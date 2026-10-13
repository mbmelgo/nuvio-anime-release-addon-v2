import assert from "node:assert/strict";
import test from "node:test";
import { formatCatalogDiagnostics, getCatalogCacheControl, mergeCatalogDiagnosticStages, normalizeCatalogOptions } from "../api/catalog-source.js";

test("TMDB resolver log summary includes stage duration and only aggregate counters", async () => {
  const { formatTMDBResolverSummary } = await import("../api/catalog-source.js");
  assert.deepEqual(formatTMDBResolverSummary(48, 1234.6, {
    rowsRequested: 48,
    rowsStarted: 48,
    rowsResolved: 30,
    rowsNoMatch: 17,
    rowsSkippedDeadline: 0,
    rowsSkippedUnavailable: 0,
    invalidRows: 0,
    rowErrors: 1,
    httpErrors: 1,
    http429Errors: 1,
    timeouts: 1,
    rowsDeadlineExhausted: 1,
    relatedSeasonRowsAttempted: 0,
    relatedSeasonSearches: 0,
    relatedSeasonCandidateSeries: 0,
    relatedSeasonDetailsLookups: 0,
    relatedSeasonTitleMatches: 0,
    relatedSeasonResolved: 0,
    relatedSeasonLookupErrors: 0,
    anilistId: 178083,
    title: "must not be logged",
  }), {
    catalogRows: 48,
    tmdbDurationMs: 1235,
    rowsRequested: 48,
    rowsStarted: 48,
    rowsResolved: 30,
    rowsNoMatch: 17,
    rowsSkippedDeadline: 0,
    rowsSkippedUnavailable: 0,
    invalidRows: 0,
    rowErrors: 1,
    httpErrors: 1,
    http429Errors: 1,
    timeouts: 1,
    rowsDeadlineExhausted: 1,
    relatedSeasonRowsAttempted: 0,
    relatedSeasonSearches: 0,
    relatedSeasonCandidateSeries: 0,
    relatedSeasonDetailsLookups: 0,
    relatedSeasonTitleMatches: 0,
    relatedSeasonResolved: 0,
    relatedSeasonLookupErrors: 0,
  });
});

test("catalog diagnostics expose stable duration and cold-start headers", () => {
  assert.deepEqual(
    formatCatalogDiagnostics(12.7, true, { arm: 4.4, canonical: 9.8 }),
    {
      "X-Nuvio-Catalog-Duration-Ms": "13",
      "X-Nuvio-Cold-Start": "1",
      "X-Nuvio-Process-Uptime-Ms": "0",
      "X-Nuvio-Catalog-Stages": JSON.stringify({ arm: 4, canonical: 10 }),
    },
  );
  assert.deepEqual(
    formatCatalogDiagnostics(-2, false),
    {
      "X-Nuvio-Catalog-Duration-Ms": "0",
      "X-Nuvio-Cold-Start": "0",
      "X-Nuvio-Process-Uptime-Ms": "0",
    },
  );
});


test("catalog canonicalizer options normalize null diagnostics input", () => {
  assert.deepEqual(normalizeCatalogOptions(null), {});
  const diagnostics = {};
  assert.deepEqual(normalizeCatalogOptions({ diagnostics }), { diagnostics });
});


test("rolling page diagnostic stages accumulate instead of overwriting earlier pages", () => {
  const diagnostics = { schedule: 12, identityResolution: 5, arm: 2, productionIdentityCache: 1 };
  mergeCatalogDiagnosticStages(diagnostics, {
    identityResolution: 7,
    arm: 3,
    tmdb: 4,
    productionIdentityCache: 2,
  });

  assert.deepEqual(diagnostics, {
    schedule: 12,
    identityResolution: 12,
    arm: 5,
    tmdb: 4,
    productionIdentityCache: 3,
  });
});


test("rolling catalogs use short shared caching without long stale fallbacks", () => {
  assert.equal(getCatalogCacheControl("upcoming_3_days"), "public, s-maxage=30, stale-while-revalidate=30");
  assert.equal(getCatalogCacheControl("previous_3_days"), "public, s-maxage=30, stale-while-revalidate=30");
  assert.equal(getCatalogCacheControl("current_season"), "public, s-maxage=3600, stale-while-revalidate=86400, stale-if-error=86400");
  assert.equal(getCatalogCacheControl("upcoming_3_days", true), "no-store");
});
