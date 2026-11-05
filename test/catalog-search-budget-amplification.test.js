import assert from "node:assert/strict";
import test from "node:test";
import {
  clearAniListRateLimitState,
  clearAniListResponseCache,
  queryAnime,
  queryAiringSchedulePage,
} from "../lib/catalog-anilist.js";
import {
  ANILIST_MAX_PERMIT_WAIT_MS,
  acquireAniListRequestPermit,
  setAniListRateLimiterForTests,
  setAniListRedisClientForTests,
} from "../lib/catalog-rate-limiter.js";
import { setCatalogRuntimeCacheForTests } from "../lib/catalog-runtime-cache.js";

test("repeated seasonal search prefixes reuse complete exact-query results beyond one minute while rolling schedules stay fresh", async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const shared = new Map();
  let now = 1_000_000_000_000;
  let upstreamCalls = 0;
  const categories = [];
  Date.now = () => now;

  // A TTL-aware regional shared cache models a fresh instance between search bursts.
  setCatalogRuntimeCacheForTests({
    async get(key) {
      const entry = shared.get(key);
      return entry && entry.expiresAt > Date.now() ? entry.value : null;
    },
    async set(key, value, { ttl } = {}) {
      shared.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
      return true;
    },
  });
  setAniListRateLimiterForTests(async () => ({ success: true }));
  globalThis.fetch = async (_url, options) => {
    upstreamCalls += 1;
    const payload = JSON.parse(options.body);
    const schedule = payload.query.includes("airingSchedules(");
    categories.push(schedule ? "rolling" : "seasonal");
    return new Response(JSON.stringify({
      data: { Page: schedule
        ? { airingSchedules: [] }
        : { media: [{ id: 10_000 + upstreamCalls }] } },
    }), { status: 200 });
  };
  clearAniListRateLimitState();

  const seasons = [
    { season: "SUMMER", year: 2026 },
    { season: "FALL", year: 2026 },
    { season: "WINTER", year: 2027 },
  ];
  const requests = [
    ...seasons.flatMap((season) => [
      () => queryAnime({ season, sort: ["POPULARITY_DESC"], formats: ["TV", "ONA"] }, 1, "prefix", { includeMalId: true }),
      () => queryAnime({ season, sort: ["POPULARITY_DESC"], formats: ["MOVIE"] }, 1, "prefix", { includeMalId: true }),
    ]),
    () => queryAiringSchedulePage(1_790_000_000_000, 1_790_259_200_000, true, 1, "TIME"),
    () => queryAiringSchedulePage(1_789_740_800_000, 1_790_000_000_000, false, 1, "TIME_DESC"),
  ];

  try {
    const first = await Promise.all(requests.map((fn) => fn()));
    assert.equal(upstreamCalls, 8, "eight distinct cold upstream queries use eight permits");
    assert.deepEqual(categories.sort(), ["rolling", "rolling", ...Array(6).fill("seasonal")].sort());
    assert.equal(first.length, 8);

    now += 90_000;
    clearAniListResponseCache();
    const repeated = await Promise.all(requests.map((fn) => fn()));
    assert.equal(upstreamCalls, 10,
      "repeat prefixes across six seasonal catalogs should hit shared exact-query cache; two rolling schedule requests refresh");
    for (let i = 0; i < 6; i++) {
      assert.deepEqual(repeated[i], first[i], "search ordering and page identity remain exactly those returned upstream");
    }

    now += 240_000;
    clearAniListResponseCache();
    await Promise.all(requests.map((fn) => fn()));
    assert.equal(upstreamCalls, 18, "cached searches and rolling requests eventually refresh after their separate TTLs");
  } finally {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
    clearAniListRateLimitState();
    setAniListRateLimiterForTests(null);
    setAniListRedisClientForTests(null);
    setCatalogRuntimeCacheForTests(null);
  }
});

test("moderate cold-search bursts can wait for six token refills without exceeding the shared budget", async () => {
  const originalNow = Date.now;
  let now = 5_000_000;
  let checks = 0;
  const waits = [];
  Date.now = () => now;
  setAniListRateLimiterForTests(async () => {
    checks++;
    return checks <= 6
      ? { success: false, reset: Date.now() + 3_000 }
      : { success: true };
  });

  try {
    const permit = await acquireAniListRequestPermit({
      maxWaitMs: ANILIST_MAX_PERMIT_WAIT_MS,
      wait: async (ms) => { waits.push(ms); now += ms; },
    });
    assert.equal(permit.allowed, true, "bursts needing up to 18 seconds of token refill should succeed");
    assert.equal(permit.waitedMs, 18_000);
    assert.equal(checks, 7);
    assert.deepEqual(waits, Array(6).fill(3_000));
    assert.ok(ANILIST_MAX_PERMIT_WAIT_MS >= 18_000);
  } finally {
    Date.now = originalNow;
    setAniListRateLimiterForTests(null);
    clearAniListRateLimitState();
  }
});

test("a second region reuses exact seasonal prefix results through Redis for five minutes", async () => {
  const previousFetch = globalThis.fetch;
  const previousNow = Date.now;
  let now = 1_000_000_000_000;
  let upstreamCalls = 0;
  const redisEntries = new Map();
  const redis = {
    async get(key) {
      const entry = redisEntries.get(key);
      return entry && entry.expiresAt > Date.now() ? entry.value : null;
    },
    async set(key, value, options) {
      if (options?.nx) return "OK";
      if (options?.ex) {
        redisEntries.set(key, { value, ttlSeconds: options.ex, expiresAt: Date.now() + options.ex * 1000 });
      }
      return "OK";
    },
    async eval() { return 1; },
  };
  Date.now = () => now;
  setAniListRedisClientForTests(redis);
  setCatalogRuntimeCacheForTests({ async get() { return null; }, async set() { return false; } });
  setAniListRateLimiterForTests(async () => ({ success: true }));
  globalThis.fetch = async () => {
    upstreamCalls++;
    return new Response(JSON.stringify({ data: { Page: { media: [{ id: 12345 }] } } }), { status: 200 });
  };
  clearAniListRateLimitState();

  try {
    const filter = { season: { season: "FALL", year: 2026 }, sort: ["POPULARITY_DESC"], formats: ["TV"] };
    const first = await queryAnime(filter, 1, "repeated-prefix", { includeMalId: true });
    const responseEntries = [...redisEntries.entries()].filter(([key]) => key.startsWith("anibloom:anilist:response:v1:"));
    assert.equal(responseEntries.length, 1);
    assert.equal(responseEntries[0][1].ttlSeconds, 300);
    assert.ok(!responseEntries[0][0].includes("repeated-prefix"), "search terms must not appear in shared cache keys");

    now += 120_000;
    clearAniListResponseCache(); // Different function instance / region without a warm Runtime Cache.
    assert.deepEqual(await queryAnime(filter, 1, "repeated-prefix", { includeMalId: true }), first);
    assert.equal(upstreamCalls, 1);

    now += 240_000;
    clearAniListResponseCache();
    assert.deepEqual(await queryAnime(filter, 1, "repeated-prefix", { includeMalId: true }), first);
    assert.equal(upstreamCalls, 2, "expired Redis results must trigger a new upstream query");
  } finally {
    Date.now = previousNow;
    globalThis.fetch = previousFetch;
    clearAniListRateLimitState();
    setAniListRateLimiterForTests(null);
    setAniListRedisClientForTests(null);
    setCatalogRuntimeCacheForTests(null);
  }
});
