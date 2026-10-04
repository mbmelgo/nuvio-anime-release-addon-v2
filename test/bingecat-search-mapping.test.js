import assert from "node:assert/strict";
import test from "node:test";
import {
  clearBingeCatSearchCache,
  resolveAniListMappingsByBingeCatSearch,
  selectExactCandidate,
} from "../lib/bingecat-search-mapping.js";

test("BingeCat search preserves a perfect Meilisearch ranking score on an exact title match", async () => {
  clearBingeCatSearchCache();
  const result = await resolveAniListMappingsByBingeCatSearch([{
    anilistId: 202401,
    type: "TV",
    year: 2026,
    titleEnglish: "Perfect Score Anime",
  }], {
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          series: [{
            name: "Perfect Score Anime",
            id: "tt20240101",
            contentType: "series",
            year: 2026,
            meiliRankingScore: 1,
          }],
        };
      },
    }),
  });

  const record = result.get(202401)[0];
  assert.equal(record.imdbIds[0], "tt20240101");
  assert.equal(record.meiliRankingScore, 1);
  assert.equal(record.bingecatExactTitle, true);
});

test("BingeCat search prefers a perfect exact-title score over an earlier weaker candidate", () => {
  const row = {
    anilistId: 202403,
    type: "TV",
    year: 2026,
    titles: ["Preferred Anime"],
  };

  const record = selectExactCandidate({
    series: [
      {
        name: "Preferred Anime",
        id: "tt20240301",
        contentType: "series",
        year: 2026,
        meiliRankingScore: 0.9,
      },
      {
        name: "Preferred Anime",
        id: "tt20240302",
        contentType: "series",
        year: 2026,
        meiliRankingScore: 1,
      },
    ],
  }, row);

  assert.equal(record.imdbIds[0], "tt20240302");
  assert.equal(record.meiliRankingScore, 1);
  assert.equal(record.bingecatAuthoritative, true);
});

test("BingeCat search does not treat a perfect score as exact-title evidence when titles differ", () => {
  const row = {
    anilistId: 202402,
    type: "TV",
    year: 2026,
    titles: ["Requested Anime"],
  };

  const record = selectExactCandidate({
    series: [{
      name: "Different Anime",
      id: "tt20240201",
      contentType: "series",
      year: 2026,
      meiliRankingScore: 1,
    }],
  }, row);

  assert.equal(record, null);
});

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

test("BingeCat search consumes AniList-shaped title, format, year, MAL, and synonyms", async () => {
  clearBingeCatSearchCache();
  const calls = [];
  const result = await resolveAniListMappingsByBingeCatSearch([{
    id: 212653,
    idMal: 999001,
    format: "MOVIE",
    startDate: { year: 2026 },
    title: {
      english: "Patlabor EZY File 3",
      romaji: "Kidou Keisatsu Patlabor EZY File 3",
      native: "機動警察パトレイバー EZY File 3",
    },
    synonyms: ["Patlabor EZY File 3"],
  }], {
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      calls.push(parsed.searchParams.get("query"));
      if (parsed.searchParams.get("query") === "機動警察パトレイバー EZY File 3") {
        return {