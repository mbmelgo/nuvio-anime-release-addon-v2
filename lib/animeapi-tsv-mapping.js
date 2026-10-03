const ANIME_API_TSV_URL = "https://raw.githubusercontent.com/nattadasu/animeApi/v3/database/animeapi.tsv";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let rowsCache = null;
let expiresAt = 0;
let loadPromise = null;

const HEADER = [
  "title","anidb","anilist","animenewsnetwork","animeplanet","anisearch","annict","hikka","imdb",
  "kaize","kaize_id","kitsu","letterboxd_lid","letterboxd_slug","letterboxd_uid","livechart",
  "myanimelist","nautiljon","nautiljon_id","notify","otakotaku","shikimori","shoboi","silveryasha",
  "simkl","themoviedb","themoviedb_season_id","themoviedb_type","thetvdb","thetvdb_season_id",
  "trakt","trakt_may_invalid","trakt_season","trakt_season_id","trakt_slug","trakt_type",
];

const INDEX = Object.fromEntries(HEADER.map((name, index) => [name, index]));

export async function resolveAniListMappingsFromAnimeApiTsv(anilistIds, {
  fetchImpl = fetch,
  endpoint = ANIME_API_TSV_URL,
  now = () => Date.now(),
} = {}) {
  const ids = new Set((Array.isArray(anilistIds) ? anilistIds : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0));
  if (!ids.size) return new Map();

  const rows = await loadRows({ fetchImpl, endpoint, now });
  const result = new Map();

  for (const columns of rows) {
    const anilistId = positiveInt(columns[INDEX.anilist]);
    if (!anilistId || !ids.has(anilistId)) continue;

    const record = normalizeRow(columns, anilistId);
    if (record) result.set(anilistId, [record]);
  }

  return result;
}

export function normalizeAnimeApiTsvRow(columns, expectedAniListId) {
  return normalizeRow(columns, expectedAniListId);
}

export function clearAnimeApiTsvCache() {
  rowsCache = null;
  expiresAt = 0;
  loadPromise = null;
}

function normalizeRow(columns, expectedAniListId) {
  const anilistId = positiveInt(columns?.[INDEX.anilist]);
  if (!anilistId || anilistId !== Number(expectedAniListId)) return null;

  const type = String(columns?.[INDEX.themoviedb_type] || "").toLowerCase() === "movie" ? "MOVIE" : "TV";
  const imdb = String(columns?.[INDEX.imdb] || "").trim();
  const tvdbId = positiveInt(columns?.[INDEX.thetvdb]);
  const tmdbId = positiveInt(columns?.[INDEX.themoviedb]);

  if (!/^tt\d+$/.test(imdb) && !tvdbId && !tmdbId) return null;

  return {
    source: "animeapi-tsv",
    anilistId,
    type,
    malId: positiveInt(columns?.[INDEX.myanimelist]),
    imdbIds: /^tt\d+$/.test(imdb) ? [imdb] : [],
    tvdbId,
    tmdbTvId: type === "MOVIE" ? null : tmdbId,
    tmdbMovieIds: type === "MOVIE" && tmdbId ? [tmdbId] : [],
    season: {
      tvdb: positiveInt(columns?.[INDEX.thetvdb_season_id]),
      tmdb: positiveInt(columns?.[INDEX.themoviedb_season_id]),
    },
    episodeOffset: null,
    title: String(columns?.[INDEX.title] || "").trim() || null,
    year: inferYear(columns?.[INDEX.title]),
  };
}

async function loadRows({ fetchImpl, endpoint, now }) {
  if (rowsCache && expiresAt > now()) return rowsCache;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const response = await fetchImpl(endpoint, {
      headers: { Accept: "text/tab-separated-values,text/plain;q=0.9,*/*;q=0.8" },
    });
    if (!response.ok) throw new Error(`AnimeAPI TSV HTTP ${response.status}`);

    const text = await response.text();
    const lines = text.split(/\r?\n/);
    const rows = [];
    for (let index = 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line) continue;
      rows.push(line.split("\t"));
    }

    rowsCache = rows;
    expiresAt = now() + CACHE_TTL_MS;
    return rowsCache;
  })();

  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

function positiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function inferYear(title) {
  const match = String(title || "").match(/(?:^|[\s(])((?:19|20)\d{2})(?:[\s)]|$)/);
  return match ? Number(match[1]) : null;
}
