import assert from "node:assert/strict";
import test from "node:test";
import { applyKitsuFallback, resolveAniListKitsuMappings } from "../lib/kitsu-fallback.js";
import { canonicalizeCatalogPage } from "../api/catalog-source.js";

function mapping(site, externalId, kitsuId) {
  return {
    type: "mappings",
    attributes: { externalSite: site, externalId: String(externalId) },
    relationships: { item: { data: { type: "anime", id: String(kitsuId) } } },
  };
}

test("Kitsu fallback prefers the ID source matching the current MAL/AniList fallback", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    const parsed = new URL(url);
    const site = parsed.searchParams.get("filter[externalSite]");
    const ids = parsed.searchParams.get("filter[externalId]").split(",");
    const data = [];
    for (const id of ids) {
      if (site === "anilist/anime" && id === "10001") data.push(mapping(site, id, 7001));
      if (site === "anilist/anime" && id === "10002") data.push(mapping(site, id, 7002));
      if (site === "myanimelist/anime" && id === "20001") data.push(mapping(site, id, 8001));
      if (site === "myanimelist/anime" && id === "20002") data.push(mapping(site, id, 8002));
    }
    return { ok: true, status: 200, json: async () => ({ data }) };
  };

  const result = await resolveAniListKitsuMappings([
    { id: 10001, idMal: 20001, currentFallbackId: "mal:20001" },
    { id: 10002, idMal: 20002, currentFallbackId: "anilist:10002" },
  ], { fetchImpl });

  assert.equal(result.get(10001), "8001");
  assert.equal(result.get(10002), "7002");
  assert.equal(calls.length, 2);
  assert.ok(calls.every((url) => url.startsWith("https://kitsu.io/api/edge/mappings?")));
});

test("ambiguous preferred Kitsu mappings do not replace the existing identity", async () => {
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    const site = parsed.searchParams.get("filter[externalSite]");
    const ids = parsed.searchParams.get("filter[externalId]").split(",");
    const data = [];
    for (const id of ids) {
      if (site === "myanimelist/anime" && id === "21001") {
        data.push(mapping(site, id, 9001), mapping(site, id, 9002));
      }
      if (site === "anilist/anime" && id === "11001") data.push(mapping(site, id, 9003));
    }
    return { ok: true, status: 200, json: async () => ({ data }) };
  };

  const result = await resolveAniListKitsuMappings([
    { id: 11001, idMal: 21001, currentFallbackId: "mal:21001" },
  ], { fetchImpl });

  assert.equal(result.has(11001), false);
});

test("post-processing replaces only MAL/AniList fallback IDs and records the fallback evidence", async () => {
  const metas = [
    { id: "mal:301", name: "MAL fallback", extra: { anilistId: 101, malId: 301, identityEvidence: "canonical-mal-id-fallback" } },
    { id: "anilist:102", name: "AniList fallback", extra: { anilistId: 102, malId: 302, identityEvidence: "anilist-id-fallback" } },
    { id: "tt1234567", name: "Verified IMDb", extra: { anilistId: 103, malId: 303, identityProvider: "imdb" } },
    { id: "tmdb:1234", name: "Verified TMDB", extra: { anilistId: 104, malId: 304, tmdbProvider: "tmdb" } },
  ];

  const result = await applyKitsuFallback(metas, async (targets) => {
    assert.deepEqual(targets.map((row) => row.currentFallbackId), ["mal:301", "anilist:102"]);
    return new Map([[101, "701"], [102, "702"]]);
  });

  assert.equal(result[0].id, "kitsu:701");
  assert.equal(result[0].extra.identityProvider, "kitsu");
  assert.equal(result[0].extra.identityFallbackFrom, "mal:301");
  assert.equal(result[0].extra.identityEvidence[0].source, "kitsu-mapping");
  assert.equal(result[1].id, "kitsu:702");
  assert.equal(result[2], metas[2]);
  assert.equal(result[3], metas[3]);
});

test("Kitsu lookup errors preserve the original fallback IDs", async () => {
  const metas = [
    { id: "mal:401", extra: { anilistId: 201, malId: 401 } },
  ];
  const result = await applyKitsuFallback(metas, async () => {
    throw new Error("temporary upstream failure");
  });
  assert.equal(result[0].id, "mal:401");
});

test("catalog applies Kitsu only after the existing identity pipeline returns a MAL fallback", async () => {
  const empty = async () => new Map();
  const row = {
    id: 990001,
    idMal: 990002,
    title: { english: "Post-Provider Kitsu Test", romaji: "Post-Provider Kitsu Test", native: "Kitsu fallback test" },
    synonyms: [],
    format: "TV",
    startDate: { year: 2026 },
    relations: { edges: [] },
    status: "NOT_YET_RELEASED",
    coverImage: { large: null },
    genres: [],
  };

  const result = await canonicalizeCatalogPage([row], {
    enableKitsuFallback: true,
    resolveKitsuMappings: async (targets) => {
      assert.equal(targets.length, 1);
      assert.equal(targets[0].currentFallbackId, "mal:990002");
      return new Map([[990001, "770001"]]);
    },
    resolveMappings: empty,
    resolveFribbMappings: empty,
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: empty,
    resolveIdMapperMappings: empty,
    resolveTMDBMappings: empty,
    resolveAnimeMapperMappings: empty,
    resolveAnimeMapperRelatedProviderIds: empty,
    resolveCanonicalSeriesMappings: empty,
    resolveAniBridgeMappings: empty,
    resolveTsvMappings: empty,
    resolveImdbMappings: empty,
    resolveSecondaryMappings: empty,
    resolveAlternativeMappings: empty,
  });

  assert.equal(result[0].id, "kitsu:770001");
  assert.equal(result[0].extra.identityFallbackFrom, "mal:990002");
  assert.equal(result[0].extra.identityProvider, "kitsu");
});
