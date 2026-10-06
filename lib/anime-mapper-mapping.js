const ANIME_MAPPER_BASE_URL = "https://cdn.jsdelivr.net/gh/subhajeetch-fl/anime-mapper@main/data/anime";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 60 * 60 * 1000;
const RELATED_RELATIONS = new Set(["PARENT", "PREQUEL", "SEQUEL", "SPIN_OFF", "SIDE_STORY"]);
const FETCH_TIMEOUT_MS = 750;
const cache = new Map();
const inFlight = new Map();

export async function resolveAniListMappingsByAnimeMapper(rows, {
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
      const response = await fetchWithTimeout(`${baseUrl}/${bucket}/${malId}.json`, {
        fetchImpl,
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

async function fetchWithTimeout(url, { fetchImpl, headers }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetchImpl(url, {
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
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


export async function resolveAniListCanonicalSeriesByAnimeMapper(rows, {
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
      const root = await findCanonicalSeriesRoot(row.malId, { fetchImpl, baseUrl, now });
      if (!root || root.malId === row.malId || !root.anilistId) continue;
      result.set(row.anilistId, {
        source: "anime-mapper-canonical",
        anilistId: row.anilistId,
        canonicalAnilistId: root.anilistId,
        canonicalMalId: root.malId,
        canonicalTitle: root.title,
        canonicalType: root.type,
        canonicalYear: root.year,
        canonicalExternal: root.mappings,
        type: row.type,
        malId: row.malId,
        title: firstTitle(row.titles),
        titles: row.titles,
        year: row.year,
        relation: true,
        season: null,
        episodeOffset: null,
      });
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, candidates.length) }, worker),
  );
  return result;
}

async function findCanonicalSeriesRoot(malId, { fetchImpl, baseUrl, now }) {
  const visited = new Set();
  let currentMalId = positiveInt(malId);
  let currentRecord = null;
  let sourceRecord = null;

  for (let depth = 0; currentMalId && depth < 16 && !visited.has(currentMalId); depth += 1) {
    visited.add(currentMalId);
    currentRecord = await fetchRecord(currentMalId, { fetchImpl, baseUrl, now });
    if (!currentRecord) return null;
    if (!sourceRecord) sourceRecord = currentRecord;

    const sequence = Array.isArray(currentRecord.sequence) ? currentRecord.sequence : [];
    const parentSeries = sequence.find((entry) =>
      String(entry?.relationType || "").toUpperCase() === "PARENT"
      && ["TV", "TV_SHORT", "ONA", "OVA"].includes(String(entry?.format || "").toUpperCase())
      && positiveInt(entry?.malId),
    );

    if (parentSeries) {
      const parentRecord = await fetchRecord(parentSeries.malId, { fetchImpl, baseUrl, now });
      if (parentRecord
        && sharesSeriesIdentity(sourceRecord, parentRecord)
        && sameSeriesTitle(sourceRecord, parentRecord)) {
        return currentRecordToRoot(parentSeries.malId, parentRecord);
      }
    }

    const prequelEntries = sequence
      .filter((entry) =>
        String(entry?.relationType || "").toUpperCase() === "PREQUEL"
        && positiveInt(entry?.malId),
      );
    const prequelSeries = prequelEntries
      .filter((entry) => ["TV", "TV_SHORT", "ONA", "OVA"].includes(String(entry?.format || "").toUpperCase()))
      .sort((a, b) => Number(a?.seasonYear || 9999) - Number(b?.seasonYear || 9999))[0];
    const prequel = prequelSeries
      || prequelEntries.sort((a, b) => Number(a?.seasonYear || 9999) - Number(b?.seasonYear || 9999))[0];

    if (!prequel) {
      return sharesSeriesIdentity(sourceRecord, currentRecord)
        ? currentRecordToRoot(currentMalId, currentRecord)
        : null;
    }

    const prequelRecord = await fetchRecord(prequel.malId, { fetchImpl, baseUrl, now });
    if (!prequelRecord
      || !sharesSeriesIdentity(sourceRecord, prequelRecord)
      || !sameSeriesTitle(sourceRecord, prequelRecord)) {
      return currentRecordToRoot(currentMalId, currentRecord);
    }

    currentMalId = positiveInt(prequel.malId);
  }

  return null;
}

function sharesSeriesIdentity(sourceRecord, candidateRecord) {
  if (!sourceRecord || !candidateRecord) return false;

  const sourceMappings = sourceRecord?.mappings || {};
  const candidateMappings = candidateRecord?.mappings || {};
  const stableKeys = ["tvdb", "tmdb", "trakt"];

  return stableKeys.some((key) => {
    const sourceId = positiveInt(sourceMappings[key]);
    const candidateId = positiveInt(candidateMappings[key]);
    return sourceId && candidateId && sourceId === candidateId;
  });
}

function sameSeriesTitle(sourceRecord, candidateRecord) {
  const sourceTitles = recordTitles(sourceRecord);
  const candidateTitles = recordTitles(candidateRecord);
  if (!sourceTitles.length || !candidateTitles.length) return false;

  for (const sourceTitle of sourceTitles) {
    for (const candidateTitle of candidateTitles) {
      const candidateVariants = seriesTitleTokenVariants(candidateTitle);
      for (const sourceVariant of seriesTitleTokenVariants(sourceTitle)) {
        if (sourceVariant.tokens.size < 2) continue;
        for (const candidateVariant of candidateVariants) {
          if (sourceVariant.kind !== candidateVariant.kind || candidateVariant.tokens.size < 2) continue;

          if (sourceVariant.kind === "full") {
            if (isSeriesTitlePrefix(sourceVariant.tokenList, candidateVariant.tokenList)) return true;
            continue;
          }

          const smaller = sourceVariant.tokens.size <= candidateVariant.tokens.size
            ? sourceVariant.tokens
            : candidateVariant.tokens;
          const larger = sourceVariant.tokens.size <= candidateVariant.tokens.size
            ? candidateVariant.tokens
            : sourceVariant.tokens;
          if ([...smaller].every((token) => larger.has(token))) return true;
        }
      }
    }
  }
  return false;
}

function isSeriesTitlePrefix(left, right) {
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  return shorter.every((token, index) => token === longer[index]);
}

function recordTitles(record) {
  const title = record?.title || {};
  return [
    title.english,
    title.romaji,
    title.native,
  ].map((value) => String(value || "").trim()).filter(Boolean);
}

function seriesTitleTokenVariants(value) {
  const text = String(value || "").trim();
  const variants = [
    { kind: "full", value: text },
  ];
  const dashStem = text.split(/\s+[-–—]\s+/)[0].trim();
  if (dashStem && dashStem !== text) variants.push({ kind: "dash", value: dashStem });
  const colonStem = text.split(/[:：]/, 1)[0].trim();
  if (colonStem && colonStem !== text) variants.push({ kind: "colon", value: colonStem });

  const seen = new Set();
  return variants
    .map((variant) => ({ kind: variant.kind, tokens: seriesTitleTokens(variant.value) }))
    .filter((variant) => {
      const key = variant.kind + ":" + JSON.stringify([...variant.tokens].sort());
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function seriesTitleTokens(value) {
  const ignored = new Set([
    "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th",
    "season", "seasons", "part", "parts", "stage", "stages", "cour", "arc",
    "episode", "episodes", "the", "a", "an", "final", "finale",
  ]);
  return new Set(normalizeSeriesTitle(value)
    .split(" ")
    .filter((token) => token && !ignored.has(token) && !/^\d+$/.test(token)));
}

function normalizeSeriesTitle(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function currentRecordToRoot(malId, record) {
  const mappings = record?.mappings || {};
  return {
    malId,
    anilistId: positiveInt(mappings.anilist),
    title: firstTitle([
      record?.title?.english,
      record?.title?.romaji,
      record?.title?.native,
    ]),
    type: record?.type || null,
    year: positiveInt(record?.year),
    mappings,
  };
}
