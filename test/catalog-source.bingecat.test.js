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
  assert.equal(verificationOptions.at(-1), null);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRollingCatalog,
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

test("catalog identity resolution continues cheap provider sources when BingeCat denies access", async () => {
  const rows = [row(901, 9901), row(902, 9902)];
  let fribbCalls = 0;
  let animapCalls = 0;
  let idMapperCalls = 0;
  let tsvCalls = 0;
  let imdbCalls = 0;
  let secondaryCalls = 0;
  const fetchImpl = async () => ({ ok: false, status: 403 });

  const result = await canonicalizeCatalogPageWithBingeCat(rows, {
    probeBingeCat: true,
    resolveMappings: async () => new Map(),
    resolveFribbMappings: async (ids) => {
      fribbCalls += 1;
      assert.deepEqual(ids, [901, 902]);
      return new Map([[
        901,
        [{
          source: "fribb",
          anilistId: 901,
          type: "TV",
          imdbIds: ["tt9900901"],
          tvdbId: null,
          tmdbTvId: null,
          tmdbMovieIds: [],
          season: null,
          episodeOffset: null,
        }],
      ]]);
    },
    resolveAnimapMappings: async (ids) => {
      animapCalls += 1;
      assert.deepEqual(ids, [902]);
      return new Map();
    },
    resolveIdMapperMappings: async () => {
      idMapperCalls += 1;
      return new Map();
    },
    resolveBingeCatSearchMappings: async (searchRows, options = {}) => {
      assert.deepEqual(searchRows.map((item) => item.id), [901]);
      options.onCircuitOpen?.();
      return new Map();
    },
    resolveAnimeMapperMappings: async (rows) => new Map([[902, [mapping(902, "tt9900902")]]]),
    resolveTsvMappings: async () => {
      tsvCalls += 1;
      return new Map();
    },
    resolveImdbMappings: async () => {
      imdbCalls += 1;
      return new Map();
    },
    resolveSecondaryMappings: async () => {
      secondaryCalls += 1;
      return new Map();
    },
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(result.length, rows.length);
  assert.deepEqual(result.map((meta) => meta.id), ["tt9900901", "tt9900902"]);
  assert.equal(fribbCalls, 1);
  assert.equal(animapCalls, 1);
  assert.equal(idMapperCalls, 1);
  assert.equal(tsvCalls, 1);
  assert.equal(imdbCalls, 0);
  assert.equal(secondaryCalls, 0);
});

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
  const result = await canonicalizeCatalogPageWithBingeCat(rows, {
    requireBingeCatVerification: true,
    resolveMappings: async () => new Map([
      [1, [mapping(1, "tt1000001")]],
      [2, [mapping(2, "tt1000002")]],
    ]),
    resolveBingeCatSearchMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });
  assert.equal(result.length, rows.length);
  assert.equal(result[1].id, "tt1000002");
  assert.equal(result[1].extra.bingecatEvidence, "provider-id-fallback");
  assert.equal(result[1].extra.bingecatVerification, "unverified-upstream");
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


test("rolling catalogs preserve an exact provider identity when BingeCat verification is unavailable", async () => {
  const result = await buildRollingCatalog("previous_7_days", new Date("2026-10-03T12:00:00+08:00"), 0, "", {
    fetchPage: async () => [{
      media: {
        id: 211181,
        idMal: null,
        title: {
          english: "Mu Shen Ji 4",
          romaji: "Mu Shen Ji 4",
          native: "牧神记4",
        },
        format: "TV",
        startDate: { year: 2026 },
        isAdult: false,
      },
      episode: 25,
      airingAt: 1791039600,
    }],
    resolveMappings: async () => new Map([[
      211181,
      [{
        source: "anime-mapper",
        anilistId: 211181,
        type: "TV",
        imdbIds: ["tt33501934"],
        tvdbId: null,
        tmdbTvId: null,
        tmdbMovieIds: [],
        title: "Tales of Herding Gods 4",
        year: 2026,
      }],
    ]]),
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
    resolveBingeCatSearchMappings: async () => new Map(),
    maxPages: 1,
    requireBingeCatVerification: true,
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, "tt33501934");
  assert.equal(result[0].extra.bingecatEvidence, "provider-id-fallback");
  assert.equal(result[0].extra.bingecatVerification, "unverified-upstream");
});


test("catalog identity resolution performs only one BingeCat verification after Anime Mapper", async () => {
  const rows = [row(903, 9903)];
  let bingeCatCalls = 0;

  const result = await canonicalizeCatalogPageWithBingeCat(rows, {
    probeBingeCat: false,
    resolveMappings: async () => new Map(),
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveBingeCatSearchMappings: async () => {
      bingeCatCalls += 1;
      return new Map();
    },
    resolveAnimeMapperMappings: async () => new Map([[
      903,
      [mapping(903, "tt9900903")],
    ]]),
    resolveAniBridgeMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, "tt9900903");
  assert.equal(bingeCatCalls, 1);
});



test("catalog identity resolution uses AniBridge bulk mappings after Anime Mapper is exhausted", async () => {
  const rows = [row(901, 9901), row(902, 9902)];
  let aniBridgeCalls = 0;

  const result = await canonicalizeCatalogPageWithBingeCat(rows, {
    probeBingeCat: true,
    resolveMappings: async () => new Map(),
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveBingeCatSearchMappings: async (searchRows, options = {}) => {
      assert.deepEqual(searchRows.map((item) => item.id), [901]);
      options.onCircuitOpen?.();
      return new Map();
    },
    resolveAnimeMapperMappings: async () => new Map(),
    resolveAniBridgeMappings: async (unresolvedRows) => {
      aniBridgeCalls += 1;
      assert.deepEqual(unresolvedRows.map((item) => item.id), [901, 902]);
      return new Map([
        [901, [mapping(901, "tt9900901")]],
        [902, [{
          source: "anibridge",
          anilistId: 902,
          type: "TV",
          imdbIds: [],
          tvdbId: 470902,
          tmdbTvId: null,
          tmdbMovieIds: [],
          title: "Anime 902",
          year: 2026,
        }]],
      ]);
    },
    resolveTsvMappings: async () => new Map(),
  });

  assert.equal(result.length, 2);
  assert.deepEqual(result.map((meta) => meta.id), ["tt9900901", "tvdb:470902"]);
  assert.equal(aniBridgeCalls, 1);
});


test("catalog identity resolution keeps IMDb fallback coverage when BingeCat is rate-limited", async () => {
  const rows = [{
    id: 212888,
    idMal: 64340,
    title: { english: "Overgeared", romaji: "Tempal: Item no Chikara", native: "テムパル～アイテムの力～" },
    synonyms: [],
    format: "TV",
    startDate: { year: 2026 },
    endDate: { year: null },
    isAdult: false,
  }];
  let bingeCatCalls = 0;
  let imdbCalls = 0;

  const result = await canonicalizeCatalogPageWithBingeCat(rows, {
    probeBingeCat: true,
    resolveMappings: async () => new Map(),
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveBingeCatSearchMappings: async (_searchRows, options = {}) => {
      bingeCatCalls += 1;
      options.onCircuitOpen?.();
      return new Map();
    },
    resolveAnimeMapperMappings: async () => new Map(),
    resolveAniBridgeMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async (unresolvedRows) => {
      imdbCalls += 1;
      assert.deepEqual(unresolvedRows.map((row) => row.id), [212888]);
      return new Map([[212888, [{
        source: "imdb-search",
        anilistId: 212888,
        type: "TV",
        malId: 64340,
        imdbIds: ["tt43691353"],
        tvdbId: null,
        tmdbTvId: null,
        tmdbMovieIds: [],
        title: "Overgeared",
        year: 2026,
      }]]]);
    },
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, "tt43691353");
  assert.equal(bingeCatCalls, 1);
  assert.equal(imdbCalls, 1);
});
