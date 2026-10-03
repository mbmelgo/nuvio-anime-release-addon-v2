import test from "node:test";

test("temporary BingeCat Meilisearch request contract investigation", async () => {
  const html = await fetch("https://bingecat.com/").then((r) => r.text());
  const needles = ["fetch(\`\${API_ENDPOINT}?", "const qs =", "API_ENDPOINT ="];
  for (const needle of needles) {
    const index = html.indexOf(needle);
    console.log(JSON.stringify({ needle, index, snippet: index >= 0 ? html.slice(Math.max(0, index - 5000), index + 12000) : null }));
  }
});
