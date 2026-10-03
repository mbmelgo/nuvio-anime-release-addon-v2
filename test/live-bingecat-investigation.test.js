import test from "node:test";
import assert from "node:assert/strict";

const IDS = [
  202390, 205289, 189121, 212653, 215695,
  211181, 155723, 196613, 199353, 214260,
  217624, 210687, 199409, 214974, 216625, 207217,
];

const ANILIST_URL = "https://graphql.anilist.co";
const BINGECAT_URL = "https://bingecat.com/public/meilisearch/api";

async function fetchAniList(ids) {
  const query = `query($ids:[Int!]!){Page(perPage:50){media(id_in:$ids,type:ANIME){id format startDate{year} title{english romaji native}}}}`;
  const response = await fetch(ANILIST_URL, {
    method: "POST",
    headers: {"Content-Type":"application/json","Accept":"application/json"},
    body: JSON.stringify({query,variables:{ids}}),
  });
  assert.equal(response.ok, true);
  return (await response.json()).data.Page.media;
}

async function search(title, extra = {}) {
  const params = new URLSearchParams({
    query: title,
    exploration: "0.55",
    quality_bias: "0.6",
    newness_bias: "0.4",
    exclude_history: "0",
    page: "1",
    shuffle_session_seed: "nuvio-anime-addon-investigation",
    include_reservoir: "1",
    ...extra,
  });
  const response = await fetch(`${BINGECAT_URL}?${params}`, {
    headers: {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Referer: "https://bingecat.com/",
    },
  });
  const payload = await response.json();
  return {
    status: response.status,
    movies: Array.isArray(payload.movies) ? payload.movies.slice(0, 5) : [],
    series: Array.isArray(payload.series) ? payload.series.slice(0, 5) : [],
    keys: Object.keys(payload),
  };
}

test("investigate BingeCat title variants for current unresolved AniList IDs", async () => {
  const media = await fetchAniList(IDS);
  for (const row of media) {
    const titles = [row.title.english, row.title.romaji, row.title.native]
      .filter(Boolean);
    console.log(JSON.stringify({
      anilistId: row.id,
      format: row.format,
      year: row.startDate?.year ?? null,
      titles,
    }));
    for (const title of titles) {
      for (const mode of ["exact", "default"]) {
        const result = await search(title, mode === "exact" ? {mode:"exact"} : {});
        console.log(JSON.stringify({
          anilistId: row.id,
          title,
          mode,
          result,
        }));
      }
    }
  }
});
