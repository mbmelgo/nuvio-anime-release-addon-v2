import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeCatalogPage, isSelectedIdentityProtected } from "../api/catalog-source.js";

const empty = async () => new Map();

const validateKnownImdb = async (rows, identities) => new Map(
  [...identities.entries()].map(([id, imdbId]) => [id, [{
    source: "imdb-search",
    anilistId: id,
    type: "TV",
    imdbIds: [imdbId],
    tvdbId: null,
    tmdbTvId: null,
    tmdbMovieIds: [],
    title: rows.find((row) => Number(row.id) === id)?.title?.english || null,
    titles: [rows.find((row) => Number(row.id) === id)?.title?.english].filter(Boolean),
    year: rows.find((row) => Number(row.id) === id)?.startDate?.year || null,
  }]]),
);


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
    validateImdbMappings: validateKnownImdb,
    resolveAnimapMappings: empty,
    resolveIdMapperMappings: empty,
    resolveAnimeMapperMappings: empty,
    resolveTsvMappings: empty,
    resolveImdbMappings: empty,
    resolveSecondaryMappings: empty,
    resolveAlternativeMappings: empty,
  });
  assert.equal(metas[0].id, "tmdb:30984");
  assert.equal(metas[0].extra.tmdbProvider, "tmdb");
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

test("aggregated current-title evidence overrides a related-provider collision", async () => {
  const { getProviderCandidates, selectProviderIdentity } = await import("../lib/provider-identity.js");
  const media = {
    anilistId: 272,
    format: "TV",
    startDate: { year: 2026 },
    title: { english: "Link Click Season 3", romaji: "Shiguang Dailiren III" },
    synonyms: [],
    relatedProviderIds: ["imdb:tt14976292"],
    relations: { edges: [] },
  };
  const records = [
    { source: "arm", anilistId: 272, type: "TV", imdbIds: ["tt14976292"], title: "Link Click" },
    { source: "imdb-search", anilistId: 272, type: "TV", imdbIds: ["tt14976292"], title: "Link Click Season 3", titles: ["Link Click"], derivedTitle: true, derivedInstallmentTitle: true, derivedSearchTitle: "Link Click" },
  ];
  const candidate = getProviderCandidates(media, records)[0];
  console.log(JSON.stringify({ candidate, selected: selectProviderIdentity(media, [candidate]) }));
  assert.equal(selectProviderIdentity(media, [candidate])?.id, "tt14976292");
});

test("catalog rejects a TMDB IMDb external ID when its title does not match the AniList title", async () => {
  const metas = await canonicalizeCatalogPage([{
    ...row(206814, 63367),
    title: { english: "Dragon Ball Super: Beerus", romaji: "Dragon Ball Super: Beerus" },
    startDate: { year: 2026 },
  }], {
    resolveMappings: empty,
    resolveFribbMappings: empty,
    resolveExternalMappings: () => new Map(),
    resolveAniBridgeMappings: empty,
    resolveTMDBMappings: async () => new Map([[206814, [{
      source: "tmdb-search",
      anilistId: 206814,
      type: "TV",
      imdbIds: ["tt8433216"],
      tvdbId: 347734,
      tmdbTvId: 80020,
      tmdbMovieIds: [],
      title: "Super Dragon Ball Heroes",
      titles: ["Super Dragon Ball Heroes"],
      year: 2018,
      tmdbAuthoritative: true,
      tmdbMatchScore: 130,
    }]]]),
    validateImdbMappings: validateKnownImdb,
    resolveAnimapMappings: empty,
    resolveIdMapperMappings: empty,
    resolveAnimeMapperMappings: empty,
    resolveTsvMappings: empty,
    resolveImdbMappings: empty,
    resolveSecondaryMappings: empty,
    resolveAlternativeMappings: empty,
  });
  assert.equal(metas[0].id, "mal:63367");
});

