import assert from "node:assert/strict";
import test from "node:test";
import {
  getBingeCatCandidates,
  selectBingeCatIdentity,
  normalizeTitle,
  titlesCompatible,
} from "../lib/bingecat-identity.js";
import { normalizeMappingRecord } from "../lib/mapping-record.js";

const MAPPINGS = {
  269: { anilistId: 269, imdbIds: ["tt0434665"], tvdbId: 74796, tmdbTvId: 30984, type: "TV" },
  158871: { anilistId: 158871, imdbIds: ["tt26692417"], tvdbId: 76703, tmdbTvId: 220150, type: "TV", season: { tvdb: 20, tmdb: 1 } },
  516: { anilistId: 516, imdbIds: ["tt0434693"], tvdbId: 75414, tmdbTvId: 63164, type: "TV" },
  21: { anilistId: 21, imdbIds: ["tt0388629"], tvdbId: 81797, tmdbTvId: 37854, type: "TV" },
  185262: { anilistId: 185262, imdbIds: ["tt38646634"], tvdbId: 457532, tmdbTvId: 280049, type: "TV", season: { tvdb: 1, tmdb: 1 } },
  179955: { anilistId: 179955, imdbIds: ["tt35346717"], tvdbId: 452710, tmdbTvId: 260823, type: "TV", season: { tvdb: 1, tmdb: 1 } },
  159309: { anilistId: 159309, imdbIds: ["tt16255458"], tvdbId: 412826, tmdbTvId: 139512, type: "TV", season: { tvdb: 2, tmdb: 2 } },
};

const getMapping = (id) => normalizeMappingRecord(MAPPINGS[id], "mapping-fixture");

test("mapping normalization rejects malformed source records", () => {
  assert.equal(normalizeMappingRecord(null), null);
  assert.equal(normalizeMappingRecord({ anilistId: 0 }), null);
  assert.equal(
    normalizeMappingRecord({ anilistId: 21, imdb_id: ["bad", "tt0388629"], tvdb_id: "81797" }).imdbIds[0],
    "tt0388629",
  );
});

test("mapping fixtures expose BingeCat-compatible IDs for representative regression cases", () => {
  for (const id of Object.keys(MAPPINGS)) {
    const record = getMapping(id);
    assert.ok(record);
    assert.ok(record.imdbIds.length > 0);
    assert.ok(record.tvdbId > 0);
    assert.ok(record.tmdbTvId > 0);
  }
});

test("BingeCat candidate ordering prefers IMDb over TVDB and TMDB", () => {
  const candidates = getBingeCatCandidates(
    { anilistId: 21, title: { english: "ONE PIECE", romaji: "One Piece" }, format: "TV" },
    [getMapping(21)],
  );

  assert.deepEqual(candidates.map((candidate) => candidate.stremioId), [
    "tt0388629",
    "tvdb:81797",
    "tmdb:37854",
  ]);
});

test("Pokémon Horizons keeps its own franchise identity", () => {
  const media = {
    anilistId: 158871,
    title: { english: "Pokémon Horizons: The Series", romaji: "Pocket Monsters (2023)" },
    format: "TV",
  };
  const selected = selectBingeCatIdentity(media, getBingeCatCandidates(media, [getMapping(158871)]));
  assert.equal(selected.id, "tt26692417");
});

test("final selection prioritizes a valid IMDb identity over a valid TVDB identity", () => {
  const candidates = [
    {
      provider: "tvdb",
      id: "331753",
      stremioId: "tvdb:331753",
      mediaType: "tv",
      anilistId: 195604,
      title: "Black Clover Season 2",
      relation: true,
    },
    {
      provider: "imdb",
      id: "tt7441658",
      stremioId: "tt7441658",
      mediaType: "tv",
      anilistId: 195604,
      title: "Black Clover",
      derivedTitle: true,
    },
  ];

  const selected = selectBingeCatIdentity({
    anilistId: 195604,
    title: { english: "Black Clover Season 2", romaji: "Black Clover 2nd Season" },
    startDate: { year: 2026 },
    format: "TV",
  }, candidates);

  assert.equal(selected.stremioId, "tt7441658");
  assert.equal(selected.provider, "imdb");
});

test("candidate selection rejects a franchise-mismatched candidate", () => {
  const candidates = [
    { provider: "imdb", id: "tt1234567", title: "Pokémon", year: 1997, mediaType: "tv" },
    { provider: "imdb", id: "tt26692417", title: "Pokémon Horizons: The Series", year: 2023, mediaType: "tv" },
  ];
  const selected = selectBingeCatIdentity({
    title: { english: "Pokémon Horizons: The Series", romaji: "Pocket Monsters (2023)" },
    startDate: { year: 2023 },
    format: "TV",
  }, candidates);

  assert.equal(selected.id, "tt26692417");
});

