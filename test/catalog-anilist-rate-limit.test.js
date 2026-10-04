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
      /cooldown active/,
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


test("AniList coalesces identical concurrent catalog requests", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  globalThis.fetch = async () => {
    calls += 1;
    await gate;
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      async json() {
        return { data: { Page: { media: [] } } };
      },
    };
  };

  clearAniListRateLimitState();
  try {
    const first = queryAnime({ season: "FALL", seasonYear: 2026, sort: ["ID"] }, 1);
    const second = queryAnime({ season: "FALL", seasonYear: 2026, sort: ["ID"] }, 1);
    release();
    const [a, b] = await Promise.all([first, second]);

    assert.deepEqual(a, []);
    assert.deepEqual(b, []);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    clearAniListRateLimitState();
  }
});

test("AniList reuses successful catalog responses across sequential requests", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      async json() {
        return { data: { Page: { media: [{ id: 123 }] } } };
      },
    };
  };

  clearAniListRateLimitState();
  try {
    const first = await queryAnime({ season: "FALL", seasonYear: 2026, sort: ["ID"] }, 1);
    const second = await queryAnime({ season: "FALL", seasonYear: 2026, sort: ["ID"] }, 1);

    assert.deepEqual(first, [{ id: 123 }]);
    assert.deepEqual(second, [{ id: 123 }]);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    clearAniListRateLimitState();
  }
});

