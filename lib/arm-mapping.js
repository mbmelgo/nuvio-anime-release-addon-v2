const ARM_URL = "https://arm.haglund.dev/api/v2/ids";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 60 * 60 * 1000;
const cache = new Map();

export async function resolveAniListMappings(anilistIds, {
  fetchImpl = fetch,
  endpoint = ARM_URL,
  now = () => Date.now(),
} = {}) {
  const ids = [...new Set((Array.isArray(anilistIds) ? anilistIds : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return new Map();

  const result = new Map();
  const missing = [];

  for (const id of ids) {
    const cached = cache.get(id);
    if (cached && cached.expiresAt > now()) {
      if (cached.records) result.set(id, cached.records);
    } else {
      cache.delete(id);
      missing.push(id);
    }
  }

  if (!missing.length) return result;

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(missing.map((anilist) => ({ anilist }))),
  });

  if (!response.ok) {
    throw new Error(`ARM mapping HTTP ${response.status}`);
  }

  const payload = await response.json();
  const rows = Array.isArray(payload) ? payload : [payload];

  for (let index = 0; index < missing.length; index += 1) {
    const id = missing[index];
    const raw = rows[index];
    const records = normalizeArmResponse(raw, id);
    cache.set(id, {
      records,
      expiresAt: now() + (records.length ? CACHE_TTL_MS : NEGATIVE_TTL_MS),
    });
    if (records.length) result.set(id, records);
  }

  return result;
}

export function normalizeArmResponse(raw, expectedAniListId) {
  const values = Array.isArray(raw) ? raw : [raw];
  return values
    .filter((value) => value && typeof value === "object")
    .map((value) => ({
      source: "arm",
      anilistId: positiveInt(value.anilist) || expectedAniListId,
      type: value.media || null,
      malId: positiveInt(value.myanimelist),
      kitsuId: positiveInt(value.kitsu),
      anidbId: positiveInt(value.anidb),
      imdbIds: value.imdb ? [String(value.imdb)] : [],
      tvdbId: positiveInt(value.thetvdb),
      tmdbTvId: positiveInt(value.themoviedb),
      tmdbMovieIds: [],
      season: {
        tvdb: positiveInt(value["thetvdb-season"]),
        tmdb: positiveInt(value["themoviedb-season"]),
      },
      episodeOffset: null,
    }));
}

export function clearMappingCache() {
  cache.clear();
}

function positiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
