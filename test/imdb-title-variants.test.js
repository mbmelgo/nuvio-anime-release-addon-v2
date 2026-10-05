import assert from "node:assert/strict";
import test from "node:test";
import { buildImdbSearchTitles, clearImdbSearchCache, resolveAniListMappingsByImdbSearch } from "../lib/imdb-search-mapping.js";

test("IMDb search tries AniList synonym and numeric title variants", async () => {
  clearImdbSearchCache();
  const requested = [];
  const fetchImpl = async (url) => {
    const title = decodeURIComponent(String(url).split("/").pop().replace(/\.json$/, ""));
    requested.push(title);
    if (title !== "Norman the Snowman 3") {
      return { ok: true, json: async () => ({ d: [] }) };
    }
    return {
      ok: true,
      json: async () => ({
        d: [{ id: "tt32547691", l: "Norman the Snowman: Kodomo-tachi no Hitotsuboshi", y: 2026 }],
      }),
    };
  };

  const result = await resolveAniListMappingsByImdbSearch([{
    id: 205289,
    idMal: 63221,
    format: "MOVIE",
    startDate: { year: 2026 },
    title: {
      english: null,
      romaji: "Norman the Snowman: Kodomo-tachi no Hitotsuboshi",
      native: "ノーマン・ザ・スノーマン ~こどもたちのひとつ星~",
    },
    synonyms: ["Norman the Snowman 3"],
    relations: { edges: [] },
  }], { fetchImpl });

  assert.ok(requested.includes("Norman the Snowman 3"));
  assert.equal(result.get(205289)?.[0]?.imdbIds?.[0], "tt32547691");
  assert.equal(result.get(205289)?.[0]?.source, "imdb-search");
});


test("IMDb search derives constrained installment aliases", async () => {
  clearImdbSearchCache();
  const titles = buildImdbSearchTitles({
    title: { romaji: "Kidou Keisatsu Patlabor EZY File 3", english: null, native: null },
    synonyms: ["パトレイバー EZY File 3"],
  });
  assert.ok(titles.some((item) => item.title === "Patlabor EZY File 3" && item.derived === true));
  const requested = [];
  const fetchImpl = async (url) => {
    const title = decodeURIComponent(String(url).split("/").pop().replace(/\.json$/, ""));
    requested.push(title);
    if (title !== "Patlabor EZY File 3") return { ok: true, json: async () => ({ d: [] }) };
    return {
      ok: true,
      json: async () => ({
        d: [{ id: "tt39382762", l: "Patlabor EZY: File 3", y: 2027 }],
      }),
    };
  };

  const result = await resolveAniListMappingsByImdbSearch([{
    id: 212653,
    format: "OVA",
    startDate: { year: 2027 },
    title: {
      english: null,
      romaji: "Kidou Keisatsu Patlabor EZY File 3",
      native: "機動警察パトレイバー EZY File 3",
    },
    synonyms: ["パトレイバー EZY File 3"],
    relations: { edges: [] },
  }], { fetchImpl });

  assert.equal(result.get(212653)?.[0]?.imdbIds?.[0], "tt39382762");
  assert.equal(result.get(212653)?.[0]?.derivedTitle, true);
});


test("IMDb search accepts one-word franchise bases for derived installments", async () => {
  clearImdbSearchCache();
  const cases = [
    { id: 1, title: "MARRIAGETOXIN 2nd Season", candidate: "Marriagetoxin", imdb: "tt39122769" },
    { id: 2, title: "GelPiyo 2", candidate: "GelPiyo", imdb: "tt00000002" },
    { id: 3, title: "PokéOki SEASON 2", candidate: "PokéOki", imdb: "tt00000003" },
  ];

  for (const item of cases) {
    const requested = [];
    const base = item.title.replace(/\s*(?:\d+(?:st|nd|rd|th)?\s*Season|Season\s*\d+|\d+(?:st|nd|rd|th)?)$/i, "").trim();
    const fetchImpl = async (url) => {
      const title = decodeURIComponent(String(url).split("/").pop().replace(/\.json$/, ""));
      requested.push(title);
      if (title !== base) return { ok: true, json: async () => ({ d: [] }) };
      return { ok: true, json: async () => ({ d: [{ id: item.imdb, l: item.candidate, y: 2026 }] }) };
    };

    const result = await resolveAniListMappingsByImdbSearch([{
      id: item.id,
      format: "TV",
      startDate: { year: 2026 },
      title: { english: item.title, romaji: item.title, native: null },
      synonyms: [],
      relations: { edges: [] },
    }], { fetchImpl });

    assert.ok(requested.includes(base));
    assert.equal(result.get(item.id)?.[0]?.imdbIds?.[0], item.imdb);
    assert.equal(result.get(item.id)?.[0]?.derivedTitle, true);
  }
});

test("IMDb derived one-word matching does not accept an unrelated one-word title", async () => {
  clearImdbSearchCache();
  const fetchImpl = async (url) => {
    const title = decodeURIComponent(String(url).split("/").pop().replace(/\.json$/, ""));
    if (title !== "Dragon") return { ok: true, json: async () => ({ d: [] }) };
    return { ok: true, json: async () => ({ d: [{ id: "tt99999999", l: "Dragon", y: 2026 }] }) };
  };

  const result = await resolveAniListMappingsByImdbSearch([{
    id: 4,
    format: "TV",
    startDate: { year: 2026 },
    title: { english: "Dragon Quest 2", romaji: "Dragon Quest 2", native: null },
    synonyms: [],
    relations: { edges: [] },
  }], { fetchImpl });

  assert.equal(result.get(4), undefined);
});

test("IMDb search derives parenthetical year suffixes", async () => {
  clearImdbSearchCache();
  const requested = [];
  const fetchImpl = async (url) => {
    const title = decodeURIComponent(String(url).split("/").pop().replace(/\.json$/, ""));
    requested.push(title);
    if (title !== "POKÉTOON") return { ok: true, json: async () => ({ d: [] }) };
    return { ok: true, json: async () => ({ d: [{ id: "tt12471116", l: "Pokétoon", y: 2020 }] }) };
  };

  const result = await resolveAniListMappingsByImdbSearch([{
    id: 5,
    format: "TV",
    startDate: { year: 2026 },
    title: { english: "POKÉTOON (2026)", romaji: "POKÉTOON (2026)", native: null },
    synonyms: [],
    relations: { edges: [] },
  }], { fetchImpl });

  assert.ok(requested.includes("POKÉTOON"));
  assert.equal(result.get(5)?.[0]?.imdbIds?.[0], "tt12471116");
  assert.equal(result.get(5)?.[0]?.derivedTitle, true);
});
