import assert from "node:assert/strict";
import test from "node:test";
import { clearAniListRateLimitState, queryAnime } from "../lib/catalog-anilist.js";

test("AniList fails fast on HTTP 429 and opens a cooldown", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: false,
      status: 429,
      headers: new Headers({ "Retry-After": "60" }),
      async json() { return {}; },
    };
  };

  clearAniListRateLimitState();
  try {
    await assert.rejects(
      queryAnime({ season: "FALL", seasonYear: 2026, sort: ["ID"] }, 1),
      /Too Many Requests|HTTP 429/,
    );
    await assert.rejects(
      queryAnime({ season: "FALL", seasonYear: 2026, sort: ["ID"] }, 1),
      /Too Many Requests|HTTP 429/,
    );
    assert.equal(calls, 1);

    await assert.rejects(
      queryAnime({ season: "FALL", seasonYear: 2026, sort: ["ID"] }, 1),
      /cooldown active/,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
