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

function record(mal, anilist, title, sequence = [], year = 2026, type = "TV", mappings = {}, synonyms = []) {
  return {
    mappings: { mal, anilist, ...mappings },
    title: { english: title, romaji: title, native: title, synonyms },
    type,
    year,
    sequence,
  };
}

test("canonical series resolver follows prequel chains within the same named series", async () => {
  clearAnimeMapperCache();
  const fetchImpl = createFetch({
    60636: record(60636, 185874, "Bleach: Thousand-Year Blood War - The Calamity", [
      { malId: 56784, title: { english: "Bleach: Thousand-Year Blood War - The Conflict" }, format: "TV", seasonYear: 2024, relationType: "PREQUEL" },
    ], 2026, "TV", { tmdb: 30984, tvdb: 74796, trakt: 30850 }),
    56784: record(56784, 169755, "Bleach: Thousand-Year Blood War - The Conflict", [
      { malId: 53998, title: { english: "Bleach: Thousand-Year Blood War - The Separation" }, format: "TV", seasonYear: 2023, relationType: "PREQUEL" },
    ], 2024, "TV", { tmdb: 30984, tvdb: 74796, trakt: 30850 }),
    53998: record(53998, 159322, "Bleach: Thousand-Year Blood War - The Separation", [
      { malId: 41467, title: { english: "Bleach: Thousand-Year Blood War" }, format: "TV", seasonYear: 2022, relationType: "PREQUEL" },
    ], 2023, "TV", { tmdb: 30984, tvdb: 74796, trakt: 30850 }),
    41467: record(41467, 116674, "Bleach: Thousand-Year Blood War", [
      { malId: 269, title: { english: "Bleach" }, format: "TV", seasonYear: 2004, relationType: "PREQUEL" },
    ], 2022, "TV", { tmdb: 30984, tvdb: 74796, trakt: 30850 }),
    269: record(269, 269, "Bleach", [], 2004, "TV", { tmdb: 30984, tvdb: 74796, trakt: 30850 }),
  });

  const result = await resolveAniListCanonicalSeriesByAnimeMapper([
    {
      id: 185874,
      idMal: 60636,
      format: "TV",
      title: { english: "BLEACH: Thousand-Year Blood War - The Calamity" },
      synonyms: [],
      startDate: { year: 2026 },
    },
  ], { fetchImpl });

  const root = result.get(185874);
  assert.equal(root?.canonicalMalId, 41467);
  assert.equal(root?.canonicalAnilistId, 116674);
  assert.equal(root?.canonicalTitle, "Bleach: Thousand-Year Blood War");
  assert.equal(root?.canonicalExternal?.tvdb, 74796);
});

test("canonical series resolver stops at a franchise sequel with a different series title", async () => {
  clearAnimeMapperCache();
  const fetchImpl = createFetch({
    61469: record(61469, 210482, "Steel Ball Run: JoJo's Bizarre Adventure", [
      { malId: 51367, title: { english: "JoJo's Bizarre Adventure: Stone Ocean Part 2" }, format: "ONA", seasonYear: 2022, relationType: "PREQUEL" },
    ], 2026, "ONA", { tmdb: 45790, tvdb: 262954, trakt: 45537 }, [
      "JoJo's Bizarre Adventure",
      "JoJo's Bizarre Adventure: Part 7 - Steel Ball Run",
    ]),
    51367: record(51367, 146722, "JoJo's Bizarre Adventure: Stone Ocean Part 2", [
      { malId: 48661, title: { english: "JoJo's Bizarre Adventure: Stone Ocean" }, format: "ONA", seasonYear: 2021, relationType: "PREQUEL" },
    ], 2022, "ONA", { tmdb: 45790, tvdb: 262954, trakt: 45537 }),
    48661: record(48661, 131942, "JoJo's Bizarre Adventure: Stone Ocean", [], 2021, "ONA", { tmdb: 45790, tvdb: 262954, trakt: 45537 }),
  });

  const result = await resolveAniListCanonicalSeriesByAnimeMapper([
    {
      id: 210482,
      idMal: 61469,
      format: "ONA",
      title: { english: "Steel Ball Run: JoJo's Bizarre Adventure" },
      synonyms: [],
      startDate: { year: 2026 },
    },
  ], { fetchImpl });

  assert.equal(result.has(210482), false);
});

test("canonical series resolver still follows genuine JoJo season continuity", async () => {
  clearAnimeMapperCache();
  const fetchImpl = createFetch({
    20899: record(20899, 20474, "JoJo's Bizarre Adventure: Stardust Crusaders", [
      { malId: 14719, title: { english: "JoJo's Bizarre Adventure" }, format: "TV", seasonYear: 2012, relationType: "PREQUEL" },
    ], 2014, "TV", { tmdb: 45790, tvdb: 262954, trakt: 45537 }),
    14719: record(14719, 14719, "JoJo's Bizarre Adventure", [], 2012, "TV", { tmdb: 45790, tvdb: 262954, trakt: 45537 }),
  });

  const result = await resolveAniListCanonicalSeriesByAnimeMapper([
    {
      id: 20474,
      idMal: 20899,
      format: "TV",
      title: { english: "JoJo's Bizarre Adventure: Stardust Crusaders" },
      synonyms: [],
      startDate: { year: 2014 },
    },
  ], { fetchImpl });

  const root = result.get(20474);
  assert.equal(root?.canonicalMalId, 14719);
  assert.equal(root?.canonicalAnilistId, 14719);
  assert.equal(root?.canonicalTitle, "JoJo's Bizarre Adventure");
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


test("canonical series resolver does not merge JoJo installments through a shared franchise title", async () => {
  clearAnimeMapperCache();
  const sharedMappings = { tmdb: 45790, tvdb: 262954, trakt: 45537 };
  const steelBallRun = record(61469, 210482, "Steel Ball Run: JoJo's Bizarre Adventure", [
    { malId: 51367, title: { english: "JoJo's Bizarre Adventure: Stone Ocean Part 2" }, format: "ONA", seasonYear: 2022, relationType: "PREQUEL" },
  ], 2026, "ONA", sharedMappings);
  steelBallRun.title = { english: "Steel Ball Run: JoJo's Bizarre Adventure", romaji: "JoJo no Kimyou na Bouken: Steel Ball Run - 1st STAGE", native: "ジョジョの奇妙な冒険 スティール・ボール・ラン 1st STAGE" };
  const stoneOcean = record(51367, 146722, "JoJo's Bizarre Adventure: Stone Ocean Part 2", [
    { malId: 48661, title: { english: "JoJo's Bizarre Adventure: Stone Ocean" }, format: "ONA", seasonYear: 2021, relationType: "PREQUEL" },
  ], 2022, "ONA", sharedMappings);
  stoneOcean.title = { english: "JoJo's Bizarre Adventure: Stone Ocean Part 2", romaji: "JoJo no Kimyou na Bouken: Stone Ocean Part 2", native: "ジョジョの奇妙な冒険 ストーンオーシャン 2クール" };
  const fetchImpl = createFetch({ 61469: steelBallRun, 51367: stoneOcean });
  const result = await resolveAniListCanonicalSeriesByAnimeMapper([{ id: 210482, idMal: 61469, type: "ONA", title: { english: "Steel Ball Run: JoJo's Bizarre Adventure" } }], { fetchImpl });
  assert.equal(result.has(210482), false);
});
