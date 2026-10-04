const ANIBRIDGE_MAPPINGS_URL = "https://github.com/anibridge/anibridge-mappings/releases/download/v3/mappings.min.json";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 60 * 60 * 1000;

let mappingsCache = null;
let mappingsExpiresAt = 0;
let mappingsPromise = null;

export async function resolveAniListMappingsByAniBridge(rows, {
  fetchImpl = fetch,
  endpoint = ANIBRIDGE_MAPPINGS_URL,
  now = () => Date.now(),
} = {}) {
  const normalizedRows = (Array.isArray(rows) ? rows : [])
    .map(normalizeRow)
    .filter(Boolean);
  if (!normalizedRows.length) return new Map();

  const payload = await loadMappings({ fetchImpl, endpoint, now });
  const result = new Map();

  for (const row of normalizedRows) {
    const source = payload?.[`anilist:${row.anilistId}`];
    const relatedProviderIds = collectRelatedProviderIds(payload, row);
    const records = normalizeSourceMappings(source, row, relatedProviderIds);
    if (records.length) result.set(row.anilistId, records);
  }

  return result;
}

export function normalizeAniBridgeMappings(source, row) {
  return normalizeSourceMappings(source, normalizeRow(row));
}

export function clearAniBridgeCache() {
  mappingsCache = null;
  mappingsExpiresAt = 0;
  mappingsPromise = null;
}

