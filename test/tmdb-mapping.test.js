import assert from "node:assert/strict";
import test from "node:test";
import { resolveAniListMappingsByTMDB, resetTMDBMappingCache, selectTMDBIdentity } from "../lib/tmdb-mapping.js";

function mockFetch(routes) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    calls.push({ url: parsed.toString(), options });
    const params = [...parsed.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    const key = parsed.pathname + (params.length ? "?" + new URLSearchParams(params).toString() : "");
    const route = routes[key];
    if (!route) throw new Error(`Unexpected TMDB request: ${key}`);
    return {
      ok: true,
      status: 200,
      async json() { return typeof route === "function" ? route(parsed) : route; },
    };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

test.beforeEach(() => resetTMDBMappingCache());

test("TMDB resolver accepts an exact TV title and upgrades to IMDb when available", async () => {
  const fetchImpl = mockFetch({
    "/3/search/tv?include_adult=false&language=en-US&page=1&query=Bleach": {
      results: [{ id: 30984, name: "Bleach", original_name: "Bleach", first_air_date: "2004-10-05" }],
    },
    "/3/tv/30984/external_ids": { imdb_id: "tt0434665", tvdb_id: 74796 },
  });

  const mappings = await resolveAniListMappingsByTMDB([{
    id: 269,
    title: { english: "Bleach", romaji: "Bleach" },
    format: "TV",
    startDate: { year: 2004 },
  }], { token: "test-token", fetchImpl });

  const record = mappings.get(269)?.[0];
  assert.equal(record.source, "tmdb-search");
  assert.equal(record.tmdbTvId, 30984);
  assert.deepEqual(record.imdbIds, ["tt0434665"]);
  assert.equal(record.tvdbId, 74796);
  assert.equal(record.tmdbMatchScore, 130);
  assert.equal(fetchImpl.calls.length, 2);
  assert.equal(fetchImpl.calls[0].options.headers.Authorization, "Bearer test-token");
});

test("TMDB resolver caps concurrent row resolution", async () => {
  let active = 0;
  let maxActive = 0;

  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active -= 1;

    const id = Number(parsed.searchParams.get("query").split("-").at(-1));
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          results: [{
            id,
            name: `Anime-${id}`,
            original_name: `Anime-${id}`,
            first_air_date: "2026-01-01",
          }],
        };
      },
    };
  };

  const rows = Array.from({ length: 12 }, (_, index) => ({
    id: 9000 + index,
    title: { english: `Anime-${9000 + index}` },
    format: "TV",
    startDate: { year: 2026 },
    externalLinks: [{ site: "IMDb", url: `https://www.imdb.com/title/tt${9000000 + index}/` }],
  }));

  const mappings = await resolveAniListMappingsByTMDB(rows, {
    token: "test-token",
    fetchImpl,
    concurrency: 4,
  });

  assert.equal(mappings.size, rows.length);
  assert.ok(maxActive <= 4);
  assert.equal(maxActive, 4);
});

test("TMDB resolver returns TMDB identity when the matched title has no IMDb ID", async () => {
  const fetchImpl = mockFetch({
    "/3/search/movie?include_adult=false&language=en-US&page=1&query=Example+Movie": {
      results: [{ id: 991234, title: "Example Movie", original_title: "Example Movie", release_date: "2026-04-01" }],
    },
    "/3/movie/991234/external_ids": { imdb_id: null, tvdb_id: null },
  });

  const mappings = await resolveAniListMappingsByTMDB([{
    id: 123,
    title: { english: "Example Movie" },
    format: "MOVIE",
    startDate: { year: 2026 },
  }], { token: "test-token", fetchImpl });

  const record = mappings.get(123)?.[0];
  assert.equal(record.tmdbMovieIds[0], 991234);
  assert.deepEqual(record.imdbIds, []);
  assert.equal(record.type, "MOVIE");
  assert.equal(record.tmdbMatchScore, 130);
});

test("TMDB resolver does not prefilter an exact title by AniList start year", async () => {
  const fetchImpl = mockFetch({
    "/3/search/tv?include_adult=false&language=en-US&page=1&query=Future+Example": {
      results: [{ id: 777, name: "Future Example", original_name: "Future Example", first_air_date: "2026-01-01" }],
    },
    "/3/tv/777/external_ids": { imdb_id: "tt7777777", tvdb_id: 777777 },
  });

  const mappings = await resolveAniListMappingsByTMDB([{
    id: 7777,
    title: { english: "Future Example" },
    format: "TV",
    startDate: { year: 2027 },
  }], { token: "test-token", fetchImpl });

  const record = mappings.get(7777)?.[0];
  assert.equal(record.tmdbTvId, 777);
  assert.deepEqual(record.imdbIds, ["tt7777777"]);
  assert.equal(record.tmdbMatchScore, 115);
  assert.equal(fetchImpl.calls[0].url.includes("first_air_date_year"), false);
});

