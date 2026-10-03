import assert from "node:assert/strict";
import test from "node:test";
import {
  clearKonohaCache,
  resolveAniListMappingsByKonoha,
} from "../lib/konoha-mapping.js";

function response(record) {
  return { ok: true, async json() { return record; } };
}

test("Konoha resolves a related Norman the Snowman TMDB movie", async () => {
  clearKonohaCache();
  const result = await resolveAniListMappingsByKonoha([{
    id: 205289,
    format: "MOVIE",
    titleRomaji: "Norman the Snowman: Kodomo-tachi no Hitotsuboshi",
    relations: {
      edges: [{
        relationType: "PREQUEL",
        node: {
          id: 128020,
          title: { romaji: "Norman the Snowman: Nagareboshi no Furu Yoru ni" },
        },
      }],
    },
  }], {
    baseUrl: "https://konoha.test/data/slugs",
    fetchImpl: async (url) => {
      assert.equal(
        url,
        "https://konoha.test/data/slugs/128/norman-the-snowman-nagareboshi-no-furu-yoru-ni-128020/index.json",
      );
      return response({
        ids: { anilist: 128020, tmdb: 658019, tmdb_type: "movie" },
      });
    },
  });

  const record = result.get(205289)[0];
  assert.deepEqual(record.tmdbMovieIds, [658019]);
  assert.equal(record.source, "konoha-relation");
  assert.equal(record.relatedAnilistId, 128020);
});

test("Konoha rejects a slug record for the wrong AniList identity", async () => {
  clearKonohaCache();
  const result = await resolveAniListMappingsByKonoha([{
    id: 205289,
    format: "MOVIE",
    titleRomaji: "Norman the Snowman: Kodomo-tachi no Hitotsuboshi",
  }], {
    baseUrl: "https://konoha.test/data/slugs",
    fetchImpl: async () => response({
      ids: { anilist: 999999, tmdb: 123 },
    }),
  });

  assert.equal(result.has(205289), false);
});

test("Konoha caches negative lookups", async () => {
  clearKonohaCache();
  let calls = 0;
  const result = await resolveAniListMappingsByKonoha([{
    id: 215695,
    format: "TV",
    titleRomaji: "Komadori Mofmof Parade",
  }], {
    baseUrl: "https://konoha.test/data/slugs",
    fetchImpl: async () => {
      calls += 1;
      return { ok: false, status: 404, async json() { return {}; } };
    },
  });

  await resolveAniListMappingsByKonoha([{
    id: 215695,
    format: "TV",
    titleRomaji: "Komadori Mofmof Parade",
  }], {
    baseUrl: "https://konoha.test/data/slugs",
    fetchImpl: async () => {
      calls += 1;
      return { ok: false, status: 404, async json() { return {}; } };
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.has(215695), false);
});
