import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeCatalogPageWithBingeCat } from "../api/catalog-source.js";

const emptyMappings = async () => new Map();

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
