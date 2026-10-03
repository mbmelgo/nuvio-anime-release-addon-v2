import test from "node:test";

test("temporary BingeCat Meilisearch contract investigation", async () => {
  const js = await fetch("https://bingecat.com/static/js/main.js?v=20260928a").then((r) => r.text());
  const needles = ["/public/meilisearch/api", "performSearch", "meilisearch"];
  for (const needle of needles) {
    const index = js.indexOf(needle);
    console.log(JSON.stringify({ needle, index, snippet: index >= 0 ? js.slice(Math.max(0, index - 2500), index + 6000) : null }));
  }
});
