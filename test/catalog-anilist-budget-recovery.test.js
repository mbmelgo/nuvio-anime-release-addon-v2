import assert from "node:assert/strict";
import test from "node:test";
import {
  clearAniListRateLimitState,
  queryAnime,
  queryAiringSchedulePage,
} from "../lib/catalog-anilist.js";
import {
  setAniListRateLimiterForTests,
  setAniListRedisClientForTests,
} from "../lib/catalog-rate-limiter.js";
import {
  getSharedAniListCooldownUntil,
  setCatalogRuntimeCacheForTests,
} from "../lib/catalog-runtime-cache.js";

function installFakeSharedCache() {
  const entries = new Map();
  setCatalogRuntimeCacheForTests({
    async get(key) { return entries.get(key) ?? null; },
    async set(key, value) { entries.set(key, value); return true; },
    async delete(key) { return entries.delete(key); },
  });
}

function restoreEnvironment(fetch) {
  globalThis.fetch = fetch;
  clearAniListRateLimitState();
  setAniListRateLimiterForTests(null);
  setAniListRedisClientForTests(null);
  setCatalogRuntimeCacheForTests(null);
}

test("temporary local budget rejection does not poison independent search queries after permits recover", async () => {
  const previousFetch = globalThis.fetch;
  const accepted = [1, 2, 3, 6, 7, 8];
  let permitChecks = 0;
  let upstreamCalls = 0;
  installFakeSharedCache();
  // Avoid a real Redis or AniList request. Each distinct search and catalog needs its own permit.
  setAniListRateLimiterForTests(async () => {
    permitChecks++;
    return accepted.includes(permitChecks)
      ? { success: true }
      : { success: false, reset: Date.now() + 15_000 };
  });
  globalThis.fetch = async (_url, options) => {
    upstreamCalls++;
    const payload = JSON.parse(options.body);
    const schedules = payload.query.includes("airingSchedules(");
    return new Response(JSON.stringify({
      data: { Page: schedules
        ? { airingSchedules: [{ id: 100 + upstreamCalls, episode: 1, airingAt: 1790000000 }] }
        : { media: [{ id: 100 + upstreamCalls }] } },
    }), { status: 200 });
  };
  clearAniListRateLimitState();

  try {
    const scenarios = [
      () => queryAnime({ season: { season: "FALL", year: 2026 }, sort: ["ID"], formats: ["TV"] }, 1, "prefix-a"),
      () => queryAnime({ season: { season: "FALL", year: 2026 }, sort: ["ID"], formats: ["TV"] }, 1, "prefix-ab"),
      () => queryAnime({ season: { season: "FALL", year: 2026 }, sort: ["ID"], formats: ["TV"] }, 1, "prefix-abc"),
      () => queryAnime({ season: { season: "WINTER", year: 2027 }, sort: ["ID"], formats: ["MOVIE"] }, 1, "prefix-abcd"),
      () => queryAnime({ season: { season: "SUMMER", year: 2026 }, sort: ["ID"], formats: ["MOVIE"] }, 1, "prefix-abcde"),
      () => queryAnime({ season: { season: "FALL", year: 2026 }, sort: ["ID"], formats: ["MOVIE"] }, 1, "prefix-abcdef"),
      () => queryAiringSchedulePage(1790000000, 1790086400, true, 1, "TIME"),
      () => queryAiringSchedulePage(1790000000, 1790086400, false, 1, "TIME_DESC"),
    ];

    for (let index = 0; index < scenarios.length; index++) {
      if (index === 3 || index === 4) {
        await assert.rejects(scenarios[index](), (error) => error.code === "ANILIST_RATE_LIMIT_BUDGET");
      } else {
        const result = await scenarios[index]();
        assert.equal(result.length, 1, `scenario ${index + 1} should retain its upstream result`);
      }
    }

    assert.equal(permitChecks, 8, "all distinct requests must be evaluated by the limiter");
    assert.equal(upstreamCalls, 6, "denied permits must not call AniList");
    assert.equal(await getSharedAniListCooldownUntil(), 0, "local budget exhaustion is not an upstream HTTP 429");
  } finally {
    restoreEnvironment(previousFetch);
  }
});

test("a new instance can use a recovered token after another instance exhausted its local budget", async () => {
  const previousFetch = globalThis.fetch;
  let grant = false;
  let checks = 0;
  let upstreamCalls = 0;
  installFakeSharedCache();
  setAniListRateLimiterForTests(async () => {
    checks++;
    return grant ? { success: true } : { success: false, reset: Date.now() + 15_000 };
  });
  globalThis.fetch = async () => {
    upstreamCalls++;
    return new Response(JSON.stringify({ data: { Page: { media: [{ id: 201 }] } } }), { status: 200 });
  };
  clearAniListRateLimitState();

  try {
    const filter = { season: { season: "FALL", year: 2026 }, sort: ["ID"] };
    await assert.rejects(queryAnime(filter, 1, "distinct-prefix-a"), (error) =>
      error.code === "ANILIST_RATE_LIMIT_BUDGET");
    assert.equal(upstreamCalls, 0);
    assert.equal(await getSharedAniListCooldownUntil(), 0);

    grant = true;
    clearAniListRateLimitState(); // A different serverless instance with fresh local state.
    assert.deepEqual(await queryAnime(filter, 1, "distinct-prefix-ab"), [{ id: 201 }]);
    assert.equal(upstreamCalls, 1);
    assert.equal(checks, 2);
  } finally {
    restoreEnvironment(previousFetch);
  }
});
