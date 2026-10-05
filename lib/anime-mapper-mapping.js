const ANIME_MAPPER_BASE_URL = "https://cdn.jsdelivr.net/gh/subhajeetch-fl/anime-mapper@main/data/anime";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 60 * 60 * 1000;
const RELATED_RELATIONS = new Set(["PARENT", "PREQUEL", "SEQUEL", "SPIN_OFF", "SIDE_STORY"]);
const cache = new Map();
const inFlight = new Map();

export async function resolveAniListMappingsByAnimeMapper(rows, {
  fetchImpl = fetch,
  baseUrl = ANIME_MAPPER_BASE_URL,
  concurrency = 5,
  now = () => Date.now(),
} = {}) {
  const candidates = (Array.isArray(rows) ? rows : [])
    .map(normalizeRow)
    .filter(Boolean);

  const result = new Map();
  let cursor = 0;

  async function worker() {
    while (cursor < candidates.length) {
      const row = candidates[cursor++];
      const records = await resolveRow(row, { fetchImpl, baseUrl, now });
      if (records.length) result.set(row.anilistId, records);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, candidates.length) }, worker),
  );
  return result;
}

async function resolveRow(row, { fetchImpl, baseUrl, now }) {
  if (!row.malId) return [];

  const primary = await fetchRecord(row.malId, { fetchImpl, baseUrl, now });
  if (!primary || Number(primary?.mappings?.anilist) !== row.anilistId) {
    return [];
  }

  const direct = buildDirectMapping(row, primary);
  if (direct) return [direct];

  const related = Array.isArray(primary.sequence) ? primary.sequence : [];
  for (const relation of related) {
    if (!RELATED_RELATIONS.has(String(relation?.relationType || "").toUpperCase())) continue;

    const relatedMalId = positiveInt(relation?.malId);
    if (!relatedMalId || relatedMalId === row.malId) continue;

    const relatedRecord = await fetchRecord(relatedMalId, { fetchImpl, baseUrl, now });
    if (!relatedRecord) continue;

    const provider = buildProviderIdentity(relatedRecord, row.type);
    if (!provider) continue;

    return [{
      ...provider,
      source: "anime-mapper-relation",
      anilistId: row.anilistId,
      type: row.type,
      malId: row.malId,
      title: firstTitle(row.titles),
      titles: row.titles,
      year: null,
      relationType: String(relation.relationType).toUpperCase(),
      relatedAnilistId: positiveInt(relatedRecord?.mappings?.anilist),
      season: null,
      episodeOffset: null,
    }];
  }

  return [];
}

