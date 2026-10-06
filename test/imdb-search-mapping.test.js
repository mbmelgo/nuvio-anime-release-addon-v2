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
      if (title === "tt7441658") {
        return new Response(JSON.stringify({
          d: [{ id: "tt7441658", l: "Black Clover", y: 2017, q: "tvSeries" }],
        }), { status: 200 });
      }
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

test("IMDb fallback rejects stopword-heavy false matches such as Dust of the Simulacrum vs Daughters of the Dust", async () => {
  clearImdbSearchCache();
  const result = await resolveAniListMappingsByImdbSearch([{
    id: 214070,
    format: "MOVIE",
    startDate: { year: 2026 },
    title: { english: "Dust of the Simulacrum", romaji: "Dust of the Simulacrum", native: "砂塵ノ中デ" },
    synonyms: [],
  }], {
    endpoint: "https://example.test/suggestion/x/",
    fetchImpl: async () => new Response(JSON.stringify({
      d: [{
        id: "tt0104057",
        l: "Daughters of the Dust",
        y: 1991,
        q: "feature",
      }],
    }), { status: 200 }),
  });

  assert.equal(result.has(214070), false);
});


test("IMDb fallback rejects a stale canonical ID even when the search payload falsely matches Dust of the Simulacrum", async () => {
  clearImdbSearchCache();
  const result = await resolveAniListMappingsByImdbSearch([{
    id: 214070,
    format: "MOVIE",
    startDate: { year: 2026 },
    title: { english: "Dust of the Simulacrum", romaji: "Dust of the Simulacrum", native: "砂塵ノ中デ" },
    synonyms: [],
  }], {
    endpoint: "https://example.test/suggestion/x/",
    fetchImpl: async (url) => {
      if (url.endsWith("/tt0104057.json")) {
        return new Response(JSON.stringify({
          d: [{ id: "tt0104057", l: "Daughters of the Dust", y: 1991, q: "feature" }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        d: [{ id: "tt0104057", l: "Dust of the Simulacrum", y: 2026, q: "feature" }],
      }), { status: 200 });
    },
  });

  assert.equal(result.has(214070), false);
});

test("IMDb fallback rejects a stale canonical ID when the search payload reports the 2026 Rusuban", async () => {
  clearImdbSearchCache();
  const result = await resolveAniListMappingsByImdbSearch([{
    id: 213908,
    format: "MOVIE",
    startDate: { year: 2026 },
    title: { english: "Rusuban", romaji: "Rusuban", native: "るすばん" },
    synonyms: [],
  }], {
    endpoint: "https://example.test/suggestion/x/",
    fetchImpl: async (url) => {
      if (url.endsWith("/tt2124031.json")) {
        return new Response(JSON.stringify({
          d: [{ id: "tt2124031", l: "Rusuban", y: 1996, q: "short" }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        d: [{ id: "tt2124031", l: "Rusuban", y: 2026, q: "short" }],
      }), { status: 200 });
    },
  });

  assert.equal(result.has(213908), false);
});

test("IMDb fallback rejects a canonical ID whose title no longer matches Now That I Can Control Reality", async () => {
  clearImdbSearchCache();
  const result = await resolveAniListMappingsByImdbSearch([{
    id: 206774,
    format: "TV",
    startDate: { year: 2026 },
    title: {
      english: "Now That I Can Control Reality With A Mouse Cursor, I'm Gonna Click Away On The Girls!",
      romaji: "Mouse Cursor de Genjitsu wo Sousa Dekiru You ni Natta node, Onnanoko wo Ippai Click Shimasu",
      native: "マウスカーソルで現実を操作できるようになったので、女の子をいっぱいクリックしまーす",
    },
    synonyms: ["Click Me All Over"],
  }], {
    endpoint: "https://example.test/suggestion/x/",
    fetchImpl: async (url) => {
      if (url.endsWith("/tt37493643.json")) {
        return new Response(JSON.stringify({
          d: [{ id: "tt37493643", l: "Haim: All over me", y: 2025, q: "musicVideo" }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        d: [{
          id: "tt37493643",
          l: "Now That I Can Control Reality With A Mouse Cursor, I'm Gonna Click Away On The Girls!",
          y: 2026,
          q: "tvSeries",
        }],
      }), { status: 200 });
    },
  });

  assert.equal(result.has(206774), false);
});
