const ANIME_CATALOG_BASE = "https://raw.githubusercontent.com/victorgveloso/animes-season-addon/4e2f1b7e0ffc111dad7f777cd6e86e9c4c26fd92/catalog/movie/latest_anime_seasons.json";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 60 * 60 * 1000;
const cache = new Map();

export async function resolveAniListMappingsByAnimeCatalog(rows, {
  fetchImpl = fetch,
  endpoint = ANIME_CATALOG_BASE,
  now = () => Date.now(),
} = {}) {
  const candidates = (Array.isArray(rows) ? rows : []).filter((row) => Number.isInteger(Number(row?.anilistId ?? row?.id)));
  if (!candidates.length) return new Map();

  let data;
  const cacheKey = `dataset:${endpoint}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now()) data = cached.record;
  else {
    try {
      const response = await fetchImpl(endpoint, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`anime catalog HTTP ${response.status}`);
      data = await response.json();
      cache.set(cacheKey, { record: data, expiresAt: now() + CACHE_TTL_MS });
    } catch {
      cache.set(cacheKey, { record: null, expiresAt: now() + NEGATIVE_TTL_MS });
      return new Map();
    }
  }

  if (!Array.isArray(data)) return new Map();

  const result = new Map();
  for (const row of candidates) {
    const anilistId = Number(row.anilistId ?? row.id);
    const match = data.find((item) => Number(item?.extra?.anilistId) === anilistId);
    if (!match) continue;

    const imdbId = /^tt\d+$/.test(String(match?.id || "")) ? String(match.id) : null;
    if (!imdbId) continue;

    const type = String(row.type || row.format || "").toUpperCase() === "MOVIE" ? "MOVIE" : "TV";
    result.set(anilistId, [{
      source: "anime-season-catalog",
      anilistId,
      type,
      malId: Number.isInteger(Number(row.malId)) ? Number(row.malId) : null,
      imdbIds: [imdbId],
      tvdbId: null,
      tmdbTvId: null,
      tmdbMovieIds: [],
      season: null,
      episodeOffset: null,
      title: match.name || null,
      titles: [match.name].filter(Boolean),
      year: null,
    }]);
  }

  return result;
}

export function clearAnimeCatalogCache() {
  cache.clear();
}
