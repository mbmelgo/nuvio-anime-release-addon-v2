import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeCatalogPage } from "../api/catalog-source.js";

const empty = async () => new Map();

test("catalog prefers TMDB resolver identity and does not invoke BingeCat for a strong TMDB match", async () => {
  let bingeCatCalls = 0;
  const metas = await canonicalizeCatalogPage([{
    id: 269,
    idMal: 269,
    title: { english: "Bleach", romaji: "Bleach" },
    format: "TV",
    startDate: { year: 2004 },
  }], {
    resolveTMDBMappings: async () => new Map([[269, [{
      source: "tmdb-search",
      anilistId: 269,
      type: "TV",
      imdbIds: ["tt0434665"],
      tmdbTvId: 30984,
      tmdbMovieIds: [],
      title: "Bleach",
      titles: ["Bleach"],
      year: 2004,
      tmdbAuthoritative: true,
      tmdbMatchScore: 130,
    }]]]),
    resolveMappings: empty,
    resolveBingeCatSearchMappings: async () => {
      bingeCatCalls += 1;
      return new Map();
    },
    resolveFribbMappings: empty,
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: empty,
    resolveIdMapperMappings: empty,
    resolveAnimeMapperMappings: empty,
    resolveTsvMappings: empty,
    resolveImdbMappings: empty,
    resolveSecondaryMappings: empty,
    resolveAlternativeMappings: empty,
    resolveAniBridgeMappings: empty,
  });

  assert.equal(metas[0].id, "tt0434665");
  assert.equal(metas[0].extra.bingecatProvider, null);
  assert.equal(metas[0].extra.tmdbProvider, "imdb");
  assert.equal(metas[0].extra.tmdbId, "tt0434665");
  assert.equal(metas[0].extra.tmdbEvidence, "tmdb-search");
  assert.equal(bingeCatCalls, 0);
});

test("catalog returns TMDB ID when TMDB match has no IMDb identity", async () => {
  const metas = await canonicalizeCatalogPage([{
    id: 10001,
    title: { english: "Example Movie" },
    format: "MOVIE",
    startDate: { year: 2026 },
  }], {
    resolveTMDBMappings: async () => new Map([[10001, [{
      source: "tmdb-search",
      anilistId: 10001,
      type: "MOVIE",
      imdbIds: [],
      tmdbTvId: null,
      tmdbMovieIds: [991234],
      title: "Example Movie",
      titles: ["Example Movie"],
      year: 2026,
      tmdbAuthoritative: true,
      tmdbMatchScore: 130,
    }]]]),
    resolveMappings: empty,
    resolveBingeCatSearchMappings: async () => new Map(),
    resolveFribbMappings: empty,
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: empty,
    resolveIdMapperMappings: empty,
    resolveAnimeMapperMappings: empty,
    resolveTsvMappings: empty,
    resolveImdbMappings: empty,
    resolveSecondaryMappings: empty,
    resolveAlternativeMappings: empty,
  });

  assert.equal(metas[0].id, "tmdb:991234");
  assert.equal(metas[0].extra.tmdbProvider, "tmdb");
  assert.equal(metas[0].extra.tmdbId, "991234");
  assert.equal(metas[0].extra.tmdbEvidence, "tmdb-search");
});



test("catalog lets TMDB upgrade non-IMDb mappings when BingeCat is unavailable", async () => {
  let tmdbCalls = 0;
  let bingeCatCalls = 0;

  const metas = await canonicalizeCatalogPage([{
    id: 269,
    idMal: 269,
    title: { english: "Bleach", romaji: "Bleach" },
    format: "TV",
    startDate: { year: 2004 },
  }, {
    id: 270,
    idMal: 270,
    title: { english: "Probe Trigger", romaji: "Probe Trigger" },
    format: "TV",
    startDate: { year: 2026 },
  }], {
    probeBingeCat: true,
    resolveMappings: async () => new Map([[269, [{
      source: "arm",
      anilistId: 269,
      type: "TV",
      tvdbId: 30984,
      imdbIds: [],
      title: "Bleach",
      titles: ["Bleach"],
      year: 2004,
    }]]]),
    resolveBingeCatSearchMappings: async (rows, options = {}) => {
      bingeCatCalls += 1;
      assert.deepEqual(rows.map((row) => row.id), [270]);
      options.onCircuitOpen?.();
      return new Map();
    },
    resolveFribbMappings: empty,
    resolveExternalMappings: () => new Map(),
    resolveAniBridgeMappings: empty,
    resolveTMDBMappings: async (rows) => {
      tmdbCalls += 1;
      assert.deepEqual(rows.map((row) => row.id), [269, 270]);
      return new Map([[269, [{
        source: "tmdb-search",
        anilistId: 269,
        type: "TV",
        imdbIds: ["tt0434665"],
        tmdbTvId: 30984,
        tmdbMovieIds: [],
        title: "Bleach",
        titles: ["Bleach"],
        year: 2004,
        tmdbAuthoritative: true,
        tmdbMatchScore: 130,
      }]]]);
    },
    resolveAnimapMappings: empty,
    resolveIdMapperMappings: empty,
    resolveAnimeMapperMappings: empty,
    resolveTsvMappings: empty,
    resolveImdbMappings: empty,
    resolveSecondaryMappings: empty,
    resolveAlternativeMappings: empty,
  });

  assert.equal(metas.length, 2);
  assert.equal(metas[0].id, "tt0434665");
  assert.equal(metas[0].extra.tmdbProvider, "imdb");
  assert.equal(metas[0].extra.tmdbEvidence, "tmdb-search");
  assert.equal(tmdbCalls, 1);
  assert.equal(bingeCatCalls, 1);
});

test("catalog lets TMDB upgrade an earlier TVDB mapping to IMDb", async () => {
  let tmdbCalls = 0;
  let bingeCatCalls = 0;

  const metas = await canonicalizeCatalogPage([{
    id: 269,
    idMal: 269,
    title: { english: "Bleach", romaji: "Bleach" },
    format: "TV",
    startDate: { year: 2004 },
  }], {
    resolveMappings: async () => new Map([[269, [{
      source: "arm",
      anilistId: 269,
      type: "TV",
      tvdbId: 30984,
      imdbIds: [],
      title: "Bleach",
      titles: ["Bleach"],
      year: 2004,
    }]]]),
    resolveTMDBMappings: async () => {
      tmdbCalls += 1;
      return new Map([[269, [{
        source: "tmdb-search",
        anilistId: 269,
        type: "TV",
        imdbIds: ["tt0434665"],
        tmdbTvId: 30984,
        tmdbMovieIds: [],
        title: "Bleach",
        titles: ["Bleach"],
        year: 2004,
        tmdbAuthoritative: true,
        tmdbMatchScore: 130,
      }]]]);
    },
    resolveBingeCatSearchMappings: async () => {
      bingeCatCalls += 1;
      return new Map();
    },
    resolveFribbMappings: empty,
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: empty,
    resolveIdMapperMappings: empty,
    resolveAnimeMapperMappings: empty,
    resolveTsvMappings: empty,
    resolveImdbMappings: empty,
    resolveSecondaryMappings: empty,
    resolveAlternativeMappings: empty,
    resolveAniBridgeMappings: empty,
  });

  assert.equal(metas[0].id, "tt0434665");
  assert.equal(metas[0].extra.tmdbProvider, "imdb");
  assert.equal(tmdbCalls, 1);
  assert.equal(bingeCatCalls, 0);
});
