import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Worker } from "node:worker_threads";
import test from "node:test";
import { getSeasonInfo } from "../api/catalog-source.js";
import { catalogResponseCacheKey } from "../lib/catalog-runtime-cache.js";

async function runCatalogFanoutScenario({ stale = false, lockUnavailable = false, cacheWriteFailure = false } = {}) {
  const cache = new Map();
  const locks = new Map();
  let catalogReads = 0;
  let catalogWrites = 0;
  let anilistCalls = 0;
  let armCalls = 0;
  const providerTargets = [];
  const pendingCatalogReads = [];
  const writeWaiters = [];

  const sendJson = (res, body, status = 200) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const readBody = async req => {
    let body = "";
    for await (const chunk of req) body += chunk;
    return body ? JSON.parse(body) : {};
  };
  const signalWrites = () => {
    for (let index = writeWaiters.length - 1; index >= 0; index -= 1) {
      const waiter = writeWaiters[index];
      if (catalogWrites >= waiter.count) {
        writeWaiters.splice(index, 1);
        clearTimeout(waiter.timer);
        waiter.res.writeHead(200).end("ok");
      }
    }
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/cache/get") {
      const key = url.searchParams.get("key");
      if (key?.startsWith("catalog-response:") && catalogReads < 2) {
        catalogReads += 1;
        pendingCatalogReads.push({ key, res });
        if (catalogReads === 2) {
          for (const item of pendingCatalogReads.splice(0)) {
            sendJson(item.res, { value: stale ? cache.get(item.key) : null });
          }
        }
        return;
      }
      sendJson(res, { value: cache.get(key) ?? null });
      return;
    }
    if (url.pathname === "/cache/set" && req.method === "POST") {
      const { key, value, cacheWriteFailure: failWrite } = await readBody(req);
      if (failWrite && key.startsWith("catalog-response:")) {
        sendJson(res, { error: "mocked cache write failure" }, 503);
        return;
      }
      cache.set(key, value);
      if (key.startsWith("catalog-response:")) {
        catalogWrites += 1;
        signalWrites();
      }
      sendJson(res, { ok: true });
      return;
    }
    if (url.pathname === "/lock/set" && req.method === "POST") {
      const { key, token, leaseMs, lockUnavailable: failLock } = await readBody(req);
      if (failLock) {
        sendJson(res, { error: "mocked lock service unavailable" }, 503);
        return;
      }
      const current = locks.get(key);
      if (current && current.expiresAt > Date.now()) {
        sendJson(res, { result: null });
        return;
      }
      locks.set(key, { token, expiresAt: Date.now() + leaseMs });
      sendJson(res, { result: "OK" });
      return;
    }
    if (url.pathname === "/lock/renew" && req.method === "POST") {
      const { key, token, leaseMs } = await readBody(req);
      const current = locks.get(key);
      const renewed = current?.token === token;
      if (renewed) current.expiresAt = Date.now() + leaseMs;
      sendJson(res, { result: renewed ? 1 : 0 });
      return;
    }
    if (url.pathname === "/lock/release" && req.method === "POST") {
      const { key, token } = await readBody(req);
      const current = locks.get(key);
      const released = current?.token === token;
      if (released) locks.delete(key);
      sendJson(res, { result: released ? 1 : 0 });
      return;
    }
    if (url.pathname === "/upstream/anilist" && req.method === "POST") {
      anilistCalls += 1;
      await new Promise(resolve => setTimeout(resolve, 100));
      sendJson(res, {
        data: {
          Page: {
            media: [{
              id: 123,
              idMal: 456,
              title: { romaji: "Catalog Fanout Movie", english: "Catalog Fanout Movie", native: null },
              synonyms: [],
              coverImage: { large: null },
              status: "FINISHED",
              format: "MOVIE",
              isAdult: false,
              countryOfOrigin: "JP",
              startDate: { year: 2026, month: 1, day: 1 },
              endDate: { year: 2026 },
              genres: ["Animation"],
              relations: { edges: [] },
            }],
          },
        },
      });
      return;
    }
    if (url.pathname === "/upstream/arm" && req.method === "POST") {
      armCalls += 1;
      await new Promise(resolve => setTimeout(resolve, 100));
      sendJson(res, [{ anilist: 123, media: "MOVIE", imdb: "tt1234567", myanimelist: 456, title: "Catalog Fanout Movie", year: 2026 }]);
      return;
    }
    if (url.pathname === "/upstream/provider" && req.method === "POST") {
      const { url: target, method } = await readBody(req);
      providerTargets.push({ url: target, method });
      sendJson(res, { error: "mocked provider response unavailable" }, 404);
      return;
    }
    if (url.pathname === "/wait-for-catalog-writes") {
      const count = Number(url.searchParams.get("count")) || 1;
      if (catalogWrites >= count) {
        res.writeHead(200).end("ok");
        return;
      }
      const timer = setTimeout(() => {
        const index = writeWaiters.findIndex(item => item.res === res);
        if (index >= 0) writeWaiters.splice(index, 1);
        res.writeHead(504).end("timeout");
      }, 8_000);
      writeWaiters.push({ count, res, timer });
      return;
    }
    res.writeHead(404).end();
  });

  const seasonInfo = getSeasonInfo(new Date());
  const catalogKey = catalogResponseCacheKey({
    id: "current_season_movies",
    seasonInfo,
    skip: 0,
    search: "",
  });
  if (stale) {
    cache.set(catalogKey, {
      metas: [{ id: "mal:456", type: "movie" }],
      cachedAt: Date.now() - 3_600_000,
      freshUntil: Date.now() - 1,
    });
  }

  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const workerUrl = new URL("../test-support/catalog-refresh-worker.mjs", import.meta.url);
  const workers = [0, 1].map(() => new Worker(workerUrl, { workerData: { baseUrl, mode: stale ? "stale" : "cold", lockUnavailable, cacheWriteFailure } }));
  const startedAt = Date.now();

  try {
    const results = await Promise.all(workers.map(worker => new Promise((resolve, reject) => {
      worker.once("message", resolve);
      worker.once("error", reject);
      worker.once("exit", code => {
        if (code !== 0) reject(new Error(`worker exited with code ${code}`));
      });
    })));
    const providerCountsByHost = {};
    for (const target of providerTargets) {
      const host = new URL(target.url).hostname;
      providerCountsByHost[host] = (providerCountsByHost[host] || 0) + 1;
    }
    return {
      results,
      catalogReads,
      catalogWrites,
      anilistCalls,
      armCalls,
      providerTargets,
      providerCountsByHost,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await Promise.all(workers.map(worker => worker.terminate()));
    await new Promise(resolve => server.close(resolve));
  }
}

