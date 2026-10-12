import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeCatalogPage } from "../api/catalog-source.js";

const currentRow = {
  id: 185874,
  idMal: 185874,
  format: "TV",
  title: {
    english: "BLEACH: Thousand-Year Blood War - The Calamity",
    romaji: "BLEACH: Sennen Kessen-hen - Kashin-tan",
  },
  startDate: { year: 2026 },
  synonyms: [],
  relations: {
    edges: [{
      relationType: "PREQUEL",
      node: { id: 159322, format: "TV", title: { english: "BLEACH: Thousand-Year Blood War" } },
    }],
  },
};

function resolverOptions({ tmdbId = 30984, imdbId = "tt0434665" } = {}) {
  const emptyMap = async () => new Map();
  const canonicalRoot = new Map([[185874, {
    source: "anime-mapper-canonical",
    anilistId: 185874,
    canonicalAnilistId: 269,
    canonicalMalId: 269,
    canonicalTitle: "Bleach",
    canonicalType: "TV",
    canonicalYear: 2004,
    mappings: { anilist: 269, tmdb: tmdbId },
  }]]);
  return {
    resolveMappings: emptyMap,
    resolveFribbMappings: emptyMap,
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: emptyMap,
    resolveIdMapperMappings: emptyMap,
    resolveTMDBMappings: emptyMap,
    resolveAnimeMapperMappings: emptyMap,
    resolveAnimeMapperRelatedProviderIds: emptyMap,
    resolveCanonicalSeriesMappings: async () => canonicalRoot,
    resolveAniBridgeMappings: emptyMap,
    resolveTsvMappings: emptyMap,
    resolveImdbMappings: async (rows) => {
      const records = [];
      for (const row of rows || []) {
        const title = row?.title?.english || row?.title?.romaji;
        if (title === "Bleach" && imdbId) {
          records.push([Number(row.id), [{
            source: "imdb-search",
            anilistId: Number(row.id),
            type: "TV",
            imdbIds: [imdbId],
            title: "Bleach",
            titles: ["Bleach"],
            year: 2004,
          }]]);
        }
      }
      return new Map(records);
    },
    validateImdbMappings: async () => new Set(),
    resolveSecondaryMappings: emptyMap,
    resolveAlternativeMappings: emptyMap,
  };
}

test("canonical series catalog identity emits TMDB ahead of canonical IMDb", async () => {
  const [meta] = await canonicalizeCatalogPage([currentRow], resolverOptions());
  assert.equal(meta?.id, "tmdb:30984");
  assert.equal(meta?.extra?.identityProvider, "tmdb");
  assert.equal(meta?.extra?.identityId, "30984");
  assert.equal(meta?.extra?.identityCanonicalSeries, true);
});

test("canonical series catalog identity falls back to IMDb without a TMDB root mapping", async () => {
  const [meta] = await canonicalizeCatalogPage([currentRow], resolverOptions({ tmdbId: null }));
  assert.equal(meta?.id, "tt0434665");
  assert.equal(meta?.extra?.identityProvider, "imdb");
  assert.equal(meta?.extra?.identityCanonicalSeries, true);
});
