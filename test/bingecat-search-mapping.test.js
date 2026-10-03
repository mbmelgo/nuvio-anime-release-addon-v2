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

test("BingeCat search rejects token-compatible candidates from a different year", () => {
  const row = {
    anilistId: 202391,
    type: "TV",
    year: 2026,
    titles: ["The Shared Detective Special"],
  };

  assert.equal(selectExactCandidate({
    series: [{
      name: "The Shared Detective",
      id: "tt87654322",
      contentType: "series",
      year: 2020,
    }],
  }, row), null);
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
  assert.equal(calls, 4);
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

test("BingeCat search derives a base title from File-numbered installments", async () => {
  clearBingeCatSearchCache();
  const result = await resolveAniListMappingsByBingeCatSearch([{
    anilistId: 212653,
    type: "TV",
    year: 2027,
    titleRomaji: "Kidou Keisatsu Patlabor EZY File 3",
  }], {
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.searchParams.get("query") !== "Kidou Keisatsu Patlabor EZY") {
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
});


test("BingeCat search cache does not reuse a candidate across distinct AniList rows", async () => {
  clearBingeCatSearchCache();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    const id = calls === 1 ? "tt11111111" : "tt22222222";
    return {
      ok: true,
      async json() {
        return {
          series: [{
            name: "Duplicate Title",
            id,
            contentType: "series",
            year: 2026,
          }],
        };
      },
    };
  };

  const base = {
    type: "TV",
    year: 2026,
    titleEnglish: "Duplicate Title",
  };
  const first = await resolveAniListMappingsByBingeCatSearch([
    { ...base, anilistId: 900101 },
  ], { fetchImpl });
  const second = await resolveAniListMappingsByBingeCatSearch([
    { ...base, anilistId: 900102 },
  ], { fetchImpl });

  assert.equal(first.get(900101)[0].imdbIds[0], "tt11111111");
  assert.equal(second.get(900102)[0].imdbIds[0], "tt22222222");
  assert.equal(calls, 2);
});


test("BingeCat cache continues past a cached negative title variant", async () => {
  clearBingeCatSearchCache();
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    const query = new URL(url).searchParams.get("query");
    if (query === "Resolved Alias") {
      return {
        ok: true,
        async json() {
          return {
            movies: [{
              name: "Resolved Alias",
              id: "tt8888888",
              contentType: "movie",
              year: 2026,
            }],
          };
        },
      };
    }
    return { ok: true, async json() { return { movies: [], series: [] }; } };
  };
  const row = [{
    anilistId: 301003,
    type: "MOVIE",
    year: 2026,
    titleEnglish: "Missing Alias",
    titleRomaji: "Resolved Alias",
  }];

  const first = await resolveAniListMappingsByBingeCatSearch(row, { fetchImpl });
  assert.equal(first.get(301003)[0].imdbIds[0], "tt8888888");
  assert.equal(calls, 3);

  const second = await resolveAniListMappingsByBingeCatSearch(row, { fetchImpl });
  assert.equal(second.get(301003)[0].imdbIds[0], "tt8888888");
  assert.equal(calls, 3);
});

test("BingeCat cache is scoped to the AniList identity", async () => {
  clearBingeCatSearchCache();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, async json() {
      return { movies: [{ name: "Shared Title", id: "tt7777777", contentType: "movie", year: 2026 }] };
    }};
  };
  const rows = [
    { anilistId: 301001, type: "MOVIE", year: 2026, titleEnglish: "Shared Title" },
    { anilistId: 301002, type: "MOVIE", year: 2026, titleEnglish: "Shared Title" },
  ];
  await resolveAniListMappingsByBingeCatSearch([rows[0]], { fetchImpl });
  await resolveAniListMappingsByBingeCatSearch([rows[1]], { fetchImpl });
  assert.equal(calls, 2);
});


test("BingeCat authoritative verification can retry a cached negative result", async () => {
  clearBingeCatSearchCache();
  let phase = 0;
  let calls = 0;
  const row = [{
    anilistId: 202079,
    type: "TV",
    year: 2026,
    titleEnglish: "Uncle's Obsession with Cute Things",
    titleRomaji: "Oji-san wa Kawaii Mono ga Osuki.",
    titleNative: "おじさんはカワイイものがお好き。",
    synonyms: ["Pops Loves Kawaii Stuff", "This Uncle Likes Cute Things", "Ojikawa", "おじかわ"],
  }];

  const fetchImpl = async () => {
    calls += 1;
    if (phase === 0) {
      return { ok: true, async json() { return { movies: [], series: [] }; } };
    }
    return {
      ok: true,
      async json() {
        return {
          series: [{
            name: "Uncle's Obsession with Cute Things",
            id: "tt43691343",
            contentType: "series",
            year: 2026,
          }],
        };
      },
    };
  };

  const first = await resolveAniListMappingsByBingeCatSearch(row, { fetchImpl });
  assert.equal(first.has(202079), false);
  const firstCallCount = calls;
  phase = 1;

  const second = await resolveAniListMappingsByBingeCatSearch(row, {
    fetchImpl,
    bypassNegativeCache: true,
  });
  assert.equal(second.get(202079)[0].imdbIds[0], "tt43691343");
  assert.ok(calls > firstCallCount);
});


test("TEMP live probe logs BingeCat 202079 HTTP statuses", async () => {
  clearBingeCatSearchCache();
  const calls = [];
  const result = await resolveAniListMappingsByBingeCatSearch([{
    anilistId: 202079,
    type: "TV",
    year: 2026,
    titleEnglish: "Uncle's Obsession with Cute Things",
    titleRomaji: "Oji-san wa Kawaii Mono ga Osuki.",
    titleNative: "おじさんはカワイイものがお好き。",
    synonyms: ["Pops Loves Kawaii Stuff", "This Uncle Likes Cute Things", "Ojikawa", "おじかわ"],
  }], {
    fetchImpl: async (url, init) => {
      const response = await fetch(url, init);
      calls.push({
        query: new URL(url).searchParams.get("query"),
        semanticRatio: new URL(url).searchParams.get("semantic_ratio"),
        status: response.status,
      });
      return response;
    },
  });
  console.log("TEMP_UNCLE_BINGECAT_HTTP", JSON.stringify(calls));
  console.log("TEMP_UNCLE_BINGECAT_RESULT", JSON.stringify(result.get(202079) || []));
  assert.equal(result.get(202079)?.[0]?.imdbIds?.[0], "tt43691343");
});
