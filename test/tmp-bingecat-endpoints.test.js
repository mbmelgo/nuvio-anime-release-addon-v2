import test from "node:test";

test("temporary BingeCat endpoint investigation", async () => {
  const html = await fetch("https://bingecat.com/").then((r) => r.text());
  const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => new URL(m[1], "https://bingecat.com/").href);
  console.log(JSON.stringify({ scripts }));

  for (const url of scripts.slice(-20)) {
    const js = await fetch(url).then((r) => r.text()).catch(() => "");
    const lines = js.split("\n").filter((line) => line.includes("/api/") || line.includes("search"));
    if (lines.length) console.log(JSON.stringify({ url, lines: lines.slice(0, 100) }));
  }
});