test("AniMap provider identities require independent corroboration", () => {
  const media = {
    anilistId: 195604,
    title: { english: "Black Clover Season 2", romaji: "Black Clover 2nd Season" },
    startDate: { year: 2026 },
    format: "TV",
  };

  const animapOnly = getBingeCatCandidates(media, [{
    source: "animap",
    anilistId: 195604,
    type: "TV",
    tvdbId: 36880,
    imdbIds: [],
    tmdbTvId: null,
    tmdbMovieIds: [],
    title: "Black Clover Season 2",
    year: 2026,
  }]);

  assert.equal(selectBingeCatIdentity(media, animapOnly), null);

  const corroborated = getBingeCatCandidates(media, [
    {
      source: "animap",
      anilistId: 195604,
      type: "TV",
      tvdbId: 36880,
      imdbIds: [],
      tmdbTvId: null,
      tmdbMovieIds: [],
      title: "Black Clover Season 2",
      year: 2026,
    },
    {
      source: "arm",
      anilistId: 195604,
      type: "TV",
      tvdbId: 36880,
      imdbIds: [],
      tmdbTvId: null,
      tmdbMovieIds: [],
      title: "Black Clover Season 2",
      year: 2026,
    },
  ]);

  const selected = selectBingeCatIdentity(media, corroborated);
  assert.equal(selected.stremioId, "tvdb:36880");
});

test("candidate validation rejects a mapping record for a different AniList item", () => {
  const media = { anilistId: 21, title: { english: "ONE PIECE" }, format: "TV" };
  const candidates = getBingeCatCandidates(media, [{
    source: "arm",
    anilistId: 269,
    imdbIds: ["tt0434665"],
    tvdbId: 74796,
    tmdbTvId: 30984,
    tmdbMovieIds: [],
    type: "TV",
  }]);

  assert.equal(selectBingeCatIdentity(media, candidates), null);
});

test("candidate validation rejects materially different titles", () => {
  assert.equal(titlesCompatible(["Pokémon Horizons: The Series"], ["Pokémon"]), false);
  assert.equal(titlesCompatible(["ONE PIECE"], ["One Piece"]), true);
  assert.equal(normalizeTitle("  One-Piece: The Series! "), "one piece the series");
});

test("candidate validation rejects a related parent identity even when the provider mapping shares the AniList ID", () => {
  const media = {
    anilistId: 206814,
    title: { english: "Dragon Ball Super: Beerus", romaji: "Dragon Ball Super: Beerus" },
    startDate: { year: 2026 },
    format: "TV",
    relations: {
      edges: [{
        relationType: "PREQUEL",
        node: {
          id: 813,
          title: { english: "Dragon Ball Z", romaji: "Dragon Ball Z" },
          synonyms: [],
        },
      }],
    },
  };

  const candidates = getBingeCatCandidates(media, [{
    source: "animeapi",
    anilistId: 206814,
    type: "TV",
    imdbIds: ["tt0121220"],
    tvdbId: 81472,
    tmdbTvId: 12971,
    tmdbMovieIds: [],
    title: "Dragon Ball Z",
    year: 1989,
  }]);

  assert.equal(selectBingeCatIdentity(media, candidates), null);
});

test("Ghost Meets Gal! rejects its Cardfight!! Vanguard parent identity", () => {
  const media = {
    anilistId: 214703,
    title: { english: "Ghost Meets Gal!", romaji: "Ghost Meets Gal!" },
    startDate: { year: 2026 },
    format: "TV",
    relations: {
      edges: [{
        relationType: "SPIN_OFF",
        node: {
          id: 9539,
          title: { english: "Cardfight!! Vanguard", romaji: "Cardfight!! Vanguard" },
          synonyms: [],
        },
      }],
    },
  };

  const candidates = getBingeCatCandidates(media, [{
    source: "anibridge",
    anilistId: 214703,
    type: "TV",
    imdbIds: ["tt2549176"],
    tvdbId: 82222,
    tmdbTvId: 12345,
    tmdbMovieIds: [],
    title: "Cardfight!! Vanguard",
    year: 2011,
  }]);

  assert.equal(selectBingeCatIdentity(media, candidates), null);
});

test("exact strong source IDs survive title mismatches when BingeCat verification is unavailable", () => {
  const media = {
    anilistId: 211181,
    title: { english: "Mu Shen Ji 4", romaji: "Mu Shen Ji 4" },
    startDate: { year: 2026 },
    format: "TV",
  };
  const selected = selectBingeCatIdentity(media, getBingeCatCandidates(media, [{
    source: "anime-mapper",
    anilistId: 211181,
    type: "TV",
    imdbIds: ["tt33501934"],
    tvdbId: null,
    tmdbTvId: null,
    tmdbMovieIds: [],
    title: "Tales of Herding Gods 4",
    year: 2026,
  }]));

  assert.equal(selected?.stremioId, "tt33501934");
  assert.equal(selected?.bingecatVerified, false);
});

test("selected identity is a single stable BingeCat ID", () => {
  const media = { anilistId: 21, title: { english: "ONE PIECE" }, startDate: { year: 1999 }, format: "TV" };
  const selected = selectBingeCatIdentity(media, getBingeCatCandidates(media, [getMapping(21)]));

  assert.equal(selected.id, "tt0388629");
  assert.equal(selected.stremioId, "tt0388629");
  assert.equal(selected.provider, "imdb");
});

