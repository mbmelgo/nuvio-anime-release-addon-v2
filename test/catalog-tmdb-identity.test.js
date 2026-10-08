import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeCatalogPage } from "../api/catalog-source.js";

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


test("catalog prefers TMDB resolver identity", async () => {
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
    validateImdbMappings: async (rows, identities) => new Map(
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
    ),
    resolveMappings: empty,
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

  assert.equal(metas[0].id, "tt0434665");  assert.equal(metas[0].extra.tmdbProvider, "imdb");
  assert.equal(metas[0].extra.tmdbId, "tt0434665");
  assert.equal(metas[0].extra.tmdbEvidence, "tmdb-search");});

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
    validateImdbMappings: async (rows, identities) => new Map(
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
    ),
    resolveMappings: empty,
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



test("catalog lets TMDB upgrade non-IMDb mappings", async () => {
  let tmdbCalls = 0;
  
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
    validateImdbMappings: async (rows, identities) => new Map(
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
    ),
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
  assert.equal(tmdbCalls, 1);});

test("catalog lets TMDB upgrade an earlier TVDB mapping to IMDb", async () => {
  let tmdbCalls = 0;
  
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
    validateImdbMappings: async (rows, identities) => new Map(
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
    ),
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
});


test("catalog retries TMDB when an earlier IMDb mapping is invalid", async () => {
  let tmdbCalls = 0;

  const metas = await canonicalizeCatalogPage([{
    id: 12345,
    idMal: 12345,
    title: { english: "Correct Anime", romaji: "Correct Anime" },
    format: "TV",
    startDate: { year: 2026 },
  }], {
    resolveMappings: async () => new Map([[12345, [{
      source: "arm",
      anilistId: 12345,
      type: "TV",
      imdbIds: ["tt9999999"],
      tvdbId: null,
      tmdbTvId: null,
      tmdbMovieIds: [],
      title: "Wrong Anime",
      titles: ["Wrong Anime"],
      year: 2026,
    }]]]),
    resolveFribbMappings: empty,
    resolveExternalMappings: () => new Map(),
    resolveAniBridgeMappings: empty,
    resolveTMDBMappings: async () => {
      tmdbCalls += 1;
      return new Map([[12345, [{
        source: "tmdb-search",
        anilistId: 12345,
        type: "TV",
        imdbIds: ["tt1234567"],
        tmdbTvId: 765432,
        tmdbMovieIds: [],
        title: "Correct Anime",
        titles: ["Correct Anime"],
        year: 2026,
        tmdbAuthoritative: true,
        tmdbMatchScore: 130,
      }]]]);
    validateImdbMappings: async (rows, identities) => new Map(
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
    ),
    },
    resolveAnimapMappings: empty,
    resolveIdMapperMappings: empty,
    resolveAnimeMapperMappings: empty,
    resolveTsvMappings: empty,
    resolveImdbMappings: empty,
    resolveSecondaryMappings: empty,
    resolveAlternativeMappings: empty,
  });

  assert.equal(metas[0].id, "tt1234567");
  assert.equal(metas[0].extra.tmdbProvider, "imdb");
  assert.equal(metas[0].extra.tmdbId, "tt1234567");
  assert.equal(tmdbCalls, 1);
});

test("catalog skips TMDB when an earlier IMDb mapping is already valid", async () => {
  let tmdbCalls = 0;

  const metas = await canonicalizeCatalogPage([{
    id: 12346,
    idMal: 12346,
    title: { english: "Correct Anime", romaji: "Correct Anime" },
    format: "TV",
    startDate: { year: 2026 },
  }], {
    resolveMappings: async () => new Map([[12346, [{
      source: "arm",
      anilistId: 12346,
      type: "TV",
      imdbIds: ["tt1234567"],
      tvdbId: null,
      tmdbTvId: null,
      tmdbMovieIds: [],
      title: "Correct Anime",
      titles: ["Correct Anime"],
      year: 2026,
    }]]]),
    resolveFribbMappings: empty,
    resolveExternalMappings: () => new Map(),
    resolveAniBridgeMappings: empty,
    resolveTMDBMappings: async () => {
      tmdbCalls += 1;
      return new Map();
    },
    resolveAnimapMappings: empty,
    resolveIdMapperMappings: empty,
    resolveAnimeMapperMappings: empty,
    resolveTsvMappings: empty,
    resolveImdbMappings: empty,
    resolveSecondaryMappings: empty,
    resolveAlternativeMappings: empty,
  });

  assert.equal(metas[0].id, "tt1234567");
  assert.equal(metas[0].extra.identityProvider, "imdb");
  assert.equal(tmdbCalls, 0);
});
