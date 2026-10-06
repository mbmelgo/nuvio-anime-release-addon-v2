import assert from "node:assert/strict";
import test from "node:test";
import { clearImdbSearchCache, resolveAniListMappingsByImdbSearch } from "../lib/imdb-search-mapping.js";

const ENDPOINT = "https://v3.sg.media-imdb.com/suggestion/x/";

async function suggestions(title) {
  const response = await fetch(ENDPOINT + encodeURIComponent(title) + ".json", { headers: { Accept: "application/json" } });
  assert.equal(response.ok, true, `IMDb suggestion HTTP ${response.status} for ${title}`);
  const payload = await response.json();
  return (payload.d || []).map((item) => ({ id: item.id, title: item.l, year: item.y, q: item.q }));
}

test("investigation: live IMDb suggestions for Link Click Season 3 and Detective Conan", async () => {
  clearImdbSearchCache();
  for (const title of ["Link Click Season 3", "Link Click", "Shiguang Dailiren III", "Detective Conan", "Meitantei Conan"]) {
    console.log(JSON.stringify({ title, rows: (await suggestions(title)).slice(0, 12) }));
  }

  const result = await resolveAniListMappingsByImdbSearch([
    { id: 151020, format: "TV", startDate: { year: 2026 }, title: { english: "Link Click Season 3", romaji: "Shiguang Dailiren III", native: null }, synonyms: [] },
    { id: 235, format: "TV", startDate: { year: 1996 }, title: { english: "Detective Conan", romaji: "Meitantei Conan", native: "名探偵コナン" }, synonyms: ["Case Closed"] },
  ]);

  console.log(JSON.stringify({ linkClick: result.get(151020) || null, detectiveConan: result.get(235) || null }));
  assert.equal(result.get(151020)?.[0]?.imdbIds?.[0], "tt14976292");
  assert.equal(result.get(235)?.[0]?.imdbIds?.[0], "tt0131179");
});
