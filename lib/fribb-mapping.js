const FRIBB_URL = "https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-mini.json";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let datasetCache = null;
let datasetExpiresAt = 0;
let datasetPromise = null;

export async function resolveAniListMappingsFribb(anilistIds, {
  fetchImpl = fetch,
  endpoint = FRIBB_URL,
  now = () => Date.now(),
} = {}) {
  const ids = [...new Set((Array.isArray(anilistIds) ? anilistIds : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return new Map();

  const records = await loadDataset({ fetchImpl, endpoint, now });
  const wanted = new Set(ids);
  const result = new Map();

  for (const record of records) {
    const anilistId = positiveInt(record?.anilist_id);
    if (!anilistId || !wanted.has(anilistId)) continue;

    const normalized = normalizeFribbRecord(record);
    if (!normalized) continue;

    const existing = result.get(anilistId) || [];
    existing.push(normalized);
    result.set(anilistId, existing);
  }

  return result;
}

export function normalizeFribbRecord(raw) {
  if (!raw || typeof raw !== "object") return null;

  const anilistId = positiveInt(raw.anilist_id);
  if (!anilistId) return null;

  const type = String(raw.type || "").toUpperCase() === "MOVIE" ? "MOVIE" : "TV";
  const imdbIds = (Array.isArray(raw.imdb_id) ? raw.imdb_id : raw.imdb_id ? [raw.imdb_id] : [])
    .map(String)
    .filter((id) => /^tt\d+$/.test(id));

  const tvdbId = positiveInt(raw.tvdb_id);
  const tmdb = raw.themoviedb_id && typeof raw.themoviedb_id === "object"
    ? raw.themoviedb_id
    : {};
  const tmdbTvId = positiveInt(tmdb.tv);
  const tmdbMovieIds = (Array.isArray(tmdb.movie) ? tmdb.movie : tmdb.movie ? [tmdb.movie] : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);

  if (!imdbIds.length && !tvdbId && !tmdbTvId && !tmdbMovieIds.length) return null;

  return {
    source: "fribb",
    anilistId,
    type,
    malId: positiveInt(raw.mal_id),
    imdbIds,
    tvdbId,
    tmdbTvId: type === "MOVIE" ? null : tmdbTvId,
    tmdbMovieIds: type === "MOVIE" ? tmdbMovieIds : [],
    season: {
      tvdb: positiveInt(raw.season?.tvdb),
      tmdb: positiveInt(raw.season?.tmdb),
    },
    episodeOffset: {
      tvdb: Number.isInteger(Number(raw.episode_offset?.tvdb)) ? Number(raw.episode_offset.tvdb) : null,
      tmdb: Number.isInteger(Number(raw.episode_offset?.tmdb)) ? Number(raw.episode_offset.tmdb) : null,
    },
  };
}

export function clearFribbMappingCache() {
  datasetCache = null;
  datasetExpiresAt = 0;
  datasetPromise = null;
}

async function loadDataset({ fetchImpl, endpoint, now }) {
  if (datasetCache && datasetExpiresAt > now()) return datasetCache;
  if (datasetPromise) return datasetPromise;

  datasetPromise = (async () => {
    const response = await fetchImpl(endpoint, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Fribb mapping HTTP ${response.status}`);

    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error("Fribb mapping response must be an array.");

    datasetCache = payload;
    datasetExpiresAt = now() + CACHE_TTL_MS;
    return datasetCache;
  })();

  try {
    return await datasetPromise;
  } finally {
    datasetPromise = null;
  }
}

function positiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
