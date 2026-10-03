import assert from "node:assert/strict";
import test from "node:test";
import { resolveAniListMappingsByImdbSearch } from "../lib/imdb-search-mapping.js";

test("IMDb search tries AniList synonym and numeric title variants", async () => {
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
