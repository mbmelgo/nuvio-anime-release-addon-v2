import test from "node:test";

test("temporary BingeCat Meilisearch request investigation", async () => {
  const html = await fetch("https://bingecat.com/").then((r) => r.text());
  const lines = html.split("\n").filter((line) => line.includes("fetch(") || line.includes("api-endpoint") || line.includes("meiliEndpoint") || line.includes("performSearch"));
  console.log(lines.slice(-200).join("\n"));
});
