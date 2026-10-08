import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRollingCatalog,
  getCatalogFilter,
  getRollingCatalogRange,
  fetchValidatedSeasonCatalogPage,
  canonicalizeCatalogPage,
} from "../api/catalog-source.js";

function schedule(mediaId, airingAt, episode, title = `Anime ${mediaId}`, malId = null) {
  return {
    id: `${mediaId}-${episode}`,
    airingAt,
    episode,
    media: {
      id: mediaId,
      ...(malId ? { idMal: malId } : {}),
      title: { english: title, romaji: title, native: title },
      coverImage: { large: `https://example.test/${mediaId}.jpg` },
      status: "RELEASING",
      format: "TV",
      isAdult: false,
      startDate: { year: 2026, month: 1, day: 1 },
      endDate: { year: null },
      genres: ["Action"],
    },
  };
}

test("seasonal filters remain isolated from rolling catalog ids", () => {
  const info = {
    ongoing: { season: "FALL", year: 2026 },
    previous: { season: "SUMMER", year: 2026 },
    upcoming: { season: "WINTER", year: 2027 },
  };
  assert.deepEqual(getCatalogFilter("current_season", info), { season: info.ongoing, sort: ["ID"] });
  assert.deepEqual(getCatalogFilter("previous_season", info), { season: info.previous, sort: ["ID"] });
  assert.deepEqual(getCatalogFilter("upcoming_season", info), { season: info.upcoming, sort: ["ID"] });
  assert.equal(getCatalogFilter("upcoming_5_days", info), null);
  assert.equal(getCatalogFilter("previous_7_days", info), null);
});

test("rolling ranges are exactly 5 days upcoming and 7 days previous", () => {
  const now = new Date("2026-10-01T00:00:00.000Z");
  const upcoming = getRollingCatalogRange("upcoming_5_days", now);
  const previous = getRollingCatalogRange("previous_7_days", now);
  assert.equal(upcoming.end - upcoming.start, 5 * 24 * 60 * 60 * 1000);
  assert.equal(previous.end - previous.start, 7 * 24 * 60 * 60 * 1000);
  assert.equal(upcoming.start, now.getTime());
  assert.equal(previous.end, now.getTime());
});

test("upcoming rolling catalog prefers MAL and falls back to AniList", async () => {
  const now = new Date("2026-10-01T00:00:00.000Z");
  const rows = [
    schedule(10, now.getTime() + 60_000, 2, "MAL Anime", 10010),
    schedule(20, now.getTime() + 120_000, 1, "AniList Fallback"),
    schedule(10, now.getTime() + 180_000, 3, "MAL Anime", 10010),
    schedule(30, now.getTime() + 240_000, 1, "Another MAL Anime", 10030),
  ];
  const result = await buildRollingCatalog("upcoming_5_days", now, 0, "", {
    fetchPage: async () => rows,
    maxPages: 1,
    resolveMappings: async (ids) => new Map(ids.map((id) => [id, [{ source: "test", anilistId: id, type: "TV", imdbIds: [`tt${10000000 + id}`], tvdbId: null, tmdbTvId: null, tmdbMovieIds: [] }]])),
  });
  assert.deepEqual(result.map((meta) => meta.id), ["tt10000010", "tt10000020", "tt10000030"]);
  assert.equal(result[0].extra.nextEpisode, 2);
  assert.equal(result[0].extra.nextAiringAt, rows[0].airingAt);
});

test("previous rolling catalog keeps most-recent schedule order and deduplicates anime", async () => {
  const now = new Date("2026-10-01T00:00:00.000Z");
  const rows = [
    schedule(30, now.getTime() - 60_000, 4, "Anime 30", 10030),
    schedule(10, now.getTime() - 120_000, 9, "Anime 10", 10010),
    schedule(30, now.getTime() - 180_000, 3, "Anime 30", 10030),
    schedule(20, now.getTime() - 240_000, 7, "Anime 20", 10020),
  ];
  const result = await buildRollingCatalog("previous_7_days", now, 0, "", {
    fetchPage: async () => rows,
    maxPages: 1,
    resolveMappings: async (ids) => new Map(ids.map((id) => [id, [{ source: "test", anilistId: id, type: "TV", imdbIds: [`tt${10000000 + id}`], tvdbId: null, tmdbTvId: null, tmdbMovieIds: [] }]])),
  });
  assert.deepEqual(result.map((meta) => meta.id), ["tt10000030", "tt10000010", "tt10000020"]);
});

