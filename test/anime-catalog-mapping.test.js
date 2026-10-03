import assert from "node:assert/strict";
import test from "node:test";
import { clearAnimeCatalogCache, resolveAniListMappingsByAnimeCatalog } from "../lib/anime-catalog-mapping.js";

test("anime catalog resolves a movie identity by AniList ID", async () => {
  clearAnimeCatalogCache();
  const result = await resolveAniListMappingsByAnimeCatalog([{ id: 205289, type: "MOVIE" }], {
    endpoint: "https://mapper.test/catalog.json",
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return [{
          id: "tt32547691",
          name: "Norman the Snowman: Kodomo-tachi no Hitotsuboshi",
          extra: { anilistId: 205289 },
        }];
      },
    }),
  });
  assert.equal(result.get(205289)[0].imdbIds[0], "tt32547691");
  assert.equal(result.get(205289)[0].type, "MOVIE");
});

test("anime catalog ignores entries without an IMDb identity", async () => {
  clearAnimeCatalogCache();
  const result = await resolveAniListMappingsByAnimeCatalog([{ id: 215695, type: "TV" }], {
    endpoint: "https://mapper.test/catalog.json",
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return [{ id: "215695", name: "Komadori Mofmof Parade", extra: { anilistId: 215695 } }];
      },
    }),
  });
  assert.equal(result.has(215695), false);
});

test("anime catalog caches the dataset", async () => {
  clearAnimeCatalogCache();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, async json() { return []; } };
  };
  await resolveAniListMappingsByAnimeCatalog([{ id: 205289 }], { endpoint: "https://mapper.test/catalog.json", fetchImpl });
  await resolveAniListMappingsByAnimeCatalog([{ id: 205289 }], { endpoint: "https://mapper.test/catalog.json", fetchImpl });
  assert.equal(calls, 1);
});
