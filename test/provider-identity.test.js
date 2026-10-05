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

test("provider identity selects a valid IMDb mapping", () => {
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