test("rolling pagination fills a Nuvio page across schedule pages after deduplication", async () => {
  const now = new Date("2026-10-01T00:00:00.000Z");
  const pages = [
    [schedule(1, now.getTime() + 1, 1), schedule(1, now.getTime() + 2, 2), schedule(2, now.getTime() + 3, 1), schedule(2, now.getTime() + 3, 1)],
    [schedule(3, now.getTime() + 4, 1), schedule(2, now.getTime() + 5, 2), schedule(4, now.getTime() + 6, 1), schedule(4, now.getTime() + 6, 1)],
  ];
  const calls = [];
  const result = await buildRollingCatalog("upcoming_5_days", now, 0, "", {
    fetchPage: async (start, end, futureOnly, page, sort) => {
      calls.push({ start, end, futureOnly, page, sort });
      return pages[page - 1] || [];
    },
    maxPages: 2,
    pageSize: 4,
    resolveMappings: async (ids) => new Map(ids.map((id) => [id, [{ source: "test", anilistId: id, type: "TV", imdbIds: [`tt${10000000 + id}`], tvdbId: null, tmdbTvId: null, tmdbMovieIds: [] }]])),
  });
  assert.deepEqual(result.map((meta) => meta.id), ["tt10000001", "tt10000002", "tt10000003", "tt10000004"]);
  assert.deepEqual(calls.map((call) => [call.page, call.futureOnly, call.sort]), [[1, true, "TIME"], [2, true, "TIME"]]);
});

test("rolling search is applied before logical pagination so later schedule pages can fill the result", async () => {
  const now = new Date("2026-10-01T00:00:00.000Z");
  const pages = [
    [schedule(1, now.getTime() + 1, 1, "Other Anime"), schedule(2, now.getTime() + 2, 1, "Target Anime")],
    [schedule(3, now.getTime() + 3, 1, "Target Anime 2")],
  ];
  const calls = [];
  const result = await buildRollingCatalog("upcoming_5_days", now, 0, "target", {
    fetchPage: async (...args) => {
      calls.push(args[3]);
      return pages[args[3] - 1] || [];
    },
    maxPages: 2,
    pageSize: 2,
    resolveMappings: async (ids) => new Map(ids.map((id) => [id, [{ source: "test", anilistId: id, type: "TV", imdbIds: [`tt${10000000 + id}`], tvdbId: null, tmdbTvId: null, tmdbMovieIds: [] }]])),
  });
  assert.deepEqual(result.map((meta) => meta.name), ["Target Anime", "Target Anime 2"]);
  assert.deepEqual(calls, [1, 2]);
});

test("seasonal pagination requests AniList pages using the Nuvio 50-item offset", async () => {
  const calls = [];
  const result = await fetchValidatedSeasonCatalogPage({
    filter: { season: { season: "FALL", year: 2026 }, sort: ["ID"] },
    skip: 50,
    fetchPage: async (_filter, page) => {
      calls.push(page);
      return [{ id: page * 100 + 1, idMal: 10001 }, { id: page * 100 + 2, idMal: 10002 }];
    },
    canonicalizePage: async (rows) => rows.map((row) => ({ id: `mal:${row.idMal}` })),
  });
  assert.deepEqual(calls, [2]);
  assert.deepEqual(result, [{ id: "mal:10001" }, { id: "mal:10002" }]);
});

test("rolling catalogs exclude adult and unsupported-format media", async () => {
  const now = new Date("2026-10-01T00:00:00.000Z");
  const rows = [
    {
      ...schedule(1, now.getTime() + 1, 1, "Allowed TV"),
      media: { ...schedule(1, now.getTime() + 1, 1, "Allowed TV").media, format: "TV", isAdult: false },
    },
    {
      ...schedule(2, now.getTime() + 2, 1, "Adult TV"),
      media: { ...schedule(2, now.getTime() + 2, 1, "Adult TV").media, format: "TV", isAdult: true },
    },
    {
      ...schedule(3, now.getTime() + 3, 1, "Allowed ONA"),
      media: { ...schedule(3, now.getTime() + 3, 1, "Allowed ONA").media, format: "ONA", isAdult: false },
    },
    {
      ...schedule(4, now.getTime() + 4, 1, "Unsupported Manga"),
      media: { ...schedule(4, now.getTime() + 4, 1, "Unsupported Manga").media, format: "MANGA", isAdult: false },
    },
  ];
  const result = await buildRollingCatalog("upcoming_5_days", now, 0, "", {
    fetchPage: async () => rows,
    maxPages: 1,
    resolveMappings: async (ids) => new Map(ids.map((id) => [id, [{ source: "test", anilistId: id, type: "TV", imdbIds: [`tt${10000000 + id}`], tvdbId: null, tmdbTvId: null, tmdbMovieIds: [] }]])),
  });
  assert.deepEqual(result.map((meta) => meta.id), ["tt10000001", "tt10000003"]);
});


