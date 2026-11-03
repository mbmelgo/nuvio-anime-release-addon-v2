import { parentPort, workerData } from "node:worker_threads";

const nativeFetch = globalThis.fetch;
const { baseUrl, mode, lockUnavailable = false, cacheWriteFailure = false } = workerData;
// Mocked provider failures are expected in this amplification scenario.
console.error = () => {};
console.warn = () => {};
const cache = {
  async get(key) {
    const response = await nativeFetch(`${baseUrl}/cache/get?key=${encodeURIComponent(key)}`);
    return (await response.json()).value ?? null;
  },
  async set(key, value) {
    const response = await nativeFetch(`${baseUrl}/cache/set`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, value, cacheWriteFailure }),
    });
    if (!response.ok) throw new Error("shared cache write failed");
  },
};
globalThis.fetch = (url, options) => {
  const target = String(url);
  if (target === "https://graphql.anilist.co") {
    return nativeFetch(`${baseUrl}/upstream/anilist`, options);
  }
  if (target === "https://arm.haglund.dev/api/v2/ids") {
    return nativeFetch(`${baseUrl}/upstream/arm`, options);
  }
  return nativeFetch(`${baseUrl}/upstream/provider`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: target, method: options?.method || "GET" }),
  });
};

const redis = {
  async set(key, token, options) {
    const response = await nativeFetch(`${baseUrl}/lock/set`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, token, leaseMs: options.px, lockUnavailable }),
    });
    if (!response.ok) throw new Error("shared lock service unavailable");
    return (await response.json()).result;
  },
  async eval(script, keys, args) {
    const renew = script.includes("pexpire");
    const response = await nativeFetch(`${baseUrl}/lock/${renew ? "renew" : "release"}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: keys[0], token: args[0], leaseMs: Number(args[1]) }),
    });
    return (await response.json()).result;
  },
};

const [
  { setCatalogRuntimeCacheForTests },
  { setAniListRedisClientForTests, setAniListRateLimiterForTests },
  { default: catalogSource },
] = await Promise.all([
  import("../lib/catalog-runtime-cache.js"),
  import("../lib/catalog-rate-limiter.js"),
  import("../api/catalog-source.js"),
]);

setCatalogRuntimeCacheForTests(cache);
setAniListRedisClientForTests(redis);
setAniListRateLimiterForTests(async () => ({ success: true }));

try {
  const response = await catalogSource.fetch(new Request(
    "https://anibloom.example/catalog/movie/current_season_movies.json",
  ));
  const body = await response.json();
  if (mode === "stale") {
    const waited = await nativeFetch(`${baseUrl}/wait-for-catalog-writes?count=1`);
    if (!waited.ok) throw new Error("timed out waiting for background catalog refreshes");
  }
  parentPort.postMessage({
    ok: response.status === 200,
    status: response.status,
    stale: response.headers.get("x-nuvio-catalog-stale") === "1",
    metas: body.metas || [],
  });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error?.message || "unknown" });
}
