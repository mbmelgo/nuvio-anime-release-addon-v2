import test from "node:test";

const CASES = [[202390,"Girls und Panzer das Finale: Part 5",2026,"MOVIE"],[205289,"Norman the Snowman: Kodomo-tachi no Hitotsuboshi",2026,"MOVIE"],[189121,"BanG Dream! It's MyGO!!!!! / Ave Mujica (Zoku-hen)",2027,"TV"],[212653,"Kidou Keisatsu Patlabor EZY File 3",2027,"TV"],[215695,"Komadori Mofmof Parade",2027,"TV"],[155723,"Wushen Zhuzai: Da Wei Pian",2022,"TV"],[199353,"Dawang Raoming 3",2026,"TV"],[214260,"A Good Day to Ascend",2026,"TV"],[217624,"PetitCure: Precure Fairies Season 4",2026,"TV"],[210687,"Re:Zero kara Hajimeru Kyuukei Jikan (Break Time) 4th Season",2026,"TV"],[199409,"Yi Nian Yongheng 4",2026,"TV"],[214974,"Da Xia Shou Mu Ren",2026,"TV"],[216625,"PokéOki SEASON 2",2026,"TV"],[207217,"Delivery Kitten Unyan",2026,"TV"]];

test("temporary BingeCat exact mapping coverage investigation", async () => {
  for (const [anilistId, title, year, type] of CASES) {
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
    const response = await fetch("https://bingecat.com/public/meilisearch/api?" + qs, {
      headers: { "X-Requested-With": "XMLHttpRequest", Accept: "application/json", Referer: "https://bingecat.com/" },
    });
    const data = await response.json();
    const expected = type === "MOVIE" ? data.movies || [] : data.series || [];
    const exact = expected.find((item) => item.name && item.name.normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "").toLocaleLowerCase().replace(/[^\\p{Letter}\\p{Number}]+/gu, " ").trim().replace(/\\s+/g, " ") === title.normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "").toLocaleLowerCase().replace(/[^\\p{Letter}\\p{Number}]+/gu, " ").trim().replace(/\\s+/g, " ") && (!item.year || item.year === year));
    console.log(JSON.stringify({ anilistId, title, status: response.status, match: exact ? { name: exact.name, id: exact.id, tmdbId: exact.tmdbId, year: exact.year, contentType: exact.contentType } : null }));
  }
});
