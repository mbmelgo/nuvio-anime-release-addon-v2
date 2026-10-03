import test from "node:test";
import assert from "node:assert/strict";
import { buildManifest } from "../api/resolver-manifest.js";

test("release addon advertises anime catalogs for external metadata delegation", () => {
  const manifest = buildManifest({
    ongoing: { season: "SUMMER", year: 2026 },
    previous: { season: "SPRING", year: 2026 },
    upcoming: { season: "FALL", year: 2026 },
  });

  assert.deepEqual(manifest.types, ["anime"]);
  assert.deepEqual(manifest.resources, [
    { name: "catalog", types: ["anime"] },
  ]);
  assert.equal(manifest.resources.some((resource) => resource.name === "meta"), false);
  assert.equal("idPrefixes" in manifest, false);
  assert.match(manifest.description, /catalog/i);
  assert.match(manifest.description, /release/i);
});
