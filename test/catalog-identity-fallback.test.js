import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeCatalogPageWithBingeCat } from "../api/catalog-source.js";

const emptyMappings = async () => new Map();

test("BingeCat retry supersedes an Anime Mapper identity for the same unresolved row", async () => {
  const metas = await canonicalizeCatalogPageWithBingeCat([{
    id: 195604,
    idMal: 61967,
    title: {
      english: "Black Clover Season 2",
      romaji: "Black Clover 2nd Season",
      native: "ブラッククローバー 第2期",
    },
    synonyms: [],
    format: "TV",
    startDate: { year: 2026 },
    status: "NOT_YET_RELEASED",
    isAdult: false,
    relations: {
      edges: [{
        relationType: "PREQUEL",
        node: {
          id: 97940,
          title: { english: "Black Clover", romaji: "Black Clover", native: "ブラッククローバー" },
          format: "TV",
          startDate: { year: 2017 },
        },
      }],
    },
  }], {
    resolveMappings: async () => new Map(),
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveBingeCatSearchMappings: async (rows) => {
      const row = rows[0];
      if (row.id !== 195604) return new Map();
      return new Map([[195604, [{
        source: "bingecat-search",
        anilistId: 195604,
        type: "TV",
        imdbIds: ["tt22868844"],
        tvdbId: null,
        tmdbTvId: null,
        tmdbMovieIds: [],
        title: "Black Clover",
        year: null,
      }]]]);
    },
    resolveAnimeMapperMappings: async () => new Map([[195604, [{
      source: "anime-mapper-relation",
      anilistId: 195604,
      type: "TV",
      imdbIds: [],
      tvdbId: 331753,
      tmdbTvId: null,
      tmdbMovieIds: [],
      title: "Black Clover Season 2",
      year: 2026,
    }]]]),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "tt22868844");
  assert.equal(metas[0].extra.bingecatProvider, "imdb");
});

test("later mapping sources supplement unsupported earlier records", async () => {
  const metas = await canonicalizeCatalogPageWithBingeCat([{
    id: 123,
    title: {
      english: "Example Anime",
      romaji: "Example Anime",
      native: "例",
    },
    format: "TV",
    startDate: { year: 2026 },
    status: "RELEASING",
    isAdult: false,
  }], {
    resolveMappings: async () => new Map([[
      123,
      [{
        source: "arm",
        anilistId: 123,
        type: "TV",
        imdbIds: ["tt1234567"],
        tvdbId: null,
        tmdbTvId: null,
        tmdbMovieIds: [],
        malId: 456,
        title: "Example Anime",
      }],
    ]]),
    resolveFribbMappings: emptyMappings,
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: async () => new Map([[
      123,
      [{
        source: "animap",
        anilistId: 123,
        type: "TV",
        imdbIds: ["tt1234567"],
        tvdbId: null,
        tmdbTvId: null,
        tmdbMovieIds: [],
        malId: null,
        title: "Example Anime",
        year: 2026,
      }],
    ]]),
    resolveTsvMappings: emptyMappings,
    resolveImdbMappings: async () => new Map(),
    resolveSecondaryMappings: emptyMappings,
    resolveAlternativeMappings: emptyMappings,
  });

  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "tt1234567");
  assert.equal(metas[0].extra.bingecatProvider, "imdb");
});
