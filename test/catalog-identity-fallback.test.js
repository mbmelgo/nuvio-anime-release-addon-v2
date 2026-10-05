import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeCatalogPage } from "../api/catalog-source.js";

const empty = async () => new Map();

test("catalog preserves an independent provider identity when later sources are unavailable", async () => {
  const metas = await canonicalizeCatalogPage([{
    id: 195604,
    idMal: 61967,
    title: { english: "Black Clover Season 2", romaji: "Black Clover 2nd Season", native: "ブラッククローバー 第2期" },
    format: "TV",
    startDate: { year: 2026 },
    isAdult: false,
  }], {
    resolveMappings: async () => new Map([[195604, [{
      source: "anime-mapper",
      anilistId: 195604,
      type: "TV",
      imdbIds: ["tt22868844"],
      tvdbId: null,
      tmdbTvId: null,
      tmdbMovieIds: [],
      title: "Black Clover Season 2",
      year: 2026,
    }]]]),
    resolveFribbMappings: empty,
    resolveExternalMappings: () => new Map(),
    resolveAniBridgeMappings: empty,
    resolveTMDBMappings: empty,
    resolveAnimapMappings: empty,
    resolveIdMapperMappings: empty,
    resolveTsvMappings: empty,
    resolveImdbMappings: empty,
    resolveSecondaryMappings: empty,
    resolveAlternativeMappings: empty,
  });

  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "tt22868844");
  assert.equal(metas[0].extra.identityProvider, "imdb");
});

test("later mapping sources supplement unsupported earlier records", async () => {
  const metas = await canonicalizeCatalogPage([{
    id: 123,
    title: { english: "Example Anime", romaji: "Example Anime", native: "例" },
    format: "TV",
    startDate: { year: 2026 },
    isAdult: false,
  }], {
    resolveMappings: async () => new Map([[123, [{
      source: "arm",
      anilistId: 123,
      type: "TV",
      imdbIds: [],
      tvdbId: 123,
      tmdbTvId: null,
      tmdbMovieIds: [],
      malId: 456,
      title: "Wrong Parent",
      year: 2019,
    }]]]),
    resolveFribbMappings: empty,
    resolveExternalMappings: () => new Map(),
    resolveAniBridgeMappings: empty,
    resolveTMDBMappings: empty,
    resolveAnimapMappings: empty,
    resolveAnimeMapperMappings: async () => new Map([[123, [{
      source: "anime-mapper",
      anilistId: 123,
      type: "TV",
      imdbIds: ["tt1234567"],
      tvdbId: null,
      tmdbTvId: null,
      tmdbMovieIds: [],
      title: "Example Anime",
      year: 2026,
      corroborated: true,
    }]]]),
    resolveIdMapperMappings: empty,
    resolveAnimeMapperMappings: empty,
    resolveTsvMappings: empty,
    resolveImdbMappings: empty,
    resolveSecondaryMappings: empty,
    resolveAlternativeMappings: empty,
  });

  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "tt1234567");
  assert.equal(metas[0].extra.identityProvider, "imdb");
});
