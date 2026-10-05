import assert from "node:assert/strict";
import test from "node:test";
import { resolveAniListMappingsByTMDB } from "../lib/tmdb-mapping.js";

function mockFetch(routes) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    calls.push({ url: parsed.toString(), options });
    const key = parsed.pathname + (parsed.search ? parsed.search : "");
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

test("TMDB resolver accepts an exact TV title and upgrades to IMDb when available", async () => {
  const fetchImpl = mockFetch({
    "/3/search/tv?query=Bleach&first_air_date_year=2004&include_adult=false&language=en-US&page=1": {
      results: [{
        id: 30984,
        name: "Bleach",
        original_name: "Bleach",
        first_air_date: "2004-10-05",
        popularity: 100,
      }],
    },
    "/3/tv/30984/external_ids": {
      imdb_id: "tt0434665",
      tvdb_id: 74796,
    },
  });

  const mappings = await resolveAniListMappingsByTMDB([{
    id: 269,
    title: { english: "Bleach", romaji: "Bleach" },
    synonyms: [],
    format: "TV",
    startDate: { year: 2004 },
  }], { token: "test-token", fetchImpl });

  const record = mappings.get(269)?.[0];
  assert.equal(record.source, "tmdb-search");
  assert.equal(record.tmdbTvId, 30984);
  assert.deepEqual(record.imdbIds, ["tt0434665"]);
  assert.equal(record.tvdbId, 74796);
  assert.equal(record.title, "Bleach");
  assert.equal(record.year, 2004);
  assert.equal(record.tmdbMatchScore, 130);
  assert.equal(fetchImpl.calls.length, 2);
  assert.equal(fetchImpl.calls[0].options.headers.Authorization, "Bearer test-token");
});

test("TMDB resolver returns TMDB identity when the matched title has no IMDb ID", async () => {
  const fetchImpl = mockFetch({
    "/3/search/movie?query=Example%20Movie&first_air_date_year=2026&include_adult=false&language=en-US&page=1": {
      results: [{
        id: 991234,
        title: "Example Movie",
        original_title: "Example Movie",
        release_date: "2026-04-01",
      }],
    },
    "/3/movie/991234/external_ids": {
      imdb_id: null,
      tvdb_id: null,
    },
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

test("TMDB resolver does not accept an ambiguous close match", async () => {
  const fetchImpl = mockFetch({
    "/3/search/tv?query=Example&first_air_date_year=2026&include_adult=false&language=en-US&page=1": {
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
    "/3/search/tv?query=Shingeki%20no%20Kyojin&first_air_date_year=2013&include_adult=false&language=en-US&page=1": {
      results: [],
    },
    "/3/search/tv?query=Attack%20on%20Titan&first_air_date_year=2013&include_adult=false&language=en-US&page=1": {
      results: [{
        id: 1429,
        name: "Attack on Titan",
        original_name: "進撃の巨人",
        first_air_date: "2013-04-07",
      }],
    },
    "/3/tv/1429/external_ids": {
      imdb_id: "tt2560140",
      tvdb_id: 267440,
    },
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
  assert.equal(fetchImpl.calls.length, 3);
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
