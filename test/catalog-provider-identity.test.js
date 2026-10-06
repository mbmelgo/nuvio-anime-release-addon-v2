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

test("catalog retries IMDb after relation protection invalidates an early provider mapping", async () => {
  const metas = await canonicalizeCatalogPage([{
    ...row(272, 272),
    title: { english: "Link Click Season 3", romaji: "Shiguang Dailiren III" },
    startDate: { year: 2026 },
    relations: {
      edges: [{
        relationType: "PREQUEL",
        node: {
          id: 271272,
          format: "TV",
          title: { english: "Link Click" },
          startDate: { year: 2021 },
          externalLinks: [{ site: "IMDb", url: "https://www.imdb.com/title/tt14976292/" }],
        },
      }],
    },
  }], {
    resolveMappings: async (ids) => ids.includes(272)
      ? new Map([[272, [{
        source: "arm",
        anilistId: 272,
        type: "TV",
        imdbIds: ["tt14976292"],
        tvdbId: null,
        tmdbTvId: null,
        tmdbMovieIds: [],
        title: "Link Click",
        year: 2021,
      }]]])
      : new Map(),
    resolveFribbMappings: empty,
    resolveExternalMappings: () => new Map(),
    resolveAniBridgeMappings: empty,
    resolveTMDBMappings: empty,
    resolveAnimapMappings: empty,
    resolveIdMapperMappings: empty,
    resolveAnimeMapperMappings: empty,
    resolveAnimeMapperRelatedProviderIds: empty,
    resolveTsvMappings: empty,
    resolveImdbMappings: async (rows) => new Map(rows.some((r) => Number(r.id) === 272) ? [[272, [{
      source: "imdb-search",
      anilistId: 272,
      type: "TV",
      imdbIds: ["tt14976292"],
      tvdbId: null,
      tmdbTvId: null,
      tmdbMovieIds: [],
      title: "Link Click Season 3",
      titles: ["Link Click"],
      derivedTitle: true,
      derivedInstallmentTitle: true,
      derivedSearchTitle: "Link Click",
      relation: false,
    }]]] : []),
    resolveSecondaryMappings: empty,
    resolveAlternativeMappings: empty,
  });

  assert.equal(metas[0].id, "tt14976292");
  assert.equal(metas[0].extra.identityProvider, "imdb");
  assert.ok(metas[0].extra.identityEvidence.some((entry) => entry.source === "imdb-search"));
});
