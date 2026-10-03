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
