import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeCatalogPageWithBingeCat } from "../api/catalog-source.js";
import { getBingeCatCandidates, selectBingeCatIdentity } from "../lib/bingecat-identity.js";

const emptyMap = () => new Map();

test("relation-derived provider mappings are not reused as the current identity without corroboration", async () => {
  const searchedTitles = [];
  const metas = await canonicalizeCatalogPageWithBingeCat([{
    id: 155723,
    idMal: 64999,
    title: {
      english: "The God of War Dominates",
      romaji: "The God of War Dominates",
      native: "武神主宰",
    },
    synonyms: [],
    status: "RELEASING",
    format: "ONA",
    isAdult: false,
    startDate: { year: 2020 },
    coverImage: { large: null },
    relations: {
      edges: [{
        relationType: "PREQUEL",
        node: {
          id: 12345,
          format: "TV",
          title: {
            english: "The God of War Dominates",
            romaji: "Wushen Zhuzai",
            native: "武神主宰",
          },
          startDate: { year: 2020 },
        },
      }],
    },
  }], {
    resolveMappings: async (ids) => {
      if (ids.includes(12345)) {
        return new Map([[12345, [{
          source: "arm",
          anilistId: 12345,
          type: "TV",
          imdbIds: ["tt20769560"],
          tvdbId: null,
          tmdbTvId: null,
          tmdbMovieIds: [],
          title: "The God of War Dominates",
          year: 2020,
          season: null,
          episodeOffset: null,
        }]]]);
      }
      return new Map();
    },
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: emptyMap,
    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveBingeCatSearchMappings: async () => new Map(),
    resolveAnimeMapperMappings: async (rows) => rows.some((row) => Number(row.id) === 206814)
      ? new Map([[206814, [{
        source: "anime-mapper-relation",
        anilistId: 206814,
        type: "TV",
        imdbIds: [],
        tvdbId: 81472,
        tmdbTvId: null,
        tmdbMovieIds: [],
        title: "Dragon Ball Super: Beerus",
        year: null,
      }]]])
      : new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "mal:64999");
  assert.equal(metas[0].extra.anilistId, 155723);
  assert.equal(metas[0].extra.bingecatProvider, null);
  assert.equal(metas[0].extra.bingecatId, null);
  assert.equal(metas[0].extra.bingecatEvidence, "canonical-mal-id-fallback");
});


test("relation provider mappings are rejected when the related title does not match the current entry", async () => {
  const metas = await canonicalizeCatalogPageWithBingeCat([{
    id: 155723,
    title: {
      english: null,
      romaji: "Wushen Zhuzai: Da Wei Pian",
      native: "武神主宰：大威篇",
    },
    synonyms: [],
    status: "RELEASING",
    format: "ONA",
    isAdult: false,
    startDate: { year: 2026 },
    coverImage: { large: null },
    relations: {
      edges: [{
        relationType: "PREQUEL",
        node: {
          id: 117168,
          format: "ONA",
          title: {
            english: "The God of War Dominates",
            romaji: "Wushen Zhuzai",
            native: "武神主宰",
          },
          startDate: { year: 2020 },
          synonyms: [],
          externalLinks: [],
        },
      }],
    },
  }], {
    resolveMappings: async () => new Map(),
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: emptyMap,
    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveBingeCatSearchMappings: async () => new Map(),
    resolveAnimeMapperMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async () => new Map([[117168, [{
      source: "imdb-search",
      anilistId: 117168,
      type: "TV",
      imdbIds: ["tt20769560"],
      tvdbId: null,
      tmdbTvId: null,
      tmdbMovieIds: [],
      title: "The God of War Dominates",
      year: 2020,
      season: null,
      episodeOffset: null,
    }]]]),
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "anilist:155723");
  assert.equal(metas[0].extra.bingecatEvidence, "anilist-id-fallback");
});

test("relation external provider mappings are validated against the current title", async () => {
  const metas = await canonicalizeCatalogPageWithBingeCat([{
    id: 5000,
    idMal: 5000,
    title: { english: "Example Series Season 2", romaji: "Example Series Season 2", native: null },
    synonyms: [],
    status: "RELEASING",
    format: "TV",
    isAdult: false,
    startDate: { year: 2026 },
    coverImage: { large: null },
    relations: {
      edges: [{
        relationType: "PREQUEL",
        node: {
          id: 4999,
          format: "TV",
          title: { english: "Example Series", romaji: "Example Series", native: null },
          startDate: { year: 2025 },
          synonyms: [],
          externalLinks: [{ site: "TheTVDB", url: "https://thetvdb.com/series/36880" }],
        },
      }],
    },
  }], {
    resolveMappings: async () => new Map(),
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: (rows) => {
      if (rows[0]?.id !== 4999) return new Map();
      return new Map([[4999, [{
        source: "anilist-external",
        anilistId: 4999,
        type: "TV",
        malId: null,
        imdbIds: [],
        tvdbId: 36880,
        tmdbTvId: null,
        tmdbMovieIds: [],
        title: "Example Series",
        year: 2025,
      }]]]);
    },
    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveBingeCatSearchMappings: async () => new Map(),
    resolveAnimeMapperMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "mal:5000");
  assert.equal(metas[0].extra.bingecatEvidence, "canonical-mal-id-fallback");
});

test("relation identity resolution derives provider installment titles", async () => {
  const validationMedia = {
    anilistId: 212653,
    format: "OVA",
    startDate: { year: 2027 },
    title: { romaji: "Kidou Keisatsu Patlabor EZY File 3", english: null, native: null },
    synonyms: ["パトレイバー EZY File 3"],
  };
  const validationRecord = {
    source: "imdb-search",
    anilistId: 212653,
    type: "TV",
    imdbIds: ["tt39382762"],
    title: "Patlabor EZY: File 3",
    year: 2027,
    derivedTitle: true,
  };
  assert.equal(selectBingeCatIdentity(
    validationMedia,
    getBingeCatCandidates(validationMedia, [validationRecord]),
  )?.id, "tt39382762");

  const searchedTitles = [];
  const metas = await canonicalizeCatalogPageWithBingeCat([{
    id: 212653,
    title: {
      english: null,
      romaji: "Kidou Keisatsu Patlabor EZY File 3",
      native: "機動警察パトレイバー EZY File 3",
    },
    synonyms: ["パトレイバー EZY File 3"],
    status: "NOT_YET_RELEASED",
    format: "OVA",
    isAdult: false,
    startDate: { year: 2027 },
    coverImage: { large: null },
    relations: {
      edges: [{
        relationType: "PREQUEL",
        node: {
          id: 212652,
          format: "OVA",
          title: {
            english: null,
            romaji: "Kidou Keisatsu Patlabor EZY File 2",
            native: "機動警察パトレイバー EZY File 2",
          },
          startDate: { year: 2026 },
          synonyms: [],
          externalLinks: [],
        },
      }],
    },
  }], {
    resolveMappings: async (ids) => ids.includes(212652)
      ? new Map([[212652, [{
        source: "imdb-search",
        anilistId: 212652,
        type: "TV",
        imdbIds: ["tt39382758"],
        tvdbId: null,
        tmdbTvId: null,
        tmdbMovieIds: [],
        title: "Patlabor EZY: File 2",
        year: 2026,
        season: null,
        episodeOffset: null,
      }]]])
      : new Map(),
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: emptyMap,
    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveBingeCatSearchMappings: async () => new Map(),
    resolveAnimeMapperMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async (rows) => {
      searchedTitles.push(rows[0]?.title?.english || null);
      if (rows[0]?.title?.english !== "Patlabor EZY: File 3") return new Map();
      return new Map([[212653, [{
        source: "imdb-search",
        anilistId: 212653,
        type: "TV",
        imdbIds: ["tt39382762"],
        tvdbId: null,
        tmdbTvId: null,
        tmdbMovieIds: [],
        title: "Patlabor EZY: File 3",
        year: 2027,
        season: null,
        episodeOffset: null,
      }]]]);
    },
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.ok(searchedTitles.includes("Patlabor EZY: File 3"), searchedTitles.join(" | "));
  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "tt39382762");
  assert.equal(metas[0].extra.anilistId, 212653);
});


test("current mappings cannot inherit a provider ID owned by an explicit related anime", async () => {
  const metas = await canonicalizeCatalogPageWithBingeCat([{
    id: 206814,
    idMal: 63367,
    title: {
      english: "Dragon Ball Super: Beerus",
      romaji: "Dragon Ball Super: Beerus",
      native: "ドラゴンボール超 ビルス",
    },
    synonyms: [],
    status: "NOT_YET_RELEASED",
    format: "TV",
    isAdult: false,
    startDate: { year: 2026 },
    coverImage: { large: null },
    relations: {
      edges: [{
        relationType: "PREQUEL",
        node: {
          id: 813,
          format: "TV",
          title: { english: "Dragon Ball Z", romaji: "Dragon Ball Z", native: "ドラゴンボールZ" },
          startDate: { year: 1989 },
          synonyms: [],
          externalLinks: [],
        },
      }],
    },
  }], {
    resolveMappings: async (ids) => {
      if (ids.includes(206814)) {
        return new Map([[206814, [{
          source: "animeapi",
          anilistId: 206814,
          type: "TV",
          imdbIds: [],
          tvdbId: 81472,
          tmdbTvId: null,
          tmdbMovieIds: [],
          title: "Dragon Ball Super: Beerus",
          year: 2026,
        }]]]);
      }
      if (ids.includes(813)) {
        return new Map([[813, [{
          source: "arm",
          anilistId: 813,
          type: "TV",
          imdbIds: [],
          tvdbId: 81472,
          tmdbTvId: null,
          tmdbMovieIds: [],
          title: "Dragon Ball Z",
          year: 1989,
        }]]]);
      }
      return new Map();
    },
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveBingeCatSearchMappings: async () => new Map(),
    resolveAnimeMapperMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "mal:63367");
  assert.equal(metas[0].extra.bingecatProvider, null);
  assert.equal(metas[0].extra.bingecatEvidence, "canonical-mal-id-fallback");
});


test("related provider protection is carried by mapping records before final candidate selection", async () => {
  const mappings = new Map([[206814, [{
    source: "animeapi", anilistId: 206814, type: "TV", imdbIds: [], tvdbId: 81472,
    tmdbTvId: null, tmdbMovieIds: [], title: "Dragon Ball Super: Beerus", year: 2026,
  }]]]);
  const media = {
    anilistId: 206814,
    title: { english: "Dragon Ball Super: Beerus", romaji: "Dragon Ball Super: Beerus" },
    startDate: { year: 2026 },
    format: "TV",
    relations: { edges: [{ relationType: "PREQUEL", node: { id: 813, title: { english: "Dragon Ball Z" } } }] },
    relatedProviderIds: ["tvdb:81472"],
  };
  const candidates = getBingeCatCandidates(media, mappings.get(206814));
  assert.equal(selectBingeCatIdentity(media, candidates), null);
});


test("final verification mappings cannot bypass protected related provider IDs", () => {
  const media = {
    anilistId: 206814,
    title: { english: "Dragon Ball Super: Beerus", romaji: "Dragon Ball Super: Beerus" },
    startDate: { year: 2026 },
    format: "TV",
    relations: { edges: [{ relationType: "PREQUEL", node: { id: 813, title: { english: "Dragon Ball Z" } } }] },
    relatedProviderIds: ["tvdb:81472"],
  };
  const verificationRecord = {
    source: "bingecat-search",
    anilistId: 206814,
    type: "TV",
    imdbIds: [],
    tvdbId: 81472,
    tmdbTvId: null,
    tmdbMovieIds: [],
    title: "Dragon Ball Super: Beerus",
  };
  const candidates = getBingeCatCandidates(media, [{ ...verificationRecord, relatedProviderIds: media.relatedProviderIds }]);
  assert.equal(selectBingeCatIdentity(media, candidates), null);
});
test("shared provider IDs are accepted for compatible related installments", () => {
  const media = {
    anilistId: 191788,
    title: { english: "Aoashi Season 2", romaji: "Aoashi 2nd Season" },
    startDate: { year: 2026 },
    format: "TV",
    relations: {
      edges: [{
        relationType: "PREQUEL",
        node: { id: 174, title: { english: "Aoashi" } },
      }],
    },
    relatedProviderIds: ["tvdb:407840"],
    relatedProviderTitles: ["Aoashi"],
  };
  const record = {
    source: "animeapi",
    anilistId: 191788,
    type: "TV",
    imdbIds: [],
    tvdbId: 407840,
    tmdbTvId: null,
    tmdbMovieIds: [],
    title: "Aoashi",
    year: null,
  };

  const candidate = getBingeCatCandidates(media, [record]).find(
    (item) => item.provider === "tvdb" && item.id === "407840",
  );
  assert.equal(selectBingeCatIdentity(media, [candidate])?.id, "407840");
});

test("shared provider protection still rejects an unrelated provider collision", () => {
  const media = {
    anilistId: 206814,
    title: { english: "Dragon Ball Super: Beerus", romaji: "Dragon Ball Super: Beerus" },
    startDate: { year: 2026 },
    format: "TV",
    relations: {
      edges: [{
        relationType: "PREQUEL",
        node: { id: 813, title: { english: "Dragon Ball Z" } },
      }],
    },
    relatedProviderIds: ["tvdb:81472"],
    relatedProviderTitles: ["Dragon Ball Z"],
  };
  const record = {
    source: "arm",
    anilistId: 206814,
    type: "TV",
    imdbIds: [],
    tvdbId: 81472,
    tmdbTvId: null,
    tmdbMovieIds: [],
    title: "Dragon Ball Super: Beerus",
    year: 2026,
  };

  const candidate = getBingeCatCandidates(media, [record]).find(
    (item) => item.provider === "tvdb" && item.id === "81472",
  );
  assert.equal(selectBingeCatIdentity(media, [candidate]), null);
});

