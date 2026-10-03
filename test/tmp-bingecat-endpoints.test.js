import test from "node:test";

test("temporary BingeCat AI search investigation", async () => {
  const titles = [
    "Girls und Panzer das Finale Part 5",
    "Norman the Snowman Kodomo-tachi no Hitotsuboshi",
    "Komadori Mofmof Parade",
    "Kidou Keisatsu Patlabor EZY File 3",
    "Mu Shen Ji 4",
    "Wushen Zhuzai Da Wei Pian",
    "PetitCure Precure Fairies Season 4",
    "PokeOki Season 2",
  ];
  for (const title of titles) {
    const qs = new URLSearchParams({
      query: title,
      mode: "ai",
      semantic_ratio: "0.55",
      exploration: "0.78",
      quality_bias: "0.6",
      newness_bias: "0.4",
      exclude_history: "0",
      page: "1",
      shuffle_session_seed: "nuvio-addon-investigation",
      include_reservoir: "1",
    });
    const response = await fetch("https://bingecat.com/public/meilisearch/api?" + qs, {
      headers: { "X-Requested-With": "XMLHttpRequest", Accept: "application/json", Referer: "https://bingecat.com/" },
    });
    const data = await response.json();
    const results = [...(data.movies || []), ...(data.series || [])].slice(0, 8).map((item) => ({
      name: item.name,
      id: item.id,
      tmdbId: item.tmdbId,
      contentType: item.contentType,
      year: item.year,
    }));
    console.log(JSON.stringify({ title, status: response.status, results }));
  }
});
