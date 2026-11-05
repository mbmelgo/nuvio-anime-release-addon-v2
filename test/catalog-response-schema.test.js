import assert from "node:assert/strict";
import test from "node:test";

import catalogSource, { getSeasonInfo } from "../api/catalog-source.js";
import {
  catalogCacheKey,
  catalogResponseCacheKey,
  getCatalogRuntimeCache,
  setCatalogRuntimeCacheForTests,
} from "../lib/catalog-runtime-cache.js";
import { setCatalogRequestRateLimiterForTests } from "../lib/catalog-request-rate-limiter.js";

const MEDIUM = "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx187316-example.jpg";
const LARGE = "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx187316-example.jpg";

function cacheDimensions({ id = "current_season", skip = 0, search = "" } = {}) {
  return { id, seasonInfo: getSeasonInfo(new Date()), skip, search };
}

test("catalog response schema upgrade uses a new key without changing unrelated hashed cache keys", () => {
  const dimensions = cacheDimensions();
  const legacyKey = catalogCacheKey("catalog-response", dimensions);
  const newKey = catalogResponseCacheKey(dimensions);

  assert.match(newKey, /^catalog-response:v1:[a-f0-9]{64}$/);
  assert.notEqual(newKey, legacyKey, "a pre-release medium-poster catalog must not be reused");
  assert.equal(catalogResponseCacheKey(dimensions), newKey);
  assert.notEqual(catalogResponseCacheKey({ ...dimensions, skip: 50 }), newKey);
  assert.notEqual(catalogResponseCacheKey({ ...dimensions, search: "Example" }), newKey);
  assert.notEqual(catalogResponseCacheKey({ ...dimensions, id: "previous_season" }), newKey);
  assert.equal(catalogCacheKey("anilist-page", { page: 1 }), catalogCacheKey("anilist-page", { page: 1 }));
  assert.doesNotMatch(catalogResponseCacheKey({ ...dimensions, search: "private user search" }), /private user search/);
});

test("catalog handler serves a new-schema poster instead of an old cached medium poster across title variants", async () => {
  const dimensions = cacheDimensions();
  const oldKey = catalogCacheKey("catalog-response", dimensions);
  const newKey = catalogResponseCacheKey(dimensions);
  const extra = {
    anilistId: 187316,
    titleEnglish: "English title",
    titleRomaji: "Romaji title",
    titleNative: "日本語の題名",
  };
  const staleLegacy = [{ id: "tmdb:285710", type: "series", name: "English title", poster: MEDIUM, extra }];
  const updated = [{ id: "tmdb:285710", type: "series", name: "English title", poster: LARGE, extra }];
  const values = new Map([
    [oldKey, { metas: staleLegacy, freshUntil: Date.now() + 86_400_000 }],
    [newKey, { metas: updated, freshUntil: Date.now() + 3_600_000 }],
  ]);
  const readKeys = [];
  setCatalogRuntimeCacheForTests({
    async get(key) { readKeys.push(key); return values.get(key) ?? null; },
    async set() { throw new Error("warmed catalog should not be rewritten"); },
  });
  setCatalogRequestRateLimiterForTests({ async limit() { return { success: true }; } });
  try {
    for (const [prefix, expectedTitle] of [
      ["", "English title"],
      ["/romaji", "Romaji title"],
      ["/native", "日本語の題名"],
    ]) {
      const result = await catalogSource.fetch(new Request(
        `https://example.test${prefix}/catalog/series/current_season.json`,
      ));
      const body = await result.json();
      assert.equal(result.status, 200);
      assert.equal(body.metas.length, 1);
      assert.equal(body.metas[0].name, expectedTitle);
      assert.equal(body.metas[0].poster, LARGE);
      assert.equal(body.metas[0].id, "tmdb:285710");
      assert.equal(body.metas[0].extra.anilistId, 187316);
    }
    assert.deepEqual(readKeys, [newKey, newKey, newKey], "do not read pre-release catalog response data");
  } finally {
    setCatalogRuntimeCacheForTests(null);
    setCatalogRequestRateLimiterForTests(null);
  }
});

test("an old cached medium poster alone never counts as a fresh response under the new schema", async () => {
  const dimensions = cacheDimensions({ id: "current_season" });
  const legacyKey = catalogCacheKey("catalog-response", dimensions);
  const newKey = catalogResponseCacheKey(dimensions);
  const values = new Map([
    [legacyKey, {
      metas: [{ id: "mal:123", name: "Old poster", type: "series", poster: MEDIUM }],
      freshUntil: Date.now() + 86_400_000,
    }],
  ]);
  let readKey;
  setCatalogRuntimeCacheForTests({
    async get(key) { readKey = key; return values.get(key) ?? null; },
    async set() {},
  });
  try {
    const cached = await getCatalogRuntimeCache(newKey);
    assert.equal(cached, null, "legacy cached responses cannot satisfy the new schema");
    assert.equal(readKey, newKey);
    assert.notEqual(newKey, legacyKey);
  } finally {
    setCatalogRuntimeCacheForTests(null);
  }
});
