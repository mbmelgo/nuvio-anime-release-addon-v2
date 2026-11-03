import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Worker } from "node:worker_threads";
import test from "node:test";

async function runCrossInstanceScenario({ failCacheWrites = false, lockUnavailable = false, upstream429 = false } = {}) {
  const cache = new Map();
  const locks = new Map();
  let responseCacheReads = 0;
  let upstreamCalls = 0;
  let releaseInitialReads;
  const initialReads = new Promise(resolve => { releaseInitialReads = resolve; });
  const pendingReads = [];

  const sendJson = (res, body, status = 200) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const readBody = async req => {
    let body = "";
    for await (const chunk of req) body += chunk;
    return body ? JSON.parse(body) : {};
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/cache/get") {
      const key = url.searchParams.get("key");
      if (key?.startsWith("anilist-response:") && responseCacheReads < 2) {
        responseCacheReads += 1;
        pendingReads.push({ key, res });
        if (responseCacheReads === 2) {
          releaseInitialReads();
          for (const item of pendingReads.splice(0)) sendJson(item.res, { value: null });
        }
        return;
      }
      sendJson(res, { value: cache.get(key) ?? null });
      return;
    }
    if (url.pathname === "/cache/set" && req.method === "POST") {
      const { key, value } = await readBody(req);
      if (failCacheWrites) {
        sendJson(res, { error: "simulated cache write failure" }, 503);
        return;
      }
      cache.set(key, value);
      sendJson(res, { ok: true });
      return;
    }
    if (url.pathname === "/lock/set" && req.method === "POST") {
      if (lockUnavailable) {
        sendJson(res, { error: "simulated Redis outage" }, 503);
        return;
      }
      const { key, token, leaseMs } = await readBody(req);
      const existing = locks.get(key);
      if (existing && existing.expiresAt > Date.now()) {
        sendJson(res, { result: null });
        return;
      }
      locks.set(key, { token, expiresAt: Date.now() + leaseMs });
      sendJson(res, { result: "OK" });
      return;
    }
    if (url.pathname === "/lock/release" && req.method === "POST") {
      const { key, token } = await readBody(req);
      const existing = locks.get(key);
      const released = existing?.token === token;
      if (released) locks.delete(key);
      sendJson(res, { result: released ? 1 : 0 });
      return;
    }
    if (url.pathname === "/upstream" && req.method === "POST") {
      upstreamCalls += 1;
      await new Promise(resolve => setTimeout(resolve, 100));
      if (upstream429) {
        res.writeHead(429, { "content-type": "application/json", "retry-after": "60" });
        res.end(JSON.stringify({}));
      } else {
        sendJson(res, { data: { Page: { media: [{ id: 123 }] } } });
      }
      return;
    }
    res.writeHead(404).end();
  });

  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const workerUrl = new URL("../test-support/catalog-anilist-worker.mjs", import.meta.url);
  const workers = [0, 1].map(() => new Worker(workerUrl, { workerData: { baseUrl } }));
  const startedAt = Date.now();

  try {
    const results = await Promise.all(workers.map(worker => new Promise((resolve, reject) => {
      worker.once("message", resolve);
      worker.once("error", reject);
      worker.once("exit", code => {
        if (code !== 0) reject(new Error(`worker exited with code ${code}`));
      });
    })));
    await initialReads;
    return {
      results,
      upstreamCalls,
      activeLocks: locks.size,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await Promise.all(workers.map(worker => worker.terminate()));
    await new Promise(resolve => server.close(resolve));
  }
}

test("separate AniBloom workers coalesce identical cold AniList requests through shared Redis and cache", async () => {
  const result = await runCrossInstanceScenario();
  assert.deepEqual(result.results, [
    { ok: true, result: [{ id: 123 }] },
    { ok: true, result: [{ id: 123 }] },
  ]);
  assert.equal(result.upstreamCalls, 1, "only the lock owner should call AniList for an identical cold query");
  assert.equal(result.activeLocks, 0, "the lock owner must release its lease after caching the response");
  assert.ok(result.durationMs < 3_000, "both workers should complete within the bounded test window");
});

test("cache-write failures release the lock and allow a later worker to retry", async () => {
  const result = await runCrossInstanceScenario({ failCacheWrites: true });
  assert.deepEqual(result.results, [
    { ok: true, result: [{ id: 123 }] },
    { ok: true, result: [{ id: 123 }] },
  ]);
  assert.equal(result.upstreamCalls, 2, "a later owner may retry when the shared response cache cannot persist");
  assert.equal(result.activeLocks, 0, "cache-write failures must not leave a lock behind");
  assert.ok(result.durationMs < 3_000, "failed cache writes must not deadlock either worker");
});

