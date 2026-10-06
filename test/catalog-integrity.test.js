import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRollingCatalog,
  fetchValidatedSeasonCatalogPage,
  getSeasonInfo,
  isEligibleRollingMedia,
  toCatalogIdentity,
} from "../api/catalog-source.js";
import {
  ANILIST_PAGE_SIZE,
  NUVIO_PAGE_SIZE,
  catalogDefinitions,
} from "../lib/catalog-config.js";
import { filterCatalogMetasBySearch, toMetaFromAniList } from "../lib/catalog-meta.js";

const SEASON_INFO = {
  ongoing: { season: "FALL", year: 2026 },
  previous: { season: "SUMMER", year: 2026 },
  upcoming: { season: "WINTER", year: 2027 },
};

function media(id, {
  malId = null,
  title = `Anime ${id}`,
  format = "TV",
  isAdult = false,
} = {}) {
  return {
    id,
    ...(malId ? { idMal: malId } : {}),
    title: { english: title, romaji: title, native: title },
    coverImage: { large: `https://example.test/${id}.jpg` },
    status: "RELEASING",
    format,
    isAdult,
    startDate: { year: 2026, month: 10, day: 1 },
    endDate: { year: null },
    genres: ["Action"],
  };
}

function schedule(id, airingAt, episode, options = {}) {
  return {
    id: `${id}-${episode}`,
    airingAt,
    episode,
    media: media(id, options),
  };
}

function assertCatalogMeta(meta) {
  assert.ok(meta && typeof meta === "object");
  assert.match(meta.id, /^(tt\d+|tvdb:[1-9]\d*|tmdb:[1-9]\d*|mal:[1-9]\d*|anilist:[1-9]\d*)$/);
  assert.equal(meta.type, "series");
  assert.equal(typeof meta.name, "string");
  assert.ok(meta.name.length > 0);
  assert.equal(meta.posterShape, "poster");
  assert.ok(meta.extra && Number.isInteger(Number(meta.extra.anilistId)));
  assert.ok(Number(meta.extra.anilistId) > 0);
  if (/^(tt\d+|tvdb:|tmdb:)/.test(meta.id)) assert.ok(meta.extra.identityProvider);
}

test("catalog definitions expose exactly the supported five catalogs with one consistent Nuvio contract", () => {
  const definitions = catalogDefinitions(SEASON_INFO);

  assert.deepEqual(
    definitions.map(({ id }) => id),
    ["upcoming_season", "current_season", "previous_season", "upcoming_5_days", "previous_7_days"],
  );
  assert.equal(new Set(definitions.map(({ id }) => id)).size, definitions.length);

  for (const definition of definitions) {
    assert.equal(definition.type, "series");
    assert.equal(definition.pageSize, NUVIO_PAGE_SIZE);
    assert.deepEqual(definition.extra.map(({ name }) => name), ["search", "skip"]);
  }
  assert.equal(ANILIST_PAGE_SIZE, NUVIO_PAGE_SIZE);
});

test("season calculation always produces three adjacent seasonal slots", () => {
  const cases = [
    ["2026-01-15T00:00:00Z", ["FALL:2025", "WINTER:2026", "SPRING:2026"]],
    ["2026-04-15T00:00:00Z", ["WINTER:2026", "SPRING:2026", "SUMMER:2026"]],
    ["2026-07-15T00:00:00Z", ["SPRING:2026", "SUMMER:2026", "FALL:2026"]],
    ["2026-10-15T00:00:00Z", ["SUMMER:2026", "FALL:2026", "WINTER:2027"]],
  ];

  for (const [date, expected] of cases) {
    const info = getSeasonInfo(new Date(date));
    assert.deepEqual(
      [info.previous, info.ongoing, info.upcoming].map(({ season, year }) => `${season}:${year}`),
      expected,
    );
  }
});

test("catalog identity resolution never emits an invalid downstream identity", () => {
  assert.equal(toCatalogIdentity(null), null);
  assert.equal(toCatalogIdentity({ extra: {} }), null);
  assert.equal(toCatalogIdentity({ extra: { malId: "0", anilistId: "0" } }), null);
  assert.equal(toCatalogIdentity({ extra: { malId: "123", anilistId: "456" } }).id, "mal:123");
  assert.equal(toCatalogIdentity({ extra: { anilistId: "456" } }).id, "anilist:456");
});

test("seasonal pagination returns a unique, bounded, contract-valid catalog page", async () => {
  const rows = [
    media(1, { malId: 1001 }),
    media(2),
    media(3),
    media(4),
  ];
  const result = await fetchValidatedSeasonCatalogPage({
    filter: { season: SEASON_INFO.ongoing, sort: ["ID"] },
    skip: 0,
    fetchPage: async () => rows,
    canonicalizePage: async (sourceRows) =>
      sourceRows.map((row) => {
        const meta = toCatalogIdentity(toMetaFromAniList(row.id, row));
        return meta ? { ...meta, type: "series" } : null;
      }).filter(Boolean),
  });

  assert.ok(result.length <= NUVIO_PAGE_SIZE);
  assert.equal(new Set(result.map(({ id }) => id)).size, result.length);
  for (const meta of result) assertCatalogMeta(meta);
});

