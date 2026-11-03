import assert from "node:assert/strict";
import test from "node:test";
import { clearAniListRateLimitState, clearAniListResponseCache, queryAnime } from "../lib/catalog-anilist.js";

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

test("AniList serves unexpired cached responses during a global 429 cooldown", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        async json() { return { data: { Page: { media: [{ id: 123 }] } } }; },
      };
    }
    return {
      ok: false,
      status: 429,
      headers: new Headers({ "Retry-After": "60" }),
      async json() { return {}; },
    };
  };

  clearAniListRateLimitState();
  try {
    const filter = { season: "FALL", seasonYear: 2026, sort: ["ID"] };
    assert.deepEqual(await queryAnime(filter, 1), [{ id: 123 }]);
    await assert.rejects(queryAnime(filter, 2), /HTTP 429/);

    assert.deepEqual(await queryAnime(filter, 1), [{ id: 123 }]);
    await assert.rejects(queryAnime(filter, 3), /cooldown active/);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    clearAniListRateLimitState();
  }
});


test("AniList bounds stalled response bodies after headers arrive", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: new Headers(),
    async json() { return new Promise(() => {}); },
  });

  clearAniListRateLimitState();
  try {
    const result = await Promise.race([
      queryAnime({ season: "FALL", seasonYear: 2026, sort: ["ID"] }, 1, "", { fetchTimeoutMs: 20 })
        .then(() => "settled", () => "rejected"),
      new Promise((resolve) => setTimeout(() => resolve("timed-out"), 250)),
    ]);
    assert.equal(result, "rejected", "AniList JSON body reads must share the request timeout boundary");
  } finally {
    globalThis.fetch = originalFetch;
    clearAniListRateLimitState();
  }
});


test("AniList preserves 429 cooldown when the response body stalls", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: false,
      status: 429,
      headers: new Headers({ "Retry-After": "60" }),
      async json() { return new Promise(() => {}); },
    };
  };

  clearAniListRateLimitState();
  try {
    const result = await Promise.race([
      (async () => {
        await assert.rejects(
          queryAnime({ season: "FALL", seasonYear: 2026, sort: ["ID"] }, 1, "", { fetchTimeoutMs: 20 }),
          /HTTP 429/,
        );
        await assert.rejects(
          queryAnime({ season: "FALL", seasonYear: 2026, sort: ["ID"] }, 1),
          /cooldown active/,
        );
        return "settled";
      })(),
      new Promise((resolve) => setTimeout(() => resolve("timed-out"), 250)),
    ]);
    assert.equal(result, "settled", "429 cooldown should not depend on its response body finishing");
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    clearAniListRateLimitState();
  }
});

test("AniList Retry-After is honored beyond the previous one-minute cap", async () => {
  const { getAniListRetryDelayMs } = await import("../lib/catalog-anilist.js");
  assert.equal(getAniListRetryDelayMs(new Headers({ "Retry-After": "120" }), 1_000), 120_000);
});

test("AniList rate-limit reset header is used when Retry-After is absent", async () => {
  const { getAniListRetryDelayMs } = await import("../lib/catalog-anilist.js");
  assert.equal(getAniListRetryDelayMs(new Headers({ "X-RateLimit-Reset": "1700" }), 1_000_000), 700_000);
});

test("AniList upstream failures are classified without exposing request data", async () => {
  const { classifyAniListFailure } = await import("../lib/catalog-anilist.js");
  const timeout = new Error("request timed out");
  timeout.name = "TimeoutError";
  assert.equal(classifyAniListFailure(timeout), "timeout");
  assert.equal(classifyAniListFailure(new TypeError("fetch failed")), "network");
  assert.equal(classifyAniListFailure(new Error("GraphQL response invalid")), "upstream");
});

test("AniList reuses Runtime Cache responses after the function-local cache is cleared", async () => {
  const { setCatalogRuntimeCacheForTests } = await import("../lib/catalog-runtime-cache.js");
  const values = new Map();
  setCatalogRuntimeCacheForTests({
    async get(key) { return values.get(key) ?? null; },
    async set(key, value) { values.set(key, value); },
  });
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      async json() { return { data: { Page: { media: [{ id: 321 }] } } }; },
    };
  };

  clearAniListRateLimitState();
  try {
    const filter = { season: "FALL", seasonYear: 2026, sort: ["ID"] };
    assert.deepEqual(await queryAnime(filter, 1), [{ id: 321 }]);
    clearAniListResponseCache();
    assert.deepEqual(await queryAnime(filter, 1), [{ id: 321 }]);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    setCatalogRuntimeCacheForTests(null);
    clearAniListRateLimitState();
  }
});

test("AniList shares a 429 cooldown across function-local state", async () => {
  const { setCatalogRuntimeCacheForTests } = await import("../lib/catalog-runtime-cache.js");
  const values = new Map();
  setCatalogRuntimeCacheForTests({
    async get(key) { return values.get(key) ?? null; },
    async set(key, value) { values.set(key, value); },
  });
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: false,
      status: 429,
      headers: new Headers({ "Retry-After": "120" }),
      async json() { return {}; },
    };
  };

  clearAniListRateLimitState();
  try {
    const filter = { season: "FALL", seasonYear: 2026, sort: ["ID"] };
    await assert.rejects(queryAnime(filter, 1), /HTTP 429/);
    clearAniListRateLimitState();
    await assert.rejects(queryAnime(filter, 1), /cooldown active/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    setCatalogRuntimeCacheForTests(null);
    clearAniListRateLimitState();
  }
});

test("AniList relative rate-limit reset values are treated as seconds", async () => {
  const { getAniListRetryDelayMs } = await import("../lib/catalog-anilist.js");
  assert.equal(getAniListRetryDelayMs(new Headers({ "X-RateLimit-Reset": "45" }), 1_000_000), 45_000);
});