async function loadMappings({ fetchImpl, endpoint, now }) {
  if (mappingsCache && mappingsExpiresAt > now()) return mappingsCache;
  if (mappingsPromise) return mappingsPromise;

  mappingsPromise = (async () => {
    try {
      const response = await fetchImpl(endpoint, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`AniBridge mappings HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("AniBridge mappings response must be an object.");
      }
      mappingsCache = payload;
      mappingsExpiresAt = now() + CACHE_TTL_MS;
      return mappingsCache;
    } catch (error) {
      mappingsCache = {};
      mappingsExpiresAt = now() + NEGATIVE_TTL_MS;
      throw error;
    } finally {
      mappingsPromise = null;
    }
  })();

  return mappingsPromise;
}

function normalizeSourceMappings(source, row, relatedProviderIds = []) {
  if (!source || typeof source !== "object" || !row) return [];

  const records = [];
  for (const descriptor of Object.keys(source)) {
    const parsed = parseProviderDescriptor(descriptor);
    if (!parsed || !isSupportedProvider(parsed, row.format)) continue;

    records.push({
      source: "anibridge",
      anilistId: row.anilistId,
      type: row.type,
      malId: row.malId,
      imdbIds: parsed.provider === "imdb" ? [parsed.id] : [],
      tvdbId: parsed.provider === "tvdb" ? Number(parsed.id) : null,
      tmdbTvId: parsed.provider === "tmdb" && parsed.mediaType !== "movie" ? Number(parsed.id) : null,
      tmdbMovieIds: parsed.provider === "tmdb" && parsed.mediaType === "movie" ? [Number(parsed.id)] : [],
      title: row.title,
      titles: row.titles,
      year: row.year,
      season: parsed.scope ? parseSeason(parsed.scope) : null,
      episodeOffset: null,
      relatedProviderIds,
    });
  }

  return dedupeRecords(records);
}

function collectRelatedProviderIds(payload, row) {
  const relationTypes = new Set(["PARENT", "PREQUEL", "SEQUEL", "SPIN_OFF", "SIDE_STORY"]);
  const ids = new Set();

  for (const edge of row.relations || []) {
    if (!relationTypes.has(String(edge?.relationType || "").toUpperCase())) continue;

    for (const link of Array.isArray(edge?.node?.externalLinks) ? edge.node.externalLinks : []) {
      const parsed = parseProviderLink(link);
      if (parsed) ids.add(`${parsed.provider}:${parsed.id}`);
    }

    const relatedId = positiveInt(edge?.node?.id);
    if (!relatedId) continue;
    const relatedSource = payload?.[`anilist:${relatedId}`];
    for (const descriptor of Object.keys(relatedSource || {})) {
      const parsed = parseProviderDescriptor(descriptor);
      if (!parsed || !isSupportedProvider(parsed, edge?.node?.format)) continue;
      ids.add(`${parsed.provider}:${parsed.id}`);
    }
  }

  return [...ids];
}

function parseProviderLink(link) {
  const site = String(link?.site || "").toLowerCase();
  const url = String(link?.url || "");
  let match;
  if (site.includes("imdb") && (match = url.match(/\/title\/(tt\d+)/i))) {
    return { provider: "imdb", id: match[1] };
  }
  if (site.includes("tvdb") && (match = url.match(/\/series\/(\d+)/i))) {
    return { provider: "tvdb", id: match[1] };
  }
  if (site.includes("tmdb") && (match = url.match(/\/(?:tv|movie)\/(\d+)/i))) {
    return { provider: "tmdb", id: match[1] };
  }
  return null;
}

function parseProviderDescriptor(value) {
  const parts = String(value || "").split(":");
  if (parts.length < 2) return null;

  const provider = parts[0];
  const id = parts[1];
  const scope = parts.length >= 3 ? parts.slice(2).join(":") : null;

  if (provider === "imdb_show" && /^tt\d+$/.test(id)) {
    return { provider: "imdb", id, mediaType: "tv", scope };
  }
  if (provider === "imdb_movie" && /^tt\d+$/.test(id)) {
    return { provider: "imdb", id, mediaType: "movie", scope };
  }
  if (provider === "tvdb_show" && /^\d+$/.test(id)) {
    return { provider: "tvdb", id, mediaType: "tv", scope };
  }
  if (provider === "tvdb_movie" && /^\d+$/.test(id)) {
    return { provider: "tvdb", id, mediaType: "movie", scope };
  }
  if (provider === "tmdb_show" && /^\d+$/.test(id)) {
    return { provider: "tmdb", id, mediaType: "tv", scope };
  }
  if (provider === "tmdb_movie" && /^\d+$/.test(id)) {
    return { provider: "tmdb", id, mediaType: "movie", scope };
  }
  return null;
}

function isSupportedProvider(providerDescriptor, format) {
  if (providerDescriptor.mediaType === "movie") {
    return String(format).toUpperCase() === "MOVIE"
      || ["OVA", "SPECIAL", "ONA"].includes(String(format).toUpperCase());
  }
  return String(format).toUpperCase() !== "MOVIE";
}

function parseSeason(scope) {
  const match = String(scope || "").match(/^s(\d+)$/i);
  return match ? { tvdb: Number(match[1]), tmdb: Number(match[1]) } : null;
}

function dedupeRecords(records) {
  const seen = new Set();
  return records.filter((record) => {
    const ids = [
      ...(record.imdbIds || []).map((id) => `imdb:${id}`),
      record.tvdbId ? `tvdb:${record.tvdbId}` : null,
      ...(record.tmdbTvId ? [`tmdb:${record.tmdbTvId}`] : []),
      ...(record.tmdbMovieIds || []).map((id) => `tmdb:${id}`),
    ].filter(Boolean);
    const key = ids.join("|");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeRow(row) {
  const anilistId = positiveInt(row?.anilistId ?? row?.id);
  if (!anilistId) return null;

  const title = row?.title || {};
  const titles = [
    title.english,
    title.romaji,
    title.native,
    ...(Array.isArray(row?.synonyms) ? row.synonyms : []),
  ].map((value) => String(value || "").trim()).filter(Boolean);

  const format = String(row?.format || row?.type || "TV").toUpperCase();
  return {
    anilistId,
    malId: positiveInt(row?.malId ?? row?.idMal),
    type: format === "MOVIE" ? "MOVIE" : "TV",
    format,
    year: positiveInt(row?.startDate?.year ?? row?.year),
    title: titles[0] || null,
    titles,
    relations: Array.isArray(row?.relations?.edges) ? row.relations.edges : [],
  };
}

function positiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
