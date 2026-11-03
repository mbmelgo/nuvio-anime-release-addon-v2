import assert from "node:assert/strict";
import test from "node:test";
import {
  getCatalogClientIdentifier,
  normalizeCatalogRequestOptions,
  isCatalogDiagnosticsEnabled,
} from "../lib/catalog-request-guard.js";

test("catalog request options reject invalid, negative, fractional, and excessive offsets", () => {
  assert.deepEqual(normalizeCatalogRequestOptions({}), { ok: true, skip: 0, search: "" });
  assert.deepEqual(normalizeCatalogRequestOptions({ skip: "50", search: " One Piece " }), {
    ok: true, skip: 50, search: "One Piece",
  });
  for (const skip of ["-1", "1.5", "Infinity", "NaN", "1001", "999999999999999999999"]) {
    assert.deepEqual(normalizeCatalogRequestOptions({ skip }), {
      ok: false, error: "Invalid catalog offset", code: "INVALID_SKIP",
    });
  }
});

test("catalog request options cap search input length", () => {
  assert.deepEqual(normalizeCatalogRequestOptions({ search: "x".repeat(200) }), {
    ok: true, skip: 0, search: "x".repeat(200),
  });
  assert.deepEqual(normalizeCatalogRequestOptions({ search: "x".repeat(201) }), {
    ok: false, error: "Search query is too long", code: "SEARCH_TOO_LONG",
  });
});

test("production diagnostics are disabled while non-production diagnostics remain available", () => {
  assert.equal(isCatalogDiagnosticsEnabled({ diagnostics: "1" }, "production"), false);
  assert.equal(isCatalogDiagnosticsEnabled({ diagnostics: "1" }, "preview"), true);
  assert.equal(isCatalogDiagnosticsEnabled({ diagnostics: "0" }, "preview"), false);
});

test("client identifiers hash valid forwarded IP addresses and ignore malformed values", () => {
  const first = getCatalogClientIdentifier(new Request("https://example.test", {
    headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" },
  }));
  const same = getCatalogClientIdentifier(new Request("https://example.test", {
    headers: { "x-forwarded-for": "203.0.113.10" },
  }));
  const other = getCatalogClientIdentifier(new Request("https://example.test", {
    headers: { "x-forwarded-for": "203.0.113.11" },
  }));
  const invalid = getCatalogClientIdentifier(new Request("https://example.test", {
    headers: { "x-forwarded-for": "not-an-ip" },
  }));
  assert.match(first, /^ip:[a-f0-9]{32}$/);
  assert.equal(first, same);
  assert.notEqual(first, other);
  assert.equal(invalid, "ip:unknown");
});

test("catalog handler rejects unsupported methods before catalog work", async () => {
  const { default: handler } = await import("../api/catalog-source.js");
  const response = await handler.fetch(new Request("https://example.test/catalog/series/current_season.json", {
    method: "POST",
  }));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, OPTIONS");
  assert.deepEqual(await response.json(), { error: "Method not allowed" });
});

test("catalog handler keeps OPTIONS support and rejects malformed identifiers", async () => {
  const { default: handler } = await import("../api/catalog-source.js");
  const options = await handler.fetch(new Request("https://example.test/catalog/series/current_season.json", { method: "OPTIONS" }));
  assert.equal(options.status, 200);
  const malformed = await handler.fetch(new Request("https://example.test/catalog/series/%E0%A4%A.json"));
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { error: "Invalid catalog identifier" });
});

test("catalog handler validates pagination and search before rate limiting or upstream work", async () => {
  const { default: handler } = await import("../api/catalog-source.js");
  const invalidOffset = await handler.fetch(new Request("https://example.test/catalog/series/current_season.json?skip=1001"));
  assert.equal(invalidOffset.status, 400);
  assert.deepEqual(await invalidOffset.json(), { error: "Invalid catalog offset", code: "INVALID_SKIP" });
  const longSearch = await handler.fetch(new Request(`https://example.test/catalog/series/current_season.json?search=${"x".repeat(201)}`));
  assert.equal(longSearch.status, 400);
  assert.deepEqual(await longSearch.json(), { error: "Search query is too long", code: "SEARCH_TOO_LONG" });
});

test("catalog handler enforces the incoming request limiter and returns a retry hint", async () => {
  const { default: handler } = await import("../api/catalog-source.js");
  const { setCatalogRequestRateLimiterForTests } = await import("../lib/catalog-request-rate-limiter.js");
  setCatalogRequestRateLimiterForTests({ async limit() { return { success: false, reset: Date.now() + 5_000 }; } });
  try {
    const response = await handler.fetch(new Request("https://example.test/catalog/series/current_season.json", {
      headers: { "x-forwarded-for": "203.0.113.42" },
    }));
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const retryAfter = Number(response.headers.get("retry-after"));
    assert.ok(Number.isInteger(retryAfter) && retryAfter >= 1);
    assert.deepEqual(await response.json(), { error: "Too many requests", code: "RATE_LIMITED" });
  } finally {
    setCatalogRequestRateLimiterForTests(null);
  }
});

test("production diagnostics query cannot bypass the normalized catalog cache", async () => {
  const { default: handler } = await import("../api/catalog-source.js");
  const { setCatalogRuntimeCacheForTests } = await import("../lib/catalog-runtime-cache.js");
  const { setCatalogRequestRateLimiterForTests } = await import("../lib/catalog-request-rate-limiter.js");
  const previousVercelEnv = process.env.VERCEL_ENV;
  const cachedMetas = [{ id: "tmdb:123", type: "series", name: "Cached catalog result" }];
  let cacheReads = 0;
  process.env.VERCEL_ENV = "production";
  setCatalogRuntimeCacheForTests({
    async get() {
      cacheReads += 1;
      return { metas: cachedMetas, freshUntil: Date.now() + 60_000 };
    },
    async set() {},
  });
  setCatalogRequestRateLimiterForTests({ async limit() { return { success: true }; } });
  try {
    const response = await handler.fetch(new Request("https://example.test/catalog/series/current_season.json?diagnostics=1", {
      headers: { "x-forwarded-for": "203.0.113.43" },
    }));
    assert.equal(response.status, 200);
    assert.equal(cacheReads, 1);
    assert.equal(response.headers.get("x-nuvio-catalog-duration-ms"), null);
    assert.deepEqual((await response.json()).metas, cachedMetas);
  } finally {
    setCatalogRuntimeCacheForTests(null);
    setCatalogRequestRateLimiterForTests(null);
    if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercelEnv;
  }
});