test("separate catalog workers coalesce simultaneous cold misses", async () => {
  const result = await runCatalogFanoutScenario();
  assert.equal(result.results.every(item => item.ok && item.status === 200), true);
  assert.deepEqual(result.results.map(item => item.metas.map(meta => meta.id)), [
    ["mal:456"],
    ["mal:456"],
  ]);
  assert.equal(result.anilistCalls, 1, "the AniList request lock should already coalesce GraphQL misses");
  assert.equal(result.armCalls, 1, "one catalog build should execute across both workers");
  assert.equal(result.catalogWrites, 1, "only the lock owner should write the shared catalog response");
  assert.equal(result.providerTargets.length, 16, "only one build should traverse the mocked provider fallback chain");
  assert.equal(result.providerCountsByHost["kitsu.io"], 2, "the single build should perform two Kitsu fallback lookups");
  assert.equal(result.providerCountsByHost["raw.githubusercontent.com"], 3, "the single build should perform Fribb and AnimeAPI TSV dataset lookups");
  assert.ok(result.durationMs < 5_000);
});

test("separate catalog workers coalesce stale background refreshes", async () => {
  const result = await runCatalogFanoutScenario({ stale: true });
  assert.equal(result.results.every(item => item.ok && item.status === 200 && item.stale), true);
  assert.deepEqual(result.results.map(item => item.metas.map(meta => meta.id)), [
    ["mal:456"],
    ["mal:456"],
  ]);
  assert.equal(result.anilistCalls, 1, "the AniList request lock should already coalesce GraphQL misses");
  assert.equal(result.armCalls, 1, "only one instance should refresh a stale catalog");
  assert.equal(result.catalogWrites, 1, "only the lock owner should write the refreshed catalog");
  assert.equal(result.providerTargets.length, 16, "only one refresh should traverse the mocked provider fallback chain");
  assert.equal(result.providerCountsByHost["kitsu.io"], 2, "the single refresh should perform two Kitsu fallback lookups");
  assert.equal(result.providerCountsByHost["raw.githubusercontent.com"], 3, "the single refresh should perform Fribb and AnimeAPI TSV dataset lookups");
  assert.ok(result.durationMs < 5_000);
});

