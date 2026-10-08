const ARM_URL = "https://arm.haglund.dev/api/v2/ids";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const ARM_MAX_BATCH_SIZE = 100;
const cache = new Map();
const inFlight = new Map();

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
      if (cached.records?.length) result.set(id, cached.records);
    } else {
      cache.delete(id);
      missing.push(id);
    }
  }

  if (!missing.length) return result;

  const batchIds = [...missing].sort((left, right) => left - right);
  const batches = [];
  for (let index = 0; index < batchIds.length; index += ARM_MAX_BATCH_SIZE) {
    batches.push(batchIds.slice(index, index + ARM_MAX_BATCH_SIZE));
  }

  const batchMappings = await Promise.all(batches.map(async (idsBatch) => {
    const batchKey = `${endpoint}|${idsBatch.join(",")}`;
    let request = inFlight.get(batchKey);

    if (!request) {
      request = fetchArmMappings(idsBatch, { fetchImpl, endpoint, now });
      inFlight.set(batchKey, request);
    }

    try {
      return await request;
    } finally {
      if (inFlight.get(batchKey) === request) inFlight.delete(batchKey);
    }
  }));

  for (const mappings of batchMappings) {
    for (const [id, records] of mappings) {
      if (records?.length) result.set(id, records);
    }
  }
  return result;
}

async function fetchArmMappings(ids, { fetchImpl, endpoint, now }) {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(ids.map((anilist) => ({ anilist }))),
  });

  if (!response.ok) {
    throw new Error(`ARM mapping HTTP ${response.status}`);
  }

  const payload = await response.json();
  const rows = Array.isArray(payload) ? payload : [payload];
  const mappings = new Map();

  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    const raw = rows[index];
    const records = normalizeArmResponse(raw, id);
    cache.set(id, {
      records,
      expiresAt: now() + CACHE_TTL_MS,
    });
    if (records.length) mappings.set(id, records);
  }

  return mappings;
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
      tmdbTvId: value.media === "MOVIE" ? null : positiveInt(value.themoviedb),
      tmdbMovieIds: value.media === "MOVIE" ? [positiveInt(value.themoviedb)].filter(Boolean) : [],
      season: {
        tvdb: positiveInt(value["thetvdb-season"]),
        tmdb: positiveInt(value["themoviedb-season"]),
      },
      episodeOffset: null,
    }));
}

export function clearMappingCache() {
  cache.clear();
  inFlight.clear();
}

function positiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