test("rolling catalog preserves an entry with AniList fallback when no provider or MAL identity exists", async () => {
  const now = new Date("2026-10-01T00:00:00.000Z");
  const rows = [schedule(900998, now.getTime() + 60_000, 1, "No Provider Rolling Example")];
  const result = await buildRollingCatalog("upcoming_5_days", now, 0, "", {
    fetchPage: async () => rows,
    maxPages: 1,
    resolveMappings: async () => new Map(),
    resolveTMDBMappings: async () => new Map(),
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveAnimeMapperMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async (rows) => {
      imdbCalls += 1;
      if (imdbCalls < 2) return new Map();
      return new Map(rows.map((item) => [Number(item.id), [{
        source: "imdb-search",
        anilistId: Number(item.id),
        type: "TV",
        malId: 60597,
        imdbIds: ["tt16409202"],
        tvdbId: null,
        tmdbTvId: null,
        tmdbMovieIds: [],
        title: "Dawang Raoming 3",
        titles: ["Dawang Raoming 3"],
        year: 2026,
        relation: false,
      }]]));
    },
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, "anilist:900998");
  assert.equal(result[0].extra.identityEvidence, "anilist-id-fallback");
});


test("rolling catalogs enforce the exact requested time range after schedule cache bucketing", async () => {
  const now = new Date("2026-10-01T00:00:00.000Z");
  const rows = [
    schedule(1, now.getTime() - 1, 1),
    schedule(2, now.getTime() + 60_000, 1, "Inside"),
    schedule(3, now.getTime() + (5 * 24 * 60 * 60 * 1000) + 1, 1),
  ];
  const result = await buildRollingCatalog("upcoming_5_days", now, 0, "", {
    fetchPage: async () => rows,
    maxPages: 1,
    resolveMappings: async (ids) => new Map(ids.map((id) => [id, [{
      source: "test",
      anilistId: id,
      type: "TV",
      imdbIds: [`tt${10000000 + id}`],
      tvdbId: null,
      tmdbTvId: null,
      tmdbMovieIds: [],
    }]])),
  });
  assert.deepEqual(result.map((meta) => meta.id), ["tt10000002"]);
});


test("rolling catalogs prefer independently verified IMDb identity over a conflicting TMDB-derived IMDb identity", async () => {
  const now = new Date("2026-10-01T00:00:00.000Z");
  const rows = [schedule(209463, now.getTime() + 60_000, 1, "From Far Away", 12345)];

  const result = await buildRollingCatalog("upcoming_5_days", now, 0, "", {
    fetchPage: async () => rows,
    maxPages: 1,
    resolveMappings: async () => new Map([[209463, [{
      source: "test-direct",
      anilistId: 209463,
      type: "TV",
      imdbIds: [],
      tvdbId: 12345,
      tmdbTvId: null,
      tmdbMovieIds: [],
      title: "From Far Away",
      titles: ["From Far Away"],
      year: 2026,
    }]]]),
    resolveTMDBMappings: async () => new Map([[209463, [{
      source: "tmdb-search",
      anilistId: 209463,
      type: "TV",
      imdbIds: ["tt43691315"],
      tvdbId: null,
      tmdbTvId: 43691315,
      tmdbMovieIds: [],
      title: "From Far Away",
      titles: ["From Far Away"],
      year: 2026,
      tmdbMatchScore: 130,
      tmdbAuthoritative: true,
    }]]]),
    resolveImdbMappings: async () => new Map([[209463, [{
      source: "imdb-search",
      anilistId: 209463,
      type: "TV",
      imdbIds: ["tt18268600"],
      tvdbId: null,
      tmdbTvId: null,
      tmdbMovieIds: [],
      title: "From Far Away",
      titles: ["From Far Away"],
      year: 2026,
    }]]]),
  });

  assert.equal(result[0].id, "tt18268600");
  assert.equal(result[0].extra.identityProvider, "imdb");
  assert.equal(result[0].extra.identityId, "tt18268600");
});

test("catalog identity recovery retries transiently unresolved provider mappings before MAL fallback", async () => {
  let mappingCalls = 0;
  let imdbCalls = 0;
  const row = {
    id: 199353,
    idMal: 60597,
    title: { english: "Dawang Raoming 3", romaji: "Dawang Raoming 3", native: "大王饶命 第三季" },
    synonyms: [],
    format: "TV",
    startDate: { year: 2026 },
    relations: { edges: [] },
  };
  const result = await canonicalizeCatalogPage([row], {
    resolveMappings: async (ids) => {
      mappingCalls += 1;
      mappingCalls += 1;
      return new Map();
    },
    resolveFribbMappings: async () => new Map(),
    resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: async () => new Map(),
    resolveIdMapperMappings: async () => new Map(),
    resolveTMDBMappings: async () => new Map(),
    resolveAnimeMapperMappings: async () => new Map(),
    resolveAnimeMapperRelatedProviderIds: async () => new Map(),
    resolveCanonicalSeriesMappings: async () => new Map(),
    resolveAniBridgeMappings: async () => new Map(),
    resolveTsvMappings: async () => new Map(),
    resolveImdbMappings: async () => new Map(),
    resolveSecondaryMappings: async () => new Map(),
    resolveAlternativeMappings: async () => new Map(),
  });

  assert.equal(result[0].id, "tt16409202");
  assert.equal(mappingCalls, 2);
  assert.equal(imdbCalls, 2);
});
