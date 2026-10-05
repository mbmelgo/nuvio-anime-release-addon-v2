const TMDB_API_BASE = "https://api.themoviedb.org/3";
const DEFAULT_LANGUAGE = "en-US";
const CACHE_TTL_MS = 15 * 60 * 1000;
const searchCache = new Map();
const externalIdCache = new Map();

export async function resolveAniListMappingsByTMDB(rows, {
  token = process.env.TMDB_API_TOKEN,
  fetchImpl = globalThis.fetch,
  language = DEFAULT_LANGUAGE,
} = {}) {
  const result = new Map();
  const normalizedRows = Array.isArray(rows) ? rows : [];
  if (!String(token || "").trim() || typeof fetchImpl !== "function") return result;

  for (const row of normalizedRows) {
    const anilistId = Number(row?.id);
    if (!Number.isInteger(anilistId) || anilistId <= 0) continue;

    try {
      const match = await resolveRow(row, { token, fetchImpl, language });
      if (match) result.set(anilistId, [match]);
    } catch (error) {
      console.error("[identity] TMDB mapping failed", { anilistId, error });
    }
  }

  return result;
}

export function resetTMDBMappingCache() {
  searchCache.clear();
  externalIdCache.clear();
}

async function resolveRow(row, { token, fetchImpl, language }) {
  const queries = buildTitleQueries(row);
  if (!queries.length) return null;

  const mediaType = String(row?.format || "").toUpperCase() === "MOVIE" ? "movie" : "tv";
  const year = Number(row?.startDate?.year);
  const candidates = [];

  for (const query of queries) {
    const response = await tmdbGet(
      buildSearchUrl(mediaType, query, year, language),
      token,
      fetchImpl,
      searchCache,
    );
    if (!response?.results?.length) continue;

    const best = chooseBestCandidate(row, mediaType, query, response.results);
    if (best) candidates.push(best);

    if (best?.score >= 130) break;
  }

  if (!candidates.length) {
    if (["OVA", "SPECIAL", "ONA"].includes(String(row?.format || "").toUpperCase())) {
      return resolveStandaloneMovie(row, { token, fetchImpl, language });
    }
    return null;
  }

  const ranked = [...candidates].sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const second = ranked[1];
  if (second && best.score === second.score && best.id !== second.id) return null;
  if (best.score < 100) return null;

  const external = await getExternalIds(mediaType, best.id, token, fetchImpl);
  return toMappingRecord(row, mediaType, best, external);
}

async function resolveStandaloneMovie(row, { token, fetchImpl, language }) {
  const queries = buildTitleQueries(row);
  const year = Number(row?.startDate?.year);
  const candidates = [];

  for (const query of queries) {
    const response = await tmdbGet(
      buildSearchUrl("movie", query, year, language),
      token,
      fetchImpl,
      searchCache,
    );
    const best = chooseBestCandidate(row, "movie", query, response?.results || []);
    if (best) candidates.push(best);
    if (best?.score >= 130) break;
  }

  if (!candidates.length) return null;
  const ranked = [...candidates].sort((a, b) => b.score - a.score);
  if (ranked[1] && ranked[0].score === ranked[1].score && ranked[0].id !== ranked[1].id) return null;
  if (ranked[0].score < 100) return null;

  const external = await getExternalIds("movie", ranked[0].id, token, fetchImpl);
  return toMappingRecord(row, "movie", ranked[0], external);
}

function buildTitleQueries(row) {
  const values = [
    row?.title?.english,
    row?.title?.romaji,
    row?.title?.native,
    ...(Array.isArray(row?.synonyms) ? row.synonyms : []),
  ];
  const seen = new Set();
  const queries = [];
  for (const value of values) {
    const query = String(value || "").trim();
    const normalized = normalizeTitle(query);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    queries.push(query);
  }
  return queries;
}

function chooseBestCandidate(row, mediaType, query, results) {
  const year = Number(row?.startDate?.year);
  const scored = (Array.isArray(results) ? results : [])
    .map((candidate) => {
      const titles = mediaType === "movie"
        ? [candidate?.title, candidate?.original_title]
        : [candidate?.name, candidate?.original_name];
      const score = scoreCandidate(query, titles, candidate?.release_date || candidate?.first_air_date, year);
      return { candidate, id: Number(candidate?.id), score, query };
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
    title: mediaType === "movie" ? (best.candidate.title || best.candidate.original_title) : (best.candidate.name || best.candidate.original_name),
    originalTitle: mediaType === "movie" ? best.candidate.original_title : best.candidate.original_name,
    year: parseYear(mediaType === "movie" ? best.candidate.release_date : best.candidate.first_air_date),
    query: best.query,
  };
}

function scoreCandidate(query, candidateTitles, date, targetYear) {
  const normalizedQuery = normalizeTitle(query);
  if (!normalizedQuery) return -Infinity;

  const normalizedTitles = candidateTitles.map(normalizeTitle).filter(Boolean);
  if (!normalizedTitles.length) return -Infinity;

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

async function getExternalIds(mediaType, id, token, fetchImpl) {
  const key = mediaType + ":" + id;
  const cached = readCache(externalIdCache, key);
  if (cached !== undefined) return cached;

  const data = await tmdbGet(
    `${TMDB_API_BASE}/${mediaType}/${encodeURIComponent(id)}/external_ids`,
    token,
    fetchImpl,
    externalIdCache,
    key,
  );
  const value = {
    imdbId: /^tt\\d+$/.test(String(data?.imdb_id || "")) ? String(data.imdb_id) : null,
    tvdbId: Number.isInteger(Number(data?.tvdb_id)) && Number(data.tvdb_id) > 0 ? Number(data.tvdb_id) : null,
  };
  writeCache(externalIdCache, key, value);
  return value;
}

async function tmdbGet(url, token, fetchImpl, cache, cacheKey = url) {
  const cached = readCache(cache, cacheKey);
  if (cached !== undefined) return cached;

  const response = await fetchImpl(url, {
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${String(token).trim()}`,
    },
  });
  if (!response?.ok) {
    const error = new Error(`TMDB request failed with HTTP ${response?.status ?? "unknown"}`);
    error.status = response?.status;
    throw error;
  }
  const data = await response.json();
  writeCache(cache, cacheKey, data);
  return data;
}

function toMappingRecord(row, mediaType, match, external) {
  const format = String(row?.format || (mediaType === "movie" ? "MOVIE" : "TV")).toUpperCase();
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
    format,
  };
}

function buildSearchUrl(mediaType, query, year, language) {
  const params = new URLSearchParams({
    query,
    include_adult: "false",
    language,
    page: "1",
  });
  if (Number.isInteger(year) && year > 0) {
    params.set(mediaType === "movie" ? "first_air_date_year" : "first_air_date_year", String(year));
  }
  if (mediaType === "movie") {
    params.delete("first_air_date_year");
    params.set("year", String(year));
  }
  return `${TMDB_API_BASE}/search/${mediaType}?${params.toString()}`;
}

function parseYear(value) {
  const match = String(value || "").match(/^(\\d{4})/);
  return match ? Number(match[1]) : null;
}

function normalizeTitle(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\\p{L}\\p{N}]+/gu, " ")
    .trim()
    .replace(/\\s+/g, " ");
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
