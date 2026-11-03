import assert from "node:assert/strict";
import test from "node:test";
import {
  parseLoadTestArgs,
  runLoadTest,
  summarizeLoadResults,
  validateLoadTestConfig,
} from "../scripts/load-probe.mjs";

test("load probe requires a recognized AniBloom HTTPS deployment", () => {
  assert.throws(
    () => validateLoadTestConfig({
      target: "https://example.com",
      path: "/catalog/series/current_season.json",
      requests: 10,
      concurrency: 2,
      timeoutMs: 5000,
    }),
    /AniBloom Vercel preview deployment/,
  );
  assert.throws(
    () => parseLoadTestArgs(["--target", "https://anibloom.vercel.app"]),
    /explicit --allow-production/,
  );
});

test("load probe rejects unsafe targets, paths, and excessive load", () => {
  const base = {
    target: "https://anibloom-preview123-personal-bcb9.vercel.app",
    path: "/catalog/series/current_season.json",
    requests: 10,
    concurrency: 2,
    timeoutMs: 5000,
  };
  assert.throws(() => validateLoadTestConfig({ ...base, target: "http://anibloom-preview123.vercel.app" }), /HTTPS origin/);
  assert.throws(() => validateLoadTestConfig({ ...base, path: "/api/admin" }), /Path must be/);
  assert.throws(() => validateLoadTestConfig({ ...base, requests: 101 }), /requests must be/);
  assert.throws(() => validateLoadTestConfig({ ...base, concurrency: 21 }), /concurrency must be/);
  assert.throws(
    () => validateLoadTestConfig({
      ...base,
      target: "https://anibloom.vercel.app",
      allowProduction: true,
      requests: 41,
    }),
    /Production runs are limited/,
  );
});

test("load probe accepts bounded preview and explicitly opted-in production runs", () => {
  const preview = parseLoadTestArgs([
    "--target", "https://anibloom-preview123-personal-bcb9.vercel.app",
    "--requests", "40",
    "--concurrency", "10",
  ]);
  assert.equal(preview.requests, 40);
  assert.equal(preview.allowProduction, false);

  const production = parseLoadTestArgs([
    "--target", "https://anibloom.vercel.app",
    "--requests", "40",
    "--concurrency", "10",
    "--allow-production",
  ]);
  assert.equal(production.allowProduction, true);
});

test("load probe bypasses CDN URL cache while preserving the catalog path", async () => {
  const config = {
    target: "https://anibloom-preview123-personal-bcb9.vercel.app",
    path: "/catalog/series/current_season.json",
    requests: 8,
    concurrency: 4,
    timeoutMs: 5000,
  };
  const urls = [];
  const report = await runLoadTest(config, {
    fetchImpl: async (url, options) => {
      urls.push(new URL(url));
      assert.equal(options.method, "GET");
      assert.equal(options.redirect, "error");
      assert.equal(options.headers["Cache-Control"], "no-cache");
      return new Response(JSON.stringify({ metas: [] }), {
        status: 200,
        headers: { "x-vercel-cache": "MISS" },
      });
    },
  });

  assert.equal(report.summary.requests, 8);
  assert.equal(report.summary.failures, 0);
  assert.equal(report.summary.vercelCache.MISS, 8);
  assert.equal(new Set(urls.map((url) => url.searchParams.get("_load_probe"))).size, 8);
  assert.ok(urls.every((url) => url.pathname === config.path));
});

test("load probe records HTTP and response-contract failures without leaking bodies", async () => {
  const report = await runLoadTest({
    target: "https://anibloom-preview123-personal-bcb9.vercel.app",
    path: "/catalog/series/current_season.json",
    requests: 2,
    concurrency: 2,
    timeoutMs: 5000,
  }, {
    fetchImpl: async () => new Response(JSON.stringify({ error: "unavailable" }), { status: 503 }),
  });
  assert.equal(report.summary.failures, 2);
  assert.equal(report.summary.statuses["503"], 2);
  assert.equal(JSON.stringify(report).includes("unavailable"), false);
});

test("load probe forwards the local Vercel OIDC token only to preview requests", async () => {
  const token = "test-oidc-token-not-a-secret";
  const preview = await runLoadTest({
    target: "https://anibloom-preview123-personal-bcb9.vercel.app",
    path: "/catalog/series/current_season.json",
    requests: 1,
    concurrency: 1,
    timeoutMs: 5000,
  }, {
    env: { VERCEL_OIDC_TOKEN: token },
    fetchImpl: async (_url, options) => {
      assert.equal(options.headers["x-vercel-trusted-oidc-idp-token"], token);
      return new Response(JSON.stringify({ metas: [] }), { status: 200 });
    },
  });
  assert.equal(JSON.stringify(preview).includes(token), false);

  await runLoadTest({
    target: "https://anibloom.vercel.app",
    path: "/catalog/series/current_season.json",
    requests: 1,
    concurrency: 1,
    timeoutMs: 5000,
    allowProduction: true,
  }, {
    env: { VERCEL_OIDC_TOKEN: token },
    fetchImpl: async (_url, options) => {
      assert.equal(options.headers["x-vercel-trusted-oidc-idp-token"], undefined);
      return new Response(JSON.stringify({ metas: [] }), { status: 200 });
    },
  });
});

test("load result summary counts stale catalog responses", () => {
  const summary = summarizeLoadResults(
    [
      { ok: true, status: 200, durationMs: 10, bytes: 100, cache: "MISS", stale: true },
      { ok: true, status: 200, durationMs: 20, bytes: 100, cache: "MISS", stale: false },
    ],
    30,
  );
  assert.equal(summary.staleResponses, 1);
});

test("load result summary computes nearest-rank latency percentiles", () => {
  const summary = summarizeLoadResults(
    [10, 20, 30, 40, 50].map((durationMs) => ({
      ok: true,
      status: 200,
      durationMs,
      bytes: 100,
      cache: "MISS",
    })),
    100,
  );
  assert.deepEqual(summary.latencyMs, { p50: 30, p95: 50, p99: 50, max: 50 });
  assert.equal(summary.requestsPerSecond, 50);
  assert.equal(summary.responseBytes, 500);
});
