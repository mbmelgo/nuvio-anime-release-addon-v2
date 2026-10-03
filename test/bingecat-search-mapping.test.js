import assert from "node:assert/strict";
import test from "node:test";
import {
  clearBingeCatSearchCache,
  resolveAniListMappingsByBingeCatSearch,
  selectExactCandidate,
} from "../lib/bingecat-search-mapping.js";

test("BingeCat search normalizes an exact movie identity", async () => {
  clearBingeCatSearchCache();
  const result = await resolveAniListMappingsByBingeCatSearch([{
    anilistId: 202390,
    type: "MOVIE",
    year: 2026,
    titleEnglish: "Girls und Panzer das Finale: Part 5",
    titleRomaji: "Girls und Panzer das Finale: Part 5",
  }], {
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          movies: [{
            name: "Girls und Panzer das Finale: Part 5",
            id: "tt39195693",
            tmdbId: 1592548,
            contentType: "movie",
            year: 2026,
          }],
        };
      },
    }),
  });

  const record = result.get(202390)[0];
  assert.equal(record.imdbIds[0], "tt39195693");
  assert.deepEqual(record.tmdbMovieIds, [1592548]);
  assert.equal(record.tmdbTvId, null);
});

test("BingeCat search rejects fuzzy, wrong-type, and wrong-year candidates", () => {
  const row = {
    anilistId: 202390,
    type: "MOVIE",
    year: 2026,
    titles: ["Girls und Panzer das Finale: Part 5"],
  };

  assert.equal(selectExactCandidate({
    movies: [{
      name: "Girls und Panzer das Finale: Part 4",
      id: "tt12345678",
      tmdbId: 123,
      contentType: "movie",
      year: 2023,
    }],
    series: [{
      name: "Girls und Panzer das Finale: Part 5",
      id: "tt87654321",
      contentType: "series",
      year: 2026,
    }],
  }, row), null);
});

test("BingeCat search caches negative lookups", async () => {
  clearBingeCatSearchCache();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return {
      ok: true,
      async json() {
        return { movies: [], series: [] };
      },
    };
  };

  const row = [{
    anilistId: 205289,
    type: "MOVIE",
    year: 2026,
    titleEnglish: "Norman the Snowman: The Children's Star",
  }];

  await resolveAniListMappingsByBingeCatSearch(row, { fetchImpl });
  await resolveAniListMappingsByBingeCatSearch(row, { fetchImpl });
  assert.equal(calls, 1);
});
