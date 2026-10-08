import assert from "node:assert/strict";
import test from "node:test";
import {
  clearAnimeMapperCache,
  resolveAniListMappingsByAnimeMapper,
  resolveAniListRelatedProviderIdsByAnimeMapper,
} from "../lib/anime-mapper-mapping.js";

function response(record) {
  return { ok: true, async json() { return record; } };
}

test("Anime Mapper normalizes a direct TVDB/TMDB mapping", async () => {
  clearAnimeMapperCache();
  const result = await resolveAniListMappingsByAnimeMapper([{
    id: 199409,
    idMal: 62248,
    format: "ONA",
    titleRomaji: "Yi Nian Yongheng 4",
  }], {
    baseUrl: "https://mapper.test",
    fetchImpl: async (url) => {
      assert.equal(url, "https://mapper.test/062/62248.json");
      return response({
        mappings: { anilist: 199409, tmdb: 123456, tvdb: 388680 },
        title: { romaji: "Yi Nian Yongheng 4" },
      });
    },
  });

  const record = result.get(199409)[0];
  assert.equal(record.tvdbId, 388680);
  assert.equal(record.tmdbTvId, 123456);
  assert.equal(record.source, "anime-mapper");
});


test("Anime Mapper bounds a stalled primary lookup", async () => {
  clearAnimeMapperCache();
  const started = Date.now();
  const result = await resolveAniListMappingsByAnimeMapper([{
    id: 300001,
    idMal: 60001,
    format: "TV",
    titleRomaji: "Slow Test Anime",
  }], {
    baseUrl: "https://mapper.test",
    fetchImpl: async (_url, { signal }) => await new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }),
  });

  assert.equal(result.size, 0);
  assert.ok(Date.now() - started < 1500);
});

test("Anime Mapper can use a related parent identity for a sequel", async () => {
  clearAnimeMapperCache();
  const result = await resolveAniListMappingsByAnimeMapper([{
    id: 189121,
    idMal: 61324,
    format: "TV",
    titleEnglish: "BanG Dream! It's MyGO!!!!! / Ave Mujica (Zoku-hen)",
    titleRomaji: "BanG Dream! It's MyGO!!!!! / Ave Mujica (Zoku-hen)",
  }], {
    baseUrl: "https://mapper.test",
    fetchImpl: async (url) => {
      if (url.endsWith("/061/61324.json")) {
        return response({
          mappings: { anilist: 189121, tmdb: null, tvdb: null },
          sequence: [{ malId: 56653, relationType: "PREQUEL" }],
        });
      }
      assert.equal(url, "https://mapper.test/056/56653.json");
      return response({
        mappings: { anilist: 169295, tmdb: 274580, tvdb: 439765 },
        title: { english: "Ave Mujica - The Die is Cast -" },
      });
    },
  });

  const record = result.get(189121)[0];
  assert.equal(record.tvdbId, 439765);
  assert.equal(record.tmdbTvId, 274580);
  assert.equal(record.relationType, "PREQUEL");
  assert.equal(record.year, null);
});

test("Anime Mapper rejects a record whose AniList identity does not match", async () => {
  clearAnimeMapperCache();
  const result = await resolveAniListMappingsByAnimeMapper([{
    id: 214260,
    idMal: 61619,
    format: "ONA",
    titleRomaji: "A Good Day to Ascend",
  }], {
    baseUrl: "https://mapper.test",
    fetchImpl: async () => response({
      mappings: { anilist: 999999, tmdb: 123, tvdb: 456 },
    }),
  });
  assert.equal(result.has(214260), false);
});

test("Anime Mapper coalesces transient failures briefly without durable negative caching", async () => {
  clearAnimeMapperCache();
  let calls = 0;
  let now = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: false, status: 404, async json() { return {}; } };
  };
  const row = [{ id: 205289, idMal: 63221, format: "MOVIE", titleRomaji: "Norman the Snowman" }];

  await resolveAniListMappingsByAnimeMapper(row, { baseUrl: "https://mapper.test", fetchImpl, now: () => now });
  await resolveAniListMappingsByAnimeMapper(row, { baseUrl: "https://mapper.test", fetchImpl, now: () => now });
  assert.equal(calls, 1);

  now += 5001;
  await resolveAniListMappingsByAnimeMapper(row, { baseUrl: "https://mapper.test", fetchImpl, now: () => now });
  assert.equal(calls, 2);
});


test("Anime Mapper resolves provider IDs from explicit related entries without per-AniList API calls", async () => {
  clearAnimeMapperCache();
  const responses = new Map([
    ["63367", {
      mappings: { anilist: 206814 },
      sequence: [{ relationType: "PREQUEL", malId: 813 }],
    }],
    ["813", { mappings: { anilist: 813, tvdb: 81472 } }],
  ]);
  const calls = [];
  const result = await resolveAniListRelatedProviderIdsByAnimeMapper(
    [{ anilistId: 206814, malId: 63367, type: "TV", title: { english: "Dragon Ball Super: Beerus" } }],
    {
      fetchImpl: async (url) => {
        calls.push(url);
        const malId = url.match(/\/(\d+)\.json$/)?.[1];
        return {
          ok: responses.has(malId),
          async json() { return responses.get(malId); },
        };
      },
      now: () => 0,
    },
  );
  assert.deepEqual(result.get(206814), ["tvdb:81472"]);
  assert.equal(calls.length, 2);
});


test("Anime Mapper relation protection uses enough concurrency for catalog-scale lookups", async () => {
  clearAnimeMapperCache();
  const rows = Array.from({ length: 12 }, (_, index) => ({
    anilistId: 300000 + index,
    malId: 60000 + index,
    type: "TV",
    title: { english: `Protected Series ${index}` },
  }));
  let active = 0;
  let maxActive = 0;

  const result = await resolveAniListRelatedProviderIdsByAnimeMapper(rows, {
    baseUrl: "https://mapper.test",
    fetchImpl: async (url) => {
      const malId = Number(url.match(/\/(\d+)\.json$/)?.[1]);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;

      if (malId >= 60000 && malId < 60012) {
        return response({
          mappings: { anilist: malId - 30000 },
          sequence: [{ relationType: "PREQUEL", malId: 70000 + (malId - 60000) }],
        });
      }
      return response({
        mappings: { anilist: malId, tvdb: 80000 + (malId - 70000) },
      });
    },
  });

  assert.equal(result.size, 12);
  assert.ok(maxActive >= 6, `expected at least 6 concurrent protection lookups, saw ${maxActive}`);
});
