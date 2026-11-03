import assert from "node:assert/strict";
import test from "node:test";
import {
  acquireCatalogRequestPermit,
  resetCatalogRequestRateLimiterForTests,
  setCatalogRequestRateLimiterForTests,
} from "../lib/catalog-request-rate-limiter.js";

function request(ip) {
  return new Request("https://example.test/catalog/series/current_season.json", {
    headers: ip ? { "x-forwarded-for": ip } : {},
  });
}

test("incoming catalog limiter enforces the configured per-client burst locally", async () => {
  resetCatalogRequestRateLimiterForTests();
  const client = request("203.0.113.25");
  for (let index = 0; index < 30; index += 1) {
    assert.equal((await acquireCatalogRequestPermit(client, 1_000)).allowed, true);
  }
  const limited = await acquireCatalogRequestPermit(client, 1_000);
  assert.equal(limited.allowed, false);
  assert.equal(limited.source, "instance-fallback");
  assert.ok(limited.retryAfterMs > 0);
  assert.equal((await acquireCatalogRequestPermit(request("203.0.113.26"), 1_000)).allowed, true);
});

test("incoming catalog limiter refills the local bucket over time", async () => {
  resetCatalogRequestRateLimiterForTests();
  const client = request("203.0.113.27");
  for (let index = 0; index < 30; index += 1) await acquireCatalogRequestPermit(client, 1_000);
  assert.equal((await acquireCatalogRequestPermit(client, 1_000)).allowed, false);
  assert.equal((await acquireCatalogRequestPermit(client, 1_500)).allowed, true);
});

test("incoming catalog limiter uses the distributed limiter when configured", async () => {
  let receivedIdentifier;
  setCatalogRequestRateLimiterForTests({
    async limit(identifier) {
      receivedIdentifier = identifier;
      return { success: false, reset: 5_000 };
    },
  });
  try {
    const result = await acquireCatalogRequestPermit(request("203.0.113.28"), 1_000);
    assert.equal(result.allowed, false);
    assert.equal(result.source, "upstash");
    assert.equal(result.retryAfterMs, 4_000);
    assert.match(receivedIdentifier, /^ip:[a-f0-9]{32}$/);
  } finally {
    setCatalogRequestRateLimiterForTests(null);
  }
});

test("incoming catalog limiter falls back to the bounded local bucket when Redis errors", async () => {
  setCatalogRequestRateLimiterForTests({
    async limit() { throw new Error("simulated Redis outage"); },
  });
  try {
    const result = await acquireCatalogRequestPermit(request("203.0.113.29"), 2_000);
    assert.equal(result.allowed, true);
    assert.equal(result.source, "instance-fallback");
  } finally {
    setCatalogRequestRateLimiterForTests(null);
  }
});
