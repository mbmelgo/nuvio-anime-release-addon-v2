import test from "node:test";
import assert from "node:assert/strict";
import { buildManifest } from "../api/resolver-manifest.js";
import { getSeasonInfo } from "../api/catalog-source.js";
import { ADDON_VERSION } from "../api/version.js";
import { BASE_URL } from "../api/config.js";

test("AniBloom manifest exposes the icon and preserves the catalog contract", () => {
  const manifest = buildManifest(getSeasonInfo(new Date()));
  assert.equal(manifest.id, "com.marki.nuvio.anime-releases");
  assert.equal(manifest.version, ADDON_VERSION);
  assert.equal(manifest.name, "AniBloom");
  assert.equal(manifest.logo, BASE_URL + "/assets/anibloom-icon.png");
  assert.equal(Object.hasOwn(manifest, "background"), false);
  assert.deepEqual(manifest.resources, [{ name: "catalog", types: ["series", "movie"] }]);
  assert.deepEqual(manifest.types, ["series", "movie"]);
  assert.equal(manifest.identityMode, "provider");
  assert.deepEqual(manifest.catalogs.map(function (item) { return item.id; }), ["upcoming_season","current_season","previous_season","upcoming_season_movies","current_season_movies","previous_season_movies","upcoming_3_days","previous_3_days"]);
});
