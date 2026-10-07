import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeCatalogPage } from "../api/catalog-source.js";

const empty = async () => new Map();

test("catalog anchors Bleach TYBW with a parent relation while preserving standalone SBR identity", async () => {
  const rows = [
    {
      id: 185874,
      idMal: 60636,
      format: "TV",
      title: { english: "BLEACH: Thousand-Year Blood War - The Calamity" },
      synonyms: ["BLEACH: Thousand-Year Blood War Part 4"],
      startDate: { year: 2026 },
      relations: { edges: [{
        relationType: "PARENT",
        node: { id: 116674, format: "TV", title: { english: "Bleach: Thousand-Year Blood War" }, startDate: { year: 2022 } },
      }] },
      coverImage: { large: "bleach-poster" },
    },
    {
      id: 210482,
      idMal: 61469,
      format: "ONA",
      title: { english: "STEEL BALL RUN JoJo's Bizarre Adventure 2nd - 3rd STAGE" },
      synonyms: ["JoJo's Bizarre Adventure: Part 7–Steel Ball Run"],
      startDate: { year: 2026 },
      relations: { edges: [] },
      coverImage: { large: "sbr-poster" },
    },
  ];

  const canonicalRoots = new Map([[
    185874,
    {
      canonicalAnilistId: 116674,
      canonicalMalId: 41467,
      canonicalTitle: "Bleach: Thousand-Year Blood War",
      canonicalYear: 2022,
    },
  ]]);

  const directMappings = new Map([
    [185874, [{
      source: "imdb-search",
      anilistId: 185874,
      type: "TV",
      imdbIds: ["tt14986406"],
      title: "Bleach: Thousand-Year Blood War",
      titles: ["Bleach: Thousand-Year Blood War"],
      year: 2022,
    }]],
    [210482, [{
      source: "imdb-search",
      anilistId: 210482,
      type: "TV",
      imdbIds: ["tt38268282"],
      title: "Steel Ball Run: JoJo's Bizarre Adventure",
      titles: ["Steel Ball Run: JoJo's Bizarre Adventure"],
      year: 2026,
    }]],
  ]);

  let canonicalCalls = 0;
  const resolveImdbMappings = async (canonicalRows) => new Map(
    canonicalRows.map((row) => [Number(row.id), [{
      source: "imdb-search-canonical-series",
      anilistId: Number(row.id),
      type: "TV",
      imdbIds: ["tt14986406"],
      title: "Bleach: Thousand-Year Blood War",
      titles: ["Bleach: Thousand-Year Blood War"],
      year: 2022,
    }]]),
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
    resolveCanonicalSeriesMappings: async (candidateRows) => {
      canonicalCalls += 1;
      assert.deepEqual(candidateRows.map((row) => row.id), [185874]);
      return canonicalRoots;
    },
    resolveAniBridgeMappings: empty,
    resolveTsvMappings: empty,
    resolveImdbMappings,
    resolveSecondaryMappings: empty,
    resolveAlternativeMappings: empty,
  });

  assert.equal(canonicalCalls, 1);
  assert.deepEqual(result.map((meta) => meta.id), ["tt14986406", "tt38268282"]);
  assert.equal(result[0].extra.identityCanonicalSeries, true);
  assert.equal(result[1].extra.identityCanonicalSeries, undefined);
});
test("canonical traversal scales with unresolved or related rows instead of catalog page size", async () => {
  const rows = Array.from({ length: 50 }, (_, index) => ({
    id: 300000 + index,
    idMal: 400000 + index,
    format: "TV",
    title: { english: `Test Series ${index}` },
    synonyms: [],
    startDate: { year: 2026 },
    relations: { edges: [] },
    coverImage: { large: `poster-${index}` },
  }));

  rows[49].relations = {
    edges: [{
      relationType: "PARENT",
      node: { id: 500000, format: "TV", title: { english: "Canonical Test Series" }, startDate: { year: 2020 } },
    }],
  };

  const directMappings = new Map(rows.map((row) => [row.id, [{
    source: "imdb-search",
    anilistId: row.id,
    type: "TV",
    imdbIds: [`tt${10000000 + row.id}`],
    title: row.title.english,
    titles: [row.title.english],
    year: 2026,
  }]]));

  let canonicalCandidateCount = 0;
  await canonicalizeCatalogPage(rows, {
    resolveMappings: async () => directMappings,
    resolveFribbMappings: empty,
    resolveExternalMappings: empty,
    resolveAnimapMappings: empty,
    resolveIdMapperMappings: empty,
    resolveTMDBMappings: empty,
    resolveAnimeMapperMappings: empty,
    resolveAnimeMapperRelatedProviderIds: empty,
    resolveCanonicalSeriesMappings: async (candidateRows) => {
      canonicalCandidateCount = candidateRows.length;
      assert.deepEqual(candidateRows.map((row) => row.id), [rows[49].id]);
      return new Map();
    },
    resolveAniBridgeMappings: empty,
    resolveTsvMappings: empty,
    resolveImdbMappings: empty,
    resolveSecondaryMappings: empty,
    resolveAlternativeMappings: empty,
  });

  assert.equal(canonicalCandidateCount, 1);
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
