import test from "node:test";
import assert from "node:assert/strict";
import { queryAnime, queryAiringSchedulePage } from "../lib/catalog-anilist.js";

test("catalog AniList queries request all seasonal anime formats without a status filter", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return new Response(JSON.stringify({ data: { Page: { media: [] } } }), { status: 200 });
  };

  try {
    await queryAnime({ season: { season: "FALL", year: 2026 }, sort: ["ID"] }, 1, "", { includeMalId: true });
    assert.equal(request.variables.page, 1);
    assert.equal(request.variables.season, "FALL");
    assert.equal(request.variables.seasonYear, 2026);
    assert.equal(request.variables.sort[0], "ID");
    assert.equal(Object.hasOwn(request.variables, "status"), false);
    assert.match(request.query, /format_in:\[TV,TV_SHORT,ONA,OVA,SPECIAL,MOVIE\]/);
    assert.doesNotMatch(request.query, /status:\$status/);
    assert.match(request.query, /perPage:50/);
    assert.match(request.query, /isAdult:false/);
    assert.match(request.query, /idMal/);
    assert.match(request.query, /countryOfOrigin/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("catalog AniList queries omit optional MAL id field only when explicitly disabled", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return new Response(JSON.stringify({ data: { Page: { media: [] } } }), { status: 200 });
  };

  try {
    await queryAnime({ season: { season: "FALL", year: 2026 }, sort: ["ID"] }, 1, "", { includeMalId: false });
    assert.doesNotMatch(request.query, /idMal/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("catalog AniList queries request 50 media rows with only fields needed to render Nuvio previews", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return new Response(JSON.stringify({
      data: {
        Page: {
          media: [{
            id: 166254,
            idMal: 1662540,
            title: { english: "Pokémon Horizons", romaji: "Pokemon Horizons", native: "ポケットモンスター" },
            coverImage: { large: "https://example.test/pokemon.jpg" },
            status: "RELEASING",
            startDate: { year: 2026, month: 4, day: 11 },
            endDate: { year: null },
            genres: ["Action", "Adventure"],
          }],
        },
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const filter = { season: { season: "FALL", year: 2026 }, sort: ["ID"] };
    const result = await queryAnime(filter, 2, "Pokémon Horizons", { includeMalId: true });
    assert.equal(result[0].idMal, 1662540);
    assert.equal(request.variables.page, 2);
    assert.equal(request.variables.search, "Pokémon Horizons");
    assert.deepEqual(request.variables.sort, ["ID"]);
    assert.match(request.query, /perPage:50/);
    assert.match(request.query, /\bid\b/);
    assert.match(request.query, /title\s*\{/);
    assert.match(request.query, /coverImage\s*\{/);
    assert.match(request.query, /status/);
    assert.match(request.query, /startDate\s*\{/);
    assert.match(request.query, /endDate\s*\{/);
    assert.match(request.query, /genres/);
    assert.match(request.query, /idMal/);
    assert.match(request.query, /node\s*\{[\s\S]*externalLinks\s*\{\s*site url\s*\}/);
    assert.doesNotMatch(request.query, /format\s+externalLinks\s*\{\s*site url\s*\}/);
    assert.doesNotMatch(request.query, /nextAiringEpisode/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("airing schedule queries include relation titles needed by rolling identity fallbacks", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return new Response(JSON.stringify({ data: { Page: { airingSchedules: [] } } }), { status: 200 });
  };

  try {
    await queryAiringSchedulePage(Date.now() - 1000, Date.now(), false, 1);
    assert.match(request.query, /relations\s*\{/);
    assert.match(request.query, /relationType/);
    assert.match(request.query, /node\s*\{\s*id\s+format\s+title/);
    assert.match(request.query, /node\s*\{\s*id\s+format\s+title[\s\S]*externalLinks\s*\{\s*site url\s*\}/);\n    assert.doesNotMatch(request.query, /isAdult\s+externalLinks\s*\{\s*site url\s*\}/);
    assert.doesNotMatch(request.query, /countryOfOrigin/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
