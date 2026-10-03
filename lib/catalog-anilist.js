import { ANILIST_PAGE_SIZE, FETCH_TIMEOUT_MS, buildCatalogMediaVariables } from "./catalog-config.js";

const ANILIST_URL = "https://graphql.anilist.co";

export const CATALOG_MEDIA_FIELDS = `
  id
  title { romaji english native }
  coverImage { large }
  status
  isAdult
  startDate { year month day }
  endDate { year }
  genres
`;

export const SCHEDULE_MEDIA_FIELDS = `
  id
  idMal
  title { romaji english native }
  coverImage { large }
  status
  startDate { year month day }
  endDate { year }
  format
  isAdult
  externalLinks { site url }
`;

export async function queryAnime(filter, page, search = "", { includeMalId = false } = {}) {
  const query = `
    query ($page:Int,$season:MediaSeason,$seasonYear:Int,$sort:[MediaSort],$search:String) {
      Page(page:$page,perPage:${ANILIST_PAGE_SIZE}) {
        media(
          type:ANIME,
          format_in:[TV,TV_SHORT,ONA,OVA,SPECIAL,MOVIE],
          season:$season,
          seasonYear:$seasonYear,
          sort:$sort,
          search:$search,
          isAdult:false
        ) { ${includeMalId ? `${CATALOG_MEDIA_FIELDS}\n  idMal` : CATALOG_MEDIA_FIELDS} }
      }
    }
  `;
  const data = await anilist(query, buildCatalogMediaVariables(filter, page, search));
  return (data?.Page?.media || []).filter((media) => Number.isInteger(Number(media?.id)) && Number(media.id) > 0);
}

export async function queryAiringSchedulePage(start, end, futureOnly, page, sort = "TIME_DESC") {
  const safeSort = sort === "TIME" ? "TIME" : "TIME_DESC";
  const query = `
    query ($page:Int,$start:Int,$end:Int,$notYetAired:Boolean) {
      Page(page:$page,perPage:${ANILIST_PAGE_SIZE}) {
        airingSchedules(
          airingAt_greater:$start,
          airingAt_lesser:$end,
          notYetAired:$notYetAired,
          sort:${safeSort}
        ) {
          id airingAt episode media { ${SCHEDULE_MEDIA_FIELDS} }
        }
      }
    }
  `;
  const data = await anilist(query, {
    page,
    start: Math.floor(start / 1000),
    end: Math.floor(end / 1000),
    notYetAired: futureOnly,
  });
  return data?.Page?.airingSchedules || [];
}

async function anilist(query, variables) {
  const response = await fetchWithTimeout(ANILIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.errors) {
    throw new Error(json.errors?.map((x) => x.message).join("; ") || `AniList HTTP ${response.status}`);
  }
  return json.data;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
