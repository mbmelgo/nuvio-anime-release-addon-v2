import assert from "node:assert/strict";
import test from "node:test";
import catalogSource from "../api/catalog-source.js";
import { clearAniListRateLimitState } from "../lib/catalog-anilist.js";
import {
  setAniListRateLimiterForTests,
  setAniListRedisClientForTests,
} from "../lib/catalog-rate-limiter.js";
import { setCatalogRequestRateLimiterForTests } from "../lib/catalog-request-rate-limiter.js";
import {
  getSharedAniListCooldownUntil,
  setCatalogRuntimeCacheForTests,
} from "../lib/catalog-runtime-cache.js";

test("catalog HTTP responses distinguish outgoing budget 503, recovered search 200, and incoming guard 429", async () => {
  const previousFetch = globalThis.fetch;
  const values = new Map();
  let outboundAllowed = false;
  let incomingAllowed = true;
  let outboundChecks = 0;
  let upstreamCalls = 0;

  setCatalogRuntimeCacheForTests({
    async get(key) { return values.get(key) ?? null; },
    async set(key, value) { values.set(key, value); return true; },
    async delete(key) { values.delete(key); return true; },
  });
  setCatalogRequestRateLimiterForTests({
    async limit() {
      return incomingAllowed
        ? { success: true }
        : { success: false, reset: Date.now() + 15_000 };
    },
  });
  setAniListRateLimiterForTests(async () => {
    outboundChecks++;
    return outboundAllowed
      ? { success: true }
      : { success: false, reset: Date.now() + 15_000 };
  });
  globalThis.fetch = async (url) => {
    assert.equal(url, "https://graphql.anilist.co", "no external mapping services are required for empty results");
    upstreamCalls++;
    return new Response(JSON.stringify({ data: { Page: { media: [] } } }), { status: 200 });
  };
  clearAniListRateLimitState();

  try {
    const first = await catalogSource.fetch(new Request(
      "https://anibloom.example/catalog/series/current_season/search=prefix-a.json",
    ));
    assert.equal(first.status, 503);
    assert.equal((await first.json()).error, "Catalog temporarily unavailable");
    assert.ok(Number(first.headers.get("Retry-After")) >= 1);
    assert.equal(upstreamCalls, 0, "a denied outgoing permit must not reach AniList");
    assert.equal(await getSharedAniListCooldownUntil(), 0, "a local denial is not an upstream HTTP 429");

    outboundAllowed = true;
    const secondUrl = "https://anibloom.example/catalog/series/current_season/search=prefix-ab&skip=50.json";
    const second = await catalogSource.fetch(new Request(secondUrl));
    assert.equal(second.status, 200, "a later search can use a recovered token");
    assert.deepEqual(await second.json(), { metas: [] });
    assert.equal(upstreamCalls, 1);

    const repeated = await catalogSource.fetch(new Request(secondUrl));
    assert.equal(repeated.status, 200);
    assert.deepEqual(await repeated.json(), { metas: [] });
    assert.equal(upstreamCalls, 1, "an exact repeated search should reuse the shared catalog cache");

    incomingAllowed = false;
    const limited = await catalogSource.fetch(new Request(
      "https://anibloom.example/catalog/movie/current_season_movies/search=prefix-abc.json",
    ));
    assert.equal(limited.status, 429, "the incoming per-client guard keeps its own status code");
    assert.equal((await limited.json()).code, "RATE_LIMITED");
    assert.ok(Number(limited.headers.get("Retry-After")) >= 1);
    assert.equal(upstreamCalls, 1);
    assert.equal(outboundChecks, 2);
  } finally {
    globalThis.fetch = previousFetch;
    setCatalogRequestRateLimiterForTests(null);
    clearAniListRateLimitState();
    setAniListRateLimiterForTests(null);
    setAniListRedisClientForTests(null);
    setCatalogRuntimeCacheForTests(null);
  }
});
