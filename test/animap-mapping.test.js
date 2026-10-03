import assert from "node:assert/strict";
import test from "node:test";
import {
  clearAnimapMappingCache,
  normalizeAnimapRecord,
  resolveAniListMappingsAnimap,
} from "../lib/animap-mapping.js";

test("AniMap records normalize AniList to BingeCat-compatible provider identities", () => {
  assert.deepEqual(normalizeAnimapRecord({
    anilist_id: 123,
    title: "Example Anime",
    type: "TV",
    year: 2026,
    synonyms: ["Example"],
    imdb_id: ["tt1234567"],
    tvdb_id: [7654321],
    tmdb_id: [{ id: 987654, type: "tv" }],
  }, 123), {
    source: "animap",
    anilistId: 123,
    type: "TV",
    malId: null,
    imdbIds: ["tt1234567"],
    tvdbId: 7654321,
    tmdbTvId: 987654,
    tmdbMovieIds: [],
    season: { tvdb: null, tmdb: null },
    episodeOffset: null,
    title: "Example Anime",
    titles: ["Example"],
    year: 2026,
  });
});

test("AniMap preserves movie TMDB identity as a movie candidate", () => {
  const record = normalizeAnimapRecord({
    anilist_id: 456,
    type: "MOVIE",
    imdb_id: [],
    tvdb_id: [],
    tmdb_id: [{ id: 123456, type: "movie" }],
  }, 456);

  assert.equal(record?.tmdbTvId, null);
  assert.deepEqual(record?.tmdbMovieIds, [123456]);
});

test("AniMap rejects cross-source ID mismatches and unmapped records", () => {
  assert.equal(normalizeAnimapRecord({
    anilist_id: 999,
    imdb_id: ["tt1234567"],
  }, 123), null);

  assert.equal(normalizeAnimapRecord({
    anilist_id: 123,
    imdb_id: [],
    tvdb_id: [],
    tmdb_id: [],
  }, 123), null);
});

test("AniMap resolver requests only missing IDs and caches negative results", async () => {
  clearAnimapMappingCache();
  let requests = 0;
  const payloads = {
    123: {
      anilist_id: 123,
      type: "TV",
      imdb_id: ["tt1234567"],
      tvdb_id: [],
      tmdb_id: [],
    },
    999: {
      anilist_id: 999,
      type: "TV",
      imdb_id: [],
      tvdb_id: [],
      tmdb_id: [],
    },
  };

  const fetchImpl = async (url) => {
    requests += 1;
    const id = url.split("/").pop();
    const payload = payloads[id];
    return new Response(JSON.stringify(payload), {
      status: payload ? 200 : 404,
      headers: { "Content-Type": "application/json" },
    });
  };

  const first = await resolveAniListMappingsAnimap([123, 999], {
    endpoint: "https://example.test/api/map/anilist",
    fetchImpl,
  });

  assert.equal(first.get(123)?.[0]?.imdbIds[0], "tt1234567");
  assert.equal(first.has(999), false);
  assert.equal(requests, 2);

  const second = await resolveAniListMappingsAnimap([123, 999], {
    endpoint: "https://example.test/api/map/anilist",
    fetchImpl,
  });

  assert.equal(second.get(123)?.[0]?.imdbIds[0], "tt1234567");
  assert.equal(second.has(999), false);
  assert.equal(requests, 2);
});
