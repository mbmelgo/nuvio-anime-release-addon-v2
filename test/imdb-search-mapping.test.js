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

test("IMDb fallback resolves a two-token derived base title for Black Clover Season 2", async () => {
  clearImdbSearchCache();
  const result = await resolveAniListMappingsByImdbSearch([{
    id: 195604,
    idMal: 61967,
    format: "TV",
    startDate: { year: 2026 },
    title: { english: "Black Clover Season 2", romaji: "Black Clover 2nd Season", native: "ブラッククローバー 第2期" },
    synonyms: [],
  }], {
    endpoint: "https://example.test/suggestion/x/",
    fetchImpl: async (url) => {
      const title = decodeURIComponent(url.split("/").pop().replace(/\.json$/, ""));
      if (title !== "Black Clover") {
        return new Response(JSON.stringify({ d: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({
        d: [
          { id: "tt22868844", l: "Black Clover: Sword of the Wizard King", y: 2023, q: "feature" },
          { id: "tt7441658", l: "Black Clover", y: 2017, q: "tvSeries" },
        ],
      }), { status: 200 });
    },
  });

  assert.equal(result.get(195604)?.[0]?.imdbIds[0], "tt7441658");
  assert.equal(result.get(195604)?.[0]?.derivedTitle, true);
  assert.equal(result.get(195604)?.[0]?.year, null);
});

test("IMDb fallback does not invent a mapping for incompatible search results", async () => {
  clearImdbSearchCache();
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