test("TMDB resolver does not accept an ambiguous close match", async () => {
  const fetchImpl = mockFetch({
    "/3/search/tv?include_adult=false&language=en-US&page=1&query=Example": {
      results: [
        { id: 1, name: "Example", original_name: "Example", first_air_date: "2026-01-01" },
        { id: 2, name: "Example", original_name: "Example", first_air_date: "2026-01-02" },
      ],
    },
  });

  const mappings = await resolveAniListMappingsByTMDB([{
    id: 456,
    title: { english: "Example" },
    format: "TV",
    startDate: { year: 2026 },
  }], { token: "test-token", fetchImpl });

  assert.equal(mappings.has(456), false);
  assert.equal(fetchImpl.calls.length, 1);
});

test("TMDB resolver uses alternate AniList titles when the primary title is absent", async () => {
  const fetchImpl = mockFetch({
    "/3/search/tv?include_adult=false&language=en-US&page=1&query=Shingeki+no+Kyojin": { results: [] },
    "/3/search/tv?include_adult=false&language=en-US&page=1&query=Attack+on+Titan": {
      results: [{ id: 1429, name: "Attack on Titan", original_name: "進撃の巨人", first_air_date: "2013-04-07" }],
    },
    "/3/tv/1429/external_ids": { imdb_id: "tt2560140", tvdb_id: 267440 },
  });

  const mappings = await resolveAniListMappingsByTMDB([{
    id: 16498,
    title: { romaji: "Shingeki no Kyojin", english: "Attack on Titan", native: "進撃の巨人" },
    format: "TV",
    startDate: { year: 2013 },
  }], { token: "test-token", fetchImpl });

  const record = mappings.get(16498)?.[0];
  assert.equal(record.tmdbTvId, 1429);
  assert.deepEqual(record.imdbIds, ["tt2560140"]);
  assert.equal(fetchImpl.calls.length, 2);
});

test("TMDB resolver is a no-op when the application token is unavailable", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error("network must not be called"); };
  const mappings = await resolveAniListMappingsByTMDB([{
    id: 1,
    title: { english: "Anything" },
    format: "TV",
  }], { token: "", fetchImpl });
  assert.equal(mappings.size, 0);
  assert.equal(calls, 0);
});

test("TMDB resolver reuses an AniList IMDb link instead of making an external-ID request", async () => {
  const fetchImpl = mockFetch({
    "/3/search/tv?include_adult=false&language=en-US&page=1&query=Example+Series": {
      results: [{ id: 700, name: "Example Series", original_name: "Example Series", first_air_date: "2020-01-01" }],
    },
  });

  const mappings = await resolveAniListMappingsByTMDB([{
    id: 7000,
    title: { english: "Example Series" },
    format: "TV",
    startDate: { year: 2020 },
    externalLinks: [{ site: "IMDb", url: "https://www.imdb.com/title/tt1234567/" }],
  }], { token: "test-token", fetchImpl });

  assert.deepEqual(mappings.get(7000)?.[0]?.imdbIds, ["tt1234567"]);
  assert.equal(fetchImpl.calls.length, 1);
});


test("TMDB resolver bounds the total fallback wait when the upstream stalls", async () => {
  resetTMDBMappingCache();
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return new Promise(() => {}); };
  const startedAt = Date.now();
  const result = await Promise.race([
    resolveAniListMappingsByTMDB([{ id: 991001, format: "TV", title: { english: "Slow Provider Test" }, startDate: { year: 2026 } }], { token: "test-token", fetchImpl, timeoutMs: 30 }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("TMDB fallback exceeded its total time budget")), 250)),
  ]);
  assert.deepEqual([...result], []);
  assert.ok(Date.now() - startedAt < 250);
  assert.equal(calls, 1);
});


