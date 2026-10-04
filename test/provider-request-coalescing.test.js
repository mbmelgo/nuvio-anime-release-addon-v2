import assert from "node:assert/strict";
import test from "node:test";
import { clearAnimapMappingCache, resolveAniListMappingsAnimap } from "../lib/animap-mapping.js";
import { clearIdMapperCache, resolveAniListMappingsIdMapper } from "../lib/idmapper-mapping.js";

function delayedResponse(payload, delay = 25) {
  return {
    ok: true,
    async json() {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return payload;
    },
  };
}

test("AniMap coalesces concurrent requests for the same AniList ID", async () => {
  clearAnimapMappingCache();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return delayedResponse({
      sources: [
        "https://anilist.co/anime/12345",
        "https://www.imdb.com/title/tt1234567/",
      ],
      type: "TV",
      title: "Example Anime",
      animeSeason: { year: 2026 },
    });
  };

  const [first, second] = await Promise.all([
    resolveAniListMappingsAnimap([12345], { fetchImpl }),
    resolveAniListMappingsAnimap([12345], { fetchImpl }),
  ]);

  assert.equal(calls, 1);
  assert.deepEqual(first.get(12345), second.get(12345));
});

test("IDMapper coalesces concurrent requests for the same AniList ID", async () => {
  clearIdMapperCache();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return delayedResponse({
      anilist_id: 12345,
      imdb_id: "tt1234567",
      type: "TV",
      year: 2026,
    });
  };

  const [first, second] = await Promise.all([
    resolveAniListMappingsIdMapper([12345], { fetchImpl }),
    resolveAniListMappingsIdMapper([12345], { fetchImpl }),
  ]);

  assert.equal(calls, 1);
  assert.deepEqual(first.get(12345), second.get(12345));
});


import { clearAnimeMapperCache, resolveAniListMappingsByAnimeMapper } from "../lib/anime-mapper-mapping.js";
import { clearImdbSearchCache, resolveAniListMappingsByImdbSearch } from "../lib/imdb-search-mapping.js";
import { clearSecondaryMappingCache, resolveAniListMappingsSecondary } from "../lib/secondary-mapping.js";

test("Anime Mapper coalesces concurrent requests for the same MAL ID", async () => {
  clearAnimeMapperCache();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return delayedResponse({
      mappings: { anilist: 12345, tvdb: 67890 },
      episodes: {},
      sequence: [],
    });
  };
  const row = {
    id: 12345,
    idMal: 54321,
    format: "TV",
    title: { english: "Example Anime" },
  };

  const [first, second] = await Promise.all([
    resolveAniListMappingsByAnimeMapper([row], { fetchImpl }),
    resolveAniListMappingsByAnimeMapper([row], { fetchImpl }),
  ]);

  assert.equal(calls, 1);
  assert.deepEqual(first.get(12345), second.get(12345));
});

test("IMDb search coalesces concurrent requests for the same title", async () => {
  clearImdbSearchCache();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return delayedResponse({
      d: [{ id: "tt1234567", l: "Example Anime", y: 2026 }],
    });
  };
  const row = {
    id: 12345,
    format: "TV",
    startDate: { year: 2026 },
    title: { english: "Example Anime" },
    synonyms: [],
  };

  const [first, second] = await Promise.all([
    resolveAniListMappingsByImdbSearch([row], { fetchImpl }),
    resolveAniListMappingsByImdbSearch([{ ...row, id: 12346 }], { fetchImpl }),
  ]);

  assert.equal(calls, 1);
  assert.equal(first.get(12345)[0].imdbIds[0], "tt1234567");
  assert.equal(second.get(12346)[0].imdbIds[0], "tt1234567");
});

test("AnimeAPI secondary mapping coalesces concurrent requests for the same AniList ID", async () => {
  clearSecondaryMappingCache();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return delayedResponse({
      anilist: 12345,
      imdb: "tt1234567",
      themoviedb_type: "tv",
    });
  };

  const [first, second] = await Promise.all([
    resolveAniListMappingsSecondary([12345], { fetchImpl }),
    resolveAniListMappingsSecondary([12345], { fetchImpl }),
  ]);

  assert.equal(calls, 1);
  assert.deepEqual(first.get(12345), second.get(12345));
});
