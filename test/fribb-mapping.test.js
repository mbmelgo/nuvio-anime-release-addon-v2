import assert from "node:assert/strict";
import test from "node:test";
import {
  clearFribbMappingCache,
  normalizeFribbRecord,
  resolveAniListMappingsFribb,
} from "../lib/fribb-mapping.js";

test("Fribb records normalize AniList to supported provider identities", () => {
  const record = normalizeFribbRecord({
    type: "TV",
    anilist_id: 123,
    mal_id: 456,
    imdb_id: ["tt1234567"],
    tvdb_id: 7654321,
    themoviedb_id: { tv: 987654 },
    season: { tvdb: 1, tmdb: 1 },
    episode_offset: { tvdb: 0, tmdb: 0 },
  });

  assert.deepEqual(record, {
    source: "fribb",
    anilistId: 123,
    type: "TV",
    malId: 456,
    imdbIds: ["tt1234567"],
    tvdbId: 7654321,
    tmdbTvId: 987654,
    tmdbMovieIds: [],
    season: { tvdb: 1, tmdb: 1 },
    episodeOffset: { tvdb: 0, tmdb: 0 },
  });
});

test("Fribb mapping resolves requested AniList IDs from the dataset", async () => {
  clearFribbMappingCache();
  let requests = 0;
  const result = await resolveAniListMappingsFribb([123, 456], {
    endpoint: "https://example.test/anime-list-mini.json",
    fetchImpl: async () => {
      requests += 1;
      return new Response(JSON.stringify([
        { type: "TV", anilist_id: 123, imdb_id: ["tt1234567"] },
        { type: "MOVIE", anilist_id: 456, imdb_id: ["tt7654321"] },
        { type: "TV", anilist_id: 999, imdb_id: ["tt9999999"] },
      ]), { status: 200 });
    },
  });

  assert.equal(requests, 1);
  assert.equal(result.get(123)?.[0]?.imdbIds[0], "tt1234567");
  assert.equal(result.get(456)?.[0]?.type, "MOVIE");
  assert.equal(result.has(999), false);
});
