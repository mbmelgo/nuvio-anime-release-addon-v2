const BINGECAT_SEARCH_URL = "https://bingecat.com/public/meilisearch/api";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 60 * 60 * 1000;
const SEARCH_PROFILES = [
  {
    semantic_ratio: "0.55",
    exploration: "0.55",
    quality_bias: "0.6",
    newness_bias: "0.4",
  },
  {
    semantic_ratio: "0",
    exploration: "0",
    quality_bias: "0",
    newness_bias: "0",
  },
];
const cache = new Map();

export async function resolveAniListMappingsByBingeCatSearch(rows, {
  fetchImpl = fetch,
  endpoint = BINGECAT_SEARCH_URL,
  concurrency = 3,
  now = () => Date.now(),
  bypassNegativeCache = false,
} = {}) {
  const candidates = (Array.isArray(rows) ? rows : [])
    .map(normalizeRow)
    .filter(Boolean);

  const result = new Map();
  let cursor = 0;
  let circuitOpen = false;

  async function worker() {
    while (!circuitOpen && cursor < candidates.length) {
      const row = candidates[cursor++];
      const record = await resolveRow(row, {
        fetchImpl,
        endpoint,
        now,
        bypassNegativeCache,
        onRateLimit: () => {
          circuitOpen = true;
        },
      });
      if (record) result.set(row.anilistId, [record]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, candidates.length) }, worker),
  );
  return result;
}

async function resolveRow(row, {
  fetchImpl,
  endpoint,
  now,
  bypassNegativeCache,
  onRateLimit,
}) {
  for (const title of buildSearchTitles(row)) {
    const key = `${row.anilistId}|${row.type}|${row.year || ""}|${normalizeTitle(title.value)}`;
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now()) {
      if (cached.record) return cached.record;
      if (!bypassNegativeCache) continue;
      cache.delete(key);
    }
    cache.delete(key);

    let record = null;
    for (const profile of SEARCH_PROFILES) {
      try {
        const params = new URLSearchParams({
          query: title.value,
          mode: "exact",
          ...profile,
          exclude_history: "0",
          page: "1",
          shuffle_session_seed: "nuvio-anime-addon",
          include_reservoir: "1",
        });

        const url = `${endpoint}?${params}`;
        let response;
        let lastError = null;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            response = await fetchImpl(url, {
              headers: {
                Accept: "application/json",
                "X-Requested-With": "XMLHttpRequest",
                Referer: "https://bingecat.com/",
              },
            });
            if (response.ok) {
              lastError = null;
              break;
            }

            const transient = response.status === 429 || response.status >= 500;
            lastError = new Error(`BingeCat search HTTP ${response.status}`);
            if (!transient || attempt === 3) break;
          } catch (error) {
            lastError = error;
            if (attempt === 3) break;
          }

          await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
        }

        if (!response?.ok) {
          const status = response?.status || null;
          console.warn("[bingecat-search] upstream request failed after retries", {
            query: title.value,
            status,
            error: lastError?.message || null,
          });
          if (status === 429) {
            onRateLimit?.();
            return null;
          }
          throw lastError || new Error("BingeCat search failed");
        }

        const payload = await response.json();
        record = selectExactCandidate(payload, row, {
          allowDerivedTitle: title.derived,
          allowRelatedTitle: title.related,
        });
        if (record) break;
      } catch {
        // Try the next search profile/title before caching a negative result.
      }
    }

    cache.set(key, {
      record,
      expiresAt: now() + (record ? CACHE_TTL_MS : NEGATIVE_TTL_MS),
    });
    if (record) return record;
  }

  return null;
}

export function selectExactCandidate(payload, row, {
  allowDerivedTitle = false,
  allowRelatedTitle = false,
} = {}) {
  const expectedType = row.type === "MOVIE" ? "movie" : null;
  const candidates = [
    ...(Array.isArray(payload?.movies) ? payload.movies : []),
    ...(Array.isArray(payload?.series) ? payload.series : []),
  ];

  for (const candidate of candidates) {
    const candidateType = String(candidate?.contentType || "").toLowerCase();
    if (expectedType && candidateType !== expectedType) continue;

    const candidateYear = positiveInt(candidate?.year);
    const candidateTitle = normalizeTitle(candidate?.name);
    const exactTitle = row.titles.some((title) => normalizeTitle(title) === candidateTitle);
    const searchTitles = buildSearchTitles(row);
    const derivedTitle = allowDerivedTitle && searchTitles
      .some((title) => title.derived && normalizeTitle(title.value) === candidateTitle);
    const derivedPrefixCompatibleTitle = allowDerivedTitle && searchTitles
      .some((title) => title.derived && title.prefix
        && candidateContainsAllDistinctiveTokens(title.value, candidate?.name));
    const relatedSearchTitles = allowRelatedTitle ? [...row.relatedTitles] : [];
    const relatedTitle = allowRelatedTitle && relatedSearchTitles
      .some((title) => normalizeTitle(title) === candidateTitle);
    const tokenCompatibleTitle = !exactTitle && !derivedTitle && !relatedTitle && !derivedPrefixCompatibleTitle
      && titlesCompatibleByTokenContainment(row.titles, candidate?.name);
    if (!candidateTitle || (!exactTitle && !derivedTitle && !relatedTitle && !derivedPrefixCompatibleTitle && !tokenCompatibleTitle)) continue;
    if (row.year && candidateYear && candidateYear !== row.year && !derivedTitle && !relatedTitle && !derivedPrefixCompatibleTitle) continue;

    const imdbId = /^tt\d+$/.test(String(candidate?.id || "")) ? String(candidate.id) : null;
    const tmdbId = positiveInt(candidate?.tmdbId);
    if (!imdbId && !tmdbId) continue;

    return {
      source: "bingecat-search",
      anilistId: row.anilistId,
      type: row.type,
      malId: row.malId,
      imdbIds: imdbId ? [imdbId] : [],
      tvdbId: null,
      tmdbTvId: row.type === "MOVIE" ? null : tmdbId,
      tmdbMovieIds: row.type === "MOVIE" && tmdbId ? [tmdbId] : [],
      season: null,
      episodeOffset: null,
      title: candidate.name || null,
      year: allowDerivedTitle || allowRelatedTitle || derivedPrefixCompatibleTitle || tokenCompatibleTitle ? null : candidateYear,
      // A related-title query is still direct evidence from BingeCat. Treat it as a derived-title
      // candidate rather than relation provenance so semantic title validation decides whether the
      // provider identity belongs to this installment. This prevents unrelated franchise leakage.
      relation: false,
      relatedTitleSearch: relatedTitle,
      relatedSearchTitles: relatedTitle ? [...row.relatedTitles] : [],
      derivedTitle: derivedTitle || relatedTitle || derivedPrefixCompatibleTitle || tokenCompatibleTitle,
    };
  }

  return null;
}

