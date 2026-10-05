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
