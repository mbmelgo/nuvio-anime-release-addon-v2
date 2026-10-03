import test from "node:test";
import assert from "node:assert/strict";
import { buildManifest } from "../api/resolver-manifest.js";
import { canonicalizeCatalogPage } from "../api/catalog-source.js";

test("primary manifest uses MAL identity with AniList fallback", () => {
  const manifest = buildManifest({
    ongoing: { season: "SUMMER", year: 2026 },
    previous: { season: "SPRING", year: 2026 },
    upcoming: { season: "FALL", year: 2026 },
  });

  assert.equal(manifest.id, "com.marki.nuvio.anime-releases");
  assert.equal(manifest.identityMode, "bingecat");
  assert.equal(manifest.name, "Anime Releases for Nuvio");
  assert.equal(manifest.catalogs.length, 5);
  assert.deepEqual(manifest.catalogs.map((catalog) => catalog.id), [
    "upcoming_season",
    "current_season",
    "previous_season",
    "upcoming_5_days",
    "previous_7_days",
  ]);
});

test("seasonal catalog canonicalization prefers MAL identity", () => {
  const metas = canonicalizeCatalogPage([
    {
      id: 195604,
      idMal: 61967,
      title: { romaji: "Black Clover 2nd Season", english: "Black Clover Season 2" },
      coverImage: { large: "https://example.invalid/poster.jpg" },
      genres: ["Action"],
      status: "NOT_YET_RELEASED",
    },
  ]);

  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "mal:61967");
  assert.equal(metas[0].type, "series");
  assert.equal(metas[0].name, "Black Clover Season 2");
  assert.deepEqual(metas[0].genres, ["Action"]);
  assert.equal(metas[0].extra.anilistId, 195604);
  assert.equal(metas[0].extra.malId, 61967);
});

test("seasonal catalog falls back to AniList when MAL is unavailable", () => {
  const metas = canonicalizeCatalogPage([
    { id: 205896, title: { romaji: "Fallback Anime" } },
  ]);

  assert.deepEqual(metas.map((meta) => meta.id), ["anilist:205896"]);
});

test("provider mappings are not required for catalog identity", () => {
  const metas = canonicalizeCatalogPage([
    { id: 195604, idMal: 61967, title: { romaji: "Black Clover 2nd Season" } },
    { id: 205896, title: { romaji: "Fallback Anime" } },
  ]);

  assert.deepEqual(metas.map((meta) => meta.id), ["mal:61967", "anilist:205896"]);
});
