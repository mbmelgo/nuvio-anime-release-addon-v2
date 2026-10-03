const ANIME_API_URL = "https://animeapi.my.id/anilist";
const ANIME_API_MAL_URL = "https://animeapi.my.id/myanimelist";
const ANIME_API_DUMP_URL = "https://animeapi.my.id/animeApi.json";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 60 * 60 * 1000;
const cache = new Map();
const alternativeCache = new Map();
let dumpCache = null;
let dumpExpiresAt = 0;
let dumpPromise = null;

export async function resolveAniListMappingsSecondary(anilistIds, {
  fetchImpl = fetch,
  endpoint = ANIME_API_URL,
  now = () => Date.now(),
} = {}) {
  const ids = [...new Set((Array.isArray(anilistIds) ? anilistIds : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))];
  const result = new Map();
  const missing = [];

  for (const id of ids) {
    const cached = cache.get(id);
    if (cached && cached.expiresAt > now()) {
      if (cached.records?.length) result.set(id, cached.records);
    } else {
      cache.delete(id);
      missing.push(id);
    }
  }

  for (const id of missing) {
    try {
      const response = await fetchImpl(`${endpoint}/${id}`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`AnimeAPI mapping HTTP ${response.status}`);
      const payload = await response.json();
      const record = normalizeAnimeApiRecord(payload, id);
      const records = record ? [record] : [];
      cache.set(id, {
        records,
        expiresAt: now() + (records.length ? CACHE_TTL_MS : NEGATIVE_TTL_MS),
      });
      if (records.length) result.set(id, records);
    } catch (error) {
      cache.set(id, { records: [], expiresAt: now() + NEGATIVE_TTL_MS });
    }
  }

  return result;
}

export async function resolveAniListMappingsFromDump(anilistIds, {
  fetchImpl = fetch,
  endpoint = ANIME_API_DUMP_URL,
  now = () => Date.now(),
} = {}) {
  const ids = [...new Set((Array.isArray(anilistIds) ? anilistIds : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return new Map();

  const payload = await loadAnimeApiDump({ fetchImpl, endpoint, now });
  const wanted = new Set(ids);
  const result = new Map();

  for (const raw of payload) {
    const anilistId = Number(raw?.anilist);
    if (!wanted.has(anilistId)) continue;
    const record = normalizeAnimeApiRecord(raw, anilistId);
    if (record) result.set(anilistId, [record]);
  }

  return result;
}

export async function resolveAniListMappingsByMalIds(rows, {
  fetchImpl = fetch,
  endpoint = ANIME_API_MAL_URL,
  now = () => Date.now(),
} = {}) {
  const normalizedRows = (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      anilistId: Number(row?.id ?? row?.anilistId),
      malId: Number(row?.idMal ?? row?.malId),
    }))
    .filter(({ anilistId, malId }) =>
      Number.isInteger(anilistId) && anilistId > 0
      && Number.isInteger(malId) && malId > 0);

  const result = new Map();
  const missing = [];

  for (const { anilistId, malId } of normalizedRows) {
    const cached = alternativeCache.get(malId);
    if (cached && cached.expiresAt > now()) {
      if (cached.anilistId === anilistId && cached.records?.length) {
        result.set(anilistId, cached.records);
      }
      continue;
    }
    alternativeCache.delete(malId);
    missing.push({ anilistId, malId });
  }

  for (const { anilistId, malId } of missing) {
    try {
      const response = await fetchImpl(`${endpoint}/${malId}`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`AnimeAPI MAL mapping HTTP ${response.status}`);
      const payload = await response.json();
      const record = normalizeAnimeApiRecord(payload, anilistId);
      const records = record && record.malId === malId ? [record] : [];
      alternativeCache.set(malId, {
        anilistId: record?.anilistId || null,
        records,
        expiresAt: now() + (records.length ? CACHE_TTL_MS : NEGATIVE_TTL_MS),
      });
      if (records.length) result.set(anilistId, records);
    } catch (error) {
      alternativeCache.set(malId, {
        anilistId: null,
        records: [],
        expiresAt: now() + NEGATIVE_TTL_MS,
      });
    }
  }

  return result;
}

export function normalizeAnimeApiRecord(raw, expectedAniListId) {
  if (!raw || typeof raw !== "object") return null;
  const anilistId = Number(raw.anilist);
  if (!Number.isInteger(anilistId) || anilistId !== Number(expectedAniListId)) return null;

  const type = String(raw.themoviedb_type || "").toLowerCase() === "movie" ? "MOVIE" : "TV";
  const imdbIds = raw.imdb && /^tt\d+$/.test(String(raw.imdb)) ? [String(raw.imdb)] : [];
  const tvdbId = positiveInt(raw.thetvdb);
  const tmdbId = positiveInt(raw.themoviedb);

  if (!imdbIds.length && !tvdbId && !tmdbId) return null;

  return {
    source: "animeapi",
    anilistId,
    type,
    malId: positiveInt(raw.myanimelist),
    kitsuId: positiveInt(raw.kitsu),
    anidbId: positiveInt(raw.anidb),
    imdbIds,
    tvdbId,
    tmdbTvId: type === "MOVIE" ? null : tmdbId,
    tmdbMovieIds: type === "MOVIE" && tmdbId ? [tmdbId] : [],
    season: {
      tvdb: positiveInt(raw.thetvdb_season_id),
      tmdb: positiveInt(raw.themoviedb_season_id),
    },
    episodeOffset: null,
    title: raw.title || null,
  };
}

export function clearSecondaryMappingCache() {
  cache.clear();
}

export function clearAnimeApiDumpCache() {
  dumpCache = null;
  dumpExpiresAt = 0;
  dumpPromise = null;
}

export function clearAlternativeMappingCache() {
  alternativeCache.clear();
}

async function loadAnimeApiDump({ fetchImpl, endpoint, now }) {
  if (dumpCache && dumpExpiresAt > now()) return dumpCache;
  if (dumpPromise) return dumpPromise;

  dumpPromise = (async () => {
    const response = await fetchImpl(endpoint, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`AnimeAPI dump HTTP ${response.status}`);

    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error("AnimeAPI dump response must be an array.");

    dumpCache = payload;
    dumpExpiresAt = now() + CACHE_TTL_MS;
    return dumpCache;
  })();

  try {
    return await dumpPromise;
  } finally {
    dumpPromise = null;
  }
}

function positiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
