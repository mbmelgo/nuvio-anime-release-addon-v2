import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const vercelConfig = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
const catalogSource = fs.readFileSync(new URL("../api/catalog-source.js", import.meta.url), "utf8");
const manifestSource = fs.readFileSync(new URL("../api/resolver-manifest.js", import.meta.url), "utf8");

function routeSources() {
  return (vercelConfig.rewrites || []).map((route) => route.source);
}

function routeFor(source) {
  return (vercelConfig.rewrites || []).find((route) => route.source === source);
}

test("catalog-only architecture does not expose versioned or legacy metadata routes", () => {
  const sources = routeSources();
  assert.equal(sources.some((source) => /^\/v\d+\//.test(source)), false);
  assert.equal(sources.some((source) => /^\/meta\//.test(source)), false);
  assert.equal(sources.some((source) => /^\/api\/meta\//.test(source)), false);
});

test("catalog-only architecture uses only the canonical unversioned production routes", () => {
  const sources = routeSources();
  assert.equal(sources.includes("/manifest.json"), true);
  assert.equal(sources.includes("/catalog/:type/:id.json"), true);
  assert.equal(sources.some((source) => source.startsWith("/anibridge/")), false);
  assert.equal(sources.includes("/v5/manifest.json"), false);
  assert.equal(sources.includes("/v5/catalog/:type/:id.json"), false);
});

test("catalog requests are routed to the canonical catalog source", () => {
  const route = routeFor("/catalog/:type/:id.json");
  assert.ok(route);
  assert.equal(route.destination, "/api/catalog-source?resource=catalog&type=:type&id=:id");
  assert.equal(route.destination.includes("catalog-delegation"), false);
});

test("catalog source implements catalog resources without local metadata resolution", () => {
  assert.equal(catalogSource.includes('resource === "meta"'), false);
  assert.equal(catalogSource.includes("buildDetailedMeta"), false);
  assert.equal(catalogSource.includes("JIKAN_URL"), false);
  assert.equal(catalogSource.includes("withAniBridge"), false);
});

test("manifest implementation reuses the canonical catalog definitions", () => {
  assert.equal(catalogSource.includes("export function catalogDefinitions"), true);
  assert.equal(catalogSource.includes("export function getSeasonInfo"), true);
  assert.equal(manifestSource.includes('import { catalogDefinitions, getSeasonInfo } from "./catalog-source.js";'), true);
  assert.equal(manifestSource.includes("function catalogDefinitions("), false);
  assert.equal(manifestSource.includes("function getSeasonInfo("), false);
});

test("manifest uses the canonical addon identity without a legacy version suffix", () => {
  assert.equal(manifestSource.includes('id: "com.marki.nuvio.anime-releases"'), true);
  assert.equal(manifestSource.includes('com.marki.nuvio.anime-releases.v5'), false);
  assert.equal(manifestSource.includes("anibridge"), false);
});

test("manifest cache is short enough to pick up seasonal catalog changes promptly", () => {
  const match = manifestSource.match(/(?:^|[^a-z])max-age=(\d+)/);
  assert.ok(match);
  assert.ok(Number(match[1]) <= 60);
});


test("manifest advertises movie and series types while catalog routing preserves anime compatibility", () => {
  assert.match(manifestSource, /resources:\s*\[\s*\{ name: "catalog", types: \["series", "movie"\] \},\s*\]/);
  assert.match(manifestSource, /types:\s*\["series", "movie"\]/);
  assert.doesNotMatch(manifestSource, /types:\s*\["anime"\]/);
  assert.match(catalogSource, /resource === "catalog" && \["series", "movie", "anime"\]\.includes/);
});


test("catalog snapshot aggregation selects response pages without request metadata", () => {
  const workflow = fs.readFileSync(new URL("../.github/workflows/catalog-snapshot.yml", import.meta.url), "utf8");
  assert.match(workflow, /glob\("page-\[0-9\]\[0-9\]\[0-9\]\[0-9\]\.json"\)/);
  assert.doesNotMatch(workflow, /glob\("page-\*\.json"\)/);
});

test("catalog snapshot workflow compares against the previous snapshot and publishes the diff", () => {
  const workflow = fs.readFileSync(new URL("../.github/workflows/catalog-snapshot.yml", import.meta.url), "utf8");
  assert.match(workflow, /name: Compare against previous production snapshot/);
  assert.match(workflow, /git fetch --quiet origin/);
  assert.match(workflow, /refs\/heads\/catalog-snapshots\/v\*:refs\/remotes\/origin\/catalog-snapshots\/v\*/);
  assert.match(workflow, /node scripts\/find-previous-catalog-snapshot\.js "\$RELEASE_VERSION"/);
  assert.doesNotMatch(workflow, /git fetch --quiet origin[^\n]*\|\| true/);
  assert.match(workflow, /git archive "origin\/catalog-snapshots\/v\$before_version"/);
  assert.match(workflow, /scripts\/compare-catalog-snapshots\.js/);
  assert.match(workflow, /uses: actions\/upload-artifact@v4/);
  assert.match(workflow, /name: catalog-diff-v\$\{\{ steps\.diff\.outputs\.before_version \}\}-to-v\$\{\{ steps\.release\.outputs\.version \}\}/);
});

test("homepage advertises the current three-day rolling catalogs and endpoints", async () => {
  const homeSource = fs.readFileSync(new URL("../api/home-selector.js", import.meta.url), "utf8");
  assert.match(homeSource, /\["Upcoming — 3 days", "upcoming_3_days", "Unique anime with an upcoming airing within the next three days"\]/);
  assert.match(homeSource, /\["Previous — 3 days", "previous_3_days", "Unique anime with an airing within the previous three days"\]/);
  assert.doesNotMatch(homeSource, /upcoming_5_days|previous_7_days|Upcoming — 5 days|Previous — 7 days/);
  assert.doesNotMatch(homeSource, /nuvio-upcoming-5-days|nuvio-previous-7-days/);
});