test("catalog verifies IMDb after a TMDB-only match before accepting TMDB identity", async () => {
  const metas = await canonicalizeCatalogPage([{
    ...row(217787, 64211),
    title: { english: "Pop Pap Polters", romaji: "Pop Pap Polters" },
    startDate: { year: 2026 },
  }], {
    resolveMappings: empty,
    resolveFribbMappings: empty,
    resolveExternalMappings: () => new Map(),
    resolveAniBridgeMappings: empty,
    resolveTMDBMappings: async () => new Map([[217787, [{
      source: "tmdb-search",
      anilistId: 217787,
      type: "TV",
      imdbIds: [],
      tvdbId: null,
      tmdbTvId: 315682,
      tmdbMovieIds: [],
      title: "Pop Pap Polters",
      titles: ["Pop Pap Polters"],
      year: 2026,
      tmdbAuthoritative: true,
      tmdbMatchScore: 130,
    }]]]),
    resolveAnimapMappings: empty,
    resolveIdMapperMappings: empty,
    resolveAnimeMapperMappings: empty,
    resolveTsvMappings: empty,
    resolveImdbMappings: async (rows) => rows.some((candidate) => Number(candidate.id) === 217787)
      ? new Map([[217787, [{
        source: "imdb-search",
        anilistId: 217787,
        type: "TV",
        imdbIds: ["tt44923712"],
        tvdbId: null,
        tmdbTvId: null,
        tmdbMovieIds: [],
        title: "Pop Pap Polters",
        titles: ["Pop Pap Polters"],
        year: 2026,
        relation: false,
      }]]])
      : new Map(),
    resolveSecondaryMappings: empty,
    resolveAlternativeMappings: empty,
  });

  assert.equal(metas[0].id, "tmdb:315682");
});


test("catalog prefers strong direct IMDb identity over a TMDB-derived IMDb identity", async () => {
  const metas = await canonicalizeCatalogPage([{
    ...row(185874, 60636),
    title: {
      english: "BLEACH: Thousand-Year Blood War - The Calamity",
      romaji: "BLEACH: Sennen Kessen-hen - Kashin-tan",
      native: "BLEACH 千年血戦篇-禍進譚-",
    },
    startDate: { year: 2026 },
  }], {
    resolveMappings: empty,
    resolveFribbMappings: empty,
    resolveExternalMappings: () => new Map(),
    resolveAniBridgeMappings: empty,
    resolveTMDBMappings: async () => new Map([[185874, [{
      source: "tmdb-search",
      anilistId: 185874,
      type: "TV",
      imdbIds: ["tt43383343"],
      tvdbId: null,
      tmdbTvId: 185874,
      tmdbMovieIds: [],
      title: "BLEACH: Thousand-Year Blood War - The Calamity",
      titles: ["BLEACH: Thousand-Year Blood War - The Calamity"],
      year: 2026,
      tmdbAuthoritative: true,
      tmdbMatchScore: 130,
    }]]]),
    validateImdbMappings: validateKnownImdb,
    resolveAnimapMappings: empty,
    resolveIdMapperMappings: empty,
    resolveAnimeMapperMappings: empty,
    resolveTsvMappings: empty,
    resolveImdbMappings: async () => new Map([[185874, [{
      source: "anime-mapper",
      anilistId: 185874,
      type: "TV",
      imdbIds: ["tt14986406"],
      tvdbId: null,
      tmdbTvId: null,
      tmdbMovieIds: [],
      title: "Bleach: Thousand-Year Blood War",
      titles: ["Bleach: Thousand-Year Blood War"],
      derivedTitle: true,
      derivedSearchTitle: "BLEACH: Thousand-Year Blood War",
      relation: false,
      evidence: [{ source: "anime-mapper", relation: false }],
    }]]]),
    resolveSecondaryMappings: empty,
    resolveAlternativeMappings: empty,
  });

  assert.equal(metas[0].id, "tt14986406");
  assert.equal(metas[0].extra.identityProvider, "imdb");
});


test("relation retry runs when the TVDB-preferred identity is protected despite a valid IMDb fallback", () => {
  const media = { anilistId: 9001, format: "TV", title: { english: "Example Season 2", romaji: "Example Season 2" }, startDate: { year: 2026 }, relations: { edges: [] } };
  const candidates = [
    { provider: "imdb", id: "tt9001", stremioId: "tt9001", evidence: [{ source: "imdb-search" }], title: "Example Season 2" },
    { provider: "tvdb", id: "9001", stremioId: "tvdb:9001", evidence: [{ source: "arm" }], title: "Example Season 2", relatedProviderIds: ["tvdb:9001"] },
  ];
  assert.equal(isSelectedIdentityProtected(media, candidates), true);
});

test("relation retry still runs when the selected identity is protected", () => {
  const media = { anilistId: 9002, format: "TV", title: { english: "Example Season 3", romaji: "Example Season 3" }, startDate: { year: 2026 }, relations: { edges: [] } };
  const candidates = [
    { provider: "imdb", id: "tt9002", stremioId: "tt9002", evidence: [{ source: "imdb-search" }], title: "Example Season 3", relatedProviderIds: ["imdb:tt9002"] },
  ];
  assert.equal(isSelectedIdentityProtected(media, candidates), true);
});

