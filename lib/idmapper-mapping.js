const IDMAPPER_URL = "https://idmapper.vercel.app/api/mapper";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 60 * 60 * 1000;
const cache = new Map();
const inFlight = new Map();

export async function resolveAniListMappingsIdMapper(anilistIds, {
  fetchImpl = fetch,
  endpoint = IDMAPPER_URL,
  concurrency = 4,
  now = () => Date.now(),
} = {}) {
  const ids = [...new Set((Array.isArray(anilistIds) ? anilistIds : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))];

  const result = new Map();
  let cursor = 0;

  async function worker() {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      const cached = cache.get(id);

      if (cached && cached.expiresAt > now()) {
        if (cached.records?.length) result.set(id, cached.records);
        continue;
      }

      cache.delete(id);

      const existing = inFlight.get(id);
      if (existing) {
        const records = await existing;
        if (records.length) result.set(id, records);
        continue;
      }

      const request = (async () => {
        try {
          const response = await fetchImpl(`${endpoint}?${new URLSearchParams({ anilist_id: String(id) })}`, {
            headers: { Accept: "application/json" },
          });
          if (!response.ok) throw new Error(`IDMapper HTTP ${response.status}`);

          const payload = await response.json();
          const record = normalizeIdMapperRecord(payload, id);
          const records = record ? [record] : [];

          cache.set(id, {
            records,
            expiresAt: now() + (records.length ? CACHE_TTL_MS : NEGATIVE_TTL_MS),
          });
          return records;
        } catch {
          cache.set(id, { records: [], expiresAt: now() + NEGATIVE_TTL_MS });
          return [];
        }
      })();

      inFlight.set(id, request);
      try {
        const records = await request;
        if (records.length) result.set(id, records);
      } finally {
        inFlight.delete(id);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
  return result;
}

export function normalizeIdMapperRecord(raw, expectedAniListId) {
  if (!raw || typeof raw !== "object") return null;

  const anilistId = positiveInt(raw.anilist_id);
  const expectedId = positiveInt(expectedAniListId);
  if (!anilistId || !expectedId || anilistId !== expectedId) return null;

  const imdbIds = normalizeStringIds(raw.imdb_id);
  const tvdbId = positiveInt(raw.thetvdb_id ?? raw.tvdb_id);
  const tmdbTvId = positiveInt(raw.tmdb_show_id);
  const tmdbMovieIds = normalizeNumericIds(raw.tmdb_movie_id);
  const fallbackTmdb = positiveInt(raw.themoviedb_id ?? raw.tmdb_id);
  const type = String(raw.type || "").toUpperCase() === "MOVIE" ? "MOVIE" : "TV";

  if (fallbackTmdb) {
    if (type === "MOVIE") tmdbMovieIds.push(fallbackTmdb);
    else if (!tmdbTvId) {
      return {
        source: "idmapper",
        anilistId,
        type,
        malId: positiveInt(firstNumeric(raw.mal_id)),
        imdbIds,
        tvdbId,
        tmdbTvId: fallbackTmdb,
        tmdbMovieIds: [],
        season: null,
        episodeOffset: null,
        title: raw.title || null,
        year: positiveInt(raw.year),
      };
    }
  }

  const uniqueMovieIds = [...new Set(tmdbMovieIds.filter(Boolean))];
  if (!imdbIds.length && !tvdbId && !tmdbTvId && !uniqueMovieIds.length) return null;

  return {
    source: "idmapper",
    anilistId,
    type,
    malId: positiveInt(firstNumeric(raw.mal_id)),
    imdbIds,
    tvdbId,
    tmdbTvId: type === "MOVIE" ? null : tmdbTvId,
    tmdbMovieIds: type === "MOVIE" ? uniqueMovieIds : [],
    season: null,
    episodeOffset: null,
    title: raw.title || null,
    year: positiveInt(raw.year),
  };
}

export function clearIdMapperCache() {
  cache.clear();
  inFlight.clear();
}

function normalizeStringIds(value) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.map((item) => String(item || "").trim()).filter((item) => /^tt\d+$/.test(item)))];
}

function normalizeNumericIds(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.map(positiveInt).filter(Boolean);
}

function firstNumeric(value) {
  return Array.isArray(value) ? value[0] : value;
}

function positiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