test("rolling catalogs enforce the shared eligibility boundary", () => {
  for (const format of ["TV", "TV_SHORT", "ONA", "OVA", "SPECIAL", "MOVIE"]) {
    assert.equal(isEligibleRollingMedia(media(1, { format, isAdult: false })), true);
  }
  assert.equal(isEligibleRollingMedia(media(1, { format: "MANGA", isAdult: false })), false);
  assert.equal(isEligibleRollingMedia(media(1, { format: "TV", isAdult: true })), false);
});

test("upcoming rolling catalog returns unique contract-valid anime and coherent next-airing metadata", async () => {
  const now = new Date("2026-10-01T00:00:00.000Z");
  const rows = [
    schedule(1, now.getTime() + 60_000, 2, { malId: 1001 }),
    schedule(1, now.getTime() + 120_000, 3, { malId: 1001 }),
    schedule(2, now.getTime() + 180_000, 1),
    schedule(3, now.getTime() + 240_000, 1, { format: "MANGA" }),
    schedule(4, now.getTime() + 300_000, 1, { isAdult: true }),
  ];

  const result = await buildRollingCatalog("upcoming_5_days", now, 0, "", {
    fetchPage: async () => rows,
    maxPages: 1,
    resolveMappings: async (ids) => new Map(ids.map((id) => [id, [{ source: "test", anilistId: id, type: "TV", imdbIds: [`tt${10000000 + id}`], tvdbId: null, tmdbTvId: null, tmdbMovieIds: [] }]])),
  });

  assert.deepEqual(result.map(({ id }) => id), ["tt10000001", "tt10000002"]);
  assert.equal(new Set(result.map(({ id }) => id)).size, result.length);

  for (const meta of result) {
    assertCatalogMeta(meta);
    assert.equal(meta.extra.nextEpisode, meta.extra.episode);
    assert.equal(meta.extra.nextAiringAt, meta.extra.airingAt);
  }
});

test("rolling catalogs apply the same canonical series identity as seasonal catalogs", async () => {
  const now = new Date("2026-10-01T00:00:00.000Z");
  const rows = [schedule(210482, now.getTime() + 60_000, 1, {
    malId: 61469,
    title: "STEEL BALL RUN JoJo's Bizarre Adventure 2nd - 3rd STAGE",
    format: "ONA",
  })];
  const canonicalRoot = new Map([[210482, {
    canonicalAnilistId: 14719,
    canonicalMalId: 14719,
    canonicalTitle: "JoJo's Bizarre Adventure",
    canonicalYear: 2012,
  }]]);
  const result = await buildRollingCatalog("upcoming_5_days", now, 0, "", {
    fetchPage: async () => rows,
    maxPages: 1,
    resolveMappings: async () => new Map(),
    resolveCanonicalSeriesMappings: async () => canonicalRoot,
    resolveImdbMappings: async (canonicalRows) => new Map(
      canonicalRows.map((row) => [Number(row.id), [{
        source: "imdb-search",
        anilistId: Number(row.id),
        type: "TV",
        imdbIds: ["tt2359704"],
        title: "JoJo's Bizarre Adventure",
        titles: ["JoJo's Bizarre Adventure"],
        year: 2012,
      }]]),
    ),
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "tt2359704");
  assert.equal(result[0].extra.identityCanonicalSeries, true);
  assert.equal(result[0].extra.anilistId, 210482);
  assert.equal(result[0].extra.episode, 1);
});

test("previous rolling catalog returns unique contract-valid anime without future-only fields", async () => {
  const now = new Date("2026-10-01T00:00:00.000Z");
  const rows = [
    schedule(1, now.getTime() - 60_000, 8, { malId: 1001 }),
    schedule(1, now.getTime() - 120_000, 7, { malId: 1001 }),
    schedule(2, now.getTime() - 180_000, 3),
  ];

  const result = await buildRollingCatalog("previous_7_days", now, 0, "", {
    fetchPage: async () => rows,
    maxPages: 1,
    resolveMappings: async (ids) => new Map(ids.map((id) => [id, [{ source: "test", anilistId: id, type: "TV", imdbIds: [`tt${10000000 + id}`], tvdbId: null, tmdbTvId: null, tmdbMovieIds: [] }]])),
  });

  assert.deepEqual(result.map(({ id }) => id), ["tt10000001", "tt10000002"]);
  for (const meta of result) {
    assertCatalogMeta(meta);
    assert.equal(Object.hasOwn(meta.extra, "nextEpisode"), false);
    assert.equal(Object.hasOwn(meta.extra, "nextAiringAt"), false);
  }
});

test("catalog search matches all supported title identities without changing catalog shape", () => {
  const metas = [
    toMetaFromAniList(1, media(1, { title: "English Title" })),
    toMetaFromAniList(2, media(2, { title: "Other Title" })),
  ];

  metas[0].extra.titleNative = "日本語タイトル";
  metas[0].extra.titleRomaji = "Nihongo Title";

  for (const query of ["english", "NIHONGO", "日本語"]) {
    const result = filterCatalogMetasBySearch(metas, query);
    assert.equal(result.length, 1);
    assert.equal(result[0].extra.anilistId, 1);
  }
  assert.equal(filterCatalogMetasBySearch(metas, "").length, 2);
});
