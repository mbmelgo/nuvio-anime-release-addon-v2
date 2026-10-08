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