test("TMDB resolver deadline also bounds a stalled response body", async () => {
  resetTMDBMappingCache();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, json: () => new Promise(() => {}) };
  };
  const startedAt = Date.now();
  const result = await Promise.race([
    resolveAniListMappingsByTMDB([{ id: 991002, format: "TV", title: { english: "Slow Body Test" }, startDate: { year: 2026 } }], { token: "test-token", fetchImpl, timeoutMs: 30 }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("TMDB response body exceeded its total time budget")), 250)),
  ]);
  assert.deepEqual([...result], []);
  assert.ok(Date.now() - startedAt < 250);
  assert.equal(calls, 1);
});


test("TMDB row timeout does not prevent later rows from being resolved", async () => {
  resetTMDBMappingCache();
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return new Promise(() => {}); };
  const result = await Promise.race([
    resolveAniListMappingsByTMDB([
      { id: 991003, format: "TV", title: { english: "First Stalled Row" }, startDate: { year: 2026 } },
      { id: 991004, format: "TV", title: { english: "Second Stalled Row" }, startDate: { year: 2026 } },
    ], { token: "test-token", fetchImpl, timeoutMs: 30, concurrency: 1 }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("TMDB row queue stopped progressing")), 250)),
  ]);
  assert.deepEqual([...result], []);
  assert.equal(calls, 2);
});


test("TMDB resolver uses a bounded 12-worker default for cold batches", async () => {
  let active = 0;
  let maxActive = 0;
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active -= 1;
    const title = parsed.searchParams.get("query");
    return { ok: true, status: 200, async json() { return { results: [{ id: 880001, name: title, original_name: title, first_air_date: "2026-01-01" }] }; } };
  };
  const rows = Array.from({ length: 16 }, (_, index) => ({ id: 880000 + index, title: { english: `Cold Batch ${index}` }, format: "TV", startDate: { year: 2026 }, externalLinks: [{ site: "IMDb", url: `https://www.imdb.com/title/tt${8800000 + index}/` }] }));
  const mappings = await resolveAniListMappingsByTMDB(rows, { token: "test-token", fetchImpl });
  assert.equal(mappings.size, rows.length);
  assert.equal(maxActive, 12);
  assert.ok(maxActive <= 12);
});


test("TMDB resolver reports bounded aggregate diagnostics without exposing row identities", async () => {
  const stats = {};
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    const query = parsed.searchParams.get("query");
    if (query === "Rate Limited") return { ok: false, status: 429, async json() { return {}; } };
    if (query === "No Match") return { ok: true, status: 200, async json() { return { results: [] }; } };
    return {
      ok: true,
      status: 200,
      async json() {
        return { results: [{ id: 880001, name: "Found Anime", original_name: "Found Anime", first_air_date: "2026-01-01" }] };
      },
    };
  };
  const mappings = await resolveAniListMappingsByTMDB([
    { id: 880001, title: { english: "Found Anime" }, format: "TV", startDate: { year: 2026 }, externalLinks: [{ site: "IMDb", url: "https://www.imdb.com/title/tt8800001/" }] },
    { id: 880002, title: { english: "No Match" }, format: "TV", startDate: { year: 2026 } },
    { id: 880003, title: { english: "Rate Limited" }, format: "TV", startDate: { year: 2026 } },
  ], { token: "test-token", fetchImpl, concurrency: 1, diagnostics: stats });

  assert.equal(mappings.size, 1);
  assert.deepEqual(stats, {
    rowsRequested: 3,
    rowsStarted: 3,
    rowsResolved: 1,
    rowsNoMatch: 1,
    rowsSkippedDeadline: 0,
    rowsSkippedUnavailable: 0,
    invalidRows: 0,
    rowErrors: 1,
    httpErrors: 1,
    http429Errors: 1,
    timeouts: 0,
    rowsDeadlineExhausted: 0,
  });
  assert.equal(JSON.stringify(stats).includes("880001"), false);
});

test("TMDB resolver enforces a shared deadline across the whole batch", async () => {
  resetTMDBMappingCache();
  const callTimes = [];
  const fetchImpl = async () => {
    callTimes.push(Date.now());
    return new Promise(() => {});
  };
  const rows = Array.from({ length: 12 }, (_, index) => ({
    id: 992000 + index,
    format: "TV",
    title: { english: `Batch Deadline ${index}` },
    startDate: { year: 2026 },
  }));
  const stats = {};
  const startedAt = Date.now();
  const deadlineAt = startedAt + 60;
  const result = await Promise.race([
    resolveAniListMappingsByTMDB(rows, {
      token: "test-token",
      fetchImpl,
      concurrency: 2,
      timeoutMs: 1000,
      resolverTimeoutMs: 1000,
      resolverDeadlineAt: deadlineAt,
      diagnostics: stats,
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("TMDB batch exceeded its shared time budget")), 250)),
  ]);
  assert.deepEqual([...result], []);
  assert.ok(Date.now() - startedAt < 250);
  assert.ok(callTimes.every((time) => time < deadlineAt), "no row may start after the shared deadline");
  assert.equal(stats.rowsRequested, 12);
  assert.equal(stats.rowsStarted + stats.rowsSkippedDeadline + stats.invalidRows, stats.rowsRequested);
  assert.ok(stats.rowsDeadlineExhausted > 0);
  assert.ok(stats.timeouts > 0);
});


