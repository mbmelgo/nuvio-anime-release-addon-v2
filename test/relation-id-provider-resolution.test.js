import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeCatalogPageWithBingeCat } from "../api/catalog-source.js";

const emptyMap = () => new Map();

test("catalog identity resolution can reuse a verified provider mapping from an explicit related AniList id", async () => {
  const searchedTitles = [];
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
      if (rows[0]?.id === 155723) return new Map();
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


test("relation identity resolution derives provider installment titles", async () => {
  const metas = await canonicalizeCatalogPageWithBingeCat([{
    id: 212653,
    title: {
      english: null,
      romaji: "Kidou Keisatsu Patlabor EZY File 3",
      native: "機動警察パトレイバー EZY File 3",
    },
    synonyms: ["パトレイバー EZY File 3"],
    status: "NOT_YET_RELEASED",
    format: "OVA",
    isAdult: false,
    startDate: { year: 2027 },
    coverImage: { large: null },
    relations: {
      edges: [{
        relationType: "PREQUEL",
        node: {
          id: 212652,
          format: "OVA",
          title: {
            english: null,
            romaji: "Kidou Keisatsu Patlabor EZY File 2",
            native: "機動警察パトレイバー EZY File 2",
          },
          startDate: { year: 2026 },
          synonyms: [],
          externalLinks: [],
        },
      }],
    },
  }], {
    resolveMappings: async (ids) => ids.includes(212652)
      ? new Map([[212652, [{
        source: "imdb-search",
        anilistId: 212652,
        type: "TV",
        imdbIds: ["tt39382758"],
        tvdbId: null,
        tmdbTvId: null,
        tmdbMovieIds: [],
        title: "Patlabor EZY: File 2",
        year: 2026,
        season: null,
        episodeOffset: null,
      }]]])
      : new Map(),
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: emptyMap,
    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveBingeCatSearchMappings: async () => new Map(),
    resolveAnimeMapperMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async (rows) => {
      searchedTitles.push(rows[0]?.title?.english || null);
      if (rows[0]?.title?.english !== "Patlabor EZY: File 3") return new Map();
      return new Map([[212653, [{
        source: "imdb-search",
        anilistId: 212653,
        type: "TV",
        imdbIds: ["tt39382762"],
        tvdbId: null,
        tmdbTvId: null,
        tmdbMovieIds: [],
        title: "Patlabor EZY: File 3",
        year: 2027,
        season: null,
        episodeOffset: null,
      }]]]);
    },
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.ok(searchedTitles.includes("Patlabor EZY: File 3"), searchedTitles.join(" | "));
  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "tt39382762");
  assert.equal(metas[0].extra.anilistId, 212653);
});
