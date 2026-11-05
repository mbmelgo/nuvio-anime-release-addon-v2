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
      error => error.code === "ANILIST_HTTP_429" && error.retryAfterSeconds === 60,
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


test("AniList blocks upstream requests when the shared token bucket is exhausted", async () => {
  const { setAniListRateLimiterForTests } = await import("../lib/catalog-rate-limiter.js");
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("upstream must not be called");
  };
  setAniListRateLimiterForTests(async () => ({ success: false, reset: Date.now() + 15_000 }));
  clearAniListRateLimitState();
  try {
    await assert.rejects(
      queryAnime({ season: "FALL", seasonYear: 2026, sort: ["ID"] }, 1),
      /global request budget exhausted/,
    );
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    setAniListRateLimiterForTests(null);
    clearAniListRateLimitState();
  }
});

test("identical concurrent AniList requests share one distributed limiter permit", async () => {
  const { setAniListRateLimiterForTests } = await import("../lib/catalog-rate-limiter.js");
  const originalFetch = globalThis.fetch;
  let limiterCalls = 0;
  let fetchCalls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  setAniListRateLimiterForTests(async () => {
    limiterCalls += 1;
    return { success: true };
  });
  globalThis.fetch = async () => {
    fetchCalls += 1;
    await gate;
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      async json() { return { data: { Page: { media: [] } } }; },
    };
  };
  clearAniListRateLimitState();
  try {
    const filter = { season: "FALL", seasonYear: 2026, sort: ["ID"] };
    const first = queryAnime(filter, 1);
    const second = queryAnime(filter, 1);
    await Promise.resolve();
    release();
    await Promise.all([first, second]);
    assert.equal(limiterCalls, 1);
    assert.equal(fetchCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    setAniListRateLimiterForTests(null);
    clearAniListRateLimitState();
  }
});


test("AniList failure classification distinguishes cooldown, budget, HTTP, timeout, and network failures", async () => {
  const { classifyAniListFailure } = await import("../lib/catalog-anilist.js");
  const cooldown = Object.assign(new Error("private cooldown detail"), { code: "ANILIST_RATE_LIMIT_COOLDOWN" });
  const budget = Object.assign(new Error("private budget detail"), { code: "ANILIST_RATE_LIMIT_BUDGET" });
  const limited = Object.assign(new Error("private upstream detail"), { code: "ANILIST_HTTP_429", status: 429 });
  const unavailable = Object.assign(new Error("private upstream detail"), { code: "ANILIST_HTTP_ERROR", status: 503 });
  const timeout = Object.assign(new Error("private timeout detail"), { code: "ANILIST_TIMEOUT", timeoutMs: 8000 });
  assert.equal(classifyAniListFailure(cooldown), "rate_limit_cooldown");
  assert.equal(classifyAniListFailure(budget), "rate_limit_budget");
  assert.equal(classifyAniListFailure(limited), "rate_limited");
  assert.equal(classifyAniListFailure(unavailable), "upstream_http");
  assert.equal(classifyAniListFailure(timeout), "timeout");
  assert.equal(classifyAniListFailure(new TypeError("fetch failed")), "network");
});


test("AniList waits for a bounded upstream token refill instead of failing immediately", async () => {
  const { acquireAniListRequestPermit, setAniListRateLimiterForTests } = await import("../lib/catalog-rate-limiter.js");
  let limiterCalls = 0;
  const waits = [];
  setAniListRateLimiterForTests(async () => {
    limiterCalls += 1;
    return limiterCalls === 1
      ? { success: false, reset: Date.now() + 1_000 }
      : { success: true };
  });
  try {
    const permit = await acquireAniListRequestPermit({
      maxWaitMs: 2_000,
      wait: async (ms) => waits.push(ms),
    });
    assert.equal(permit.allowed, true);
    assert.equal(permit.source, "injected");
    assert.equal(limiterCalls, 2);
    assert.deepEqual(waits, [1_000]);
  } finally {
    setAniListRateLimiterForTests(null);
    clearAniListRateLimitState();
  }
});

test("AniList does not wait beyond the configured upstream permit deadline", async () => {
  const { acquireAniListRequestPermit, setAniListRateLimiterForTests } = await import("../lib/catalog-rate-limiter.js");
  let limiterCalls = 0;
  let waitCalls = 0;
  setAniListRateLimiterForTests(async () => {
    limiterCalls += 1;
    return { success: false, reset: Date.now() + 1_000 };
  });
  try {
    const permit = await acquireAniListRequestPermit({
      maxWaitMs: 500,
      wait: async () => { waitCalls += 1; },
    });
    assert.equal(permit.allowed, false);
    assert.equal(permit.retryAfterMs, 1_000);
    assert.equal(limiterCalls, 1);
    assert.equal(waitCalls, 0);
  } finally {
    setAniListRateLimiterForTests(null);
    clearAniListRateLimitState();
  }
});

test("AniList classifies shared request-lock contention as retryable work in progress", async () => {
  const { classifyAniListFailure } = await import("../lib/catalog-anilist.js");
  assert.equal(classifyAniListFailure({ code: "ANILIST_REQUEST_IN_PROGRESS" }), "request_in_progress");
});

