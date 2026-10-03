import assert from "node:assert/strict";
import test from "node:test";
import {
  clearIdMapperCache,
  normalizeIdMapperRecord,
  resolveAniListMappingsIdMapper,
} from "../lib/idmapper-mapping.js";

test("IDMapper normalizes AniList mappings to BingeCat-compatible identities", () => {
  const record = normalizeIdMapperRecord({
    anilist_id: 202390,
    mal_id: [65001],
    imdb_id: ["tt12345678"],
    thetvdb_id: 98765,
    themoviedb_id: 12345,
    type: "TV",
    title: "Example Anime",
    year: 2026,
  }, 202390);

  assert.equal(record.source, "idmapper");
  assert.equal(record.anilistId, 202390);
  assert.equal(record.type, "TV");
  assert.deepEqual(record.imdbIds, ["tt12345678"]);
  assert.equal(record.tvdbId, 98765);
  assert.equal(record.tmdbTvId, 12345);
  assert.deepEqual(record.tmdbMovieIds, []);
  assert.equal(record.malId, 65001);
});

test("IDMapper preserves movie TMDB identities", () => {
  const record = normalizeIdMapperRecord({
    anilist_id: 189121,
    themoviedb_id: 54321,
    type: "MOVIE",
    title: "Example Movie",
    year: 2026,
  }, 189121);

  assert.equal(record.type, "MOVIE");
  assert.equal(record.tmdbTvId, null);
  assert.deepEqual(record.tmdbMovieIds, [54321]);
});

test("IDMapper rejects source-id mismatches and records without BingeCat identities", () => {
  assert.equal(normalizeIdMapperRecord({
    anilist_id: 999,
    imdb_id: ["tt12345678"],
  }, 202390), null);

  assert.equal(normalizeIdMapperRecord({
    anilist_id: 202390,
    title: "No Provider",
  }, 202390), null);
});

test("IDMapper resolver caches successful and negative results", async () => {
  clearIdMapperCache();
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    const id = new URL(url).searchParams.get("anilist_id");
    return {
      ok: true,
      async json() {
        if (id === "202390") {
          return { anilist_id: 202390, imdb_id: ["tt12345678"], type: "TV" };
        }
        return { anilist_id: Number(id) };
      },
    };
  };

  const first = await resolveAniListMappingsIdMapper([202390, 202391], { fetchImpl });
  const second = await resolveAniListMappingsIdMapper([202390, 202391], { fetchImpl });

  assert.equal(calls, 2);
  assert.equal(first.get(202390)[0].imdbIds[0], "tt12345678");
  assert.equal(first.has(202391), false);
  assert.equal(second.has(202390), true);
  assert.equal(second.has(202391), false);
});
