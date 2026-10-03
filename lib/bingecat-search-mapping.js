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
} = {}) {
  const candidates = (Array.isArray(rows) ? rows : [])
    .map(normalizeRow)
    .filter(Boolean);

  const result = new Map();
  let cursor = 0;

  async function worker() {
    while (cursor < candidates.length) {
      const row = candidates[cursor++];
      const record = await resolveRow(row, { fetchImpl, endpoint, now });
      if (record) result.set(row.anilistId, [record]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, candidates.length) }, worker),
  );
  return result;
}

async function resolveRow(row, { fetchImpl, endpoint, now }) {
  for (const title of row.titles) {
    const key = `${row.type}|${row.year || ""}|${normalizeTitle(title)}`;
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now()) return cached.record;
    cache.delete(key);

    let record = null;
    for (const profile of SEARCH_PROFILES) {
      try {
        const params = new URLSearchParams({
          query: title,
          mode: "exact",
          ...profile,
          exclude_history: "0",
          page: "1",
          shuffle_session_seed: "nuvio-anime-addon",
          include_reservoir: "1",
        });

        const response = await fetchImpl(`${endpoint}?${params}`, {
          headers: {
            Accept: "application/json",
            "X-Requested-With": "XMLHttpRequest",
            Referer: "https://bingecat.com/",
          },
        });
        if (!response.ok) throw new Error(`BingeCat search HTTP ${response.status}`);

        const payload = await response.json();
        record = selectExactCandidate(payload, row);
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

export function selectExactCandidate(payload, row) {
  const expectedType = row.type === "MOVIE" ? "movie" : "series";
  const candidates = [
    ...(Array.isArray(payload?.movies) ? payload.movies : []),
    ...(Array.isArray(payload?.series) ? payload.series : []),
  ];

  for (const candidate of candidates) {
    if (String(candidate?.contentType || "").toLowerCase() !== expectedType) continue;

    const candidateYear = positiveInt(candidate?.year);
    if (row.year && candidateYear && candidateYear !== row.year) continue;

    const candidateTitle = normalizeTitle(candidate?.name);
    if (!candidateTitle || !row.titles.some((title) => normalizeTitle(title) === candidateTitle)) continue;

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
      year: candidateYear,
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
  if (!uniqueTitles.length) return null;

  const rawType = String(row?.type || row?.format || "").toUpperCase();
  const type = rawType === "MOVIE" ? "MOVIE" : "TV";
  const year = positiveInt(row?.year ?? row?.startDate?.year);

  return {
    anilistId,
    malId: positiveInt(row?.malId ?? row?.idMal),
    type,
    year,
    titles: uniqueTitles,
  };
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
