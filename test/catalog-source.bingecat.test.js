test("catalog identity resolution supplements a valid TVDB identity with a preferred BingeCat IMDb identity", async () => {
  const rows = [{ ...row(195604, 61967), title: { romaji: "Black Clover 2nd Season", english: "Black Clover Season 2", native: "ブラッククローバー 第2期" } }];
  const verificationOptions = [];
  const result = await canonicalizeCatalogPageWithBingeCat(rows, {
    resolveMappings: async () => new Map([[
      195604,
      [{
        source: "arm",
        anilistId: 195604,
        type: "TV",
        imdbIds: [],
        tvdbId: 331753,
        tmdbTvId: null,
        tmdbMovieIds: [],
        title: "Black Clover Season 2",
        year: 2026,
      }],
    ]]),
    resolveBingeCatSearchMappings: async (searchRows, options) => {
      assert.deepEqual(searchRows.map((item) => item.id), [195604]);
      verificationOptions.push(options ?? null);
      if (!options?.bypassNegativeCache) return new Map();
      return new Map([[
        195604,
        [{
          source: "bingecat-search",
          anilistId: 195604,
          type: "TV",
          imdbIds: ["tt7441658"],
          tvdbId: null,
          tmdbTvId: null,
          tmdbMovieIds: [],
          title: "Black Clover",
          year: null,
          derivedTitle: true,
        }],
      ]]);
    },
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, "tt7441658");
  assert.equal(result[0].extra.bingecatProvider, "imdb");
  assert.deepEqual(verificationOptions.at(-1), { bypassNegativeCache: true });
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalizeCatalogPageWithBingeCat,
} from "../api/catalog-source.js";

function mapping(anilistId, imdb) {
  return {
    source: "test",
    anilistId,
    type: "TV",
    imdbIds: [imdb],
    tvdbId: null,
    tmdbTvId: null,
    tmdbMovieIds: [],
    season: null,
    episodeOffset: null,
  };
}

function row(id, malId = id) {
  return {
    id,
    idMal: malId,
    title: { romaji: `Anime ${id}`, english: `Anime ${id}`, native: null },
    format: "TV",
    startDate: { year: 2026 },
    endDate: { year: null },
    isAdult: false,
  };
}

test("catalog identity resolution preserves all source rows when the MAL bridge resolves an ARM miss", async () => {
  const rows = [row(1, 101), row(2, 102), row(3, 103)];
  const result = await canonicalizeCatalogPageWithBingeCat(rows, {
    resolveMappings: async () => new Map([
      [1, [mapping(1, "tt1000001")]],
      [2, [mapping(2, "tt1000002")]],
    ]),
    resolveBingeCatSearchMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async (unresolvedRows) => {
      assert.deepEqual(unresolvedRows.map((item) => item.id), [3]);
      return new Map([[3, [mapping(3, "tt1000003")]]]);
    },
  });

  assert.equal(result.length, rows.length);
  assert.deepEqual(result.map((meta) => meta.id), [
    "tt1000001",
    "tt1000002",
    "tt1000003",
  ]);
});


test("catalog identity resolution uses Fribb before rate-limited secondary sources", async () => {
  const rows = [row(10, 110), row(11, 111)];
  let secondaryCalls = 0;
  const result = await canonicalizeCatalogPageWithBingeCat(rows, {
    resolveMappings: async () => new Map(),
    resolveFribbMappings: async (ids) => {
      assert.deepEqual(ids, [10, 11]);
      return new Map([[10, [mapping(10, "tt1000010")]]]);
    },
    resolveBingeCatSearchMappings: async () => new Map(),
    resolveSecondaryMappings: async (ids) => {
      secondaryCalls += 1;
      assert.deepEqual(ids, [11]);
      return new Map([[11, [mapping(11, "tt1000011")]]]);
    },
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(result.length, rows.length);
  assert.deepEqual(result.map((meta) => meta.id), ["tt1000010", "tt1000011"]);
  assert.equal(secondaryCalls, 1);
});

test("catalog identity resolution never silently drops an unresolved source row", async () => {
  const rows = [row(1), row(2, null)];
  await assert.rejects(
    canonicalizeCatalogPageWithBingeCat(rows, {
      resolveMappings: async () => new Map([[1, [mapping(1, "tt1000001")]]]),
      resolveBingeCatSearchMappings: async () => new Map(),
      resolveSecondaryMappings: async () => new Map(),
      resolveAlternativeMappings: async () => new Map(),
    }),
    /BingeCat identity resolution exhausted.*2/,
  );
});

test("50 AniList source rows produce exactly 50 BingeCat catalog results", async () => {
  const rows = Array.from({ length: 50 }, (_, index) => row(index + 1));
  const result = await canonicalizeCatalogPageWithBingeCat(rows, {
    resolveMappings: async (ids) => new Map(
      ids.map((id) => [id, [mapping(id, `tt${String(1000000 + id)}`)]])
    ),
    resolveBingeCatSearchMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(result.length, 50);
  assert.ok(result.every((meta) => /^(tt\d+|tvdb:[1-9]\d*|tmdb:[1-9]\d*)$/.test(meta.id)));
});