test("representative regression cases resolve to their expected BingeCat identity", () => {
  const expected = {
    269: "tt0434665",
    158871: "tt26692417",
    516: "tt0434693",
    21: "tt0388629",
    185262: "tt38646634",
    179955: "tt35346717",
    159309: "tt16255458",
  };

  for (const [anilistId, expectedId] of Object.entries(expected)) {
    const media = { anilistId: Number(anilistId), title: { english: "Test Anime" }, format: "TV" };
    const selected = selectBingeCatIdentity(media, getBingeCatCandidates(media, [getMapping(anilistId)]));
    assert.equal(selected.id, expectedId, anilistId);
  }
});


test("candidate selection can choose a different valid provider identity when the preferred identity is already used", () => {
  const candidates = [
    { provider: "imdb", id: "tt1111111", stremioId: "tt1111111", mediaType: "tv", anilistId: 1 },
    { provider: "tvdb", id: "222222", stremioId: "tvdb:222222", mediaType: "tv", anilistId: 1 },
  ];

  const selected = selectBingeCatIdentity(
    { anilistId: 1, title: { english: "Test Anime" }, format: "TV" },
    candidates,
    { excludeIds: new Set(["tt1111111"]) },
  );

  assert.equal(selected.stremioId, "tvdb:222222");
});



test("multiple relation-derived sources do not count as independent corroboration", () => {
  const media = {
    anilistId: 214703,
    title: { english: "Ghost Meets Gal!", romaji: "Ghost Meets Gal!" },
    startDate: { year: 2026 },
    format: "TV",
  };
  const candidates = getBingeCatCandidates(media, [
    {
      source: "imdb-search-relation",
      anilistId: 214703,
      type: "TV",
      imdbIds: ["tt2549176"],
      title: "Cardfight!! Vanguard",
      relation: true,
    },
    {
      source: "animeapi-relation",
      anilistId: 214703,
      type: "TV",
      imdbIds: ["tt2549176"],
      title: "Cardfight!! Vanguard",
      relation: true,
    },
  ]);
  assert.equal(selectBingeCatIdentity(media, candidates), null);
});

test("relation-derived provider identities require independent corroboration", () => {
  const media = {
    anilistId: 214703,
    title: { english: "Ghost Meets Gal!", romaji: "Ghost Meets Gal!" },
    startDate: { year: 2026 },
    format: "TV",
  };

  const relationOnly = getBingeCatCandidates(media, [{
    source: "imdb-search-relation",
    anilistId: 214703,
    type: "TV",
    imdbIds: ["tt2549176"],
    tvdbId: null,
    tmdbTvId: null,
    tmdbMovieIds: [],
    title: "Ghost Meets Gal!",
    relation: true,
  }]);

  assert.equal(selectBingeCatIdentity(media, relationOnly), null);

  const corroborated = getBingeCatCandidates(media, [
    {
      source: "imdb-search-relation",
      anilistId: 214703,
      type: "TV",
      imdbIds: ["tt2549176"],
      tvdbId: null,
      tmdbTvId: null,
      tmdbMovieIds: [],
      title: "Ghost Meets Gal!",
      relation: true,
    },
    {
      source: "arm",
      anilistId: 214703,
      type: "TV",
      imdbIds: ["tt2549176"],
      tvdbId: null,
      tmdbTvId: null,
      tmdbMovieIds: [],
      title: "Ghost Meets Gal!",
    },
  ]);

  assert.equal(selectBingeCatIdentity(media, corroborated)?.stremioId, "tt2549176");
});

test("candidate validation rejects a mapping whose media type conflicts with the AniList format", () => {
  const selected = selectBingeCatIdentity(
    { anilistId: 1, title: { english: "Test Movie" }, format: "MOVIE" },
    [{
      provider: "imdb",
      id: "tt1234567",
      stremioId: "tt1234567",
      mediaType: "tv",
      anilistId: 1,
    }],
  );

  assert.equal(selected, null);
});


test("OVA entries can use an exact movie identity", () => {
  const selected = selectBingeCatIdentity(
    {
      anilistId: 212653,
      title: { english: "Patlabor EZY File 3" },
      startDate: { year: 2027 },
      format: "OVA",
    },
    [{
      provider: "imdb",
      id: "tt39382762",
      stremioId: "tt39382762",
      mediaType: "movie",
      title: "Patlabor EZY File 3",
      year: 2027,
      anilistId: 212653,
    }],
  );

  assert.equal(selected.id, "tt39382762");
});

test("TV entries still reject movie identities", () => {
  const selected = selectBingeCatIdentity(
    {
      anilistId: 1,
      title: { english: "Test TV" },
      startDate: { year: 2026 },
      format: "TV",
    },
    [{
      provider: "imdb",
      id: "tt1234567",
      stremioId: "tt1234567",
      mediaType: "movie",
      title: "Test TV",
      year: 2026,
      anilistId: 1,
    }],
  );

  assert.equal(selected, null);
});
