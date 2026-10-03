import assert from "node:assert/strict";
import test from "node:test";
import { validateCatalog } from "../scripts/validate-production.mjs";

test("production validator accepts canonical AniList fallback identities", () => {
  assert.equal(validateCatalog({
    metas: [{
      id: "anilist:212653",
      type: "series",
      extra: { anilistId: 212653 },
    }],
  }, "upcoming_season"), true);
});