test("catalog refresh lock renews its lease and protects a successor owner", async () => {
  const { acquireCatalogRefreshLock, setAniListRedisClientForTests } = await import("../lib/catalog-rate-limiter.js");
  const locks = new Map();
  const redis = {
    async set(key, token, options) {
      const current = locks.get(key);
      if (current && current.expiresAt > Date.now()) return null;
      locks.set(key, { token, expiresAt: Date.now() + options.px });
      return "OK";
    },
    async eval(script, keys, args) {
      const current = locks.get(keys[0]);
      if (current?.token !== args[0]) return 0;
      if (script.includes("pexpire")) {
        current.expiresAt = Date.now() + Number(args[1]);
        return 1;
      }
      locks.delete(keys[0]);
      return 1;
    },
  };
  setAniListRedisClientForTests(redis);
  try {
    const owner = await acquireCatalogRefreshLock("same-catalog", { leaseMs: 1_000 });
    assert.equal(owner.status, "acquired");
    const key = [...locks.keys()][0];
    const initialExpiry = locks.get(key).expiresAt;
    assert.equal(await owner.renew(5_000), true);
    assert.ok(locks.get(key).expiresAt >= initialExpiry + 3_000);

    locks.set(key, { token: "successor-owner", expiresAt: Date.now() + 5_000 });
    assert.equal(await owner.renew(5_000), false);
    await owner.release();
    assert.equal(locks.get(key)?.token, "successor-owner", "an expired owner must not renew or release a successor's lock");

    setAniListRedisClientForTests({
      async set() { return "OK"; },
      async eval() { throw new Error("Redis unavailable during lease renewal"); },
    });
    const uncertainOwner = await acquireCatalogRefreshLock("redis-outage", { leaseMs: 1_000 });
    assert.equal(uncertainOwner.status, "acquired");
    assert.equal(await uncertainOwner.renew(5_000), null, "a failed renewal must be treated as uncertain, not as confirmed ownership");
    await uncertainOwner.release();
  } finally {
    setAniListRedisClientForTests(null);
  }
});

test("catalog refresh falls open when Redis is unavailable", async () => {
  const result = await runCatalogFanoutScenario({ lockUnavailable: true });
  assert.equal(result.results.every(item => item.ok && item.status === 200), true);
  assert.equal(result.anilistCalls, 2, "the AniList lock also fails open when the shared lock service is unavailable");
  assert.equal(result.armCalls, 2, "both catalog instances build when distributed locking is unavailable");
  assert.equal(result.catalogWrites, 2);
  assert.equal(result.providerTargets.length, 32);
});

test("catalog refresh retries after a shared cache write failure without losing response correctness", async () => {
  const result = await runCatalogFanoutScenario({ cacheWriteFailure: true });
  assert.equal(result.results.every(item => item.ok && item.status === 200), true);
  assert.equal(result.anilistCalls, 1, "AniList response caching remains available independently of catalog response writes");
  assert.equal(result.armCalls, 2, "the second instance retries after the first owner cannot publish the shared catalog");
  assert.equal(result.catalogWrites, 0);
  assert.equal(result.providerTargets.length, 32);
});
