import assert from "node:assert/strict";
import test from "node:test";
import { resolveAniListMappingsByTMDB, resetTMDBMappingCache } from "../lib/tmdb-mapping.js";

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
            name: `Anime ${id}`,
            original_name: `Anime ${id}`,
            first_air_date: "2026-01-01",
          }],
        };
      },
    };
  };

  const rows = Array.from({ length: 12 }, (_, index) => ({
    id: 9000 + index,
    title: { english: `Anime ${9000 + index}` },
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
