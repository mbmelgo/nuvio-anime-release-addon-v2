import assert from "node:assert/strict";
import test from "node:test";
import { clearMappingCache, normalizeArmResponse, resolveAniListMappings } from "../lib/arm-mapping.js";

test("ARM responses normalize AniList, IMDb, TVDB and TMDB identifiers", () => {
  const [record] = normalizeArmResponse({
    anilist: 158871,
    media: "TV",
    imdb: "tt26692417",
    thetvdb: 76703,
    themoviedb: 220150,
    "thetvdb-season": 20,
    "themoviedb-season": 1,
  }, 158871);

  assert.deepEqual(record, {
    source: "arm",
    anilistId: 158871,
    type: "TV",
    malId: null,
    kitsuId: null,
    anidbId: null,
    imdbIds: ["tt26692417"],
    tvdbId: 76703,
    tmdbTvId: 220150,
    tmdbMovieIds: [],
    season: { tvdb: 20, tmdb: 1 },
    episodeOffset: null,
  });
});

test("ARM mapping client batches AniList ids and preserves response order", async () => {
  clearMappingCache();
  let calls = 0;
  const mappings = await resolveAniListMappings([269, 158871], {
    fetchImpl: async (_url, options) => {
      calls += 1;
      const body = JSON.parse(options.body);
      assert.deepEqual(body, [{ anilist: 269 }, { anilist: 158871 }]);
      return {
        ok: true,
        async json() {
          return [
            { anilist: 269, media: "TV", imdb: "tt0434665", thetvdb: 74796, themoviedb: 30984 },
            { anilist: 158871, media: "TV", imdb: "tt26692417", thetvdb: 76703, themoviedb: 220150 },
          ];
        },
      };
    },
  });

  assert.equal(calls, 1);
  assert.equal(mappings.get(269)[0].imdbIds[0], "tt0434665");
  assert.equal(mappings.get(158871)[0].tvdbId, 76703);
});

test("ARM mapping client coalesces concurrent identical batches", async () => {
  clearMappingCache();
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const fetchImpl = async (_url, options) => {
    calls += 1;
    assert.deepEqual(JSON.parse(options.body), [{ anilist: 269 }, { anilist: 158871 }]);
    await gate;
    return {
      ok: true,
      async json() {
        return [
          { anilist: 269, media: "TV", thetvdb: 74796 },
          { anilist: 158871, media: "TV", thetvdb: 76703 },
        ];
      },
    };
  };

  const first = resolveAniListMappings([269, 158871], { fetchImpl });
  const second = resolveAniListMappings([158871, 269], { fetchImpl });
  await Promise.resolve();
  assert.equal(calls, 1);

  release();
  const [firstMappings, secondMappings] = await Promise.all([first, second]);
  assert.equal(firstMappings.get(269)[0].tvdbId, 74796);
  assert.equal(secondMappings.get(158871)[0].tvdbId, 76703);
});

test("ARM mapping client caches successful and negative results", async () => {
  clearMappingCache();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, async json() { return []; } };
  };

  const first = await resolveAniListMappings([999999], { fetchImpl });
  const second = await resolveAniListMappings([999999], { fetchImpl });

  assert.equal(calls, 1);
  assert.equal(first.has(999999), false);
  assert.equal(second.has(999999), false);
});
