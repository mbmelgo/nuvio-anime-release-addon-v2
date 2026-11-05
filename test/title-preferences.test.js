import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTitlePreference, projectCatalogMetas } from "../lib/title-preference.js";
import { buildManifest } from "../api/resolver-manifest.js";
import catalogSource, { getSeasonInfo } from "../api/catalog-source.js";
import { catalogCacheKey, setCatalogRuntimeCacheForTests } from "../lib/catalog-runtime-cache.js";
import { readFileSync } from "node:fs";

const seasons = {
  ongoing: { season: "FALL", year: 2026 },
  previous: { season: "SUMMER", year: 2026 },
  upcoming: { season: "WINTER", year: 2027 },
};
const rows = [
  { id: "tt1234567", type: "series", name: "Attack on Titan", extra: {
    anilistId: 1, titleEnglish: "Attack on Titan", titleRomaji: "Shingeki no Kyojin", titleNative: "進撃の巨人" } },
  { id: "mal:765", type: "series", name: "Romaji fallback", extra: { titleRomaji: "Romaji fallback" } },
  { id: "anilist:99", type: "series", name: "Untranslated", extra: {} },
];
test("normalizes title preferences, including invalid input", () => {
  for (const value of ["native", "romaji", "english", "garbage", null, ""]) {
    assert.equal(normalizeTitlePreference(value), value === "native" || value === "romaji" ? value : "english");
  }
});
test("projects only display titles, preserving identities and shared cached data", () => {
  const snapshot = structuredClone(rows);
  assert.equal(projectCatalogMetas(rows, "english"), rows);
  assert.deepEqual(projectCatalogMetas(rows, "native").map((m) => m.name), ["進撃の巨人", "Romaji fallback", "Untranslated"]);
  assert.deepEqual(projectCatalogMetas(rows, "romaji").map((m) => m.name), ["Shingeki no Kyojin", "Romaji fallback", "Untranslated"]);
  assert.deepEqual(rows, snapshot);
  for (const mode of ["romaji", "native"]) {
    const projected = projectCatalogMetas(rows, mode);
    assert.deepEqual(projected.map((m) => m.id), rows.map((m) => m.id));
    assert.deepEqual(projected.map((m) => m.extra), rows.map((m) => m.extra));
  }
});
test("manifest retains catalog identity, order, search and pagination across all variants", () => {
  const english = buildManifest(seasons);
  const romaji = buildManifest(seasons, "romaji");
  const native = buildManifest(seasons, "native");
  for (const variant of [romaji, native]) {
    assert.equal(variant.id, english.id);
    assert.equal(variant.identityMode, english.identityMode);
    assert.deepEqual(variant.resources, english.resources);
    assert.deepEqual(variant.catalogs.map(({id,type,extra,pageSize}) => ({id,type,extra,pageSize})),
      english.catalogs.map(({id,type,extra,pageSize}) => ({id,type,extra,pageSize})));
  }
  assert.deepEqual(romaji.catalogs.map((c) => c.name), english.catalogs.map((c) => c.name));
  assert.equal(native.catalogs.length, 8);
  assert.equal(native.catalogs.find((c) => c.id === "current_season").name, "今期のアニメ — 2026年秋");
  assert.equal(native.catalogs.find((c) => c.id === "upcoming_season").name, "来期のアニメ — 2027年冬");
  assert.equal(native.catalogs.find((c) => c.id === "previous_3_days").name, "過去3日間の放送");
});
test("Vercel rewrites route each fixed variant with no user token", () => {
  const routes = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")).rewrites;
  for (const mode of ["native", "romaji"]) {
    for (const source of ["/manifest.json", "/catalog/:type/:id.json", "/catalog/:type/:id/:extra*"]) {
      const route = routes.find((r) => r.source === "/" + mode + source);
      assert.ok(route, "missing " + mode + source);
      assert.ok(route.destination.includes("titleMode=" + mode));
    }
  }
});
test("language variants project a shared catalog cache response without poisoning the default", async () => {
  const id = "current_season";
  const seasonInfo = getSeasonInfo(new Date());
  const key = catalogCacheKey("catalog-response", {id, seasonInfo, skip: 0, search: ""});
  const cached = {metas: rows, cachedAt: Date.now(), freshUntil: Date.now() + 60000};
  setCatalogRuntimeCacheForTests({ async get(k) { return k === key ? cached : null; }, async set() {} });
  try {
    for (const [path, expected] of [
      ["/catalog/series/current_season.json", "Attack on Titan"],
      ["/romaji/catalog/series/current_season.json", "Shingeki no Kyojin"],
      ["/native/catalog/series/current_season.json", "進撃の巨人"],
    ]) {
      const response = await catalogSource.fetch(new Request("https://anibloom.example" + path));
      assert.equal(response.status, 200, path);
      const payload = await response.json();
      assert.equal(payload.metas[0].name, expected);
      assert.deepEqual(payload.metas.map((m) => m.id), rows.map((m) => m.id));
    }
    assert.equal(cached.metas[0].name, "Attack on Titan");
  } finally { setCatalogRuntimeCacheForTests(null); }
});
