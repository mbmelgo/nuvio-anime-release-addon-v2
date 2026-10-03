import assert from "node:assert/strict";
import test from "node:test";
import {
  clearAlternativeMappingCache,
  normalizeAnimeApiRecord,
  resolveAniListMappingsByMalIds,
} from "../lib/secondary-mapping.js";

test("AnimeAPI MAL lookup normalizes a BingeCat-capable relation for the original AniList item", () => {
  const record = normalizeAnimeApiRecord({
    anilist: 123,
    myanimelist: 456,
    imdb: "tt1234567",
    thetvdb: 765432,
    themoviedb: 123456,
    themoviedb_type: "tv",
  }, 123);

  assert.equal(record.anilistId, 123);
  assert.equal(record.malId, 456);
  assert.equal(record.imdbIds[0], "tt1234567");
  assert.equal(record.tvdbId, 765432);
  assert.equal(record.tmdbTvId, 123456);
});

test("AnimeAPI MAL lookup rejects a relation that points at a different AniList item", async () => {
  clearAlternativeMappingCache();
  const result = await resolveAniListMappingsByMalIds([{ id: 1, idMal: 10 }], {
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return { anilist: 2, myanimelist: 10, imdb: "tt1234567", themoviedb_type: "tv" };
      },
    }),
    endpoint: "https://example.test/myanimelist",
  });

  assert.equal(result.has(1), false);
});

test("AnimeAPI MAL lookup caches successful mappings and returns them keyed by AniList id", async () => {
  clearAlternativeMappingCache();
  let calls = 0;
  const result = await resolveAniListMappingsByMalIds(
    [{ id: 1, idMal: 10 }],
    {
      fetchImpl: async (url) => {
        calls += 1;
        assert.equal(url, "https://example.test/myanimelist/10");
        return {
          ok: true,
          async json() {
            return {
              anilist: 1,
              myanimelist: 10,
              imdb: "tt1234567",
              themoviedb_type: "tv",
            };
          },
        };
      },
      endpoint: "https://example.test/myanimelist",
    },
  );

  assert.equal(result.get(1)[0].imdbIds[0], "tt1234567");
  await resolveAniListMappingsByMalIds([{ id: 1, idMal: 10 }], {
    fetchImpl: async () => {
      calls += 1;
      throw new Error("cache miss");
    },
    endpoint: "https://example.test/myanimelist",
  });
  assert.equal(calls, 1);
});
