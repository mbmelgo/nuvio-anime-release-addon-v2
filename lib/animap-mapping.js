const ANIMAP_URL = "https://animap.id/api/map/anilist";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 60 * 60 * 1000;
const cache = new Map();

export async function resolveAniListMappingsAnimap(anilistIds, {
  fetchImpl = fetch,
  endpoint = ANIMAP_URL,
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

      try {
        const response = await fetchImpl(`${endpoint}/${id}`, {
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          throw new Error(`AniMap mapping HTTP ${response.status}`);
        }

        const payload = await response.json();
        const record = normalizeAnimapRecord(payload, id);
        const records = record ? [record] : [];

        cache.set(id, {
          records,
          expiresAt: now() + (records.length ? CACHE_TTL_MS : NEGATIVE_TTL_MS),
        });

        if (records.length) result.set(id, records);
      } catch (error) {
        cache.set(id, {
          records: [],
          expiresAt: now() + NEGATIVE_TTL_MS,
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
  return result;
}

export function normalizeAnimapRecord(raw, expectedAniListId) {
  if (!raw || typeof raw !== "object") return null;

  const anilistId = positiveInt(raw.anilist_id);
  if (anilistId !== Number(expectedAniListId)) return null;

  const imdbIds = unique((Array.isArray(raw.imdb_id) ? raw.imdb_id : raw.imdb_id ? [raw.imdb_id] : []))
    .map(String)
    .filter((id) => /^tt\d+$/.test(id));

  const tvdbIds = unique((Array.isArray(raw.tvdb_id) ? raw.tvdb_id : raw.tvdb_id ? [raw.tvdb_id] : []))
    .map(positiveInt)
    .filter(Boolean);

  const tmdbRefs = Array.isArray(raw.tmdb_id)
    ? raw.tmdb_id
    : raw.tmdb_id && typeof raw.tmdb_id === "object"
      ? [raw.tmdb_id]
      : [];

  const tmdbTvIds = unique(tmdbRefs
    .filter((ref) => String(ref?.type || "").toLowerCase() === "tv")
    .map((ref) => positiveInt(ref?.id))
    .filter(Boolean));

  const tmdbMovieIds = unique(tmdbRefs
    .filter((ref) => String(ref?.type || "").toLowerCase() === "movie")
    .map((ref) => positiveInt(ref?.id))
    .filter(Boolean));

  if (!imdbIds.length && !tvdbIds.length && !tmdbTvIds.length && !tmdbMovieIds.length) {
    return null;
  }

  const type = String(raw.type || "").toUpperCase() === "MOVIE" ? "MOVIE" : "TV";
  return {
    source: "animap",
    anilistId,
    type,
    malId: null,
    imdbIds,
    tvdbId: tvdbIds[0] || null,
    tmdbTvId: type === "MOVIE" ? null : (tmdbTvIds[0] || null),
    tmdbMovieIds: type === "MOVIE" ? tmdbMovieIds : [],
    season: { tvdb: null, tmdb: null },
    episodeOffset: null,
    title: raw.title || null,
    titles: Array.isArray(raw.synonyms) ? raw.synonyms : [],
    year: positiveInt(raw.year),
  };
}

export function clearAnimapMappingCache() {
  cache.clear();
}

function unique(values) {
  return [...new Set(values)];
}

function positiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
