import assert from "node:assert/strict";
import test from "node:test";
import {
  clearAnimeMapperCache,
  resolveAniListCanonicalSeriesByAnimeMapper,
} from "../lib/anime-mapper-mapping.js";

function createFetch(records) {
  return async (url) => {
    const match = String(url).match(/\/([0-9]+)\.json$/);
    const id = Number(match?.[1]);
    const record = records[id];
    if (!record) return new Response("", { status: 404 });
    return new Response(JSON.stringify(record), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

function record(mal, anilist, title, sequence = [], year = 2026, type = "TV", mappings = {}) {
  return {
    mappings: { mal, anilist, ...mappings },
    title: { english: title, romaji: title, native: title },
    type,
    year,
    sequence,
  };
}

test("canonical series resolver follows prequel chains to the original series", async () => {
  clearAnimeMapperCache();
  const fetchImpl = createFetch({
    61469: record(61469, 210482, "Steel Ball Run", [
      { malId: 51367, title: { english: "Stone Ocean Part 2" }, format: "ONA", seasonYear: 2022, relationType: "PREQUEL" },
    ], 2026, "ONA", { tmdb: 45790, tvdb: 262954, trakt: 45537 }),
    51367: record(51367, 146722, "Stone Ocean Part 2", [
      { malId: 48661, title: { english: "Stone Ocean" }, format: "ONA", seasonYear: 2021, relationType: "PREQUEL" },
    ]),
    48661: record(48661, 131942, "Stone Ocean", [
      { malId: 20899, title: { english: "Stardust Crusaders" }, format: "TV", seasonYear: 2014, relationType: "PREQUEL" },
    ]),
    20899: record(20899, 20474, "Stardust Crusaders", [
      { malId: 14719, title: { english: "JoJo's Bizarre Adventure" }, format: "TV", seasonYear: 2012, relationType: "PREQUEL" },
    ]),
    14719: record(14719, 14719, "JoJo's Bizarre Adventure", [], 2012, "TV", { tmdb: 45790, tvdb: 262954, trakt: 45537 }),
  });

  const result = await resolveAniListCanonicalSeriesByAnimeMapper([
    {
      id: 210482,
      idMal: 61469,
      format: "ONA",
      title: { english: "STEEL BALL RUN JoJo's Bizarre Adventure 2nd - 3rd STAGE" },
      synonyms: [],
      startDate: { year: 2026 },
    },
  ], { fetchImpl });

  const root = result.get(210482);
  assert.equal(root?.canonicalMalId, 14719);
  assert.equal(root?.canonicalAnilistId, 14719);
  assert.equal(root?.canonicalTitle, "JoJo's Bizarre Adventure");
  assert.equal(root?.canonicalExternal?.tvdb, 262954);
});

test("canonical series resolver does not collapse an enhanced re-edition without shared series identity", async () => {
  clearAnimeMapperCache();
  const fetchImpl = createFetch({
    63367: record(63367, 206814, "Dragon Ball Super: Beerus", [
      { malId: 813, title: { english: "Dragon Ball Z" }, format: "TV", seasonYear: 1989, relationType: "PREQUEL" },
      { malId: 14837, title: { english: "Dragon Ball Z: Battle of Gods" }, format: "MOVIE", seasonYear: 2013, relationType: "PARENT" },
      { malId: 30694, title: { english: "Dragon Ball Super" }, format: "TV", seasonYear: 2015, relationType: "PARENT" },
    ]),
    30694: record(30694, 21175, "Dragon Ball Super", [
      { malId: 813, title: { english: "Dragon Ball Z" }, format: "TV", seasonYear: 1989, relationType: "PREQUEL" },
    ]),
  });

  const result = await resolveAniListCanonicalSeriesByAnimeMapper([
    {
      id: 206814,
      idMal: 63367,
      format: "TV",
      title: { english: "Dragon Ball Super: Beerus" },
      synonyms: [],
      startDate: { year: 2026 },
    },
  ], { fetchImpl });

  assert.equal(result.has(206814), false);
});


test("canonical series resolver does not collapse a sequel franchise without shared series identity", async () => {
  clearAnimeMapperCache();
  const fetchImpl = createFetch({
    62534: record(62534, 199068, "Final Member Selection Match", [
      { malId: 55570, title: { english: "U-17 World Cup Semifinal" }, format: "TV", seasonYear: 2024, relationType: "PREQUEL" },
    ]),
    55570: record(55570, 165810, "U-17 World Cup Semifinal", [
      { malId: 50099, title: { english: "U-17 World Cup" }, format: "TV", seasonYear: 2022, relationType: "PREQUEL" },
    ]),
    50099: record(50099, 140187, "The Prince of Tennis II: U-17 World Cup", [
      { malId: 11371, title: { english: "The Prince of Tennis II" }, format: "TV", seasonYear: 2012, relationType: "PREQUEL" },
    ]),
    11371: record(11371, 11371, "The Prince of Tennis II", [
      { malId: 38882, title: { english: "Ryoma! The Prince of Tennis" }, format: "MOVIE", seasonYear: 2019, relationType: "PREQUEL" },
    ]),
    38882: record(38882, 113254, "Ryoma! The Prince of Tennis", [
      { malId: 4053, title: { english: "The Prince of Tennis: National Tournament Final" }, format: "OVA", seasonYear: 2008, relationType: "PREQUEL" },
    ]),
    4053: record(4053, 4053, "The Prince of Tennis: National Tournament Final", [
      { malId: 2752, title: { english: "The Prince of Tennis: National Tournament Semifinal" }, format: "OVA", seasonYear: 2007, relationType: "PREQUEL" },
    ]),
    2752: record(2752, 2752, "The Prince of Tennis: National Tournament Semifinal", [
      { malId: 995, title: { english: "The Prince of Tennis: National Tournament" }, format: "OVA", seasonYear: 2006, relationType: "PREQUEL" },
    ]),
    995: record(995, 995, "The Prince of Tennis: National Tournament", [
      { malId: 22, title: { english: "The Prince of Tennis" }, format: "TV", seasonYear: 2001, relationType: "PREQUEL" },
    ]),
    22: record(22, 22, "The Prince of Tennis", []),
  });

  const result = await resolveAniListCanonicalSeriesByAnimeMapper([
    {
      id: 199068,
      idMal: 62534,
      format: "TV",
      title: { english: "The Prince of Tennis II U-17 WORLD CUP: Final Member Selection Match" },
      synonyms: [],
      startDate: { year: 2026 },
    },
  ], { fetchImpl });

  assert.equal(result.has(199068), false);
});
