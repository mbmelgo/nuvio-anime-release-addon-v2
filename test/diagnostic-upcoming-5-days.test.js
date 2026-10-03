import assert from "node:assert/strict";
import test from "node:test";

const ANILIST_URL = "https://graphql.anilist.co";
const WINDOW_SECONDS = 5 * 24 * 60 * 60;

const QUERY = `
  query ($page:Int,$start:Int,$end:Int,$notYetAired:Boolean) {
    Page(page:$page,perPage:50) {
      airingSchedules(
        airingAt_greater:$start,
        airingAt_lesser:$end,
        notYetAired:$notYetAired,
        sort:TIME
      ) {
        id airingAt episode media {
          id
          idMal
          title { romaji english native }
          synonyms
          format
          isAdult
          countryOfOrigin
          startDate { year month day }
          externalLinks { site url }
        }
      }
    }
  }
`;

test("diagnostic: dump all AniList upcoming-5-days schedule records", async () => {
  const nowMs = Date.now();
  const start = Math.floor(nowMs / 1000);
  const end = start + WINDOW_SECONDS;
  const rows = [];

  for (let page = 1; page <= 10; page += 1) {
    const response = await fetch(ANILIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { page, start, end, notYetAired: true } }),
    });
    assert.equal(response.ok, true, `AniList HTTP ${response.status}`);
    const json = await response.json();
    assert.equal(json.errors, undefined, JSON.stringify(json.errors));
    const pageRows = json.data?.Page?.airingSchedules || [];
    if (!pageRows.length) break;
    rows.push(...pageRows);
    if (pageRows.length < 50) break;
  }

  const uniqueMedia = new Map();
  for (const row of rows) {
    const media = row.media;
    if (!media?.id || media.isAdult === true) continue;
    if (!["TV","TV_SHORT","ONA","OVA","SPECIAL","MOVIE"].includes(media.format)) continue;
    if (!uniqueMedia.has(Number(media.id))) {
      uniqueMedia.set(Number(media.id), {
        scheduleId: row.id, airingAt: row.airingAt, episode: row.episode,
        id: media.id, idMal: media.idMal, format: media.format,
        isAdult: media.isAdult, country: media.countryOfOrigin, title: media.title,
      });
    }
  }

  console.log(JSON.stringify({
    now: new Date(nowMs).toISOString(), start, end,
    rawScheduleRows: rows.length, uniqueEligibleMedia: uniqueMedia.size,
    records: [...uniqueMedia.values()],
  }, null, 2));

  assert.ok(rows.length > 0);
});
