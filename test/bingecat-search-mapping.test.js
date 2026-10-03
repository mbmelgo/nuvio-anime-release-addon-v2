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
          ok: true,
          async json() {
            return {
              movies: [{
                name: "Patlabor EZY File 3",
                id: "tt39382762",
                tmdbId: 1633794,
                contentType: "movie",
                year: 2026,
              }],
            };
          },
        };
      }
      return {
        ok: true,
        async json() {
          return { movies: [], series: [] };
        },
      };
    },
  });

  const record = result.get(212653)[0];
  assert.equal(record.imdbIds[0], "tt39382762");
  assert.equal(record.malId, 999001);
  assert.deepEqual(record.tmdbMovieIds, [1633794]);
  assert.equal(calls.includes("機動警察パトレイバー EZY File 3"), true);
});

test("BingeCat search can fall back to keyword-only exact search", async () => {
  clearBingeCatSearchCache();
  let semanticRatios = [];
  const result = await resolveAniListMappingsByBingeCatSearch([{
    anilistId: 202390,
    type: "MOVIE",
    year: 2026,
    titleEnglish: "Girls und Panzer das Finale: Part 5",
  }], {
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      semanticRatios.push(parsed.searchParams.get("semantic_ratio"));
      if (parsed.searchParams.get("semantic_ratio") === "0") {
        return {
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
        };
      }
      return {
        ok: true,
        async json() {
          return { movies: [], series: [] };
        },
      };
    },
  });

  const record = result.get(202390)[0];
  assert.equal(record.imdbIds[0], "tt39195693");
  assert.deepEqual(semanticRatios, ["0.55", "0"]);
});

test("BingeCat search accepts an exact base-series identity for a numbered TV/ONA continuation", async () => {
  clearBingeCatSearchCache();
  const result = await resolveAniListMappingsByBingeCatSearch([{
    anilistId: 199353,
    type: "TV",
    year: 2026,
    titleEnglish: "Spare Me, Great Lord! 3",
  }], {
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.searchParams.get("query") !== "Spare Me, Great Lord!") {
        return { ok: true, async json() { return { movies: [], series: [] }; } };
      }
      return {
        ok: true,
        async json() {
          return {
            series: [{
              name: "Spare Me, Great Lord!",
              id: "tt16409202",
              tmdbId: 146339,
              contentType: "series",
              year: 2021,
            }],
          };
        },
      };
    },
  });

  const record = result.get(199353)[0];
  assert.equal(record.imdbIds[0], "tt16409202");
  assert.equal(record.year, null);
});

test("BingeCat search accepts an OVA movie identity when the AniList format is non-MOVIE", async () => {
  clearBingeCatSearchCache();
  const result = await resolveAniListMappingsByBingeCatSearch([{
    anilistId: 212653,
    type: "TV",
    year: 2027,
    titleEnglish: "Patlabor EZY File 3",
    titleRomaji: "Kidou Keisatsu Patlabor EZY File 3",
    titleNative: "機動警察パトレイバー EZY File 3",
  }], {
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.searchParams.get("query") !== "Kidou Keisatsu Patlabor EZY File 3") {
        return { ok: true, async json() { return { movies: [], series: [] }; } };
      }
      return {
        ok: true,
        async json() {
          return {
            movies: [{
              name: "Patlabor EZY File 3",
              id: "tt39382762",
              tmdbId: 1633794,
              contentType: "movie",
              year: 2027,
            }],
          };
        },
      };
    },
  });

  const record = result.get(212653)[0];
  assert.equal(record.imdbIds[0], "tt39382762");
  assert.deepEqual(record.tmdbMovieIds, []);
});

test("BingeCat search accepts an exact provider title contained in a longer translated AniList title", async () => {
  clearBingeCatSearchCache();
  const result = await resolveAniListMappingsByBingeCatSearch([{
    anilistId: 212653,
    type: "TV",
    year: 2027,
    titleRomaji: "Kidou Keisatsu Patlabor EZY File 3",
  }], {
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.searchParams.get("query") !== "Kidou Keisatsu Patlabor EZY File 3") {
        return { ok: true, async json() { return { movies: [], series: [] }; } };
      }
      return {
        ok: true,
        async json() {
          return {
            movies: [{
              name: "Patlabor EZY File 3",
              id: "tt39382762",
              contentType: "movie",
              year: 2027,
            }],
          };
        },
      };
    },
  });

  assert.equal(result.get(212653)[0].imdbIds[0], "tt39382762");
});

test("BingeCat search uses an explicit related AniList title for a sequel", async () => {
  clearBingeCatSearchCache();
  const result = await resolveAniListMappingsByBingeCatSearch([{
    anilistId: 155723,
    type: "TV",
    year: 2026,
    titleRomaji: "Wushen Zhuzai: Da Wei Pian",
    relations: {
      edges: [{
        relationType: "PREQUEL",
        node: { title: { english: "The God of War Dominates" } },
      }],
    },
  }], {
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.searchParams.get("query") !== "The God of War Dominates") {
        return { ok: true, async json() { return { movies: [], series: [] }; } };
      }
      return {
        ok: true,
        async json() {
          return {
            series: [{
              name: "The God of War Dominates",
              id: "tt20769560",
              contentType: "series",
              year: 2020,
            }],
          };
        },
      };
    },
  });

  const record = result.get(155723)[0];
  assert.equal(record.imdbIds[0], "tt20769560");
  assert.equal(record.year, null);
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
  assert.equal(calls, 2);
});

test("BingeCat search can derive a franchise prefix before a subtitle", async () => {
  clearBingeCatSearchCache();
  const result = await resolveAniListMappingsByBingeCatSearch([{
    anilistId: 205289,
    type: "MOVIE",
    year: 2026,
    titleEnglish: "Norman the Snowman: The Children's Star",
    titleRomaji: "Norman the Snowman: Kodomo-tachi no Hitotsuboshi",
  }], {
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.searchParams.get("query") !== "Norman the Snowman") {
        return { ok: true, async json() { return { movies: [], series: [] }; } };
      }
      return {
        ok: true,
        async json() {
          return {
            movies: [{
              name: "Norman the Snowman: On a Night of Shooting Stars",
              id: "tt00000001",
              contentType: "movie",
              year: 2016,
            }],
          };
        },
      };
    },
  });

  const record = result.get(205289)[0];
  assert.equal(record.imdbIds[0], "tt00000001");
  assert.equal(record.year, null);
});
