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
