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


import { canonicalizeCatalogPage } from "../api/catalog-source.js";
import { resolveAniListExternalMappings } from "../lib/external-provider-mapping.js";

async function fetchAniListMedia(ids) {
  const rows = [];
  for (const id of ids) {
    const query = `query($id:Int){ Media(id:$id,type:ANIME) { id idMal format title { romaji english native } synonyms startDate { year } externalLinks { site url } relations { edges { relationType node { id format title { romaji english native } startDate { year } externalLinks { site url } } } } } }`;
    const response = await fetch("https://graphql.anilist.co", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ query, variables: { id } }) });
    assert.equal(response.ok, true, `AniList HTTP ${response.status} for ${id}`);
    rows.push((await response.json()).data.Media);
  }
  return rows;
}

test("investigation: actual AniList relations do not suppress Link Click Season 3 or Detective Conan", async () => {
  const rows = await fetchAniListMedia([151020, 235]);
  for (const row of rows) console.log(JSON.stringify({ id: row.id, title: row.title, externalLinks: row.externalLinks, relations: row.relations?.edges?.map((edge) => ({ relationType: edge.relationType, id: edge.node?.id, title: edge.node?.title, externalLinks: edge.node?.externalLinks })) }));
  const empty = async () => new Map();
  const metas = await canonicalizeCatalogPage(rows, {
    resolveMappings: empty, resolveFribbMappings: empty,
    resolveExternalMappings: (input) => resolveAniListExternalMappings(input),
    resolveAnimapMappings: empty, resolveIdMapperMappings: empty, resolveTMDBMappings: empty,
    resolveAnimeMapperMappings: empty, resolveAnimeMapperRelatedProviderIds: empty,
    resolveAniBridgeMappings: empty, resolveTsvMappings: empty,
    resolveImdbMappings: (input) => resolveAniListMappingsByImdbSearch(input),
    resolveSecondaryMappings: empty, resolveAlternativeMappings: empty,
  });
  console.log(JSON.stringify(metas.map((meta) => ({ id: meta.id, anilistId: meta.extra?.anilistId, identityProvider: meta.extra?.identityProvider, identityId: meta.extra?.identityId, identityEvidence: meta.extra?.identityEvidence }))));
  assert.equal(metas.find((meta) => meta.extra?.anilistId === 151020)?.id, "tt14976292");
  assert.equal(metas.find((meta) => meta.extra?.anilistId === 235)?.id, "tt0131179");
});
