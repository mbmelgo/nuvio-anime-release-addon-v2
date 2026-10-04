import assert from "node:assert/strict";
import test from "node:test";
import { selectExactCandidate } from "../lib/bingecat-search-mapping.js";

test("BingeCat accepts a derived installment when the provider keeps the prior franchise year", () => {
  const row = {
    anilistId: 217624,
    type: "TV",
    year: 2026,
    titles: ["PetitCure: Precure Fairies Season 4"],
  };

  const result = selectExactCandidate({
    series: [{
      name: "PetitCure ~Precure Fairies~",
      id: "tt36295071",
      tmdbId: 287971,
      contentType: "series",
      year: 2025,
    }],
  }, row, { allowDerivedTitle: true });

  assert.equal(result?.imdbIds[0], "tt36295071");
  assert.equal(result?.tmdbTvId, 287971);
  assert.equal(result?.year, null);
});
