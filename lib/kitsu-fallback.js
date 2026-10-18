const KITSU_API_BASE = "https://kitsu.io/api/edge";
const DEFAULT_TIMEOUT_MS = 3500;
const POSITIVE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 5000;
const BATCH_SIZE = 50;
const mappingCache = new Map();

function validPositiveId(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? String(number) : null;
}

function cacheRead(key, now = Date.now()) {
  const entry = mappingCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= now) {
    mappingCache.delete(key);
    return undefined;
  }
  // Refresh insertion order so the bounded cache behaves as an LRU.
  mappingCache.delete(key);
  mappingCache.set(key, entry);
  return entry.ids;
}

function cacheWrite(key, ids, now = Date.now()) {
  const normalized = [...new Set((Array.isArray(ids) ? ids : [])
    .map(validPositiveId)
    .filter(Boolean))];
  mappingCache.delete(key);
  mappingCache.set(key, {
    ids: normalized.length ? normalized : null,
    expiresAt: now + (normalized.length ? POSITIVE_CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS),
  });
  while (mappingCache.size > MAX_CACHE_ENTRIES) {
    mappingCache.delete(mappingCache.keys().next().value);
  }
}

async function fetchMappingsForSite(site, externalIds, fetchImpl, timeoutMs) {
  const resolved = new Map();
  const uncached = [];
  for (const externalId of externalIds) {
    const key = site + ":" + externalId;
    const cached = cacheRead(key);
    if (cached !== undefined) {
      resolved.set(externalId, cached);
    } else {
      uncached.push(externalId);
    }
  }
  if (!uncached.length) return resolved;

  for (let offset = 0; offset < uncached.length; offset += BATCH_SIZE) {
    const batch = uncached.slice(offset, offset + BATCH_SIZE);
    const found = new Map(batch.map((id) => [id, new Set()]));
    let offset = 0;
    let totalCount = null;
    let pageCount = 0;
    do {
      const params = new URLSearchParams();
      params.set("filter[externalSite]", site);
      params.set("filter[externalId]", batch.join(","));
      params.set("page[limit]", "100");
      params.set("page[offset]", String(offset));
      const url = KITSU_API_BASE + "/mappings?" + params.toString();
      const response = await fetchImpl(url, {
        headers: { Accept: "application/vnd.api+json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response?.ok) throw new Error("Kitsu mapping request failed with status " + Number(response?.status || 0));
      const payload = await response.json();
      if (!payload || !Array.isArray(payload.data)) throw new Error("Kitsu mapping response was invalid");

      for (const mapping of payload.data) {
        const attributes = mapping?.attributes || {};
        const externalId = validPositiveId(attributes.externalId);
        const item = mapping?.relationships?.item?.data;
        const kitsuId = item?.type === "anime" ? validPositiveId(item.id) : null;
        if (attributes.externalSite !== site || !externalId || !kitsuId || !found.has(externalId)) continue;
        found.get(externalId).add(kitsuId);
      }
      const reportedCount = Number(payload.meta?.count);
      totalCount = Number.isFinite(reportedCount) && reportedCount >= 0 ? reportedCount : null;
      offset += payload.data.length;
      pageCount += 1;
      if (!payload.data.length || (totalCount !== null && offset >= totalCount)) break;
      if (totalCount === null && payload.data.length < 100) break;
      if (pageCount >= 20 && totalCount !== null && offset < totalCount) {
        throw new Error("Kitsu mapping response exceeded the safe pagination limit");
      }
    } while (true);

    for (const externalId of batch) {
      const ids = [...found.get(externalId)];
      cacheWrite(site + ":" + externalId, ids);
      resolved.set(externalId, ids.length ? ids : null);
    }
  }
  return resolved;
}

function uniqueMapping(map, externalId) {
  const ids = map.get(externalId);
  if (!Array.isArray(ids)) return ids === null ? null : undefined;
  return ids.length === 1 ? ids[0] : ids.length > 1 ? false : null;
}

/**
 * Additive fallback resolver. Rows must carry their current MAL/AniList
 * fallback ID; callers run this only after the existing identity pipeline.
 * The existing provider-selection result is never reconsidered here.
 */
export async function resolveAniListKitsuMappings(rows, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const targets = (Array.isArray(rows) ? rows : []).filter((row) =>
    /^\d+$/.test(String(row?.id ?? ""))
      && /^(?:mal|anilist):\d+$/.test(String(row?.currentFallbackId || "")),
  );
  const anilistIds = [...new Set(targets.map((row) => validPositiveId(row.id)).filter(Boolean))];
  const malIds = [...new Set(targets.map((row) => validPositiveId(row.idMal)).filter(Boolean))];
  const lookups = await Promise.all([
    fetchMappingsForSite("anilist/anime", anilistIds, fetchImpl, timeoutMs)
      .catch((error) => {
        console.error("[identity] Kitsu AniList mapping lookup failed; preserving existing fallback IDs", error);
        return null;
      }),
    fetchMappingsForSite("myanimelist/anime", malIds, fetchImpl, timeoutMs)
      .catch((error) => {
        console.error("[identity] Kitsu MAL mapping lookup failed; preserving existing fallback IDs", error);
        return null;
      }),
  ]);
  const [anilistMappings, malMappings] = lookups;
  const result = new Map();

  for (const row of targets) {
    const anilistId = validPositiveId(row.id);
    const malId = validPositiveId(row.idMal);
    const currentIsMal = String(row.currentFallbackId).startsWith("mal:");
    const preferred = currentIsMal
      ? uniqueMapping(malMappings || new Map(), malId)
      : uniqueMapping(anilistMappings || new Map(), anilistId);
    const secondary = currentIsMal
      ? uniqueMapping(anilistMappings || new Map(), anilistId)
      : uniqueMapping(malMappings || new Map(), malId);

    // A conflicting Kitsu mapping is not safe to override. If the preferred
    // source is ambiguous, retain the original identity instead of guessing.
    if (preferred === false) continue;
    if (typeof preferred === "string") {
      result.set(Number(row.id), preferred);
      continue;
    }
    if (secondary === false || typeof secondary !== "string") continue;
    result.set(Number(row.id), secondary);
  }
  return result;
}

export async function applyKitsuFallback(metas, resolveMappings = resolveAniListKitsuMappings, diagnostics = null) {
  const normalizedMetas = Array.isArray(metas) ? metas : [];
  const targets = normalizedMetas
    .filter((meta) => /^(?:mal|anilist):\d+$/.test(String(meta?.id || "")))
    .map((meta) => {
      const currentFallbackId = String(meta.id);
      const idFromFallback = currentFallbackId.match(/^mal:(\\d+)$/)?.[1];
      return {
        id: validPositiveId(meta.extra?.anilistId),
        idMal: validPositiveId(meta.extra?.malId) || validPositiveId(idFromFallback),
        currentFallbackId,
      };
    })
    .filter((row) => row.id);
  if (!targets.length || typeof resolveMappings !== "function") return normalizedMetas;

  const startedAt = diagnostics ? performance.now() : 0;
  let mappings;
  try {
    mappings = await resolveMappings(targets);
  } catch (error) {
    console.error("[identity] Kitsu fallback failed; preserving existing fallback IDs", error);
    if (diagnostics) diagnostics.kitsu = performance.now() - startedAt;
    return normalizedMetas;
  }
  if (!(mappings instanceof Map)) {
    if (diagnostics) diagnostics.kitsu = performance.now() - startedAt;
    return normalizedMetas;
  }

  const result = normalizedMetas.map((meta) => {
    if (!/^(?:mal|anilist):\d+$/.test(String(meta?.id || ""))) return meta;
    const anilistId = Number(meta.extra?.anilistId);
    const kitsuId = validPositiveId(mappings.get(anilistId));
    if (!kitsuId) return meta;
    return {
      ...meta,
      id: "kitsu:" + kitsuId,
      extra: {
        ...meta.extra,
        identityProvider: "kitsu",
        identityId: kitsuId,
        identityEvidence: [{ source: "kitsu-mapping", season: null, episodeOffset: null, relation: false }],
        identityFallback: "kitsu",
        identityFallbackFrom: meta.id,
      },
    };
  });
  if (diagnostics) diagnostics.kitsu = performance.now() - startedAt;
  return result;
}
