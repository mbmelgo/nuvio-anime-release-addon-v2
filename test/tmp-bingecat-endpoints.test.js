import test from "node:test";

test("temporary BingeCat Meilisearch query builder investigation", async () => {
  const html = await fetch("https://bingecat.com/").then((r) => r.text());
  for (const needle of ["function buildSearchQueryParams", "function performSearch"]) {
    const index = html.indexOf(needle);
    console.log(JSON.stringify({ needle, index, snippet: index >= 0 ? html.slice(index, index + 12000) : null }));
  }
});
