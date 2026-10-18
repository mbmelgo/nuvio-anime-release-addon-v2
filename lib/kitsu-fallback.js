const KITSU_API_BASE = "https://kitsu.io/api/edge";
const DEFAULT_TIMEOUT_MS = 3500;
const POSITIVE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 5000;
const PAGE_LIMIT = 20;
const MAX_CONCURRENT_LOOKUPS = 4;
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

async function fetchMappingForExternalId(site, externalId, fetchImpl, deadlineAt) {
  const found = new Set();
  let offset = 0;
  let totalCount = null;
  let pageCount = 0;
  do {
    const params = new URLSearchParams();
    params.set("filter[externalSite]", site);
    // Kitsu's externalId filter is queried one ID at a time; comma-separated
    // IDs can be rejected or treated as a literal filter value by the API.
    params.set("filter[externalId]", externalId);
    params.set("include", "item");
    params.set("page[limit]", String(PAGE_LIMIT));
    params.set("page[offset]", String(offset));
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 0) throw new Error("Kitsu mapping lookup exceeded its deadline");
    const response = await fetchImpl(KITSU_API_BASE + "/mappings?" + params.toString(), {
      headers: { Accept: "application/vnd.api+json" },
      signal: AbortSignal.timeout(remainingMs),
    });
    if (!response?.ok) throw new Error("Kitsu mapping request failed with status " + Number(response?.status || 0));
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.data)) throw new Error("Kitsu mapping response was invalid");

    const includedAnime = (Array.isArray(payload.included) ? payload.included : [])
      .filter((item) => item?.type === "anime" && validPositiveId(item.id));
    const reportedCount = Number(payload.meta?.count);
    const hasOneUnambiguousIncludedAnime = payload.data.length === 1
      && reportedCount === 1
      && includedAnime.length === 1;
    for (const mapping of payload.data) {
      const attributes = mapping?.attributes || {};
      const mappedExternalId = validPositiveId(attributes.externalId);
      const item = mapping?.relationships?.item?.data;
      const kitsuId = item?.type === "anime"
        ? validPositiveId(item.id)
        : hasOneUnambiguousIncludedAnime ? validPositiveId(includedAnime[0].id) : null;
      if (attributes.externalSite !== site || mappedExternalId !== externalId || !kitsuId) continue;
      found.add(kitsuId);
    }
    totalCount = Number.isFinite(reportedCount) && reportedCount >= 0 ? reportedCount : null;
    offset += payload.data.length;
    pageCount += 1;
    if (!payload.data.length || (totalCount !== null && offset >= totalCount)) break;
    if (totalCount === null && payload.data.length < PAGE_LIMIT) break;
    if (pageCount >= 20 && totalCount !== null && offset < totalCount) {
      throw new Error("Kitsu mapping response exceeded the safe pagination limit");
    }
  } while (true);
  return [...found];
}

async function fetchMappingsForSite(site, externalIds, fetchImpl, timeoutMs) {
  const resolved = new Map();
  const uncached = [];
  for (const externalId of externalIds) {
    const key = site + ":" + externalId;
    const cached = cacheRead(key);
    if (cached !== undefined) resolved.set(externalId, cached);
    else uncached.push(externalId);
  }
  if (!uncached.length) return resolved;

  const deadlineAt = Date.now() + timeoutMs;
  let nextIndex = 0;
  let failures = 0;
  async function worker() {
    while (nextIndex < uncached.length) {
      const externalId = uncached[nextIndex++];
      try {
        const ids = await fetchMappingForExternalId(site, externalId, fetchImpl, deadlineAt);
        cacheWrite(site + ":" + externalId, ids);
        resolved.set(externalId, ids.length ? ids : null);
      } catch {
        failures += 1;
      }
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(MAX_CONCURRENT_LOOKUPS, uncached.length) },
    () => worker(),
  ));
  if (failures) {
    console.error("[identity] Kitsu mapping lookup had upstream failures", { site, failedCount: failures });
  }
  return resolved;
}

