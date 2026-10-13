import { ANILIST_PAGE_SIZE, FETCH_TIMEOUT_MS, buildCatalogMediaVariables } from "./catalog-config.js";

const ANILIST_URL = "https://graphql.anilist.co";
const RESPONSE_CACHE_TTL_MS = 60 * 1000;
const SCHEDULE_CACHE_BUCKET_MS = 30 * 1000;
let rateLimitedUntil = 0;
const inFlight = new Map();
const responseCache = new Map();

export function clearAniListRateLimitState() {
  rateLimitedUntil = 0;
  responseCache.clear();
}

export function clearAniListResponseCache() {
  responseCache.clear();
}

export const CATALOG_MEDIA_FIELDS = `
  id
  title { romaji english native }
  synonyms
  coverImage { large }
  status
  format
  isAdult
  countryOfOrigin
  startDate { year month day }
  endDate { year }
  genres
  relations {
    edges {
      relationType
      node { id format title { romaji english native } startDate { year } externalLinks { site url } }
    }
  }
`;

export const SCHEDULE_MEDIA_FIELDS = `
  id
  idMal
  title { romaji english native }
  synonyms
  coverImage { large }
  status
  countryOfOrigin
  startDate { year month day }
  endDate { year }
  genres
  format
  isAdult
  relations {
    edges {
      relationType
      node { id format title { romaji english native } startDate { year } externalLinks { site url } }
    }
  }
`;

export async function queryAnime(filter, page, search = "", { includeMalId = false, fetchTimeoutMs = FETCH_TIMEOUT_MS } = {}) {
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
  const data = await anilist(query, buildCatalogMediaVariables(filter, page, search), fetchTimeoutMs);
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
    start: Math.floor(start / SCHEDULE_CACHE_BUCKET_MS) * (SCHEDULE_CACHE_BUCKET_MS / 1000),
    end: Math.ceil(end / SCHEDULE_CACHE_BUCKET_MS) * (SCHEDULE_CACHE_BUCKET_MS / 1000),
    notYetAired: futureOnly,
  });
  return data?.Page?.airingSchedules || [];
}

async function anilist(query, variables, fetchTimeoutMs = FETCH_TIMEOUT_MS) {
  const now = Date.now();
  const key = JSON.stringify([query, variables]);
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > now) return cached.data;
  responseCache.delete(key);

  // Prefer an existing request over the global cooldown. It may still resolve
  // successfully even if a different request has since received HTTP 429.
  const existing = inFlight.get(key);
  if (existing) return existing;

  if (now < rateLimitedUntil) {
    throw new Error(`AniList rate limit cooldown active until ${new Date(rateLimitedUntil).toISOString()}`);
  }

  const request = fetchAniList(query, variables, fetchTimeoutMs);
  inFlight.set(key, request);
  try {
    return await request;
  } finally {
    inFlight.delete(key);
  }
}

async function fetchAniList(query, variables, fetchTimeoutMs = FETCH_TIMEOUT_MS) {
  const { response, json } = await fetchWithTimeout(ANILIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
  }, fetchTimeoutMs);

  if (response.ok && !json.errors) {
    responseCache.set(JSON.stringify([query, variables]), {
      data: json.data,
      expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS,
    });
    return json.data;
  }

  const error = new Error(
    json.errors?.map((x) => x.message).join("; ") || `AniList HTTP ${response.status}`,
  );

  if (response.status === 429) {
    const retryAfterSeconds = Number(response.headers?.get?.("retry-after"));
    const cooldownMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? Math.min(retryAfterSeconds * 1000, 60 * 1000)
      : 60 * 1000;
    rateLimitedUntil = Date.now() + cooldownMs;
  }

  throw error;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = Math.max(1, Number(timeoutMs) || FETCH_TIMEOUT_MS);
  let timer;
  const timedOut = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const error = new Error(`AniList request timed out after ${timeout}ms`);
      error.name = "TimeoutError";
      reject(error);
    }, timeout);
  });

  try {
    const response = await Promise.race([
      fetch(url, { ...options, signal: controller.signal }),
      timedOut,
    ]);
    try {
      // Keep response-body parsing under the same deadline as the HTTP request.
      const json = await Promise.race([response.json().catch(() => ({})), timedOut]);
      return { response, json };
    } catch (error) {
      // Preserve rate-limit cooldown behavior even if the 429 body itself stalls.
      if (response.status === 429 && error?.name === "TimeoutError") return { response, json: {} };
      throw error;
    }
  } finally {
    clearTimeout(timer);
  }
}
