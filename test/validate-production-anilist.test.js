import assert from "node:assert/strict";
import test from "node:test";
import { validateCatalog, validateManifest, validateProduction } from "../scripts/validate-production.mjs";

test("production validator accepts canonical AniList fallback identities for series and movies", () => {
  assert.equal(validateCatalog({
    metas: [{ id: "anilist:212653", type: "series", extra: { anilistId: 212653 } }],
  }, "upcoming_season"), true);
  assert.equal(validateCatalog({
    metas: [{ id: "anilist:31970593", type: "movie", extra: { anilistId: 31970593 } }],
  }, "current_season_movies"), true);
  assert.throws(() => validateCatalog({
    metas: [{ id: "anilist:31970593", type: "series", extra: { anilistId: 31970593 } }],
  }, "current_season_movies"), /not a movie/);
});

test("legacy production manifest is accepted only for explicit dry-run compatibility", () => {
  const ids = ["upcoming_season", "current_season", "previous_season", "upcoming_3_days", "previous_3_days"];
  const manifest = {
    version: "1.120.0",
    id: "com.marki.nuvio.anime-releases",
    identityMode: "provider",
    resources: [{ name: "catalog", types: ["series"] }],
    types: ["series"],
    catalogs: ids.map((id) => ({ id, type: "series", pageSize: 50 })),
  };
  assert.throws(() => validateManifest(manifest, "1.120.0"), /catalog contract/);
  assert.equal(validateManifest(manifest, "1.120.0", { allowLegacy: true }), true);
});

test("production manifest validator requires matching movie and series catalog types", () => {
  const ids = ["upcoming_season", "current_season", "previous_season", "upcoming_season_movies", "current_season_movies", "previous_season_movies", "upcoming_3_days", "previous_3_days"];
  const manifest = {
    version: "1.121.0",
    id: "com.marki.nuvio.anime-releases",
    identityMode: "provider",
    resources: [{ name: "catalog", types: ["series", "movie"] }],
    types: ["series", "movie"],
    catalogs: ids.map((id) => ({ id, type: id.endsWith("_movies") ? "movie" : "series", pageSize: 50 })),
  };
  assert.equal(validateManifest(manifest, "1.121.0"), true);
  assert.throws(() => validateManifest({ ...manifest, catalogs: manifest.catalogs.map((c) => c.id === "current_season_movies" ? { ...c, type: "series" } : c) }, "1.121.0"), /catalog types/);
});


test("production validation inspects every catalog page for duplicate identities", async () => {
  const catalogIds = ["upcoming_season", "current_season", "previous_season", "upcoming_season_movies", "current_season_movies", "previous_season_movies", "upcoming_3_days", "previous_3_days"];
  const manifest = {
    id: "com.marki.nuvio.anime-releases",
    version: "1.109.0",
    identityMode: "provider",
    resources: [{ name: "catalog", types: ["series", "movie"] }],
    types: ["series", "movie"],
    catalogs: catalogIds.map((id) => ({ id, type: id.endsWith("_movies") ? "movie" : "series", pageSize: 50 })),
  };
  const firstPage = Array.from({ length: 50 }, (_, index) => ({
    id: `tmdb:${10000 + index}`,
    type: "series",
    extra: {},
  }));
  const secondPage = [{
    id: firstPage[0].id,
    type: "series",
    extra: {},
  }];
  const requests = [];
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    requests.push(parsed.pathname + parsed.search);
    if (parsed.pathname === "/manifest.json") {
      return new Response(JSON.stringify(manifest), { status: 200 });
    }
    if (parsed.pathname === "/meta/series/mal%3A39535.json" || parsed.pathname === "/meta/series/mal:39535.json") {
      return new Response("{}", { status: 404 });
    }
    const catalogId = parsed.pathname.split("/").pop().replace(/\.json$/, "");
    const skip = Number(parsed.searchParams.get("skip") || 0);
    const metas = catalogId === "current_season"
      ? (skip === 0 ? firstPage : secondPage)
      : catalogId === "current_season_movies"
        ? [{ id: "tmdb:1236857", type: "movie", extra: {} }]
        : [];
    return new Response(JSON.stringify({ metas }), { status: 200 });
  };

  await assert.rejects(
    validateProduction("https://example.test", "1.109.0", fetchImpl),
    /current_season: duplicate catalog identity across pages/,
  );
  assert.ok(requests.includes("/catalog/series/current_season.json?skip=50"));
});
