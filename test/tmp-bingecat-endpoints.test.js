import test from "node:test";

test("temporary BingeCat Meilisearch contract investigation", async () => {
  const html = await fetch("https://bingecat.com/").then((r) => r.text());
  for (const needle of ["/public/meilisearch/api", "performSearch", "meilisearch"]) {
    const index = html.indexOf(needle);
    console.log(JSON.stringify({ needle, index, snippet: index >= 0 ? html.slice(Math.max(0, index - 4000), index + 9000) : null }));
  }
});