test("TMDB resolver honors a shared absolute deadline across batches", async () => {
  resetTMDBMappingCache();
  const callTimes = [];
  const fetchImpl = async () => {
    callTimes.push(Date.now());
    return new Promise(() => {});
  };
  const rows = Array.from({ length: 12 }, (_, index) => ({
    id: 993000 + index,
    format: "TV",
    title: { english: `Shared Absolute Deadline ${index}` },
    startDate: { year: 2026 },
  }));
  const startedAt = Date.now();
  const deadlineAt = startedAt + 60;
  const result = await Promise.race([
    resolveAniListMappingsByTMDB(rows, {
      token: "test-token",
      fetchImpl,
      concurrency: 2,
      timeoutMs: 1000,
      resolverTimeoutMs: 1000,
      resolverDeadlineAt: deadlineAt,
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("TMDB resolver exceeded the shared absolute deadline")), 250)),
  ]);
  assert.deepEqual([...result], []);
  assert.ok(Date.now() - startedAt < 250);
  assert.ok(callTimes.every((time) => time < deadlineAt), "no row may start after the shared absolute deadline");
});

test("TMDB resolver verifies a sequel as a season of a related TMDB series", async () => {
  const fetchImpl = mockFetch({
    "/3/search/tv?include_adult=false&language=en-US&page=1&query=The+Prince+of+Tennis+II+U-17+WORLD+CUP%3A+Final+Member+Selection+Match": { results: [] },
    "/3/search/tv?include_adult=false&language=en-US&page=1&query=Final+Member+Selection+Match": { results: [] },
    "/3/tv/205493?language=en-US": {
      id: 205493,
      seasons: [
        { season_number: 1, name: "The Prince of Tennis II: U-17 World Cup", air_date: "2022-07-06" },
        { season_number: 2, name: "SEMIFINAL", air_date: "2024-10-02" },
        { season_number: 3, name: "Final Member Selection Match", air_date: "2026-10-01" },
      ],
    },
  });

  const mappings = await resolveAniListMappingsByTMDB([{
    id: 199068,
    title: { english: "The Prince of Tennis II U-17 WORLD CUP: Final Member Selection Match" },
    format: "TV",
    startDate: { year: 2026 },
    relations: {
      edges: [{
        relationType: "PREQUEL",
        node: {
          externalLinks: [{
            site: "The Movie Database",
            url: "https://www.themoviedb.org/tv/205493-shin-tennis-no-ouji-sama-u-17-world-cup",
          }],
        },
      }],
    },
  }], { token: "test-token", fetchImpl });

  const record = mappings.get(199068)?.[0];
  assert.equal(record.source, "tmdb-season-verified");
  assert.equal(record.tmdbTvId, 205493);
  assert.equal(record.tmdbSeasonVerified, true);
  assert.equal(record.tmdbSeasonNumber, 3);
  assert.equal(selectTMDBIdentity({
    id: 199068,
    format: "TV",
    title: { english: "The Prince of Tennis II U-17 WORLD CUP: Final Member Selection Match" },
    startDate: { year: 2026 },
  }, [record])?.id, "205493");
  assert.deepEqual(record.imdbIds, []);
  assert.equal(fetchImpl.calls.length, 2);
});

