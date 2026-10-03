import test from "node:test";

test("temporary BingeCat public search route investigation", async () => {
  const html = await fetch("https://bingecat.com/").then((r) => r.text());
  const lines = html.split("\n").filter((line) => /search|intellisearch|action=/i.test(line));
  console.log(lines.slice(0, 200).join("\n"));
});
