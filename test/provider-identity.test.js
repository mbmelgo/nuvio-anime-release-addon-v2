import assert from "node:assert/strict";
import test from "node:test";
import { getProviderCandidates, selectProviderIdentity } from "../lib/provider-identity.js";

function media(overrides = {}) {
  return {
    anilistId: 269,
    id: 269,
    format: "TV",
    title: { english: "Bleach", romaji: "Bleach" },
    startDate: { year: 2004 },
    ...overrides,
  };
}

test("provider identity prefers TMDB over IMDb and TVDB when all are valid", () => {
  const records = [{
    source: "arm",
    anilistId: 269,
    type: "TV",
    imdbIds: ["tt0434665"],
    tvdbId: 30984,
    tmdbTvId: 30984,
    tmdbMovieIds: [],
    title: "Bleach",
    year: 2004,
  }];
  const selected = selectProviderIdentity(media(), getProviderCandidates(media(), records));
  assert.equal(selected?.provider, "tmdb");
  assert.equal(selected?.id, "30984");
});

test("provider identity prefers IMDb over TVDB when TMDB is unavailable", () => {
  const row = media({ relatedProviderIds: ["tvdb:30984"] });
  const records = [{
    source: "arm",
    anilistId: 269,
    type: "TV",
    imdbIds: ["tt0434665"],
    tvdbId: 30984,
    tmdbTvId: null,
    tmdbMovieIds: [],
    title: "Bleach",
    year: 2004,
  }];

  const selected = selectProviderIdentity(row, getProviderCandidates(row, records));
  assert.equal(selected?.provider, "imdb");
  assert.equal(selected?.id, "tt0434665");
});

test("provider identity rejects a weak related TVDB mapping", () => {
  const row = media({
    relations: {
      edges: [{
        relationType: "PREQUEL",
        node: {
          id: 1,
          title: { english: "Bleach", romaji: "Bleach" },
          format: "TV",
          startDate: { year: 2004 },
        },
      }],
    },
  });
  const records = [{
    source: "arm",
    anilistId: 269,
    type: "TV",
    imdbIds: [],
    tvdbId: 30984,
    tmdbTvId: null,
    tmdbMovieIds: [],
    title: "Bleach",
    year: 2004,
  }];
  const selected = selectProviderIdentity(row, getProviderCandidates(row, records));
  assert.equal(selected, null);
});


test("provider identity accepts an exact derived one-word IMDb search title", () => {
  const row = media({
    anilistId: 100,
    title: { english: "POKÉTOON (2026)", romaji: "POKÉTOON (2026)" },
    startDate: { year: 2026 },
  });
  const records = [{
    source: "imdb-search",
    anilistId: 100,
    type: "TV",
    imdbIds: ["tt12471116"],
    title: "Pokétoon",
    titles: ["Pokétoon"],
    year: null,
    derivedTitle: true,
    derivedSearchTitle: "POKÉTOON",
  }];

  const selected = selectProviderIdentity(row, getProviderCandidates(row, records));
  assert.equal(selected?.provider, "imdb");
  assert.equal(selected?.id, "tt12471116");
});

test("provider identity rejects a shorter one-word IMDb title from a multi-word derived search", () => {
  const row = media({
    anilistId: 101,
    title: { english: "Dragon Quest 2", romaji: "Dragon Quest 2" },
    startDate: { year: 2026 },
  });
  const records = [{
    source: "imdb-search",
    anilistId: 101,
    type: "TV",
    imdbIds: ["tt99999999"],
    title: "Dragon",
    titles: ["Dragon"],
    year: null,
    derivedTitle: true,
    derivedSearchTitle: "Dragon Quest",
  }];

  const selected = selectProviderIdentity(row, getProviderCandidates(row, records));
  assert.equal(selected, null);
});


test("related provider protection accepts a corroborated current-title identity when the first mapping lacks semantic metadata", () => {
  const media = {
    anilistId: 191832,
    format: "ONA",
    startDate: { year: 2026 },
    title: { english: "Link Click Season 3", romaji: "Shiguang Dailiren III", native: "时光代理人 第三季" },
    synonyms: [],
    relations: { edges: [{ relationType: "PREQUEL", node: { id: 170166, title: { english: "Link Click: Bridon Arc" } } }] },
    relatedProviderIds: ["imdb:tt14976292"],
    relatedProviderTitles: ["Link Click: Bridon Arc"],
  };
  const records = [
    { source: "arm", anilistId: 191832, type: "TV", imdbIds: ["tt14976292"], title: null, year: null },
    { source: "imdb-search", anilistId: 191832, type: "TV", imdbIds: ["tt14976292"], title: "Link Click Season 3", titles: ["Link Click"], derivedTitle: true, derivedInstallmentTitle: true, derivedSearchTitle: "Link Click", year: null },
  ];
  assert.equal(selectProviderIdentity(media, getProviderCandidates(media, records))?.id, "tt14976292");
});

