import test from "node:test";

test("temporary BingeCat public Meilisearch query investigation", async () => {
  const titles = [
    "Girls und Panzer das Finale Part 5",
    "Norman the Snowman Kodomo-tachi no Hitotsuboshi",
    "Komadori Mofmof Parade",
    "Kidou Keisatsu Patlabor EZY File 3",
  ];
  for (const title of titles) {
    const qs = new URLSearchParams({
      query: title,
      mode: "exact",
      semantic_ratio: "0.55",
      exploration: "0.55",
      quality_bias: "0.6",
      newness_bias: "0.4",
      exclude_history: "0",
      page: "1",
      shuffle_session_seed: "nuvio-addon-investigation",
      include_reservoir: "1",
    });
    const response = await fetch("https://bingecat.com/public/meilisearch/api?" + qs);
    const data = await response.json();
    console.log(JSON.stringify({ title, status: response.status, movies: data.movies, series: data.series }));
  }
});
