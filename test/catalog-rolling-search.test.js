import assert from "node:assert/strict";
import test from "node:test";
import { buildRollingCatalog } from "../api/catalog-source.js";

test("rolling catalog search resolves only matching rows", async () => {
  const targetId = 1001;
  const unrelatedId = 1002;
  const calls = [];

  const result = await buildRollingCatalog(
    "upcoming_5_days",
    new Date("2026-10-04T00:00:00+08:00"),
    0,
    "Target Anime",
    {
      fetchPage: async () => [
        {
          id: 1,
          episode: 1,
          airingAt: 1791072000,
          media: {
            id: targetId,
            title: { english: "Target Anime", romaji: "Target Anime", native: "ターゲット" },
            synonyms: [],
            format: "TV",
            isAdult: false,
            status: "RELEASING",
            startDate: { year: 2026 },
            endDate: { year: null },
          },
        },
        {
          id: 2,
          episode: 1,
          airingAt: 1791075600,
          media: {
            id: unrelatedId,
            title: { english: "Unrelated Anime", romaji: "Unrelated Anime", native: "無関係" },
            synonyms: [],
            format: "TV",
            isAdult: false,
            status: "RELEASING",
            startDate: { year: 2026 },
            endDate: { year: null },
          },
        },
      ],
      resolveMappings: async (ids) => {
        calls.push([...ids]);
        assert.deepEqual(ids, [targetId]);
        return new Map([
          [targetId, [{
            source: "bingecat-search",
            anilistId: targetId,
            imdbIds: ["tt1001001"],
            title: "Target Anime",
            year: 2026,
          }]],
        ]);
      },
      resolveSecondaryMappings: async () => new Map(),
      resolveAlternativeMappings: async () => new Map(),
    },
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].id, "tt1001001");
  assert.equal(result[0].extra.anilistId, targetId);
  assert.deepEqual(calls, [[targetId]]);
});
