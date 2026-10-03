import assert from "node:assert/strict";
import test from "node:test";
import {
  clearAnimeApiTsvCache,
  normalizeAnimeApiTsvRow,
  resolveAniListMappingsFromAnimeApiTsv,
} from "../lib/animeapi-tsv-mapping.js";

test("AnimeAPI TSV rows normalize AniList to BingeCat-compatible identities", () => {
  const columns = [];
  columns[0] = "Example Anime";
  columns[2] = "123";
  columns[8] = "tt1234567";
  columns[16] = "456";
  columns[25] = "987654";
  columns[27] = "tv";
  columns[28] = "7654321";

  assert.deepEqual(normalizeAnimeApiTsvRow(columns, 123), {
    source: "animeapi-tsv",
    anilistId: 123,
    type: "TV",
    malId: 456,
    imdbIds: ["tt1234567"],
    tvdbId: 7654321,
    tmdbTvId: 987654,
    tmdbMovieIds: [],
    season: { tvdb: null, tmdb: null },
    episodeOffset: null,
    title: "Example Anime",
    year: null,
  });
});

test("AnimeAPI TSV resolver indexes only requested AniList IDs", async () => {
  clearAnimeApiTsvCache();
  let requests = 0;
  const tsv = [
    "title\tanidb\tanilist\tanimenewsnetwork\tanimeplanet\tanisearch\tannict\thikka\timdb\tkaize\tkaize_id\tkitsu\tletterboxd_lid\tletterboxd_slug\tletterboxd_uid\tlivechart\tmyanimelist\tnautiljon\tnautiljon_id\tnotify\totakotaku\tshikimori\tshoboi\tsilveryasha\tsimkl\tthemoviedb\tthemoviedb_season_id\tthemoviedb_type\tthetvdb\tthetvdb_season_id\ttrakt\ttrakt_may_invalid\ttrakt_season\ttrakt_season_id\ttrakt_slug\ttrakt_type",
    "Example\t\t123\t\t\t\t\t\ttt1234567\t\t\t\t\t\t\t\t456\t\t\t\t\t\t\t\t\t987654\t\ttv\t7654321",
    "Other\t\t999\t\t\t\t\t\ttt9999999",
  ].join("\n");

  const result = await resolveAniListMappingsFromAnimeApiTsv([123], {
    endpoint: "https://example.test/animeapi.tsv",
    fetchImpl: async () => {
      requests += 1;
      return new Response(tsv, { status: 200 });
    },
  });

  assert.equal(requests, 1);
  assert.equal(result.get(123)?.[0]?.imdbIds[0], "tt1234567");
  assert.equal(result.has(999), false);
});