export function clearBingeCatSearchCache() {
  cache.clear();
}

function normalizeRow(row) {
  const anilistId = positiveInt(row?.anilistId ?? row?.id);
  if (!anilistId) return null;

  const title = row?.title || {};
  const synonyms = Array.isArray(row?.synonyms) ? row.synonyms : [];
  const titles = [
    row?.titleEnglish,
    row?.titleRomaji,
    row?.titleNative,
    title.english,
    title.romaji,
    title.native,
    ...synonyms,
    row?.name,
  ].map((value) => String(value || "").trim()).filter(Boolean);

  const uniqueTitles = [...new Map(
    titles.map((value) => [normalizeTitle(value), value]),
  ).values()];
  const relatedTitles = (Array.isArray(row?.relations?.edges) ? row.relations.edges : [])
    .filter((edge) => ["PARENT", "PREQUEL", "SEQUEL", "SPIN_OFF", "SIDE_STORY"].includes(String(edge?.relationType || "").toUpperCase()))
    .flatMap((edge) => [
      edge?.node?.title?.english,
      edge?.node?.title?.romaji,
      edge?.node?.title?.native,
    ])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const uniqueRelatedTitles = [...new Map(
    relatedTitles.map((value) => [normalizeTitle(value), value]),
  ).values()];
  if (!uniqueTitles.length && !uniqueRelatedTitles.length) return null;

  const rawType = String(row?.type || row?.format || "").toUpperCase();
  const type = rawType === "MOVIE" ? "MOVIE" : "TV";
  const year = positiveInt(row?.year ?? row?.startDate?.year);

  return {
    anilistId,
    malId: positiveInt(row?.malId ?? row?.idMal),
    type,
    year,
    titles: uniqueTitles,
    relatedTitles: uniqueRelatedTitles,
  };
}

function buildSearchTitles(row) {
  const titles = row.titles.map((value) => ({ value, derived: false, related: false, prefix: false }));
  for (const value of row.relatedTitles || []) {
    titles.push({ value, derived: false, related: true, prefix: false });
  }
  const seen = new Set(titles.map((title) => normalizeTitle(title.value)));

  for (const title of row.titles) {
    const variants = [
      title.replace(/\s*\/?\s*\(?(?:Zoku-hen|続編|Sequel)\)?$/i, "").trim(),
      title.replace(/\s*[-–—:]?\s*(?:\d+(?:st|nd|rd|th)?\s*Season|Season\s*\d+|\d+(?:st|nd|rd|th)?)$/i, "").trim(),
      title.replace(/\s+(?:File|Part|Episode)\s+\d+$/i, "").trim(),
    ];
    for (const value of variants) {
      const key = normalizeTitle(value);
      if (value && value !== title && key && !seen.has(key)) {
        seen.add(key);
        titles.push({ value, derived: true, prefix: false });
      }
      const prefix = title.split(/[:：]/, 1)[0].trim();
      const prefixKey = normalizeTitle(prefix);
      if (prefix && prefix !== title && prefixKey && !seen.has(prefixKey) && prefix.split(/\s+/).length >= 2) {
        seen.add(prefixKey);
        titles.push({ value: prefix, derived: true, prefix: true });
      }
    }
  }

  return titles;
}

function titlesCompatibleByTokenContainment(rowTitles, candidateTitle) {
  const candidateTokens = tokenizeTitle(candidateTitle);
  if (candidateTokens.length < 3) return false;

  return rowTitles.some((title) => {
    const rowTokens = new Set(tokenizeTitle(title));
    if (candidateTokens.some((token) => !rowTokens.has(token))) return false;
    const distinctive = candidateTokens.filter((token) => token.length >= 4);
    return distinctive.length >= 2;
  });
}

function tokenizeTitle(value) {
  return normalizeTitle(value).split(" ").filter(Boolean);
}

function normalizeTitle(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function positiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function candidateContainsAllDistinctiveTokens(searchTitle, candidateTitle) {
  const searchTokens = tokenizeTitle(searchTitle);
  const candidateTokens = new Set(tokenizeTitle(candidateTitle));
  if (searchTokens.length < 2) return false;
  const distinctive = searchTokens.filter((token) => token.length >= 4);
  return distinctive.length >= 2 && distinctive.every((token) => candidateTokens.has(token));
}
