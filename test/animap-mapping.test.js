import assert from "node:assert/strict";
import test from "node:test";
import {
  clearAnimapMappingCache,
  normalizeAnimapRecord,
  resolveAniListMappingsAnimap,
} from "../lib/animap-mapping.js";

test("AniMap records normalize AniList to BingeCat-compatible provider identities", () => {
  assert.deepEqual(normalizeAnimapRecord({
    sources: [
      "https://anilist.co/anime/123",
      "https://www.imdb.com/title/tt1234567/",
      "https://thetvdb.com/series/example/7654321",
      "https://www.themoviedb.org/tv/987654",
    ],
    title: "Example Anime",
    type: "TV",
    animeSeason: { year: 2026 },
    synonyms: ["Example"],
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
    sources: [
      "https://anilist.co/anime/456",
      "https://www.themoviedb.org/movie/123456",
    ],
    type: "MOVIE",
  }, 456);

  assert.equal(record?.tmdbTvId, null);
  assert.deepEqual(record?.tmdbMovieIds, [123456]);
});

test("AniMap rejects cross-source ID mismatches and unmapped records", () => {
  assert.equal(normalizeAnimapRecord({
    sources: [
      "https://anilist.co/anime/999",
      "https://www.imdb.com/title/tt1234567/",
    ],
  }, 123), null);

  assert.equal(normalizeAnimapRecord({
    sources: ["https://anilist.co/anime/123"],
  }, 123), null);
});

test("AniMap resolver requests only missing IDs and caches negative results", async () => {
  clearAnimapMappingCache();
  let requests = 0;
  const payloads = {
    123: {
      sources: [
        "https://anilist.co/anime/123",
        "https://www.imdb.com/title/tt1234567/",
      ],
      type: "TV",
    },
    999: {
      sources: ["https://anilist.co/anime/999"],
      type: "TV",
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