function uniqueMapping(map, externalId) {
  const ids = externalId ? map.get(externalId) : undefined;
  if (!Array.isArray(ids)) return ids === null ? null : undefined;
  return ids.length === 1 ? ids[0] : ids.length > 1 ? false : null;
}

/**
 * Additive fallback resolver. It runs only after the existing identity
 * pipeline has selected a MAL/AniList fallback and never reselects providers.
 */
export async function resolveAniListKitsuMappings(rows, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const targets = (Array.isArray(rows) ? rows : [])
    .filter((row) => /^\d+$/.test(String(row?.id ?? ""))
      && /^(?:mal|anilist):\d+$/.test(String(row?.currentFallbackId || "")))
    .map((row) => {
      const currentFallbackId = String(row.currentFallbackId);
      const fallbackMalId = currentFallbackId.match(/^mal:(\d+)$/)?.[1];
      return {
        id: validPositiveId(row.id),
        idMal: validPositiveId(row.idMal) || validPositiveId(fallbackMalId),
        currentFallbackId,
      };
    })
    .filter((row) => row.id);

  const malPreferred = targets.filter((row) => row.currentFallbackId.startsWith("mal:"));
  const anilistPreferred = targets.filter((row) => row.currentFallbackId.startsWith("anilist:"));
  const [preferredAnilistMappings, preferredMalMappings] = await Promise.all([
    fetchMappingsForSite(
      "anilist/anime",
      [...new Set(anilistPreferred.map((row) => row.id).filter(Boolean))],
      fetchImpl,
      timeoutMs,
    ),
    fetchMappingsForSite(
      "myanimelist/anime",
      [...new Set(malPreferred.map((row) => row.idMal).filter(Boolean))],
      fetchImpl,
      timeoutMs,
    ),
  ]);

  const result = new Map();
  const secondaryTargets = [];
  for (const row of targets) {
    const currentIsMal = row.currentFallbackId.startsWith("mal:");
    const preferred = currentIsMal
      ? uniqueMapping(preferredMalMappings, row.idMal)
      : uniqueMapping(preferredAnilistMappings, row.id);
    if (preferred === false) continue;
    if (typeof preferred === "string") {
      result.set(Number(row.id), preferred);
    } else {
      secondaryTargets.push(row);
    }
  }

  if (!secondaryTargets.length) return result;
  const secondaryAnilistTargets = secondaryTargets.filter((row) => row.currentFallbackId.startsWith("mal:"));
  const secondaryMalTargets = secondaryTargets.filter((row) => row.currentFallbackId.startsWith("anilist:"));
  const [secondaryAnilistMappings, secondaryMalMappings] = await Promise.all([
    fetchMappingsForSite(
      "anilist/anime",
      [...new Set(secondaryAnilistTargets.map((row) => row.id).filter(Boolean))],
      fetchImpl,
      timeoutMs,
    ),
    fetchMappingsForSite(
      "myanimelist/anime",
      [...new Set(secondaryMalTargets.map((row) => row.idMal).filter(Boolean))],
      fetchImpl,
      timeoutMs,
    ),
  ]);

  for (const row of secondaryTargets) {
    const currentIsMal = row.currentFallbackId.startsWith("mal:");
    const secondary = currentIsMal
      ? uniqueMapping(secondaryAnilistMappings, row.id)
      : uniqueMapping(secondaryMalMappings, row.idMal);
    if (typeof secondary === "string") result.set(Number(row.id), secondary);
  }
  return result;
}

export async function applyKitsuFallback(metas, resolveMappings = resolveAniListKitsuMappings, diagnostics = null) {
  const normalizedMetas = Array.isArray(metas) ? metas : [];
  const targets = normalizedMetas
    .filter((meta) => /^(?:mal|anilist):\d+$/.test(String(meta?.id || "")))
    .map((meta) => {
      const currentFallbackId = String(meta.id);
      const fallbackMalId = currentFallbackId.match(/^mal:(\d+)$/)?.[1];
      return {
        id: validPositiveId(meta.extra?.anilistId),
        idMal: validPositiveId(meta.extra?.malId) || validPositiveId(fallbackMalId),
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
