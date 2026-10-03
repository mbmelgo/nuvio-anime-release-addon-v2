import assert from "node:assert/strict";
import test from "node:test";
import {
  clearAnimeMapperCache,
  resolveAniListMappingsByAnimeMapper,
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
  assert.equal(record.tmdbTvId, null);
  assert.equal(record.source, "anime-mapper");
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

test("Anime Mapper caches negative records", async () => {
  clearAnimeMapperCache();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: false, status: 404, async json() { return {}; } };
  };
  const row = [{ id: 205289, idMal: 63221, format: "MOVIE", titleRomaji: "Norman the Snowman" }];
  await resolveAniListMappingsByAnimeMapper(row, { baseUrl: "https://mapper.test", fetchImpl });
  await resolveAniListMappingsByAnimeMapper(row, { baseUrl: "https://mapper.test", fetchImpl });
  assert.equal(calls, 1);
});