test("shared token bucket remains authoritative after local budget exhaustion", async () => {
  const { getSharedAniListCooldownUntil, setCatalogRuntimeCacheForTests } = await import("../lib/catalog-runtime-cache.js");
  const { setAniListRedisClientForTests, setAniListRateLimiterForTests } = await import("../lib/catalog-rate-limiter.js");
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const originalSetTimeout = globalThis.setTimeout;
  const values = new Map();
  const locks = new Map();
  let now = 1_000_000;
  let permitChecks = 0;
  let fetchCalls = 0;

  Date.now = () => now;
  globalThis.setTimeout = (callback, delay = 0, ...args) => {
    now += Math.max(1, Number(delay) || 0);
    queueMicrotask(() => callback(...args));
    return 0;
  };
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("upstream must not be called after budget exhaustion");
  };
  setCatalogRuntimeCacheForTests({
    async get(key) { return values.get(key) ?? null; },
    async set(key, value) { values.set(key, value); return true; },
    async delete(key) { values.delete(key); return true; },
  });
  setAniListRedisClientForTests({
    async set(key, token) {
      if (locks.has(key)) return null;
      locks.set(key, token);
      return "OK";
    },
    async eval(_script, keys, args) {
      if (locks.get(keys[0]) !== args[0]) return 0;
      locks.delete(keys[0]);
      return 1;
    },
  });
  setAniListRateLimiterForTests(async () => {
    permitChecks += 1;
    return { success: false, retryAfterMs: 3_000 };
  });
  clearAniListRateLimitState();

  try {
    await assert.rejects(
      queryAnime({ season: "FALL", seasonYear: 2026, sort: ["ID"] }, 1),
      error => error.code === "ANILIST_RATE_LIMIT_BUDGET" && error.retryAfterSeconds >= 1,
    );
    const checksAfterBudgetFailure = permitChecks;
    assert.ok(checksAfterBudgetFailure > 1);
    assert.equal(fetchCalls, 0);
    assert.equal(await getSharedAniListCooldownUntil(), 0, "the local token bucket must not publish an upstream cooldown");

    clearAniListRateLimitState();
    await assert.rejects(
      queryAnime({ season: "FALL", seasonYear: 2026, sort: ["ID"] }, 1),
      error => error.code === "ANILIST_RATE_LIMIT_BUDGET" && error.retryAfterSeconds >= 1,
    );
    assert.ok(permitChecks > checksAfterBudgetFailure, "a new instance must re-check the shared token bucket");
    assert.equal(fetchCalls, 0);
  } finally {
    Date.now = originalNow;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.fetch = originalFetch;
    clearAniListRateLimitState();
    setAniListRedisClientForTests(null);
    setAniListRateLimiterForTests(null);
    setCatalogRuntimeCacheForTests(null);
  }
});

test("AniList reuses successful responses across regions via Redis when Runtime Cache misses", async () => {
  const { setAniListRedisClientForTests } = await import("../lib/catalog-rate-limiter.js");
  const { setCatalogRuntimeCacheForTests } = await import("../lib/catalog-runtime-cache.js");
  const redisValues = new Map();
  const redis = {
    async get(key) { return redisValues.get(key) ?? null; },
    async set(key, value, options) {
      if (options?.nx) return "OK";
      redisValues.set(key, value);
      return "OK";
    },
    async eval() { return 1; },
  };
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ data: { Page: { media: [{ id: 123 }] } } }), { status: 200 });
  };
  setAniListRedisClientForTests(redis);
  setCatalogRuntimeCacheForTests({ async get() { return null; }, async set() {} });
  clearAniListRateLimitState();
  try {
    const filter = { season: { season: "FALL", year: 2026 }, sort: ["ID"] };
    assert.deepEqual(await queryAnime(filter, 1, "dragon ball"), [{ id: 123 }]);
    clearAniListResponseCache();
    assert.deepEqual(await queryAnime(filter, 1, "dragon ball"), [{ id: 123 }]);
    assert.equal(calls, 1);
    assert.equal([...redisValues.keys()].filter(key => key.startsWith("anibloom:anilist:response:v1:")).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    setAniListRedisClientForTests(null);
    setCatalogRuntimeCacheForTests(null);
    clearAniListRateLimitState();
  }
});

test("Redis response-cache failures preserve AniList upstream fallback", async () => {
  const { setAniListRedisClientForTests } = await import("../lib/catalog-rate-limiter.js");
  const { setCatalogRuntimeCacheForTests } = await import("../lib/catalog-runtime-cache.js");
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ data: { Page: { media: [{ id: 456 }] } } }), { status: 200 });
  };
  setAniListRedisClientForTests({
    async get() { throw new Error("Redis unavailable"); },
    async set() { throw new Error("Redis unavailable"); },
  });
  setCatalogRuntimeCacheForTests({ async get() { return null; }, async set() {} });
  clearAniListRateLimitState();
  try {
    const result = await queryAnime({ season: { season: "FALL", year: 2026 }, sort: ["ID"] }, 1, "unavailable");
    assert.deepEqual(result, [{ id: 456 }]);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    setAniListRedisClientForTests(null);
    setCatalogRuntimeCacheForTests(null);
    clearAniListRateLimitState();
  }
});