test("related provider protection still rejects a parent-only identity without current-title corroboration", () => {
  const media = {
    anilistId: 155723,
    format: "ONA",
    startDate: { year: 2026 },
    title: { english: null, romaji: "Wushen Zhuzai: Da Wei Pian", native: "武神主宰：大威篇" },
    synonyms: [],
    relations: { edges: [{ relationType: "PREQUEL", node: { id: 117168, title: { english: "The God of War Dominates" } } }] },
    relatedProviderIds: ["imdb:tt20769560"],
    relatedProviderTitles: ["The God of War Dominates"],
  };
  const records = [{ source: "arm", anilistId: 155723, type: "TV", imdbIds: ["tt20769560"], title: null, year: null }];
  assert.equal(selectProviderIdentity(media, getProviderCandidates(media, records)), null);
});

test("related provider protection accepts exact Detective Conan corroboration", () => {
  const media = {
    anilistId: 235,
    format: "TV",
    startDate: { year: 1996 },
    title: { english: "Detective Conan", romaji: "Meitantei Conan", native: "名探偵コナン" },
    synonyms: ["Case Closed"],
    relations: { edges: [{ relationType: "SIDE_STORY", node: { id: 112094, title: { romaji: "Meitantei Conan: Keisatsu Gakkou-hen - Wild Police Story" } } }] },
    relatedProviderIds: ["imdb:tt0131179"],
    relatedProviderTitles: ["Meitantei Conan: Keisatsu Gakkou-hen - Wild Police Story"],
  };
  const records = [
    { source: "arm", anilistId: 235, type: "TV", imdbIds: ["tt0131179"], title: null, year: null },
    { source: "imdb-search", anilistId: 235, type: "TV", imdbIds: ["tt0131179"], title: "Detective Conan", titles: ["Detective Conan"], derivedTitle: true, derivedSearchTitle: "Detective Conan", year: null },
  ];
  assert.equal(selectProviderIdentity(media, getProviderCandidates(media, records))?.id, "tt0131179");
});


test("provider identity rejects fuzzy derived-title collision with another franchise", () => {
  const row = media({
    anilistId: 206814,
    title: { english: "Dragon Ball Super: Beerus", romaji: "Dragon Ball Super: Beerus" },
    startDate: { year: 2026 },
  });
  const records = [{
    source: "imdb-search",
    anilistId: 206814,
    type: "TV",
    imdbIds: ["tt8433216"],
    title: "Super Dragon Ball Heroes",
    titles: ["Super Dragon Ball Heroes"],
    year: 2018,
    derivedTitle: true,
    derivedSearchTitle: "Dragon Ball Super",
  }];

  assert.equal(selectProviderIdentity(row, getProviderCandidates(row, records)), null);
});

test("provider identity rejects a weak IMDb mapping without semantic evidence", () => {
  const row = media({
    anilistId: 206814,
    title: { english: "Dragon Ball Super: Beerus", romaji: "Dragon Ball Super: Beerus" },
    startDate: { year: 2026 },
  });
  const records = [{
    source: "arm",
    anilistId: 206814,
    type: "TV",
    imdbIds: ["tt8433216"],
    tvdbId: null,
    tmdbTvId: null,
    tmdbMovieIds: [],
  }];

  assert.equal(selectProviderIdentity(row, getProviderCandidates(row, records)), null);
});

test("provider identity rejects a direct mapping with the right AniList ID but an unrelated provider title", () => {
  const row = media({
    anilistId: 206814,
    title: { english: "Dragon Ball Super: Beerus", romaji: "Dragon Ball Super: Beerus" },
    startDate: { year: 2026 },
  });
  const records = [{
    source: "anime-mapper",
    anilistId: 206814,
    type: "TV",
    imdbIds: ["tt8433216"],
    title: "Super Dragon Ball Heroes",
    titles: ["Super Dragon Ball Heroes"],
    year: 2018,
  }];

  assert.equal(selectProviderIdentity(row, getProviderCandidates(row, records)), null);
});

test("provider identity accepts the dedicated Dragon Ball Super: Beerus IMDb title", () => {
  const row = media({
    anilistId: 206814,
    title: { english: "Dragon Ball Super: Beerus", romaji: "Dragon Ball Super: Beerus" },
    startDate: { year: 2026 },
  });
  const records = [{
    source: "imdb-search",
    anilistId: 206814,
    type: "TV",
    imdbIds: ["tt39395275"],
    title: "Doragon Bôru Sûpâ Birusu",
    titles: ["Dragon Ball Super: Beerus"],
    year: 2026,
  }];

  assert.equal(selectProviderIdentity(row, getProviderCandidates(row, records))?.id, "tt39395275");
});

test("provider identity accepts a verified canonical series root for a season entry", () => {
  const row = media({
    anilistId: 185874,
    title: { english: "BLEACH: Thousand-Year Blood War - The Calamity", romaji: "BLEACH: Sennen Kessen-hen - Kashin-tan" },
    startDate: { year: 2026 },
  });
  const records = [{
    source: "imdb-search-canonical-series",
    anilistId: 185874,
    type: "TV",
    imdbIds: ["tt0434665"],
    title: "Bleach",
    titles: ["Bleach"],
    year: 2004,
    canonicalSeries: true,
    canonicalSeriesAnilistId: 269,
    canonicalSeriesMalId: 269,
    canonicalSeriesTitle: "Bleach",
  }];

  assert.equal(selectProviderIdentity(row, getProviderCandidates(row, records))?.id, "tt0434665");
});
