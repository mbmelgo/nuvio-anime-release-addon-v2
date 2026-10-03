import test from "node:test";

const CASES = [[205289,63221],[189121,61324],[215695,64746],[199353,60597],[214260,61619],[217624,65095],[210687,63830],[199409,62248],[214974,62218],[216625,64965],[207217,65079]];

function norm(v) {
  return String(v || "").normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "").toLocaleLowerCase().replace(/[^\\p{Letter}\\p{Number}]+/gu, " ").trim().replace(/\\s+/g, " ");
}

test("temporary MAL title enrichment for BingeCat search", async () => {
  for (const [anilistId, malId] of CASES) {
    const mal = await fetch(`https://api.jikan.moe/v4/anime/${malId}/full`).then((r) => r.json()).catch((e) => ({ error: String(e) }));
    const data = mal?.data || {};
    const titles = [
      data.title,
      data.title_english,
      data.title_japanese,
      ...(Array.isArray(data.titles) ? data.titles.map((x) => x?.title) : []),
    ].filter(Boolean);
    const unique = [...new Set(titles)];
    const matches = [];
    for (const title of unique.slice(0, 8)) {
      const qs = new URLSearchParams({
        query: title, mode: "exact", semantic_ratio: "0.55", exploration: "0.55",
        quality_bias: "0.6", newness_bias: "0.4", exclude_history: "0", page: "1",
        shuffle_session_seed: "nuvio-addon-investigation", include_reservoir: "1",
      });
      const response = await fetch("https://bingecat.com/public/meilisearch/api?" + qs, {
        headers: { "X-Requested-With": "XMLHttpRequest", Accept: "application/json", Referer: "https://bingecat.com/" },
      });
      const payload = await response.json();
      const items = [...(payload.movies || []), ...(payload.series || [])];
      const exact = items.find((item) => norm(item.name) === norm(title));
      if (exact) matches.push({ title, name: exact.name, id: exact.id, tmdbId: exact.tmdbId, year: exact.year, contentType: exact.contentType });
    }
    console.log(JSON.stringify({ anilistId, malId, titles: unique, matches }));
  }
});