test("relation retry remains enabled when no identity was valid before protection", () => {
  const media = {
    anilistId: 9003,
    format: "TV",
    title: { english: "Example Season 3", romaji: "Example Season 3" },
    startDate: { year: 2026 },
    relations: { edges: [] },
  };
  const candidates = [
    {
      provider: "imdb",
      id: "tt9003",
      stremioId: "tt9003",
      evidence: [{ source: "arm" }],
      title: "Example Parent",
    },
  ];
  assert.equal(isSelectedIdentityProtected(media, candidates), true);
});

test("relation retry is skipped when the protected IMDb candidate loses to valid TVDB", () => {
  const media = {
    anilistId: 9004,
    format: "TV",
    title: { english: "Example Season 4", romaji: "Example Season 4" },
    startDate: { year: 2026 },
    relations: { edges: [] },
  };
  const candidates = [
    {
      provider: "imdb",
      id: "tt9004",
      stremioId: "tt9004",
      evidence: [{ source: "imdb-search" }],
      title: "Example Season 4",
      relatedProviderIds: ["imdb:tt9004"],
    },
    {
      provider: "tvdb",
      id: "9004",
      stremioId: "tvdb:9004",
      evidence: [{ source: "arm" }],
      title: "Example Season 4",
    },
  ];
  assert.equal(isSelectedIdentityProtected(media, candidates), false);
});


test("catalog uses native TMDB route when IMDb is only supplied by the TMDB mapping", async () => {
  const metas = await canonicalizeCatalogPage([row(272, 272)], {
    resolveMappings: empty,
    resolveTMDBMappings: async () => new Map([[272, [{
      source: "tmdb-search",
      anilistId: 272,
      type: "TV",
      imdbIds: ["tt0000272"],
      tvdbId: null,
      tmdbTvId: 30985,
      tmdbMovieIds: [],
      title: "Bleach",
      titles: ["Bleach"],
      year: 2004,
      tmdbAuthoritative: true,
      tmdbMatchScore: 130,
    }]]]),
    resolveFribbMappings: empty,
    resolveExternalMappings: () => new Map(),
    resolveAniBridgeMappings: empty,
    resolveAnimapMappings: empty,
    resolveIdMapperMappings: empty,
    resolveAnimeMapperMappings: empty,
    resolveTsvMappings: empty,
    resolveImdbMappings: empty,
    validateImdbMappings: empty,
    resolveSecondaryMappings: empty,
    resolveAlternativeMappings: empty,
  });
  assert.equal(metas[0].id, "tmdb:30985");
});


test("catalog prefers native TMDB route for Mofusand when IMDb is only TMDB/search-derived", async () => {
  const metas = await canonicalizeCatalogPage([{
    ...row(204656, 63151),
    title: { english: "mofusand", romaji: "mofusand", native: "mofusand" },
    startDate: { year: 2025 },
    format: "TV",
  }], {
    resolveMappings: empty,
    resolveFribbMappings: empty,
    resolveExternalMappings: () => new Map(),
    resolveAniBridgeMappings: empty,
    resolveTMDBMappings: async () => new Map([[204656, [{
      source: "tmdb-search",
      anilistId: 204656,
      type: "TV",
      imdbIds: ["tt43851457"],
      tvdbId: 472627,
      tmdbTvId: 308934,
      tmdbMovieIds: [],
      title: "mofusand animation",
      titles: ["mofusand animation"],
      year: 2025,
      tmdbAuthoritative: true,
      tmdbMatchScore: 130,
    }]]]),
    validateImdbMappings: async () => new Map(),
    resolveAnimapMappings: empty,
    resolveIdMapperMappings: empty,
    resolveAnimeMapperMappings: empty,
    resolveTsvMappings: empty,
    resolveImdbMappings: async () => new Map([[204656, [{
      source: "imdb-search",
      anilistId: 204656,
      type: "TV",
      imdbIds: ["tt43851457"],
      tvdbId: null,
      tmdbTvId: null,
      tmdbMovieIds: [],
      title: "mofusand",
      titles: ["mofusand"],
      year: 2025,
    }]]]),
    resolveSecondaryMappings: empty,
    resolveAlternativeMappings: empty,
  });

  assert.equal(metas[0].id, "tmdb:308934");
  assert.equal(metas[0].extra.tmdbProvider, "tmdb");
  assert.equal(metas[0].extra.tmdbId, "308934");
});