test("a shared 429 cooldown prevents a contending worker from retrying the upstream request", async () => {
  const result = await runCrossInstanceScenario({ upstream429: true });
  assert.equal(result.results.every(item => item.ok === false), true);
  assert.equal(result.results.filter(item => /HTTP 429/.test(item.error)).length, 1);
  assert.equal(result.results.filter(item => /cooldown active/.test(item.error)).length, 1);
  assert.equal(result.upstreamCalls, 1, "the waiter must re-check shared cooldown after acquiring the released lock");
  assert.equal(result.activeLocks, 0);
});

test("Redis outages fail open to the existing AniList request path", async () => {
  const result = await runCrossInstanceScenario({ lockUnavailable: true });
  assert.deepEqual(result.results, [
    { ok: true, result: [{ id: 123 }] },
    { ok: true, result: [{ id: 123 }] },
  ]);
  assert.equal(result.upstreamCalls, 2, "unavailable locking preserves the existing non-coalesced fallback");
  assert.equal(result.activeLocks, 0);
});

test("AniList request locks enforce owner-token release and lease expiry", async () => {
  const { acquireAniListRequestLock, setAniListRedisClientForTests } = await import("../lib/catalog-rate-limiter.js");
  const locks = new Map();
  const redis = {
    async set(key, token, options) {
      const current = locks.get(key);
      if (current && current.expiresAt > Date.now()) return null;
      locks.set(key, { token, expiresAt: Date.now() + options.px });
      return "OK";
    },
    async eval(_script, keys, args) {
      const current = locks.get(keys[0]);
      if (current?.token !== args[0]) return 0;
      locks.delete(keys[0]);
      return 1;
    },
  };
  setAniListRedisClientForTests(redis);
  try {
    const owner = await acquireAniListRequestLock("same-query", { leaseMs: 100 });
    const waiter = await acquireAniListRequestLock("same-query", { leaseMs: 100 });
    assert.equal(owner.status, "acquired");
    assert.equal(waiter.status, "contended");

    const key = [...locks.keys()][0];
    locks.set(key, { token: "replacement-owner", expiresAt: Date.now() + 100 });
    await owner.release();
    assert.equal(locks.get(key)?.token, "replacement-owner", "a stale owner must not release a successor's lock");

    await new Promise(resolve => setTimeout(resolve, 110));
    const successor = await acquireAniListRequestLock("same-query", { leaseMs: 100 });
    assert.equal(successor.status, "acquired");
    await successor.release();
    assert.equal(locks.size, 0);
  } finally {
    setAniListRedisClientForTests(null);
  }
});

test("AniList request locking fails open when Redis is unavailable", async () => {
  const { acquireAniListRequestLock, setAniListRedisClientForTests } = await import("../lib/catalog-rate-limiter.js");
  setAniListRedisClientForTests({ async set() { throw new Error("Redis unavailable"); } });
  try {
    const result = await acquireAniListRequestLock("same-query", { leaseMs: 100 });
    assert.equal(result.status, "unavailable");
  } finally {
    setAniListRedisClientForTests(null);
  }
});

test("catalog requests receive a retryable 503 when a cross-instance query lock remains held", async () => {
  const { default: catalogSource } = await import("../api/catalog-source.js");
  const { setCatalogRuntimeCacheForTests } = await import("../lib/catalog-runtime-cache.js");
  const { setAniListRedisClientForTests } = await import("../lib/catalog-rate-limiter.js");
  const originalNow = Date.now;
  const originalSetTimeout = globalThis.setTimeout;
  let now = 1_000;
  Date.now = () => now;
  globalThis.setTimeout = (callback, delay = 0, ...args) => {
    now += Math.max(1, Number(delay) || 0);
    queueMicrotask(() => callback(...args));
    return 0;
  };
  setCatalogRuntimeCacheForTests({ async get() { return null; }, async set() { return false; } });
  setAniListRedisClientForTests({ async set() { return null; } });

  try {
    const response = await catalogSource.fetch(new Request(
      "https://anibloom.example/catalog/series/current_season.json",
    ));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("retry-after"), "5");
    assert.equal((await response.json()).error, "Catalog temporarily unavailable");
  } finally {
    Date.now = originalNow;
    globalThis.setTimeout = originalSetTimeout;
    setAniListRedisClientForTests(null);
    setCatalogRuntimeCacheForTests(null);
  }
});
