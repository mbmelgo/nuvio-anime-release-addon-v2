const KONOHA_BASE_URL = "https://cdn.jsdelivr.net/gh/AlokRepo/Konoha@main/data/slugs";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 60 * 60 * 1000;
const RELATED_RELATIONS = new Set(["PARENT", "PREQUEL", "SEQUEL", "SPIN_OFF", "SIDE_STORY"]);
const cache = new Map();

export async function resolveAniListMappingsByKonoha(rows, {
  fetchImpl = fetch,
  baseUrl = KONOHA_BASE_URL,
  concurrency = 3,
  now = () => Date.now(),
} = {}) {
  const candidates = (Array.isArray(rows) ? rows : []).map(normalizeRow).filter(Boolean);
  const result = new Map();
  let cursor = 0;

  async function worker() {
    while (cursor < candidates.length) {
      const row = candidates[cursor++];
      const record = await resolveRow(row, { fetchImpl, baseUrl, now });
      if (record) result.set(row.anilistId, [record]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, worker));
  return result;
}

async function resolveRow(row, { fetchImpl, baseUrl, now }) {
  const directTitles = row.titles;
  for (const title of directTitles) {
    const record = await fetchRecord(row.anilistId, title, { fetchImpl, baseUrl, now });
    if (!record || Number(record?.ids?.anilist) !== row.anilistId) continue;
    const provider = buildProviderIdentity(record, row.type);
    if (provider) {
      return {
        ...provider,
        source: "konoha",
        anilistId: row.anilistId,
        type: row.type,
        malId: row.malId,
        title: row.titles[0] || null,
        titles: row.titles,
        year: null,
        season: null,
        episodeOffset: null,
      };
    }
  }

  for (const relation of row.relations) {
    if (!RELATED_RELATIONS.has(relation.relationType) || !relation.anilistId) continue;
    for (const title of relation.titles) {
      const record = await fetchRecord(relation.anilistId, title, { fetchImpl, baseUrl, now });
      if (!record || Number(record?.ids?.anilist) !== relation.anilistId) continue;
      const provider = buildProviderIdentity(record, row.type);
      if (!provider) continue;
      return {
        ...provider,
        source: "konoha-relation",
        anilistId: row.anilistId,
        type: row.type,
        malId: row.malId,
        title: row.titles[0] || null,
        titles: row.titles,
        year: null,
        relationType: relation.relationType,
        relatedAnilistId: relation.anilistId,
        season: null,
        episodeOffset: null,
      };
    }
  }

  return null;
}

async function fetchRecord(anilistId, title, { fetchImpl, baseUrl, now }) {
  const slug = slugify(title);
  if (!slug) return null;
  const bucket = String(Math.floor(anilistId / 1000));
  const key = `anilist:${anilistId}:${slug}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now()) return cached.record;
  cache.delete(key);

  try {
    const url = `${baseUrl}/${bucket}/${slug}-${anilistId}/index.json`;
    const response = await fetchImpl(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Konoha HTTP ${response.status}`);
    const record = await response.json();
    cache.set(key, { record, expiresAt: now() + CACHE_TTL_MS });
    return record;
  } catch {
    cache.set(key, { record: null, expiresAt: now() + NEGATIVE_TTL_MS });
    return null;
  }
}

function buildProviderIdentity(record, type) {
  const tmdb = positiveInt(record?.ids?.tmdb);
  if (!tmdb) return null;
  const tmdbType = String(record?.ids?.tmdb_type || "").toLowerCase();
  if (type === "MOVIE" || tmdbType === "movie") {
    return { imdbIds: [], tvdbId: null, tmdbTvId: null, tmdbMovieIds: [tmdb] };
  }
  return { imdbIds: [], tvdbId: null, tmdbTvId: tmdb, tmdbMovieIds: [] };
}

function normalizeRow(row) {
  const anilistId = positiveInt(row?.anilistId ?? row?.id);
  if (!anilistId) return null;

  const title = row?.title || {};
  const synonyms = Array.isArray(row?.synonyms) ? row.synonyms : [];
  const titles = [...new Map([
    row?.titleEnglish,
    row?.titleRomaji,
    row?.titleNative,
    title.english,
    title.romaji,
    title.native,
    ...synonyms,
    row?.name,
  ].map((value) => String(value || "").trim()).filter(Boolean).map((value) => [slugify(value), value])).values()];

  const relations = (Array.isArray(row?.relations?.edges) ? row.relations.edges : [])
    .filter((edge) => RELATED_RELATIONS.has(String(edge?.relationType || "").toUpperCase()) && positiveInt(edge?.node?.id))
    .map((edge) => ({
      relationType: String(edge.relationType).toUpperCase(),
      anilistId: positiveInt(edge.node.id),
      titles: [
        edge?.node?.title?.english,
        edge?.node?.title?.romaji,
        edge?.node?.title?.native,
      ].map((value) => String(value || "").trim()).filter(Boolean),
    }));

  return {
    anilistId,
    malId: positiveInt(row?.malId ?? row?.idMal),
    type: String(row?.type || row?.format || "").toUpperCase() === "MOVIE" ? "MOVIE" : "TV",
    titles,
    relations,
  };
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function positiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export function clearKonohaCache() {
  cache.clear();
}