async function fetchRecord(malId, { fetchImpl, baseUrl, now }) {
  const bucket = String(Math.floor(malId / 1000)).padStart(3, "0");
  const key = `mal:${malId}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now()) return cached.record;
  cache.delete(key);

  const existing = inFlight.get(key);
  if (existing) return existing;

  const request = (async () => {
    try {
      const response = await fetchImpl(`${baseUrl}/${bucket}/${malId}.json`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`Anime Mapper HTTP ${response.status}`);
      const record = await response.json();
      cache.set(key, {
        record,
        expiresAt: now() + CACHE_TTL_MS,
      });
      return record;
    } catch {
      cache.set(key, {
        record: null,
        expiresAt: now() + NEGATIVE_TTL_MS,
      });
      return null;
    }
  })();

  inFlight.set(key, request);
  try {
    return await request;
  } finally {
    inFlight.delete(key);
  }
}

function buildDirectMapping(row, record) {
  const provider = buildProviderIdentity(record, row.type);
  if (!provider) return null;

  return {
    ...provider,
    source: "anime-mapper",
    anilistId: row.anilistId,
    type: row.type,
    malId: row.malId,
    title: firstTitle(row.titles),
    titles: row.titles,
    year: null,
    season: null,
    episodeOffset: null,
  };
}

function buildProviderIdentity(record, type) {
  const mappings = record?.mappings || {};
  const tvdbId = positiveInt(mappings.tvdb);
  const tmdbId = positiveInt(mappings.tmdb);

  const episodeTvdbIds = new Set();
  for (const episode of Object.values(record?.episodes || {})) {
    const showId = positiveInt(episode?.tvdbShowId);
    if (showId) episodeTvdbIds.add(showId);
  }

  if (type === "MOVIE") {
    return {
      imdbIds: [],
      tvdbId: tvdbId || null,
      tmdbTvId: null,
      tmdbMovieIds: tmdbId ? [tmdbId] : [],
    };
  }

  const resolvedTvdbId = tvdbId || (episodeTvdbIds.size === 1 ? [...episodeTvdbIds][0] : null);
  if (resolvedTvdbId || tmdbId) {
    return {
      imdbIds: [],
      tvdbId: resolvedTvdbId,
      tmdbTvId: tmdbId || null,
      tmdbMovieIds: [],
    };
  }

  return null;
}

function normalizeRow(row) {
  const anilistId = positiveInt(row?.anilistId ?? row?.id);
  const malId = positiveInt(row?.malId ?? row?.idMal);
  if (!anilistId || !malId) return null;

  const title = row?.title || {};
  const synonyms = Array.isArray(row?.synonyms) ? row.synonyms : [];
  const titles = [
    row?.titleEnglish,
    row?.titleRomaji,
    row?.titleNative,
    title.english,
    title.romaji,
    title.native,
    ...synonyms,
    row?.name,
  ].map((value) => String(value || "").trim()).filter(Boolean);

  return {
    anilistId,
    malId,
    type: String(row?.type || row?.format || "").toUpperCase() === "MOVIE" ? "MOVIE" : "TV",
    year: positiveInt(row?.year ?? row?.startDate?.year),
    titles: [...new Map(titles.map((value) => [normalizeTitle(value), value])).values()],
  };
}

function firstTitle(titles) {
  return Array.isArray(titles) && titles.length ? titles[0] : null;
}

function normalizeTitle(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function positiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export async function resolveAniListRelatedProviderIdsByAnimeMapper(rows, {
  fetchImpl = fetch,
  baseUrl = ANIME_MAPPER_BASE_URL,
  concurrency = 3,
  now = () => Date.now(),
} = {}) {
  const candidates = (Array.isArray(rows) ? rows : [])
    .map(normalizeRow)
    .filter(Boolean);

  const result = new Map();
  let cursor = 0;

  async function worker() {
    while (cursor < candidates.length) {
      const row = candidates[cursor++];
      const primary = await fetchRecord(row.malId, { fetchImpl, baseUrl, now });
      if (!primary) continue;

      const providerIds = new Set();
      for (const relation of Array.isArray(primary.sequence) ? primary.sequence : []) {
        if (!RELATED_RELATIONS.has(String(relation?.relationType || "").toUpperCase())) continue;
        const relatedMalId = positiveInt(relation?.malId);
        if (!relatedMalId || relatedMalId === row.malId) continue;

        const relatedRecord = await fetchRecord(relatedMalId, { fetchImpl, baseUrl, now });
        if (!relatedRecord) continue;

        const provider = buildProviderIdentity(relatedRecord, row.type);
        for (const id of providerIdentityIds(provider)) providerIds.add(id);
      }

      if (providerIds.size) result.set(row.anilistId, [...providerIds]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, candidates.length) }, worker),
  );
  return result;
}

function providerIdentityIds(provider) {
  if (!provider) return [];
  const ids = [];
  for (const imdbId of Array.isArray(provider.imdbIds) ? provider.imdbIds : []) {
    if (/^tt\d+$/.test(String(imdbId))) ids.push("imdb:" + imdbId);
  }
  if (Number.isInteger(Number(provider.tvdbId)) && Number(provider.tvdbId) > 0) {
    ids.push("tvdb:" + Number(provider.tvdbId));
  }
  if (Number.isInteger(Number(provider.tmdbTvId)) && Number(provider.tmdbTvId) > 0) {
    ids.push("tmdb:" + Number(provider.tmdbTvId));
  }
  for (const tmdbId of Array.isArray(provider.tmdbMovieIds) ? provider.tmdbMovieIds : []) {
    if (Number.isInteger(Number(tmdbId)) && Number(tmdbId) > 0) ids.push("tmdb:" + Number(tmdbId));
  }
  return ids;
}

export function clearAnimeMapperCache() {
  cache.clear();
  inFlight.clear();
}
