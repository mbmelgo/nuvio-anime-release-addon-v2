import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

test("probe public BingeCat Beerus search across fresh seeds", async () => {
  const observations = [];
  for (let i = 0; i < 8; i += 1) {
    const seed = randomUUID();
    const params = new URLSearchParams({
      query: "dragon ball super beerus",
      mode: "exact",
      semantic_ratio: "0.78",
      exploration: "0.78",
      quality_bias: "0.6",
      newness_bias: "0.6",
      exclude_history: "0",
      page: "1",
      include_reservoir: "1",
      shuffle_session_seed: seed,
    });
    const response = await fetch("https://bingecat.com/public/meilisearch/api?" + params.toString(), {
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        Referer: "https://bingecat.com/",
      },
    });
    const contentType = response.headers.get("content-type") || "";
    const body = await response.text();
    observations.push({ seed, status: response.status, contentType, prefix: body.slice(0, 240), hasCorrectId: body.includes("tt39395275") });
  }
  console.log(JSON.stringify({ observations }, null, 2));
  assert.equal(observations.some((item) => item.hasCorrectId), true);
});
