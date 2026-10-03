import assert from "node:assert/strict";
import test from "node:test";
import { clearImdbSearchCache, resolveAniListMappingsByImdbSearch } from "../lib/imdb-search-mapping.js";

test("IMDb fallback selects a title-compatible, year-compatible IMDb result", async () => {
  clearImdbSearchCache();
  const result = await resolveAniListMappingsByImdbSearch([{
    id: 123,
    idMal: 456,
    format: "TV",
    startDate: { year: 2026 },
    title: { english: "Another Example Anime", romaji: "Another Example Anime", native: "例" },
    synonyms: [],
  }], {
    endpoint: "https://example.test/suggestion/x/",
    fetchImpl: async () => new Response(JSON.stringify({
      d: [
        { id: "tt9999999", l: "Unrelated Title", y: 2026 },
        { id: "tt1234567", l: "Another Example Anime", y: 2026 },
        { id: "tt7654321", l: "Another Example Anime", y: 2020 },
      ],
    }), { status: 200 }),
  });

  assert.equal(result.get(123)?.[0]?.imdbIds[0], "tt1234567");
  assert.equal(result.get(123)?.[0]?.anilistId, 123);
});

test("IMDb fallback does not invent a mapping for incompatible search results", async () => {
  const result = await resolveAniListMappingsByImdbSearch([{
    id: 123,
    format: "TV",
    startDate: { year: 2026 },
    title: { english: "Another Example Anime", romaji: "Another Example Anime", native: "例" },
  }], {
    endpoint: "https://example.test/suggestion/x/",
    fetchImpl: async () => new Response(JSON.stringify({
      d: [{ id: "tt9999999", l: "Completely Different", y: 2026 }],
    }), { status: 200 }),
  });

  assert.equal(result.has(123), false);
});
