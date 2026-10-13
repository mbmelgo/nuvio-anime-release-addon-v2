const TMDB_API_BASE = "https://api.themoviedb.org/3";
const DEFAULT_LANGUAGE = "en-US";
const CACHE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_CONCURRENCY = 12;
export const DEFAULT_TMDB_RESOLVER_TIMEOUT_MS = 8000;
const searchCache = new Map();
const externalIdCache = new Map();

export async function resolveAniListMappingsByTMDB(rows, {
  token = process.env.TMDB_API_TOKEN,
  fetchImpl = globalThis.fetch,
  language = DEFAULT_LANGUAGE,
  concurrency = DEFAULT_CONCURRENCY,
  timeoutMs = 5000,
  resolverTimeoutMs = DEFAULT_TMDB_RESOLVER_TIMEOUT_MS,
  resolverDeadlineAt = null,
  diagnostics = null,
} = {}) {
  const result = new Map();
  const work = Array.isArray(rows) ? rows : [];
  const stats = diagnostics && typeof diagnostics === "object" ? diagnostics : null;
  if (stats) {
    Object.assign(stats, {
      rowsRequested: work.length,
      rowsStarted: 0,
      rowsResolved: 0,
      rowsNoMatch: 0,
      rowsSkippedDeadline: 0,
      rowsSkippedUnavailable: 0,
      invalidRows: 0,
      rowErrors: 0,
      httpErrors: 0,
      http429Errors: 0,
      timeouts: 0,
      rowsDeadlineExhausted: 0,
    });
  }
  if (!String(token || "").trim() || typeof fetchImpl !== "function") {
    if (stats) stats.rowsSkippedUnavailable = work.length;
    return result;
  }
  // Bound the complete provider stage as well as each individual row. Without
  // a shared deadline, several waves of slow rows can multiply the stage
  // latency even though every request has its own timeout.
  const batchDeadline = Date.now() + Math.max(1, Number(resolverTimeoutMs) || DEFAULT_TMDB_RESOLVER_TIMEOUT_MS);
  const sharedDeadline = Number(resolverDeadlineAt);
  const resolverDeadline = Number.isFinite(sharedDeadline) && sharedDeadline > 0
    ? Math.min(batchDeadline, sharedDeadline)
    : batchDeadline;
  const workerCount = Math.min(
    Math.max(1, Number.isInteger(concurrency) ? concurrency : DEFAULT_CONCURRENCY),
    work.length,
  );
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < work.length && Date.now() < resolverDeadline) {
      const row = work[nextIndex++];
      const rowDeadline = Date.now() + Math.max(1, Number(timeoutMs) || 5000);
      const deadline = Math.min(rowDeadline, resolverDeadline);
      const anilistId = Number(row?.id);
      if (!Number.isInteger(anilistId) || anilistId <= 0) {
        if (stats) stats.invalidRows += 1;
        continue;
      }
      if (stats) stats.rowsStarted += 1;
      try {
        const match = await resolveRow(row, { token, fetchImpl, language, deadline });
        if (match) {
          result.set(anilistId, [match]);
          if (stats) stats.rowsResolved += 1;
        } else if (stats) {
          stats.rowsNoMatch += 1;
          if (Date.now() >= deadline) stats.rowsDeadlineExhausted += 1;
        }
      } catch (error) {
        if (stats) {
          stats.rowErrors += 1;
          if (Number.isFinite(Number(error?.status))) {
            stats.httpErrors += 1;
            if (Number(error.status) === 429) stats.http429Errors += 1;
          }
          if (/timed out|time budget exhausted/i.test(String(error?.message || ""))) {
            stats.timeouts += 1;
            if (Date.now() >= deadline) stats.rowsDeadlineExhausted += 1;
          }
        }
        if (Date.now() < deadline) console.error("[identity] TMDB mapping failed", { anilistId, error });
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (stats) {
    stats.rowsSkippedDeadline = Math.max(0, work.length - stats.rowsStarted - stats.invalidRows);
  }
  return result;
}

export function resetTMDBMappingCache() {
  searchCache.clear();
  externalIdCache.clear();
}

async function resolveRow(row, { token, fetchImpl, language, deadline }) {
  const mediaType = String(row?.format || "").toUpperCase() === "MOVIE" ? "movie" : "tv";
  const queries = buildTitleQueries(row);
  if (!queries.length) {
    return mediaType === "tv"
      ? resolveRelatedTMDBSeason(row, { token, fetchImpl, language, deadline })
      : null;
  }
  const year = Number(row?.startDate?.year);
  const candidates = [];

  for (const query of queries) {
    if (Date.now() >= deadline) return null;
    const response = await tmdbGet(buildSearchUrl(mediaType, query, language), token, fetchImpl, searchCache, undefined, deadline);
    const best = chooseBestCandidate(row, mediaType, query, response?.results || []);
    if (best) candidates.push(best);
    if (best?.score >= 130) break;
  }

  if (!candidates.length && ["OVA", "SPECIAL", "ONA"].includes(String(row?.format || "").toUpperCase())) {
    return resolveStandaloneMovie(row, { token, fetchImpl, language, deadline });
  }
  if (!candidates.length) {
    return mediaType === "tv"
      ? resolveRelatedTMDBSeason(row, { token, fetchImpl, language, deadline })
      : null;
  }

  const ranked = [...candidates].sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const second = ranked[1];
  if ((second && best.score === second.score && best.id !== second.id) || best.score < 100) {
    return mediaType === "tv"
      ? resolveRelatedTMDBSeason(row, { token, fetchImpl, language, deadline })
      : null;
  }

  return toMappingRecord(
    row,
    mediaType,
    best,
    getAniListExternalIds(row) || await getExternalIds(mediaType, best.id, token, fetchImpl, deadline).catch(() => ({ imdbId: null, tvdbId: null })),
  );
}


async function resolveRelatedTMDBSeason(row, { token, fetchImpl, language, deadline }) {
  const edges = Array.isArray(row?.relations?.edges) ? row.relations.edges : [];
  const titles = [
    row?.title?.english,
    row?.title?.romaji,
    row?.title?.native,
    ...(Array.isArray(row?.synonyms) ? row.synonyms : []),
  ].map(normalizeTMDBTitle).filter(Boolean);
  if (!edges.length || !titles.length || Date.now() >= deadline) return null;

  const relatedIds = new Set();
  const relatedTitles = [];
  for (const edge of edges) {
    if (!["PARENT", "PREQUEL", "SEQUEL", "SPIN_OFF", "SIDE_STORY"].includes(
      String(edge?.relationType || "").toUpperCase(),
    )) continue;
    for (const title of [
      edge?.node?.title?.english,
      edge?.node?.title?.romaji,
      edge?.node?.title?.native,
    ]) {
      const normalized = normalizeTMDBTitle(title);
      if (normalized && !relatedTitles.includes(normalized)) relatedTitles.push(normalized);
    }
    for (const link of Array.isArray(edge?.node?.externalLinks) ? edge.node.externalLinks : []) {
      const url = String(link?.url || "");
      const site = String(link?.site || "").toLowerCase();
      const match = url.match(/themoviedb\.org\/tv\/(\d+)/i)
        || (site.includes("tmdb") ? url.match(/\/(?:tv|series)\/(\d+)/i) : null);
      if (match) relatedIds.add(match[1]);
    }
  }

  // AniList relation entries often have no TMDB external link. Search using
  // the related installment's title, then verify candidate series by checking
  // whether its actual season list contains the current installment.
  if (!relatedIds.size) {
    for (const relatedTitle of relatedTitles.slice(0, 2)) {
      if (Date.now() >= deadline) return null;
      try {
        const response = await tmdbGet(
          buildSearchUrl("tv", relatedTitle, language),
          token,
          fetchImpl,
          searchCache,
          undefined,
          deadline,
        );
        for (const result of (Array.isArray(response?.results) ? response.results : []).slice(0, 5)) {
          const id = Number(result?.id);
          const candidateTitle = normalizeTMDBTitle(result?.name || result?.original_name);
          if (Number.isInteger(id) && id > 0
              && candidateTitle
              && tmdbRelatedSeriesTitleMatches(relatedTitle, candidateTitle)) {
            relatedIds.add(String(id));
          }
        }
      } catch {
        // Related-title search is optional; direct relation links and regular
        // current-title matching remain available when TMDB search fails.
      }
      if (relatedIds.size) break;
    }
  }

  for (const id of relatedIds) {
    if (Date.now() >= deadline) return null;
    try {
      const details = await tmdbGet(
        `${TMDB_API_BASE}/tv/${encodeURIComponent(id)}?language=${encodeURIComponent(language)}`,
        token,
        fetchImpl,
        searchCache,
        `tv-details:${id}:${language}`,
        deadline,
      );
      const seasons = Array.isArray(details?.seasons) ? details.seasons : [];
      const year = Number(row?.startDate?.year);
      const matchingSeason = seasons.find((season) => {
        if (Number(season?.season_number) <= 0) return false;
        const seasonTitle = normalizeTMDBTitle(season?.name || season?.english_name);
        if (!seasonTitle || !titles.some((title) => tmdbSeasonTitleMatches(title, seasonTitle))) return false;
        const seasonYear = Number(String(season?.air_date || "").slice(0, 4));
        return !(Number.isInteger(year) && year > 0 && Number.isInteger(seasonYear) && seasonYear > 0)
          || year === seasonYear;
      });
      if (!matchingSeason) continue;
      return {
        source: "tmdb-season-verified",
        anilistId: Number(row?.id),
        type: "TV",
        imdbIds: [],
        tvdbId: null,
        tmdbTvId: Number(id),
        tmdbMovieIds: [],
        title: row?.title?.english || row?.title?.romaji || row?.title?.native || null,
        titles,
        year: Number.isInteger(year) && year > 0 ? year : null,
        tmdbAuthoritative: true,
        tmdbMatchScore: 150,
        tmdbSeasonVerified: true,
        tmdbSeasonNumber: Number(matchingSeason.season_number),
        tmdbSeasonTitle: matchingSeason.name || matchingSeason.english_name || null,
        relation: false,
      };
    } catch {
      // Season metadata is an optional verification path; continue to normal search.
    }
  }
  return null;
}

function normalizeTMDBTitle(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tmdbRelatedSeriesTitleMatches(left, right) {
  if (left === right) return true;
  const a = new Set(left.split(" "));
  const b = new Set(right.split(" "));
  const overlap = [...a].filter((token) => b.has(token)).length;
  return overlap >= 2 && overlap / Math.max(a.size, b.size) >= 0.6;
}

function tmdbSeasonTitleMatches(left, right) {
  if (left === right) return true;
  const a = new Set(left.split(" "));
  const b = new Set(right.split(" "));
  const overlap = [...a].filter((token) => b.has(token)).length;
  return overlap >= 2 && overlap / Math.max(a.size, b.size) >= 0.8;
}

async function resolveStandaloneMovie(row, { token, fetchImpl, language, deadline }) {
  const year = Number(row?.startDate?.year);
  const candidates = [];
  for (const query of buildTitleQueries(row)) {
    if (Date.now() >= deadline) return null;
    const response = await tmdbGet(buildSearchUrl("movie", query, language), token, fetchImpl, searchCache, undefined, deadline);
    const best = chooseBestCandidate(row, "movie", query, response?.results || []);
    if (best) candidates.push(best);
    if (best?.score >= 130) break;
  }
  if (!candidates.length) return null;
  const ranked = [...candidates].sort((a, b) => b.score - a.score);
  if (ranked[1] && ranked[0].score === ranked[1].score && ranked[0].id !== ranked[1].id) return null;
  if (ranked[0].score < 100) return null;
  return toMappingRecord(
    row,
    "movie",
    ranked[0],
    getAniListExternalIds(row) || await getExternalIds("movie", ranked[0].id, token, fetchImpl, deadline).catch(() => ({ imdbId: null, tvdbId: null })),
  );
}

function buildTitleQueries(row) {
  const values = [
    row?.title?.english,
    row?.title?.romaji,
    row?.title?.native,
    ...(Array.isArray(row?.synonyms) ? row.synonyms : []),
  ];
  const seen = new Set();
  return values.map((value) => String(value || "").trim())
    .filter((value) => {
      const normalized = normalizeTitle(value);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

function chooseBestCandidate(row, mediaType, query, results) {
  const scored = (Array.isArray(results) ? results : [])
    .map((candidate) => {
      const titles = mediaType === "movie"
        ? [candidate?.title, candidate?.original_title]
        : [candidate?.name, candidate?.original_name];
      return {
        candidate,
        id: Number(candidate?.id),
        score: scoreCandidate(query, titles, candidate?.release_date || candidate?.first_air_date, Number(row?.startDate?.year)),
      };
    })
    .filter((entry) => Number.isInteger(entry.id) && entry.id > 0 && Number.isFinite(entry.score))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];
  if (!best || best.score < 100) return null;
  if (second && best.score === second.score && best.id !== second.id) return null;

  return {
    id: best.id,
    score: best.score,
    title: mediaType === "movie"
      ? (best.candidate.title || best.candidate.original_title)
      : (best.candidate.name || best.candidate.original_name),
    originalTitle: mediaType === "movie" ? best.candidate.original_title : best.candidate.original_name,
    year: parseYear(mediaType === "movie" ? best.candidate.release_date : best.candidate.first_air_date),
    query,
  };
}

function scoreCandidate(query, candidateTitles, date, targetYear) {
  const normalizedQuery = normalizeTitle(query);
  if (!normalizedQuery) return -Infinity;
  const normalizedTitles = candidateTitles.map(normalizeTitle).filter(Boolean);
  let titleScore = 0;

  for (const title of normalizedTitles) {
    if (title === normalizedQuery) {
      titleScore = Math.max(titleScore, 100);
      continue;
    }
    const queryTokens = new Set(normalizedQuery.split(" "));
    const titleTokens = new Set(title.split(" "));
    const overlap = [...queryTokens].filter((token) => titleTokens.has(token)).length;
    const ratio = overlap / Math.max(queryTokens.size, titleTokens.size);
    if (overlap >= 2 && ratio >= 0.75) titleScore = Math.max(titleScore, 75);
    else if (overlap >= 2 && ratio >= 0.5) titleScore = Math.max(titleScore, 50);
  }

  if (titleScore < 100) return titleScore;
  const candidateYear = parseYear(date);
  if (Number.isInteger(targetYear) && Number.isInteger(candidateYear)) {
    const delta = Math.abs(candidateYear - targetYear);
    if (delta > 2) return -Infinity;
    return titleScore + (delta === 0 ? 30 : 15);
  }
  return titleScore;
}

function getAniListExternalIds(row) {
  const links = Array.isArray(row?.externalLinks) ? row.externalLinks : [];
  for (const link of links) {
    const url = String(link?.url || "");
    const site = String(link?.site || "").toLowerCase();
    const match = url.match(/imdb\.com\/title\/(tt\d+)/i);
    if (match && (site.includes("imdb") || /imdb\.com/i.test(url))) {
      return { imdbId: match[1], tvdbId: null };
    }
  }
  return null;
}

async function getExternalIds(mediaType, id, token, fetchImpl, deadline) {
  const key = mediaType + ":" + id;
  const cached = readCache(externalIdCache, key);
  if (cached !== undefined) return cached;
  const response = await tmdbGet(
    `${TMDB_API_BASE}/${mediaType}/${encodeURIComponent(id)}/external_ids`,
    token,
    fetchImpl,
    null,
    undefined,
    deadline,
  );
  const value = {
    imdbId: /^tt\d+$/.test(String(response?.imdb_id || "")) ? String(response.imdb_id) : null,
    tvdbId: Number.isInteger(Number(response?.tvdb_id)) && Number(response.tvdb_id) > 0 ? Number(response.tvdb_id) : null,
  };
  writeCache(externalIdCache, key, value);
  return value;
}

async function tmdbGet(url, token, fetchImpl, cache = null, cacheKey = url, deadline = Date.now() + 5000) {
  const cached = cache ? readCache(cache, cacheKey) : undefined;
  if (cached !== undefined) return cached;
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) throw new Error("TMDB mapping time budget exhausted");
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("TMDB request timed out"));
    }, remainingMs);
  });
  try {
    const data = await Promise.race([
      Promise.resolve().then(async () => {
        const response = await fetchImpl(url, {
          headers: {
            accept: "application/json",
            Authorization: `Bearer ${String(token).trim()}`,
          },
          signal: controller.signal,
        });
        if (!response?.ok) {
          const error = new Error(`TMDB request failed with HTTP ${response?.status ?? "unknown"}`);
          error.status = response?.status;
          throw error;
        }
        return response.json();
      }),
      timeout,
    ]);
    if (cache) writeCache(cache, cacheKey, data);
    return data;
  } finally {
    clearTimeout(timer);
  }
}
function toMappingRecord(row, mediaType, match, external) {
  const isMovie = mediaType === "movie";
  return {
    source: "tmdb-search",
    anilistId: Number(row.id),
    type: isMovie ? "MOVIE" : "TV",
    imdbIds: external.imdbId ? [external.imdbId] : [],
    tvdbId: external.tvdbId,
    tmdbTvId: isMovie ? null : match.id,
    tmdbMovieIds: isMovie ? [match.id] : [],
    title: match.title,
    titles: [match.title, match.originalTitle].filter(Boolean),
    year: match.year,
    tmdbMatchScore: match.score,
    tmdbMatchQuery: match.query,
    tmdbAuthoritative: true,
  };
}

