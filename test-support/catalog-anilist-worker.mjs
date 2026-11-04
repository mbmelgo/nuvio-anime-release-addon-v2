import { parentPort, workerData } from "node:worker_threads";

const nativeFetch = globalThis.fetch;
const { baseUrl } = workerData;
const cache = {
  async get(key) {
    const response = await nativeFetch(`${baseUrl}/cache/get?key=${encodeURIComponent(key)}`);
    return (await response.json()).value ?? null;
  },
  async set(key, value) {
    const response = await nativeFetch(`${baseUrl}/cache/set`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    if (!response.ok) throw new Error("shared cache write failed");
  },
};
const redis = {
  async get(key) {
    if (!key.startsWith("anibloom:anilist:response:v1:")) return null;
    return cache.get(key);
  },
  async set(key, token, options) {
    if (key.startsWith("anibloom:anilist:response:v1:")) {
      await cache.set(key, token);
      return "OK";
    }
    const response = await nativeFetch(`${baseUrl}/lock/set`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, token, leaseMs: options.px }),
    });
    if (!response.ok) throw new Error("Redis lock unavailable");
    return (await response.json()).result;
  },
  async eval(_script, keys, args) {
    const response = await nativeFetch(`${baseUrl}/lock/release`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: keys[0], token: args[0] }),
    });
    return (await response.json()).result;
  },
};

const [
  { setCatalogRuntimeCacheForTests },
  { setAniListRedisClientForTests, setAniListRateLimiterForTests },
  { clearAniListRateLimitState, queryAnime },
] = await Promise.all([
  import("../lib/catalog-runtime-cache.js"),
  import("../lib/catalog-rate-limiter.js"),
  import("../lib/catalog-anilist.js"),
]);

setCatalogRuntimeCacheForTests(cache);
setAniListRedisClientForTests(redis);
setAniListRateLimiterForTests(async () => ({ success: true }));
globalThis.fetch = (url, options) =>
  String(url) === "https://graphql.anilist.co"
    ? nativeFetch(`${baseUrl}/upstream`, options)
    : nativeFetch(url, options);
clearAniListRateLimitState();

try {
  const result = await queryAnime({ season: "FALL", seasonYear: 2026, sort: ["ID"] }, 1);
  parentPort.postMessage({ ok: true, result });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error?.message || "unknown", code: error?.code });
}
