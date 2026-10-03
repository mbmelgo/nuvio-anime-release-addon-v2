import assert from "node:assert/strict";
import test from "node:test";
import { clearSecondaryMappingCache, normalizeAnimeApiRecord, resolveAniListMappingsSecondary, resolveAniListMappingsFromDump } from "../lib/secondary-mapping.js";


test("AnimeAPI dataset resolves AniList mappings without per-ID requests", async () => {
  clearSecondaryMappingCache();
  const result = await resolveAniListMappingsFromDump([123, 456], {
    endpoint: "https://example.test/animeapi.json",
    fetchImpl: async () => new Response(JSON.stringify([
      {
        anilist: 123,
        myanimelist: 456,
        imdb: "tt1234567",
        thetvdb: 7654321,
        themoviedb: 987654,
        themoviedb_type: "tv",
      },
      {
        anilist: 456,
        myanimelist: 789,
        imdb: "tt7654321",
        themoviedb: 123456,
        themoviedb_type: "movie",
      },
    ]), { status: 200 }),
  });

  assert.equal(result.get(123)?.[0]?.imdbIds[0], "tt1234567");
  assert.equal(result.get(456)?.[0]?.tmdbMovieIds[0], 123456);
});
test("AnimeAPI mapping normalizes supported provider ids", () => {
  const record = normalizeAnimeApiRecord({
    anilist: 158871,
    myanimelist: 21,
    imdb: "tt26692417",
    thetvdb: 76703,
    themoviedb: 220150,
    themoviedb_type: "tv",
  }, 158871);

  assert.equal(record.source, "animeapi");
  assert.equal(record.anilistId, 158871);
  assert.deepEqual(record.imdbIds, ["tt26692417"]);
  assert.equal(record.tvdbId, 76703);
  assert.equal(record.tmdbTvId, 220150);
  assert.deepEqual(record.tmdbMovieIds, []);
});

test("AnimeAPI mapping rejects a source-id mismatch and unsupported records", () => {
  assert.equal(normalizeAnimeApiRecord({ anilist: 2, imdb: "tt1234567" }, 1), null);
  assert.equal(normalizeAnimeApiRecord({ anilist: 1, title: "No provider id" }, 1), null);
});

test("AnimeAPI mapping client caches successful and negative results", async () => {
  clearSecondaryMappingCache();
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    assert.equal(url, "https://example.test/anilist/1");
    return {
      ok: true,
      async json() {
        return { anilist: 1, imdb: "tt1234567", themoviedb_type: "tv" };
      },
    };
  };

  const first = await resolveAniListMappingsSecondary([1], {
    fetchImpl,
    endpoint: "https://example.test/anilist",
  });
  const second = await resolveAniListMappingsSecondary([1], {
    fetchImpl,
    endpoint: "https://example.test/anilist",
  });

  assert.equal(calls, 1);
  assert.equal(first.get(1)[0].imdbIds[0], "tt1234567");
  assert.equal(second.get(1)[0].imdbIds[0], "tt1234567");
});


test("AnimeAPI mapping preserves MAL-only records for terminal identity fallback", () => {
  const record = normalizeAnimeApiRecord({
    anilist: 212653,
    myanimelist: 62218,
    title: "The Guardian of Daxia",
  }, 212653);

  assert.equal(record.malId, 62218);
  assert.deepEqual(record.imdbIds, []);
  assert.equal(record.tvdbId, null);
  assert.equal(record.tmdbTvId, null);
});
