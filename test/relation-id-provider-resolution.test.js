import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeCatalogPageWithBingeCat } from "../api/catalog-source.js";

const emptyMap = () => new Map();

test("catalog identity resolution can reuse a verified provider mapping from an explicit related AniList id", async () => {
  const metas = await canonicalizeCatalogPageWithBingeCat([{
    id: 155723,
    title: {
      english: null,
      romaji: "Wushen Zhuzai: Da Wei Pian",
      native: "武神主宰：大威篇",
    },
    synonyms: [],
    status: "RELEASING",
    format: "ONA",
    isAdult: false,
    startDate: { year: 2026 },
    coverImage: { large: null },
    relations: {
      edges: [{
        relationType: "PREQUEL",
        node: {
          id: 12345,
          format: "TV",
          title: {
            english: "The God of War Dominates",
            romaji: "Wushen Zhuzai",
            native: "武神主宰",
          },
          startDate: { year: 2020 },
        },
      }],
    },
  }], {
    resolveMappings: async (ids) => {
      if (ids.includes(12345)) {
        return new Map([[12345, [{
          source: "arm",
          anilistId: 12345,
          type: "TV",
          imdbIds: ["tt20769560"],
          tvdbId: null,
          tmdbTvId: null,
          tmdbMovieIds: [],
          title: "The God of War Dominates",
          year: 2020,
          season: null,
          episodeOffset: null,
        }]]]);
      }
      return new Map();
    },
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: emptyMap,
    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveBingeCatSearchMappings: async () => new Map(),
    resolveAnimeMapperMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "tt20769560");
  assert.equal(metas[0].extra.anilistId, 155723);
  assert.equal(metas[0].extra.bingecatProvider, "imdb");
  assert.equal(metas[0].extra.bingecatId, "tt20769560");
});


test("relation identity resolution falls back to IMDb for the related title", async () => {
  const metas = await canonicalizeCatalogPageWithBingeCat([{
    id: 155723,
    title: {
      english: null,
      romaji: "Wushen Zhuzai: Da Wei Pian",
      native: "武神主宰：大威篇",
    },
    synonyms: [],
    status: "RELEASING",
    format: "ONA",
    isAdult: false,
    startDate: { year: 2026 },
    coverImage: { large: null },
    relations: {
      edges: [{
        relationType: "PREQUEL",
        node: {
          id: 117168,
          format: "ONA",
          title: {
            english: "The God of War Dominates",
            romaji: "Wushen Zhuzai",
            native: "武神主宰",
          },
          startDate: { year: 2020 },
          synonyms: [],
          externalLinks: [],
        },
      }],
    },
  }], {
    resolveMappings: async () => new Map(),
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: emptyMap,
    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveBingeCatSearchMappings: async () => new Map(),
    resolveAnimeMapperMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async (rows) => {
      assert.equal(rows.length, 1);
      assert.equal(rows[0].id, 117168);
      assert.equal(rows[0].title.english, "The God of War Dominates");
      return new Map([[117168, [{
        source: "imdb-search",
        anilistId: 117168,
        type: "TV",
        imdbIds: ["tt20769560"],
        tvdbId: null,
        tmdbTvId: null,
        tmdbMovieIds: [],
        title: "The God of War Dominates",
        year: 2020,
        season: null,
        episodeOffset: null,
      }]]]);
    },
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "tt20769560");
  assert.equal(metas[0].extra.anilistId, 155723);
});
