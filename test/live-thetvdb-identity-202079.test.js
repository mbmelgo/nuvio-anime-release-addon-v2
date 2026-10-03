import assert from "node:assert/strict";
import test from "node:test";

test("diagnostic: TheTVDB title search finds the current 2026 series identity", async () => {
  const query = "Oji-san wa Kawaii Mono ga Osuki.";
  const response = await fetch(
    "https://www.thetvdb.com/search?query=" + encodeURIComponent(query),
    { headers: { accept: "text/html" } },
  );
  assert.equal(response.ok, true);
  const html = await response.text();
  const matches = [...html.matchAll(/href=["'](\/series\/\d+)[^"']*["'][^>]*>([^<]{1,200})</gi)]
    .map((match) => ({ path: match[1], text: match[2].replace(/\s+/g, " ").trim() }));
  assert.ok(
    matches.some(({ path, text }) => path === "/series/480889" && /Oji-san wa Kawaii Mono ga Osuki|おじさんはカワイイものがお好き/i.test(text)),
    JSON.stringify(matches.slice(0, 20)),
  );
});
