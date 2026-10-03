import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeCatalogPageWithBingeCat } from "../api/catalog-source.js";
import { getBingeCatCandidates, selectBingeCatIdentity } from "../lib/bingecat-identity.js";

test("seasonal catalog emits the validated BingeCat identity when ARM mapping is available", async () => {
  const metas = await canonicalizeCatalogPageWithBingeCat([{
    id: 158871,
    title: {
      english: "Pokémon Horizons: The Series",
      romaji: "Pocket Monsters (2023)",
      native: "ポケットモンスター",
    },
    format: "TV",
    coverImage: { large: "https://example.invalid/pokemon.jpg" },
    status: "RELEASING",
    startDate: { year: 2023, month: 4, day: 14 },
    genres: ["Action"],
  }], {
    resolveBingeCatSearchMappings: async () => new Map(),
    resolveMappings: async () => new Map([
      [158871, [{
        source: "arm",
        anilistId: 158871,
        type: "TV",
        imdbIds: ["tt26692417"],
        tvdbId: 76703,
        tmdbTvId: 220150,
        tmdbMovieIds: [],
        season: { tvdb: 20, tmdb: 1 },
        episodeOffset: null,
      }]],
    ]),
  });

  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "tt26692417");
  assert.equal(metas[0].type, "series");
  assert.equal(metas[0].extra.bingecatProvider, "imdb");
  assert.equal(metas[0].extra.bingecatId, "tt26692417");
  assert.equal(metas[0].extra.anilistId, 158871);
});

