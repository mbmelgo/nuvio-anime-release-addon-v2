import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeCatalogPage } from "../api/catalog-source.js";

const empty = async () => new Map();

function row(id = 269, malId = 269) {
  return {
    id,
    idMal: malId,
    title: { english: "Bleach", romaji: "Bleach" },
    format: "TV",
    startDate: { year: 2004 },
  };
}

test("catalog uses TMDB as the primary resolver", async () => {
  const metas = await canonicalizeCatalogPage([row()], {
    resolveMappings: empty,
    resolveFribbMappings: empty,
    resolveExternalMappings: () => new Map(),
    resolveAniBridgeMappings: empty,
    resolveTMDBMappings: async () => new Map([[269, [{
      source: "tmdb-search",
      anilistId: 269,
      type: "TV",
      imdbIds: ["tt0434665"],
      tvdbId: 30984,
      tmdbTvId: 30984,
      tmdbMovieIds: [],
      title: "Bleach",
      titles: ["Bleach"],
      year: 2004,
      tmdbAuthoritative: true,
      tmdbMatchScore: 130,
    }]]]),
    resolveAnimapMappings: empty,
    resolveIdMapperMappings: empty,
    resolveAnimeMapperMappings: empty,
    resolveTsvMappings: empty,
    resolveImdbMappings: empty,
    resolveSecondaryMappings: empty,
    resolveAlternativeMappings: empty,
  });
  assert.equal(metas[0].id, "tt0434665");
  assert.equal(metas[0].extra.tmdbProvider, "imdb");
});

test("catalog falls back to an independent provider mapping when TMDB has no match", async () => {
  const metas = await canonicalizeCatalogPage([row(270, 270)], {
    resolveMappings: async () => new Map([[270, [{
      source: "arm",
      anilistId: 270,
      type: "TV",
      imdbIds: ["tt0000270"],
      tvdbId: null,
      tmdbTvId: null,
      tmdbMovieIds: [],
      title: "Bleach",
      year: 2004,
    }]]]),
    resolveTMDBMappings: empty,
    resolveFribbMappings: empty,
    resolveExternalMappings: () => new Map(),
    resolveAniBridgeMappings: empty,
    resolveAnimapMappings: empty,
    resolveIdMapperMappings: empty,
    resolveAnimeMapperMappings: empty,
    resolveTsvMappings: empty,
    resolveImdbMappings: empty,
    resolveSecondaryMappings: empty,
    resolveAlternativeMappings: empty,
  });
  assert.equal(metas[0].id, "tt0000270");
  assert.equal(metas[0].extra.identityProvider, "imdb");
});

test("catalog preserves MAL identity when no provider mapping is available", async () => {
  const metas = await canonicalizeCatalogPage([row(271, 271)], {
    resolveMappings: empty,
    resolveTMDBMappings: empty,
    resolveFribbMappings: empty,
    resolveExternalMappings: () => new Map(),
    resolveAniBridgeMappings: empty,
    resolveAnimapMappings: empty,
    resolveIdMapperMappings: empty,
    resolveAnimeMapperMappings: empty,
    resolveTsvMappings: empty,
    resolveImdbMappings: empty,
    resolveSecondaryMappings: empty,
    resolveAlternativeMappings: empty,
  });
  assert.equal(metas[0].id, "mal:271");
  assert.equal(metas[0].extra.identityEvidence, "canonical-mal-id-fallback");
});