test("TMDB resolver does not treat a related series as a season without a matching title", async () => {
  const fetchImpl = mockFetch({
    "/3/search/tv?include_adult=false&language=en-US&page=1&query=Unrelated+Sequel": { results: [] },
    "/3/tv/205493?language=en-US": {
      id: 205493,
      seasons: [
        { season_number: 1, name: "The Prince of Tennis II: U-17 World Cup", air_date: "2022-07-06" },
        { season_number: 2, name: "SEMIFINAL", air_date: "2024-10-02" },
      ],
    },
  });

  const mappings = await resolveAniListMappingsByTMDB([{
    id: 199069,
    title: { english: "Unrelated Sequel" },
    format: "TV",
    startDate: { year: 2026 },
    relations: {
      edges: [{
        relationType: "PREQUEL",
        node: {
          externalLinks: [{
            site: "The Movie Database",
            url: "https://www.themoviedb.org/tv/205493-shin-tennis-no-ouji-sama-u-17-world-cup",
          }],
        },
      }],
    },
  }], { token: "test-token", fetchImpl });

  assert.equal(mappings.has(199069), false);
});

test("TMDB resolver discovers a shared series through a related title when AniList has no TMDB relation link", async () => {
  const fetchImpl = mockFetch({
    "/3/search/tv?include_adult=false&language=en-US&page=1&query=The+Prince+of+Tennis+II+U-17+WORLD+CUP%3A+Final+Member+Selection+Match": { results: [] },
    "/3/search/tv?include_adult=false&language=en-US&page=1&query=Final+Member+Selection+Match": { results: [] },
    "/3/search/tv?include_adult=false&language=en-US&page=1&query=the+prince+of+tennis+ii+u+17+world+cup+semifinal": {
      results: [{ id: 205493, name: "The Prince of Tennis II: U-17 World Cup", original_name: "Shin Tennis no Ouji-sama: U-17 WORLD CUP", first_air_date: "2022-07-06" }],
    },
    "/3/tv/205493?language=en-US": {
      id: 205493,
      seasons: [
        { season_number: 1, name: "The Prince of Tennis II: U-17 World Cup", air_date: "2022-07-06" },
        { season_number: 2, name: "SEMIFINAL", air_date: "2024-10-02" },
        { season_number: 3, name: "Final Member Selection Match", air_date: "2026-10-01" },
      ],
    },
  });

  const mappings = await resolveAniListMappingsByTMDB([{
    id: 199068,
    title: { english: "The Prince of Tennis II U-17 WORLD CUP: Final Member Selection Match" },
    synonyms: ["Final Member Selection Match"],
    format: "TV",
    startDate: { year: 2026 },
    relations: {
      edges: [{
        relationType: "PREQUEL",
        node: {
          title: {
            english: "The Prince of Tennis II U-17 World Cup Semifinal",
            romaji: "Shin Tennis no Ouji-sama: U-17 WORLD CUP SEMIFINAL",
          },
          externalLinks: [{ site: "Official Site", url: "https://tenipuri.jp/u17/" }],
        },
      }],
    },
  }], { token: "test-token", fetchImpl });

  const record = mappings.get(199068)?.[0];
  assert.equal(record?.source, "tmdb-season-verified");
  assert.equal(record?.tmdbTvId, 205493);
  assert.equal(record?.tmdbSeasonNumber, 3);
});

test("TMDB resolver rejects a season-title subset when the season year disagrees", async () => {
  const fetchImpl = mockFetch({
    "/3/search/tv?include_adult=false&language=en-US&page=1&query=The+Prince+of+Tennis+II+U-17+WORLD+CUP%3A+Final+Member+Selection+Match": { results: [] },
    "/3/search/tv?include_adult=false&language=en-US&page=1&query=Final+Member+Selection+Match": { results: [] },
    "/3/search/tv?include_adult=false&language=en-US&page=1&query=the+prince+of+tennis+ii+u+17+world+cup+semifinal": {
      results: [{ id: 205493, name: "The Prince of Tennis II: U-17 World Cup", original_name: "Shin Tennis no Ouji-sama: U-17 WORLD CUP", first_air_date: "2022-07-06" }],
    },
    "/3/tv/205493?language=en-US": {
      id: 205493,
      seasons: [
        { season_number: 3, name: "Final Member Selection Match", air_date: "2024-10-01" },
      ],
    },
  });

  const mappings = await resolveAniListMappingsByTMDB([{
    id: 199070,
    title: { english: "The Prince of Tennis II U-17 WORLD CUP: Final Member Selection Match" },
    format: "TV",
    startDate: { year: 2026 },
    relations: {
      edges: [{
        relationType: "PREQUEL",
        node: {
          title: { english: "The Prince of Tennis II U-17 World Cup Semifinal" },
          externalLinks: [{ site: "Official Site", url: "https://tenipuri.jp/u17/" }],
        },
      }],
    },
  }], { token: "test-token", fetchImpl });

  assert.equal(mappings.has(199070), false);
});
