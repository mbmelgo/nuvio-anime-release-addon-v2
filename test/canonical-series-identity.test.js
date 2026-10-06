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

function record(mal, anilist, title, sequence = [], year = 2026, type = "TV") {
  return {
    mappings: { mal, anilist },
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
    ]),
    51367: record(51367, 146722, "Stone Ocean Part 2", [
      { malId: 48661, title: { english: "Stone Ocean" }, format: "ONA", seasonYear: 2021, relationType: "PREQUEL" },
    ]),
    48661: record(48661, 131942, "Stone Ocean", [
      { malId: 20899, title: { english: "Stardust Crusaders" }, format: "TV", seasonYear: 2014, relationType: "PREQUEL" },
    ]),
    20899: record(20899, 20474, "Stardust Crusaders", [
      { malId: 14719, title: { english: "JoJo's Bizarre Adventure" }, format: "TV", seasonYear: 2012, relationType: "PREQUEL" },
    ]),
    14719: record(14719, 14719, "JoJo's Bizarre Adventure", []),
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
});

test("canonical series resolver prefers a TV parent over unrelated prequel entries", async () => {
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

  assert.equal(result.get(206814)?.canonicalMalId, 30694);
  assert.equal(result.get(206814)?.canonicalAnilistId, 21175);
  assert.equal(result.get(206814)?.canonicalTitle, "Dragon Ball Super");
});
