import test from "node:test";

const queries = [
  "PetitCure ~Precure Fairies~",
  "SSS-Class Revival Hunter",
  "Isekai Tensei Soudouki",
  "Kizuguchi to Houtai",
];

test("live BingeCat investigation probe", async () => {
  for (const query of queries) {
    const params = new URLSearchParams({
      query,
      mode: "exact",
      semantic_ratio: "0",
      exploration: "0",
      quality_bias: "0",
      newness_bias: "0",
      exclude_history: "0",
      page: "1",
      shuffle_session_seed: "nuvio-investigation-20261004",
      include_reservoir: "1",
    });
    const response = await fetch("https://bingecat.com/public/meilisearch/api?" + params, {
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        Referer: "https://bingecat.com/",
      },
    });
    const body = await response.text();
    console.log(JSON.stringify({
      query,
      status: response.status,
      contentType: response.headers.get("content-type"),
      bodyPrefix: body.slice(0, 300),
    }));
  }
});