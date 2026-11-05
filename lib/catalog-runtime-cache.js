import { createHash } from "node:crypto";

const CACHE_NAMESPACE = "anibloom-catalog-v1";
const ANILIST_COOLDOWN_KEY = "anilist:shared-cooldown";
let injectedCache = null;
let runtimeCachePromise = null;

export function catalogCacheKey(kind, value) {
  const digest = createHash("sha256").update(JSON.stringify(value)).digest("hex");
  return `${String(kind || "catalog")}:v1:${digest}`;
}

// Bump this only when the serialized normalized catalog response schema changes.
// Do not rotate the shared AniList GraphQL cache or rate-limit/cooldown keys.
export const CATALOG_RESPONSE_SCHEMA_VERSION = 2;

export function catalogResponseCacheKey({ id, seasonInfo, skip, search }) {
  return catalogCacheKey("catalog-response", {
    schemaVersion: CATALOG_RESPONSE_SCHEMA_VERSION,
    id,
    seasonInfo,
    skip,
    search,
  });
}

export function setCatalogRuntimeCacheForTests(cache) {
  injectedCache = cache || null;
  runtimeCachePromise = null;
}

async function getRuntimeCache() {
  if (injectedCache) return injectedCache;
  if (process.env.VERCEL !== "1") return null;

  if (!runtimeCachePromise) {
    runtimeCachePromise = import("@vercel/functions")
      .then(({ getCache }) => getCache({ namespace: CACHE_NAMESPACE }))
      .catch(() => null);
  }
  return runtimeCachePromise;
}

export async function getCatalogRuntimeCache(key) {
  const cache = await getRuntimeCache();
  if (!cache || typeof cache.get !== "function") return null;
  try {
    return await cache.get(String(key)) ?? null;
  } catch {
    return null;
  }
}

export async function setCatalogRuntimeCache(key, value, ttlSeconds) {
  const ttl = Math.floor(Number(ttlSeconds));
  if (!Number.isFinite(ttl) || ttl < 1 || ttl > 31_536_000) return false;

  const cache = await getRuntimeCache();
  if (!cache || typeof cache.set !== "function") return false;
  try {
    await cache.set(String(key), value, { ttl });
    return true;
  } catch {
    return false;
  }
}

export async function deleteCatalogRuntimeCache(key) {
  const cache = await getRuntimeCache();
  if (!cache || typeof cache.delete !== "function") return false;
  try {
    await cache.delete(String(key));
    return true;
  } catch {
    return false;
  }
}

export async function getSharedAniListCooldownUntil() {
  const value = await getCatalogRuntimeCache(ANILIST_COOLDOWN_KEY);
  const until = Number(value?.until);
  return Number.isFinite(until) && until > Date.now() ? until : 0;
}

export async function setSharedAniListCooldownUntil(until) {
  const timestamp = Math.floor(Number(until));
  const ttl = Math.ceil((timestamp - Date.now()) / 1000);
  if (!Number.isFinite(timestamp) || ttl < 1) return false;
  return setCatalogRuntimeCache(ANILIST_COOLDOWN_KEY, { until: timestamp }, Math.min(ttl, 3600));
}

export async function keepCatalogTaskAlive(promise) {
  if (process.env.VERCEL === "1") {
    try {
      const { waitUntil } = await import("@vercel/functions");
      waitUntil(promise);
      return true;
    } catch {
      // Keep the request path resilient if the platform helper is unavailable.
    }
  }
  promise.catch(() => {});
  return false;
}
