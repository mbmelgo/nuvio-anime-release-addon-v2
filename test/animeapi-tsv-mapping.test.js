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


test("AnimeAPI TSV resolver recovers provider IDs when the AniList column is misaligned but MAL matches", async () => {
  clearAnimeApiTsvCache();
  const tsv = [
    "title\tanidb\tanilist\tanimenewsnetwork\tanimeplanet\tanisearch\tannict\thikka\timdb\tkaize\tkaize_id\tkitsu\tletterboxd_lid\tletterboxd_slug\tletterboxd_uid\tlivechart\tmyanimelist\tnautiljon\tnautiljon_id\tnotify\totakotaku\tshikimori\tshoboi\tsilveryasha\tsimkl\tthemoviedb\tthemoviedb_season_id\tthemoviedb_type\tthetvdb\tthetvdb_season_id\ttrakt\ttrakt_may_invalid\ttrakt_season\ttrakt_season_id\ttrakt_slug\ttrakt_type",
    "Ghost Meets Gal!\t20339\t64718\t40470\t\t21895\t17955\tghost-meets-gal-f48789\t\tghost-meets-gal\t25869\t50866\t\t\t\t13740\t64718\t\t\t\t3431\t64718\t\t\t3240648\t334103\t541314\ttv\t482144\t2267023\t327906\tFalse\t1\t533487\tghost-meets-gal\tshows",
  ].join("\\n");

  const result = await resolveAniListMappingsFromAnimeApiTsv([{ id: 214703, idMal: 64718 }], {
    endpoint: "https://example.test/animeapi.tsv",
    fetchImpl: async () => new Response(tsv, { status: 200 }),
  });

  assert.deepEqual(result.get(214703)?.[0], {
    source: "animeapi-tsv-mal-aligned",
    anilistId: 214703,
    type: "TV",
    malId: 64718,
    imdbIds: [],
    tvdbId: 482144,
    tmdbTvId: 334103,
    tmdbMovieIds: [],
    season: { tvdb: 2267023, tmdb: 541314 },
    episodeOffset: null,
    title: "Ghost Meets Gal!",
    year: null,
  });
});
