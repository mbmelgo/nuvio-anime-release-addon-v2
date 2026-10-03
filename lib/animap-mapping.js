const ANIMAP_URL = "https://animap.id/api/v1/map/anilist";
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

  const expectedId = positiveInt(expectedAniListId);
  const sources = Array.isArray(raw.sources) ? raw.sources : [];
  if (!expectedId || !sources.some((url) => new RegExp(`anilist\\.co/anime/${expectedId}(?:[/?#]|$)`, "i").test(String(url)))) {
    return null;
  }

  const imdbIds = unique(sources
    .map((url) => String(url).match(/imdb\\.com\\/title\\/(tt\\d+)/i)?.[1])
    .filter(Boolean));

  const tvdbIds = unique(sources
    .map((url) => {
      const value = String(url);
      const match = value.match(/thetvdb\\.com\\/.*(?:[?&]id=|\\/series\\/|\\/deref\\/)(\\d+)/i);
      return match?.[1] || null;
    })
    .map(positiveInt)
    .filter(Boolean));

  const tmdbRefs = sources.flatMap((url) => {
    const value = String(url);
    const tv = value.match(/themoviedb\\.org\\/tv\\/(\\d+)/i);
    if (tv) return [{ id: positiveInt(tv[1]), type: "tv" }];
    const movie = value.match(/themoviedb\\.org\\/movie\\/(\\d+)/i);
    if (movie) return [{ id: positiveInt(movie[1]), type: "movie" }];
    return [];
  }).filter((ref) => ref.id);

  const tmdbTvIds = unique(tmdbRefs.filter((ref) => ref.type === "tv").map((ref) => ref.id));
  const tmdbMovieIds = unique(tmdbRefs.filter((ref) => ref.type === "movie").map((ref) => ref.id));

  if (!imdbIds.length && !tvdbIds.length && !tmdbTvIds.length && !tmdbMovieIds.length) {
    return null;
  }

  const rawType = String(raw.type || "").toUpperCase();
  const type = ["MOVIE", "FILM"].includes(rawType) ? "MOVIE" : "TV";

  return {
    source: "animap",
    anilistId: expectedId,
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
    year: positiveInt(raw.animeSeason?.year),
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
