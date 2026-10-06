import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeCatalogPage } from "../api/catalog-source.js";

const empty = async () => new Map();

test("catalog anchors Bleach TYBW and Steel Ball Run to canonical series roots", async () => {
  const rows = [
    {
      id: 185874,
      idMal: 60636,
      format: "TV",
      title: {
        english: "BLEACH: Thousand-Year Blood War - The Calamity",
        romaji: "BLEACH: Sennen Kessen-hen - Kashin-tan",
        native: "BLEACH 千年血戦篇-禍進譚-",
      },
      synonyms: ["BLEACH: Thousand-Year Blood War Part 4"],
      startDate: { year: 2026 },
      relations: { edges: [] },
      coverImage: { large: "bleach-poster" },
    },
    {
      id: 210482,
      idMal: 61469,
      format: "ONA",
      title: {
        english: "STEEL BALL RUN JoJo's Bizarre Adventure 2nd - 3rd STAGE",
        romaji: "JoJo no Kimyou na Bouken: Steel Ball Run - 2nd & 3rd STAGE",
        native: "ジョジョの奇妙な冒険 スティール・ボール・ラン 2nd＆3rd STAGE",
      },
      synonyms: ["JoJo's Bizarre Adventure: Part 7–Steel Ball Run"],
      startDate: { year: 2026 },
      relations: { edges: [] },
      coverImage: { large: "sbr-poster" },
    },
  ];

  const canonicalRoots = new Map([
    [185874, {
      canonicalAnilistId: 116674,
      canonicalMalId: 41467,
      canonicalTitle: "Bleach: Thousand-Year Blood War",
      canonicalYear: 2022,
    }],
    [210482, {
      canonicalAnilistId: 210482,
      canonicalMalId: 61469,
      canonicalTitle: "Steel Ball Run: JoJo's Bizarre Adventure",
      canonicalYear: 2026,
    }],
  ]);

  const resolveImdbMappings = async (canonicalRows) => new Map(
    canonicalRows.map((row) => [
      Number(row.id),
      [{
        source: "imdb-search",
        anilistId: Number(row.id),
        type: "TV",
        imdbIds: [row.idMal === 41467 ? "tt14986406" : "tt38268282"],
        title: row.idMal === 41467 ? "Bleach: Thousand-Year Blood War" : "Steel Ball Run: JoJo's Bizarre Adventure",
        titles: [row.idMal === 41467 ? "Bleach: Thousand-Year Blood War" : "Steel Ball Run: JoJo's Bizarre Adventure"],
        year: row.idMal === 41467 ? 2022 : 2026,
      }],
    ]),
  );

  const result = await canonicalizeCatalogPage(rows, {
    resolveMappings: empty,
    resolveFribbMappings: empty,
    resolveExternalMappings: empty,
    resolveAnimapMappings: empty,
    resolveIdMapperMappings: empty,
    resolveTMDBMappings: empty,
    resolveAnimeMapperMappings: empty,
    resolveAnimeMapperRelatedProviderIds: empty,
    resolveCanonicalSeriesMappings: async () => canonicalRoots,
    resolveAniBridgeMappings: empty,
    resolveTsvMappings: empty,
    resolveImdbMappings,
    resolveSecondaryMappings: empty,
    resolveAlternativeMappings: empty,
  });

  assert.deepEqual(result.map((meta) => meta.id), ["tt14986406", "tt38268282"]);
  assert.equal(result[0].name, "BLEACH: Thousand-Year Blood War - The Calamity");
  assert.equal(result[1].name, "STEEL BALL RUN JoJo's Bizarre Adventure 2nd - 3rd STAGE");
  assert.equal(result[0].extra.identityCanonicalSeries, true);
  assert.equal(result[1].extra.identityCanonicalSeries, true);
});


test("catalog preserves an independently verified current IMDb series over a different canonical ancestor", async () => {
  const rows = [{
    id: 210482,
    idMal: 61469,
    format: "ONA",
    title: {
      english: "STEEL BALL RUN JoJo's Bizarre Adventure 2nd - 3rd STAGE",
      romaji: "JoJo no Kimyou na Bouken: Steel Ball Run - 2nd & 3rd STAGE",
      native: "ジョジョの奇妙な冒険 スティール・ボール・ラン 2nd＆3rd STAGE",
    },
    synonyms: ["JoJo's Bizarre Adventure: Part 7–Steel Ball Run"],
    startDate: { year: 2026 },
    relations: { edges: [] },
    coverImage: { large: "sbr-poster" },
  }];

  const canonicalRoots = new Map([[
    210482,
    {
      canonicalAnilistId: 14719,
      canonicalMalId: 14719,
      canonicalTitle: "JoJo's Bizarre Adventure",
      canonicalYear: 2012,
    },
  ]]);

  const directMappings = new Map([[
    210482,
    [{
      source: "imdb-search",
      anilistId: 210482,
      type: "TV",
      imdbIds: ["tt38268282"],
      title: "Steel Ball Run: JoJo's Bizarre Adventure",
      titles: ["Steel Ball Run: JoJo's Bizarre Adventure"],
      year: 2026,
    }],
  ]]);

  const resolveImdbMappings = async (canonicalRows) => new Map(
    canonicalRows.map((row) => [
      Number(row.id),
      [{
        source: "imdb-search-canonical-series",
        anilistId: Number(row.id),
        type: "TV",
        imdbIds: ["tt2359704"],
        title: "JoJo's Bizarre Adventure",
        titles: ["JoJo's Bizarre Adventure"],
        year: 2012,
      }],
    ]),
  );

  const result = await canonicalizeCatalogPage(rows, {
    resolveMappings: async () => directMappings,
    resolveFribbMappings: empty,
    resolveExternalMappings: empty,
    resolveAnimapMappings: empty,
    resolveIdMapperMappings: empty,
    resolveTMDBMappings: empty,
    resolveAnimeMapperMappings: empty,
    resolveAnimeMapperRelatedProviderIds: empty,
    resolveCanonicalSeriesMappings: async () => canonicalRoots,
    resolveAniBridgeMappings: empty,
    resolveTsvMappings: empty,
    resolveImdbMappings,
    resolveSecondaryMappings: empty,
    resolveAlternativeMappings: empty,
  });

  assert.equal(result[0].id, "tt38268282");
  assert.equal(result[0].extra.identityId, "tt38268282");
  assert.equal(result[0].extra.identityCanonicalSeries, undefined);
});
