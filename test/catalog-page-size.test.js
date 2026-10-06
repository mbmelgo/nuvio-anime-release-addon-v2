import test from "node:test";
import assert from "node:assert/strict";
import { ANILIST_PAGE_SIZE, NUVIO_PAGE_SIZE, catalogDefinitions } from "../lib/catalog-config.js";
import { fetchValidatedSeasonCatalogPage } from "../api/catalog-source.js";

test("catalog pagination uses 50 upstream records and 50 Nuvio records for all catalogs", () => {
  assert.equal(ANILIST_PAGE_SIZE, 50);
  assert.equal(NUVIO_PAGE_SIZE, 50);

  const definitions = catalogDefinitions({
    ongoing: { season: "FALL", year: 2026 },
    previous: { season: "SUMMER", year: 2026 },
    upcoming: { season: "WINTER", year: 2027 },
  });

  assert.equal(definitions.length, 5);
  for (const definition of definitions) {
    assert.equal(definition.type, "series");
    assert.equal(definition.pageSize, 50);
  }
});

test("seasonal page returns fewer than 50 validated results without fetching another AniList page", async () => {
  const calls = [];
  const result = await fetchValidatedSeasonCatalogPage({
    filter: { season: { season: "FALL", year: 2026 }, sort: ["START_DATE", "TITLE_ROMAJI", "ID"] },
    skip: 0,
    fetchPage: async (filter, page) => {
      calls.push({ filter, page });
      return Array.from({ length: 20 }, (_, index) => ({ id: index + 1 }));
    },
    canonicalizePage: async (rows) => rows.map((row) => meta(row.id)),
  });

  assert.equal(result.length, 20);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].page, 1);
});

test("seasonal page 2 requests only AniList page 2 and does not fill from page 3", async () => {
  const calls = [];
  const result = await fetchValidatedSeasonCatalogPage({
    filter: { season: { season: "FALL", year: 2026 }, sort: ["START_DATE", "TITLE_ROMAJI", "ID"] },
    skip: 50,
    fetchPage: async (filter, page) => {
      calls.push(page);
      return Array.from({ length: 20 }, (_, index) => ({ id: page * 100 + index }));
    },
    canonicalizePage: async (rows) => rows.map((row) => meta(row.id)),
  });

  assert.equal(result.length, 20);
  assert.deepEqual(calls, [2]);
  assert.equal(result[0].name, "Anime 200");
});

function meta(id) {
  return { id: `tmdb:${id}`, type: "anime", name: `Anime ${id}` };
}
