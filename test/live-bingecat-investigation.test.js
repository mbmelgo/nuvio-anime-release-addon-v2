import test from "node:test";

const queries = [
  "PetitCure ~Precure Fairies~",
  "SSS-Class Revival Hunter",
  "Isekai Tensei Soudouki",
  "Kizuguchi to Houtai",
  "Link Click Season 3",
  "Little Shark's Day Out Season 2",
  "MARRIAGETOXIN 2nd Season",
  "Punirunes Puni 4",
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
    const payload = await response.json();
    const hits = [
      ...(Array.isArray(payload?.movies) ? payload.movies : []),
      ...(Array.isArray(payload?.series) ? payload.series : []),
    ].slice(0, 8).map((item) => ({
      name: item?.name,
      id: item?.id,
      contentType: item?.contentType,
      year: item?.year,
      tmdbId: item?.tmdbId,
    }));
    console.log(JSON.stringify({ query, status: response.status, hits }));
    if (!response.ok) throw new Error("BingeCat probe HTTP " + response.status);
  }
});
