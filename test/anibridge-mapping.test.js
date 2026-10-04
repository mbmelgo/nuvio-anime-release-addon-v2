import assert from "node:assert/strict";
import test from "node:test";
import {
  clearAniBridgeCache,
  normalizeAniBridgeMappings,
  resolveAniListMappingsByAniBridge,
} from "../lib/anibridge-mapping.js";

const row = (id, format = "TV") => ({
  id,
  idMal: id + 1000,
  format,
  startDate: { year: 2026 },
  title: {
    english: `Anime ${id}`,
    romaji: `Anime ${id}`,
    native: null,
  },
  synonyms: [],
});

test("AniBridge maps an AniList source to IMDb, TVDB and TMDB provider candidates", () => {
  const records = normalizeAniBridgeMappings({
    "imdb_show:tt12345678:s1": {},
    "tvdb_show:470200:s1": {},
    "tmdb_show:123456:s1": {},
    "mal:99999": {},
  }, row(202079));

  assert.deepEqual(records.map((record) => record.source), ["anibridge", "anibridge", "anibridge"]);
  assert.equal(records[0].imdbIds[0], "tt12345678");
  assert.equal(records[1].tvdbId, 470200);
  assert.equal(records[2].tmdbTvId, 123456);
  assert.ok(records.every((record) => record.anilistId === 202079));
});

test("AniBridge uses movie descriptors only for movie-compatible rows", () => {
  const records = normalizeAniBridgeMappings({
    "imdb_movie:tt12345678": {},
    "tvdb_movie:12345": {},
    "tmdb_movie:67890": {},
    "tvdb_show:54321:s1": {},
  }, row(123, "MOVIE"));

  assert.equal(records.length, 3);
  assert.deepEqual(records.map((record) => record.imdbIds[0] || record.tvdbId || record.tmdbMovieIds[0]), [
    "tt12345678",
    12345,
    67890,
  ]);
});

test("AniBridge resolver loads the dataset once and resolves only requested AniList rows", async () => {
  clearAniBridgeCache();
  let calls = 0;
  const payload = {
    "anilist:202079": {
      "tvdb_show:470200:s1": {},
    },
    "anilist:999999": {
      "tvdb_show:999999:s1": {},
    },
  };

  const fetchImpl = async () => {
    calls += 1;
    return {
      ok: true,
      json: async () => payload,
    };
  };

  const first = await resolveAniListMappingsByAniBridge([row(202079), row(123456)], {
    fetchImpl,
  });
  const second = await resolveAniListMappingsByAniBridge([row(202079)], {
    fetchImpl,
  });

  assert.equal(calls, 1);
  assert.deepEqual(first.get(202079)[0].tvdbId, 470200);
  assert.equal(first.has(123456), false);
  assert.deepEqual(second.get(202079)[0].tvdbId, 470200);
});

test("AniBridge retains provider IDs from explicit related AniList entries", async () => {
  clearAniBridgeCache();
  const current = {
    ...row(206814),
    relations: {
      edges: [{
        relationType: "PREQUEL",
        node: {
          id: 813,
          format: "TV",
          title: { english: "Dragon Ball Z", romaji: "Dragon Ball Z", native: null },
          externalLinks: [
            { site: "TheTVDB", url: "https://thetvdb.com/series/81472" },
            { site: "TMDB", url: "https://www.themoviedb.org/tv/12971" },
          ],
        },
      }],
    },
  };
  const payload = {
    "anilist:206814": {
      "tvdb_show:81472:s1": {},
    },
    "anilist:813": {
      "tvdb_show:81472:s1": {},
      "tmdb_show:12971:s1": {},
    },
  };

  const result = await resolveAniListMappingsByAniBridge([current], {
    fetchImpl: async () => ({
      ok: true,
      json: async () => payload,
    }),
  });

  assert.deepEqual(result.get(206814)[0].relatedProviderIds, ["tvdb:81472", "tmdb:12971"]);
});

test("AniBridge retains provider IDs directly from AniList relation links", async () => {
  clearAniBridgeCache();
  const current = {
    ...row(206814),
    relations: {
      edges: [{
        relationType: "PREQUEL",
        node: {
          id: 813,
          format: "TV",
          title: { english: "Dragon Ball Z", romaji: "Dragon Ball Z", native: null },
          externalLinks: [
            { site: "TheTVDB", url: "https://thetvdb.com/series/81472" },
            { site: "TMDB", url: "https://www.themoviedb.org/tv/12971" },
          ],
        },
      }],
    },
  };
  const result = await resolveAniListMappingsByAniBridge([current], {
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        "anilist:206814": { "tvdb_show:81472:s1": {} },
      }),
    }),
  });
  assert.deepEqual(result.get(206814)[0].relatedProviderIds, ["tvdb:81472", "tmdb:12971"]);
});
