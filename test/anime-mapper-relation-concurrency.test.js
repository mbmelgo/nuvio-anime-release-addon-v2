import test from "node:test";
import assert from "node:assert/strict";
import {
  clearAnimeMapperCache,
  resolveAniListRelatedProviderIdsByAnimeMapper,
} from "../lib/anime-mapper-mapping.js";

test("Anime Mapper relation protection fetches related MAL records concurrently", async () => {
  clearAnimeMapperCache();

  let activeRelated = 0;
  let maxActiveRelated = 0;

  const records = {
    62753: {
      mappings: { anilist: 200455 },
      sequence: [
        { relationType: "PARENT", malId: 100001 },
        { relationType: "PREQUEL", malId: 100002 },
        { relationType: "SEQUEL", malId: 100003 },
      ],
    },
    100001: { mappings: { anilist: 300001, tvdb: 400001 }, sequence: [] },
    100002: { mappings: { anilist: 300002, tvdb: 400002 }, sequence: [] },
    100003: { mappings: { anilist: 300003, tvdb: 400003 }, sequence: [] },
  };

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const fetchImpl = async (url) => {
    const malId = Number(String(url).match(/(\d+)\.json$/)?.[1]);
    if (malId !== 62753) {
      activeRelated += 1;
      maxActiveRelated = Math.max(maxActiveRelated, activeRelated);
      await wait(20);
      activeRelated -= 1;
    }
    return {
      ok: true,
      async json() {
        return records[malId];
      },
    };
  };

  const result = await resolveAniListRelatedProviderIdsByAnimeMapper([{
    anilistId: 200455,
    malId: 62753,
    format: "TV",
  }], { fetchImpl });

  assert.deepEqual(result.get(200455), [
    "tvdb:400001",
    "tvdb:400002",
    "tvdb:400003",
  ]);
  assert.equal(maxActiveRelated, 3);
});
