
test("catalog validates a known TMDB IMDb identity without title-searching it", async () => {
  let imdbCalls = 0;
  let validationCalls = 0;

  const result = await canonicalizeCatalogPage([{
    id: 200455,
    idMal: 62753,
    format: "TV",
    title: {
      english: "Example Series",
      romaji: "Example Series",
      native: "Example Series",
    },
    synonyms: [],
    startDate: { year: 2026 },
    relations: { edges: [] },
    status: "RELEASING",
    coverImage: { large: null },
    genres: [],
  }], {
    resolveMappings: async () => new Map(),
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveTMDBMappings: async () => new Map([[200455, [{
      source: "tmdb-search",
      anilistId: 200455,
      type: "TV",
      imdbIds: ["tt12345678"],
      tvdbId: null,
      tmdbTvId: 200455,
      tmdbMovieIds: [],
      title: "Example Series",
      titles: ["Example Series"],
      year: 2026,
      tmdbAuthoritative: true,
      tmdbMatchScore: 130,
    }]]]),
    validateImdbMappings: async (rows, identities) => {
      validationCalls += 1;
      assert.equal(rows.length, 1);
      assert.equal(identities.get(200455), "tt12345678");
      return new Map([[200455, [{
        source: "imdb-search",
        anilistId: 200455,
        type: "TV",
        imdbIds: ["tt12345678"],
        tvdbId: null,
        tmdbTvId: null,
        tmdbMovieIds: [],
        title: "Example Series",
        titles: ["Example Series"],
        year: 2026,
      }]]]);
    },
    resolveAnimeMapperMappings: async () => new Map(),
    resolveAnimeMapperRelatedProviderIds: async () => new Map(),
    resolveCanonicalSeriesMappings: async () => new Map(),
    resolveAniBridgeMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async () => {
      imdbCalls += 1;
      return new Map();
    },
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(result[0].id, "tt12345678");
  assert.equal(validationCalls, 1);
  assert.equal(imdbCalls, 0);
});

import test from "node:test";
import assert from "node:assert/strict";
import { canonicalizeCatalogPage } from "../api/catalog-source.js";

test("catalog does not re-verify an IMDb identity already selected by TMDB", async () => {
  let imdbCalls = 0;

  const row = {
    id: 200455,
    idMal: 62753,
    format: "TV",
    title: {
      english: "Even Though I'm a Super Timid Noble Girl, I Accepted the Bet From My Cunning Fiancé",
      romaji: "Yowaki MAX Reijou Nano ni, Ratsuwan Konyakusha-sama no Kake ni Notte Shimatta",
      native: "弱気MAX令嬢なのに、辣腕婚約者様の賭けに乗ってしまった",
    },
    synonyms: [],
    startDate: { year: 2026 },
    relations: { edges: [] },
    status: "RELEASING",
    coverImage: { large: "https://example.test/poster.jpg" },
    genres: ["Comedy", "Fantasy", "Romance"],
  };

  const result = await canonicalizeCatalogPage([row], {
    resolveMappings: async () => new Map(),
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveTMDBMappings: async () => new Map([[200455, [{
      source: "tmdb-search",
      anilistId: 200455,
      type: "TV",
      imdbIds: ["tt43691418"],
      tvdbId: null,
      tmdbTvId: 200455,
      tmdbMovieIds: [],
      title: "Even Though I'm a Super Timid Noble Girl, I Accepted the Bet From My Cunning Fiancé",
      titles: ["Even Though I'm a Super Timid Noble Girl, I Accepted the Bet From My Cunning Fiancé"],
      year: 2026,
    }]]]),
    resolveAnimeMapperMappings: async () => new Map(),
    resolveAnimeMapperRelatedProviderIds: async () => new Map(),
    resolveCanonicalSeriesMappings: async () => new Map(),
    resolveAniBridgeMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async () => {
      imdbCalls += 1;
      return new Map();
    },
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(result[0].id, "tt43691418");
  assert.equal(imdbCalls, 0);
});
