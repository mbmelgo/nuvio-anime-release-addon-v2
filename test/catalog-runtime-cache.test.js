import assert from "node:assert/strict";
import test from "node:test";
import {
  catalogCacheKey,
  getCatalogRuntimeCache,
  setCatalogRuntimeCache,
  setCatalogRuntimeCacheForTests,
} from "../lib/catalog-runtime-cache.js";

test("catalog runtime cache keys are deterministic without exposing source values", () => {
  const first = catalogCacheKey("anilist-page", { query: "private search phrase", page: 2 });
  const second = catalogCacheKey("anilist-page", { query: "private search phrase", page: 2 });
  const different = catalogCacheKey("anilist-page", { query: "private search phrase", page: 3 });

  assert.equal(first, second);
  assert.notEqual(first, different);
  assert.doesNotMatch(first, /private search phrase/);
});

test("catalog runtime cache stores and reads values with a bounded TTL", async () => {
  const values = new Map();
  const cache = {
    async get(key) { return values.get(key) ?? null; },
    async set(key, value, options) {
      values.set(key, value);
      cache.lastOptions = options;
    },
    lastOptions: null,
  };
  setCatalogRuntimeCacheForTests(cache);
  try {
    assert.equal(await setCatalogRuntimeCache("catalog:test", { metas: [] }, 90), true);
    assert.deepEqual(await getCatalogRuntimeCache("catalog:test"), { metas: [] });
    assert.equal(cache.lastOptions.ttl, 90);
  } finally {
    setCatalogRuntimeCacheForTests(null);
  }
});

test("catalog runtime cache fails open when the backing cache is unavailable", async () => {
  setCatalogRuntimeCacheForTests({
    async get() { throw new Error("cache unavailable"); },
    async set() { throw new Error("cache unavailable"); },
  });
  try {
    assert.equal(await getCatalogRuntimeCache("catalog:test"), null);
    assert.equal(await setCatalogRuntimeCache("catalog:test", { metas: [] }, 30), false);
  } finally {
    setCatalogRuntimeCacheForTests(null);
  }
});
