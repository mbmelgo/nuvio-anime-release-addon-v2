const ANIME_API_URL = "https://animeapi.my.id/anilist";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 60 * 60 * 1000;
const cache = new Map();

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

export function normalizeAnimeApiRecord(raw, expectedAniListId) {
  if (!raw || typeof raw !== "object") return null;
  const anilistId = Number(raw.anilist);
  if (!Number.isInteger(anilistId) || anilistId !== Number(expectedAniListId)) return null;

  const type = String(raw.themoviedb_type || "").toLowerCase() === "movie" ? "MOVIE" : "TV";
  const imdbIds = raw.imdb && /^tt\\d+$/.test(String(raw.imdb)) ? [String(raw.imdb)] : [];
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

function positiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
