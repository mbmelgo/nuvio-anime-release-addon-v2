import assert from "node:assert/strict";
import test from "node:test";
import { validateCatalog } from "../scripts/validate-production.mjs";

test("production validator accepts canonical AniList fallback identities", () => {
  assert.equal(validateCatalog({
    metas: [{
      id: "anilist:212653",
      type: "series",
      extra: { anilistId: 212653 },
    }],
  }, "upcoming_season"), true);
});


test("production validation inspects every catalog page for duplicate identities", async () => {
  const catalogIds = ["upcoming_season", "current_season", "previous_season", "upcoming_3_days", "previous_3_days"];
  const manifest = {
    id: "com.marki.nuvio.anime-releases",
    version: "1.109.0",
    identityMode: "provider",
    resources: [{ name: "catalog", types: ["series"] }],
    types: ["series"],
    catalogs: catalogIds.map((id) => ({ id, type: "series", pageSize: 50 })),
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
      : [];
    return new Response(JSON.stringify({ metas }), { status: 200 });
  };

  await assert.rejects(
    validateProduction("https://example.test", "1.109.0", fetchImpl),
    /current_season: duplicate catalog identities detected/,
  );
  assert.ok(requests.includes("/catalog/series/current_season.json?skip=50"));
});
