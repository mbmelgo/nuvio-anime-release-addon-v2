import test from "node:test";
import assert from "node:assert/strict";
import { canonicalizeCatalogPage } from "../api/catalog-source.js";

test("identity recovery continues when an earlier recovery source fails", async () => {
  let armCalls = 0;
  let fribbCalls = 0;

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

  const imdbRecord = {
    source: "imdb-search",
    anilistId: 200455,
    type: "TV",
    imdbIds: ["tt43691418"],
    title: row.title.english,
    titles: [row.title.english],
    year: 2026,
  };

  const result = await canonicalizeCatalogPage([row], {
    resolveMappings: async () => {
      armCalls += 1;
      if (armCalls === 2) throw new Error("transient recovery failure");
      return new Map();
    },
    resolveFribbMappings: async () => {
      fribbCalls += 1;
      return fribbCalls === 2 ? new Map([[200455, [imdbRecord]]]) : new Map();
    },
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveTMDBMappings: async () => new Map(),
    resolveAnimeMapperMappings: async () => new Map(),
    resolveAnimeMapperRelatedProviderIds: async () => new Map(),
    resolveCanonicalSeriesMappings: async () => new Map(),
    resolveAniBridgeMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(result[0].id, "tt43691418");
  assert.equal(armCalls, 2);
  assert.equal(fribbCalls, 2);
});

test("IDMapper and Anime Mapper run concurrently while preserving Anime Mapper precedence", async () => {
  let idMapperActive = false;
  let animeMapperActive = false;
  let overlapped = false;

  const row = {
    id: 200455,
    idMal: 62753,
    format: "TV",
    title: { english: "Concurrent Provider Test", romaji: "Concurrent Provider Test", native: null },
    synonyms: [],
    startDate: { year: 2026 },
    relations: { edges: [] },
    status: "RELEASING",
    coverImage: { large: null },
    genres: [],
  };

  const animeMapperRecord = {
    source: "anime-mapper",
    anilistId: 200455,
    type: "TV",
    malId: 62753,
    imdbIds: ["tt11111111"],
    title: row.title.english,
    titles: [row.title.english],
    year: 2026,
  };

  const idMapperRecord = {
    source: "idmapper",
    anilistId: 200455,
    type: "TV",
    malId: 62753,
    imdbIds: ["tt22222222"],
    title: row.title.english,
    titles: [row.title.english],
    year: 2026,
  };

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const result = await canonicalizeCatalogPage([row], {
    resolveMappings: async () => new Map(),
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: async () => new Map(),
    resolveTMDBMappings: async () => new Map(),
    resolveAnimeMapperMappings: async () => {
      animeMapperActive = true;
      if (idMapperActive) overlapped = true;
      await wait(20);
      animeMapperActive = false;
      return new Map([[200455, [animeMapperRecord]]]);
    },
    resolveIdMapperMappings: async () => {
      idMapperActive = true;
      if (animeMapperActive) overlapped = true;
      await wait(20);
      idMapperActive = false;
      return new Map([[200455, [idMapperRecord]]]);
    },
    resolveAnimeMapperRelatedProviderIds: async () => new Map(),
    resolveCanonicalSeriesMappings: async () => new Map(),
    resolveAniBridgeMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(result[0].id, "tt11111111");
  assert.equal(overlapped, true);
});

test("related protection runs ARM and Anime Mapper lookups concurrently", async () => {
  let armActive = false;
  let animeMapperActive = false;
  let overlapped = false;

  const row = {
    id: 200455,
    idMal: 62753,
    format: "TV",
    title: { english: "Related Protection Test", romaji: "Related Protection Test", native: null },
    synonyms: [],
    startDate: { year: 2026 },
    relations: {
      edges: [{
        relationType: "PARENT",
        node: {
          id: 100001,
          format: "TV",
          title: { english: "Parent Series", romaji: "Parent Series", native: null },
          startDate: { year: 2020 },
          externalLinks: [],
        },
      }],
    },
    status: "RELEASING",
    coverImage: { large: null },
    genres: [],
  };

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const result = await canonicalizeCatalogPage([row], {
    resolveMappings: async (ids) => {
      armActive = true;
      if (animeMapperActive) overlapped = true;
      await wait(20);
      armActive = false;
      return new Map([[ids[0], [{
        source: "arm",
        anilistId: ids[0],
        type: "TV",
        imdbIds: ["tt33333333"],
        title: "Related Protection Test",
        titles: ["Related Protection Test"],
        year: 2026,
      }]]]);
    },
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: async () => new Map(),
    resolveTMDBMappings: async () => new Map(),
    resolveAnimeMapperMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveAnimeMapperRelatedProviderIds: async () => {
      animeMapperActive = true;
      if (armActive) overlapped = true;
      await wait(20);
      animeMapperActive = false;
      return new Map();
    },
    resolveCanonicalSeriesMappings: async () => new Map(),
    resolveAniBridgeMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(overlapped, true);
});