test("seasonal catalog rejects an uncorroborated AniMap TVDB identity", async () => {
  const metas = await canonicalizeCatalogPageWithBingeCat([{
    id: 195604,
    idMal: 61967,
    title: {
      english: "Black Clover Season 2",
      romaji: "Black Clover 2nd Season",
    },
    format: "TV",
    startDate: { year: 2026 },
    coverImage: { large: null },
  }], {
    resolveMappings: async () => new Map(),
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: async () => new Map([[195604, [{
      source: "animap",
      anilistId: 195604,
      type: "TV",
      imdbIds: [],
      tvdbId: 36880,
      tmdbTvId: null,
      tmdbMovieIds: [],
      title: "Black Clover Season 2",
      year: 2026,
    }]]]),
    resolveIdMapperMappings: async () => new Map(),
    resolveBingeCatSearchMappings: async () => new Map(),
    resolveAnimeMapperMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "mal:61967");
  assert.equal(metas[0].extra.bingecatEvidence, "canonical-mal-id-fallback");
});

test("seasonal catalog uses canonical MAL identity as the final fallback", async () => {
  const metas = await canonicalizeCatalogPageWithBingeCat([{
    id: 269,
    idMal: 269,
    countryOfOrigin: "JP",
    title: { romaji: "Bleach" },
    format: "TV",
  }], {
    resolveMappings: async () => new Map(),
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveBingeCatSearchMappings: async () => new Map(),
    resolveAnimeMapperMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "mal:269");
  assert.equal(metas[0].extra.bingecatEvidence, "canonical-mal-id-fallback");
});

test("seasonal catalog still fails when neither a supported provider identity nor MAL ID exists", async () => {
  await assert.rejects(canonicalizeCatalogPageWithBingeCat([{
    id: 269,
    title: { romaji: "Bleach" },
    format: "TV",
  }], {
    resolveMappings: async () => new Map(),
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveBingeCatSearchMappings: async () => new Map(),
    resolveAnimeMapperMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  }), /BingeCat identity resolution exhausted.*269/);
});

test("seasonal catalog uses canonical MAL fallback for Korea entries too", async () => {
  const metas = await canonicalizeCatalogPageWithBingeCat([{
    id: 1001,
    idMal: 1001,
    countryOfOrigin: "KR",
    title: { romaji: "Example Korea Anime" },
    format: "ONA",
  }], {
    resolveMappings: async () => new Map(),
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveBingeCatSearchMappings: async () => new Map(),
    resolveAnimeMapperMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(metas[0].id, "mal:1001");
});

test("seasonal catalog uses the secondary mapping source without dropping the entry", async () => {
  const metas = await canonicalizeCatalogPageWithBingeCat([{
    id: 269,
    title: { romaji: "Bleach" },
    format: "TV",
    startDate: { year: 2004 },
  }], {
    resolveBingeCatSearchMappings: async () => new Map(),
    resolveMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map([
      [269, [{
        source: "animeapi",
        anilistId: 269,
        type: "TV",
        imdbIds: ["tt0434665"],
        tvdbId: 74796,
        tmdbTvId: 30984,
        tmdbMovieIds: [],
      }]],
    ]),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "tt0434665");
  assert.equal(metas[0].type, "series");
});test("seasonal catalog uses canonical MAL fallback for Korea entries too", async () => {
  const metas = await canonicalizeCatalogPageWithBingeCat([{
    id: 1001,
    idMal: 1001,
    countryOfOrigin: "KR",
    title: { romaji: "Example Korea Anime" },
    format: "ONA",
  }], {
    resolveMappings: async () => new Map(),
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveBingeCatSearchMappings: async () => new Map(),
    resolveAnimeMapperMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(metas[0].id, "mal:1001");
});

test("seasonal catalog uses the secondary mapping source without dropping the entry", async () => {
  const metas = await canonicalizeCatalogPageWithBingeCat([{
    id: 269,
    title: { romaji: "Bleach" },
    format: "TV",
    startDate: { year: 2004 },
  }], {
    resolveMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map([
      [269, [{
        source: "animeapi",
        anilistId: 269,
        type: "TV",
        imdbIds: ["tt0434665"],
        tvdbId: 74796,
        tmdbTvId: 30984,
        tmdbMovieIds: [],
      }]],
    ]),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "tt0434665");
  assert.equal(metas[0].type, "series");
});


test("seasonal catalog uses MAL-only mapping evidence as the final fallback", async () => {
  const metas = await canonicalizeCatalogPageWithBingeCat([{
    id: 212653,
    title: { romaji: "Example" },
    format: "ONA",
  }], {
    resolveMappings: async () => new Map(),
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveBingeCatSearchMappings: async () => new Map(),
    resolveAnimeMapperMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map([
      [212653, [{ source: "animeapi", anilistId: 212653, malId: 62218, imdbIds: [], tvdbId: null, tmdbTvId: null, tmdbMovieIds: [] }]],
    ]),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "mal:62218");
  assert.equal(metas[0].extra.bingecatEvidence, "canonical-mal-id-fallback");
});


test("seasonal catalog executes AniMap fallback and accepts independent corroboration", async () => {
  const calls = [];
  const metas = await canonicalizeCatalogPageWithBingeCat([{
    id: 900001,
    title: { english: "AniMap Fallback Example", romaji: "AniMap Fallback Example" },
    format: "TV",
    startDate: { year: 2026 },
  }], {
    resolveMappings: async () => new Map(),
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: async (ids) => {
      calls.push(["animap", ids]);
      return new Map([[900001, [{ source: "animap", anilistId: 900001, type: "TV", imdbIds: [], tvdbId: 990001, tmdbTvId: null, tmdbMovieIds: [], title: "AniMap Fallback Example", year: 2026 }]]]);
    },
    resolveIdMapperMappings: async (ids) => {
      calls.push(["idmapper", ids]);
      return new Map([[900001, [{ source: "idmapper", anilistId: 900001, type: "TV", imdbIds: [], tvdbId: 990001, tmdbTvId: null, tmdbMovieIds: [], title: "AniMap Fallback Example", year: 2026 }]]]);
    },
    resolveBingeCatSearchMappings: async () => new Map(),
    resolveAnimeMapperMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });
  assert.deepEqual(calls, [["animap", [900001]], ["idmapper", [900001]]]);
  assert.equal(metas[0].id, "tvdb:990001");
});

test("seasonal catalog executes IDMapper fallback after AniMap is unresolved", async () => {
  const calls = [];
  const metas = await canonicalizeCatalogPageWithBingeCat([{
    id: 900002,
    title: { english: "IDMapper Fallback Example", romaji: "IDMapper Fallback Example" },
    format: "TV",
    startDate: { year: 2026 },
  }], {
    resolveMappings: async () => new Map(),
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async (ids) => {
      calls.push(ids);
      return new Map([[900002, [{ source: "idmapper", anilistId: 900002, type: "TV", imdbIds: ["tt9000002"], tvdbId: null, tmdbTvId: null, tmdbMovieIds: [], title: "IDMapper Fallback Example", year: 2026 }]]]);
    },
    resolveBingeCatSearchMappings: async () => new Map(),
    resolveAnimeMapperMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });
  assert.deepEqual(calls, [[900002]]);
  assert.equal(metas[0].id, "tt9000002");
});

test("202079 resolves through independent fallback evidence to the current TVDB series", async () => {
  const metas = await canonicalizeCatalogPageWithBingeCat([{
    id: 202079,
    idMal: 62907,
    title: { english: "Uncle's Obsession with Cute Things", romaji: "Oji-san wa Kawaii Mono ga Osuki.", native: "おじさんはカワイイものがお好き。" },
    format: "TV",
    startDate: { year: 2026 },
  }], {
    resolveMappings: async () => new Map(),
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: async () => new Map([[202079, [{ source: "animap", anilistId: 202079, type: "TV", imdbIds: [], tvdbId: 480889, tmdbTvId: null, tmdbMovieIds: [], title: "Oji-san wa Kawaii Mono ga Osuki.", year: 2026 }]]]),
    resolveIdMapperMappings: async () => new Map([[202079, [{ source: "idmapper", anilistId: 202079, type: "TV", imdbIds: [], tvdbId: 480889, tmdbTvId: null, tmdbMovieIds: [], title: "Oji-san wa Kawaii Mono ga Osuki.", year: 2026 }]]]),
    resolveBingeCatSearchMappings: async () => new Map(),
    resolveAnimeMapperMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });
  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "tvdb:480889");
  assert.equal(metas[0].extra.bingecatProvider, "tvdb");
  assert.equal(metas[0].extra.bingecatId, "480889");
});


test("catalog rejects a weak ARM TVDB identity and preserves the AniList entry via MAL fallback", async () => {
  const metas = await canonicalizeCatalogPageWithBingeCat([{
    id: 202079,
    idMal: 62907,
    title: { english: "Uncle's Obsession with Cute Things", romaji: "Oji-san wa Kawaii Mono ga Osuki." },
    format: "TV",
    startDate: { year: 2026 },
  }], {
    resolveMappings: async () => new Map([[202079, [{ source: "arm", anilistId: 202079, type: "TV", imdbIds: [], tvdbId: 470200, tmdbTvId: null, tmdbMovieIds: [], season: { tvdb: 1, tmdb: null }, episodeOffset: null }]]]),
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveBingeCatSearchMappings: async () => new Map(),
    resolveAnimeMapperMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });
  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "mal:62907");
  assert.equal(metas[0].extra.bingecatEvidence, "canonical-mal-id-fallback");
});

test("catalog does not treat multiple weak provider mappings as semantic corroboration", async () => {
  const metas = await canonicalizeCatalogPageWithBingeCat([{
    id: 202079,
    idMal: 62907,
    title: { english: "Uncle's Obsession with Cute Things" },
    format: "TV",
    startDate: { year: 2026 },
  }], {
    resolveMappings: async () => new Map([[202079, [{ source: "arm", anilistId: 202079, type: "TV", imdbIds: [], tvdbId: 470200, tmdbTvId: null, tmdbMovieIds: [] }]]]),
    resolveFribbMappings: async () => new Map([[202079, [{ source: "fribb", anilistId: 202079, type: "TV", imdbIds: [], tvdbId: 470200, tmdbTvId: null, tmdbMovieIds: [] }]]]),
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveBingeCatSearchMappings: async () => new Map(),
    resolveAnimeMapperMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });
  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "mal:62907");
});

test("catalog accepts a TVDB identity when an independent mapping supplies semantic evidence", async () => {
  const metas = await canonicalizeCatalogPageWithBingeCat([{
    id: 202079,
    idMal: 62907,
    title: { english: "Uncle's Obsession with Cute Things" },
    format: "TV",
    startDate: { year: 2026 },
  }], {
    resolveMappings: async () => new Map([[202079, [{ source: "arm", anilistId: 202079, type: "TV", imdbIds: [], tvdbId: 480889, tmdbTvId: null, tmdbMovieIds: [] }]]]),
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: () => new Map(),    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveBingeCatSearchMappings: async () => new Map(),
    resolveAnimeMapperMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map([[202079, [{ source: "animeapi", anilistId: 202079, type: "TV", imdbIds: [], tvdbId: 480889, tmdbTvId: null, tmdbMovieIds: [], title: "Uncle's Obsession with Cute Things", year: 2026 }]]]),
    resolveAlternativeMappings: async () => new Map(),
  });
  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "tvdb:480889");
  assert.equal(metas[0].extra.bingecatProvider, "tvdb");
});


test("seasonal catalog accepts a BingeCat direct identity found through a semantically compatible related title", async () => {
  const metas = await canonicalizeCatalogPageWithBingeCat([{
    id: 155723,
    idMal: 41409,
    title: {
      romaji: "Wushen Zhuzai: Da Wei Pian",
      native: "武神主宰 大威篇",
    },
    format: "ONA",
    startDate: { year: 2026 },
    relations: {
      edges: [{
        relationType: "PREQUEL",
        node: {
          id: 10620,
          title: {
            english: "The God of War Dominates",
            romaji: "Wushen Zhuzai",
          },
        },
      }],
    },
  }], {
    resolveMappings: async () => new Map(),
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveBingeCatSearchMappings: async () => new Map([[155723, [{
      source: "bingecat-search",
      anilistId: 155723,
      type: "ONA",
      imdbIds: ["tt20769560"],
      tvdbId: null,
      tmdbTvId: 110181,
      tmdbMovieIds: [],
      title: "The God of War Dominates",
      year: null,
      relation: false,
      derivedTitle: true,
      relatedTitleSearch: true,
      relatedSearchTitles: ["The God of War Dominates", "Wushen Zhuzai"],
    }]]]),
    resolveAnimeMapperMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "tt20769560");
  assert.equal(metas[0].extra.bingecatProvider, "imdb");
  assert.equal(metas[0].extra.bingecatEvidence[0].source, "bingecat-search");
});

test("seasonal catalog rejects an unrelated franchise identity returned from a related-title search", async () => {
  const metas = await canonicalizeCatalogPageWithBingeCat([{
    id: 214703,
    idMal: 64718,
    title: {
      english: "Ghost Meets Gal!",
      romaji: "Ghost Meets Gal!",
    },
    format: "TV",
    startDate: { year: 2025 },
    relations: {
      edges: [{
        relationType: "SEQUEL",
        node: {
          id: 1272,
          title: {
            english: "Cardfight!! Vanguard",
            romaji: "Cardfight!! Vanguard",
          },
        },
      }],
    },
  }], {
    resolveMappings: async () => new Map(),
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveBingeCatSearchMappings: async () => new Map([[214703, [{
      source: "bingecat-search",
      anilistId: 214703,
      type: "TV",
      imdbIds: ["tt2549176"],
      tvdbId: null,
      tmdbTvId: null,
      tmdbMovieIds: [],
      title: "Cardfight!! Vanguard",
      year: null,
      relation: false,
      derivedTitle: true,
    }]]]),
    resolveAnimeMapperMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "mal:64718");
  assert.equal(metas[0].extra.bingecatEvidence, "canonical-mal-id-fallback");
});


test("seasonal catalog accepts a BingeCat parent identity across numbered installment titles", async () => {
  const metas = await canonicalizeCatalogPageWithBingeCat([{
    id: 216860,
    idMal: 63823,
    title: { english: "Punirunes Puni 4", romaji: "Punirunes Puni 4" },
    format: "TV_SHORT",
    startDate: { year: 2026 },
    relations: {
      edges: [{
        relationType: "PREQUEL",
        node: { title: { english: "Punirunes Puni 3", romaji: "Punirunes Puni 3" } },
      }],
    },
  }], {
    resolveMappings: async () => new Map(),
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveBingeCatSearchMappings: async () => new Map([[216860, [{
      source: "bingecat-search",
      anilistId: 216860,
      type: "TV_SHORT",
      imdbIds: ["tt12345678"],
      tvdbId: null,
      tmdbTvId: 123456,
      tmdbMovieIds: [],
      title: "Punirunes Puni 3",
      year: null,
      relation: false,
      derivedTitle: true,
      relatedTitleSearch: true,
      relatedSearchTitles: ["Punirunes Puni 3"],
    }]]]),
    resolveAnimeMapperMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "tt12345678");
});


test("BingeCat-search evidence outranks an otherwise valid external provider mapping", () => {
  const media = {
    id: 999001,
    format: "TV",
    title: { english: "Example Anime", romaji: "Example Anime" },
  };
  const candidates = getBingeCatCandidates(media, [
    {
      source: "arm",
      imdbIds: ["tt1111111"],
      tvdbId: null,
      tmdbTvId: null,
      title: "Example Anime",
      year: 2026,
      relation: false,
      derivedTitle: false,
    },
    {
      source: "bingecat-search",
      imdbIds: [],
      tvdbId: 222222,
      tmdbTvId: null,
      title: "Example Anime",
      year: 2026,
      relation: false,
      derivedTitle: false,
    },
  ]);
  const selected = selectBingeCatIdentity(media, candidates);
  assert.equal(selected.provider, "tvdb");
  assert.equal(selected.id, "222222");
  assert.equal(selected.bingecatVerified, true);
});
test("BingeCat candidate dedupe keeps identical numeric IDs from different providers", () => {
  const media = {
    id: 999002,
    format: "TV",
    title: { english: "Provider Collision Example" },
  };
  const candidates = getBingeCatCandidates(media, [
    {
      source: "bingecat-search",
      imdbIds: ["tt123456"],
      tvdbId: 123456,
      tmdbTvId: null,
      title: "Provider Collision Example",
      year: 2026,
      relation: false,
      derivedTitle: false,
    },
  ]);

  assert.deepEqual(
    candidates.map(({ provider, id }) => [provider, id]),
    [["imdb", "tt123456"], ["tvdb", "123456"]],
  );
});


test("BingeCat verification survives same-provider evidence dedupe", () => {
  const media = {
    id: 999003,
    format: "TV",
    title: { english: "Evidence Aggregation Example" },
  };
  const candidates = getBingeCatCandidates(media, [
    {
      source: "arm",
      imdbIds: ["tt3333333"],
      tvdbId: null,
      tmdbTvId: null,
      title: "Evidence Aggregation Example",
      year: 2026,
      relation: false,
      derivedTitle: false,
    },
    {
      source: "bingecat-search",
      imdbIds: ["tt3333333"],
      tvdbId: null,
      tmdbTvId: null,
      title: "Evidence Aggregation Example",
      year: 2026,
      relation: false,
      derivedTitle: false,
    },
  ]);

  assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0].evidence.map((entry) => entry.source).sort(), [
    "arm",
    "bingecat-search",
  ]);

  const selected = selectBingeCatIdentity(media, candidates);
  assert.equal(selected.provider, "imdb");
  assert.equal(selected.id, "tt3333333");
  assert.equal(selected.bingecatVerified, true);
});


test("catalog verifies an already-resolved external IMDb identity through BingeCat before returning it", async () => {
  const calls = [];
  const metas = await canonicalizeCatalogPageWithBingeCat([{
    id: 999004,
    idMal: 999004,
    title: { english: "External IMDb Example", romaji: "External IMDb Example" },
    format: "TV",
    startDate: { year: 2026 },
  }], {
    resolveMappings: async () => new Map([[999004, [{
      source: "arm",
      anilistId: 999004,
      type: "TV",
      imdbIds: ["tt4444444"],
      tvdbId: null,
      tmdbTvId: null,
      tmdbMovieIds: [],
      title: "External IMDb Example",
      year: 2026,
      relation: false,
      derivedTitle: false,
    }]]]),
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveBingeCatSearchMappings: async (rows) => {
      calls.push(rows.map((row) => Number(row.id)));
      return new Map([[999004, [{
        source: "bingecat-search",
        anilistId: 999004,
        type: "TV",
        imdbIds: ["tt5555555"],
        tvdbId: null,
        tmdbTvId: null,
        tmdbMovieIds: [],
        title: "External IMDb Example",
        year: 2026,
        relation: false,
        derivedTitle: false,
      }]]]);
    },
    resolveAnimeMapperMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.deepEqual(calls, [[999004]]);
  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "tt5555555");
  assert.equal(metas[0].extra.bingecatEvidence[0].source, "bingecat-search");
});



test("catalog falls back to canonical MAL when an external identity cannot be verified by BingeCat", async () => {
  const metas = await canonicalizeCatalogPageWithBingeCat([{
    id: 999006,
    idMal: 999006,
    title: { english: "Unverified External Example", romaji: "Unverified External Example" },
    format: "TV",
    startDate: { year: 2026 },
  }], {
    requireBingeCatVerification: true,
    resolveMappings: async () => new Map([[999006, [{
      source: "arm",
      anilistId: 999006,
      type: "TV",
      imdbIds: ["tt6666666"],
      tvdbId: null,
      tmdbTvId: null,
      tmdbMovieIds: [],
      title: "Unverified External Example",
      year: 2026,
      relation: false,
      derivedTitle: false,
    }]]]),
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveBingeCatSearchMappings: async () => new Map(),
    resolveAnimeMapperMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "mal:999006");
  assert.equal(metas[0].extra.bingecatEvidence, "canonical-mal-id-fallback");
});

test("direct BingeCat evidence survives relation-derived evidence for the same provider ID", () => {
  const media = {
    id: 999005,
    format: "TV",
    title: { english: "Relation Evidence Example" },
  };
  const candidates = getBingeCatCandidates(media, [
    {
      source: "arm-relation",
      anilistId: 999005,
      imdbIds: ["tt5550005"],
      tvdbId: null,
      tmdbTvId: null,
      title: "Relation Evidence Example",
      year: 2025,
      relation: true,
    },
    {
      source: "bingecat-search",
      anilistId: 999005,
      imdbIds: ["tt5550005"],
      tvdbId: null,
      tmdbTvId: null,
      title: "Relation Evidence Example",
      year: 2026,
      relation: false,
    },
  ]);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].relation, false);
  assert.equal(candidates[0].directlyCorroborated, true);
  assert.deepEqual(candidates[0].evidence.map((entry) => entry.source).sort(), [
    "arm-relation",
    "bingecat-search",
  ]);

  const selected = selectBingeCatIdentity(media, candidates);
  assert.equal(selected.id, "tt5550005");
  assert.equal(selected.bingecatVerified, true);
});


test("seasonal catalog preserves an entry with AniList fallback when BingeCat and MAL are unavailable", async () => {
  const metas = await canonicalizeCatalogPageWithBingeCat([{
    id: 900999,
    title: { english: "No Provider Example", romaji: "No Provider Example" },
    format: "TV",
    startDate: { year: 2026 },
    coverImage: { large: null },
  }], {
    requireBingeCatVerification: true,
    resolveMappings: async () => new Map(),
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveBingeCatSearchMappings: async () => new Map(),
    resolveAnimeMapperMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "anilist:900999");
  assert.equal(metas[0].extra.bingecatEvidence, "anilist-id-fallback");
});