function buildSearchUrl(mediaType, query, language) {
  const params = new URLSearchParams({
    query,
    include_adult: "false",
    language,
    page: "1",
  });
  return `${TMDB_API_BASE}/search/${mediaType}?${params.toString()}`;
}

function parseYear(value) {
  const match = String(value || "").match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
}

function normalizeTitle(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function readCache(cache, key) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function writeCache(cache, key, value) {
  cache.set(key, { at: Date.now(), value });
}

export function selectTMDBIdentity(media, records, { excludeIds = new Set() } = {}) {
  const eligible = [];
  for (const record of Array.isArray(records) ? records : []) {
    const verifiedSeason = record?.source === "tmdb-season-verified"
      && record?.tmdbSeasonVerified === true;
    if ((!verifiedSeason && record?.source !== "tmdb-search") || record?.tmdbAuthoritative !== true) continue;
    const movie = String(media?.format || "").toUpperCase() === "MOVIE";
    const tmdbId = movie ? Number(record?.tmdbMovieIds?.[0]) : Number(record?.tmdbTvId);
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) continue;
    const imdbId = Array.isArray(record?.imdbIds)
      ? record.imdbIds.find((id) => /^tt\d+$/.test(String(id)))
      : null;
    const provider = imdbId ? "imdb" : "tmdb";
    const id = imdbId ? String(imdbId) : String(tmdbId);
    const stremioId = imdbId ? String(imdbId) : `tmdb:${tmdbId}`;
    if (excludeIds.has(id) || excludeIds.has(stremioId)) continue;
    const score = Number(record?.tmdbMatchScore);
    if (!Number.isFinite(score) || score < 100) continue;
    eligible.push({
      provider,
      id,
      stremioId,
      tmdbId,
      providerExactTitle: record?.providerExactTitle === true,
      score,
    });
  }
  eligible.sort((a, b) => b.score - a.score);
  if (eligible.length > 1 && eligible[0].score === eligible[1].score
      && eligible[0].stremioId !== eligible[1].stremioId) return null;
  return eligible[0] || null;
}
