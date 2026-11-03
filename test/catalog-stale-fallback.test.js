import assert from "node:assert/strict";
import test from "node:test";
import catalogSource, { getSeasonInfo } from "../api/catalog-source.js";
import {
  catalogCacheKey,
  setCatalogRuntimeCacheForTests,
} from "../lib/catalog-runtime-cache.js";

test("catalog request returns 503 rather than a successful empty catalog on a cold upstream failure", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
  try {
    const response = await catalogSource.fetch(new Request(
      "https://anibloom.example/catalog/series/upcoming_3_days.json",
    ));
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.error, "Catalog temporarily unavailable");
    assert.deepEqual(body.metas, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("catalog request serves stale successful data while a background refresh fails", async () => {
  const originalFetch = globalThis.fetch;
  const values = new Map();
  const now = new Date();
  const seasonInfo = getSeasonInfo(now);
  const cacheKey = catalogCacheKey("catalog-response", {
    id: "upcoming_3_days",
    seasonInfo,
    skip: 0,
    search: "",
  });
  values.set(cacheKey, {
    metas: [{ id: "imdb:tt1234567", type: "series" }],
    cachedAt: Date.now() - 60_000,
    freshUntil: Date.now() - 1,
  });
  setCatalogRuntimeCacheForTests({
    async get(key) { return values.get(key) ?? null; },
    async set(key, value) { values.set(key, value); },
  });
  globalThis.fetch = async () => { throw new TypeError("fetch failed"); };

  try {
    const response = await catalogSource.fetch(new Request(
      "https://anibloom.example/catalog/series/upcoming_3_days.json",
    ));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-nuvio-catalog-stale"), "1");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(body.metas, [{ id: "imdb:tt1234567", type: "series" }]);
    await new Promise((resolve) => setTimeout(resolve, 25));
  } finally {
    globalThis.fetch = originalFetch;
    setCatalogRuntimeCacheForTests(null);
  }
});
