import assert from "node:assert/strict";
import test from "node:test";
import { queryAnime } from "../lib/catalog-anilist.js";

test("AniList retries HTTP 429 before failing", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls < 3) {
      return {
        ok: false,
        status: 429,
        async json() { return {}; },
      };
    }
    return {
      ok: true,
      status: 200,
      async json() {
        return { data: { Page: { media: [{ id: 12345 }] } } };
      },
    };
  };

  try {
    const result = await queryAnime(
      { season: "FALL", seasonYear: 2026, sort: ["ID"] },
      1,
    );
    assert.deepEqual(result.map((row) => row.id), [12345]);
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
