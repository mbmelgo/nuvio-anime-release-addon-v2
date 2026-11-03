import { ANILIST_PAGE_SIZE, FETCH_TIMEOUT_MS, buildCatalogMediaVariables } from "./catalog-config.js";
import {
  ANILIST_MAX_PERMIT_WAIT_MS,
  acquireAniListRequestLock,
  acquireAniListRequestPermit,
  resetAniListLocalFallbackForTests,
} from "./catalog-rate-limiter.js";
import {
  catalogCacheKey,
  getCatalogRuntimeCache,
  getSharedAniListCooldownUntil,
  setCatalogRuntimeCache,
  setSharedAniListCooldownUntil,
} from "./catalog-runtime-cache.js";

const ANILIST_URL = "https://graphql.anilist.co";
const RESPONSE_CACHE_TTL_MS = 60 * 1000;
const SCHEDULE_CACHE_BUCKET_MS = 30 * 1000;
const SHARED_REQUEST_LOCK_POLL_MS = 500;
let rateLimitedUntil = 0;
const inFlight = new Map();
const responseCache = new Map();

export function clearAniListRateLimitState() {
  rateLimitedUntil = 0;
  responseCache.clear();
  resetAniListLocalFallbackForTests();
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
      node { id idMal format title { romaji english native } startDate { year } externalLinks { site url } }
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
      node { id idMal format title { romaji english native } startDate { year } externalLinks { site url } }
    }
  }
`;

export async function queryAnime(filter, page, search = "", { includeMalId = false, fetchTimeoutMs = FETCH_TIMEOUT_MS } = {}) {
  const query = `
    query ($page:Int,$season:MediaSeason,$seasonYear:Int,$sort:[MediaSort],$search:String,$formats:[MediaFormat!]) {
      Page(page:$page,perPage:${ANILIST_PAGE_SIZE}) {
        media(
          type:ANIME,
          format_in:$formats,
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

async function fetchAniListWithPermit(query, variables, fetchTimeoutMs) {
  const sharedCooldownUntil = await getSharedAniListCooldownUntil();
  const cooldownUntil = Math.max(rateLimitedUntil, sharedCooldownUntil);
  if (Date.now() < cooldownUntil) {
    rateLimitedUntil = cooldownUntil;
    const error = new Error(`AniList rate limit cooldown active until ${new Date(cooldownUntil).toISOString()}`);
    error.code = "ANILIST_RATE_LIMIT_COOLDOWN";
    throw error;
  }

  const permit = await acquireAniListRequestPermit();
  if (!permit.allowed) {
    const retrySeconds = Math.max(1, Math.ceil(permit.retryAfterMs / 1000));
    const error = new Error(`AniList global request budget exhausted; retry in ${retrySeconds}s`);
    error.code = "ANILIST_RATE_LIMIT_BUDGET";
    throw error;
  }
  return fetchAniList(query, variables, fetchTimeoutMs);
}

async function fetchAniListWithSharedLock(sharedKey, requestKey, query, variables, fetchTimeoutMs) {
  const leaseMs = Math.min(
    60_000,
    Math.max(15_000, ANILIST_MAX_PERMIT_WAIT_MS + fetchTimeoutMs + 5_000),
  );
  const waitMs = Math.min(25_000, ANILIST_MAX_PERMIT_WAIT_MS + fetchTimeoutMs + 1_000);
  const deadline = Date.now() + waitMs;

  while (true) {
    const lock = await acquireAniListRequestLock(sharedKey, { leaseMs });
    if (lock.status === "unavailable") {
      // Preserve availability if the lock service cannot be reached.
      return fetchAniListWithPermit(query, variables, fetchTimeoutMs);
    }

    if (lock.status === "acquired") {
      try {
        const sharedCached = await getCatalogRuntimeCache(sharedKey);
        if (sharedCached && typeof sharedCached === "object") {
          responseCache.set(requestKey, {
            data: sharedCached,
            expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS,
          });
          return sharedCached;
        }
        return await fetchAniListWithPermit(query, variables, fetchTimeoutMs);
      } finally {
        await lock.release();
      }
    }

    const sharedCached = await getCatalogRuntimeCache(sharedKey);
    if (sharedCached && typeof sharedCached === "object") {
      responseCache.set(requestKey, {
        data: sharedCached,
        expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS,
      });
      return sharedCached;
    }

    if (Date.now() >= deadline) {
      const error = new Error("AniList identical request is already in progress");
      error.code = "ANILIST_REQUEST_IN_PROGRESS";
      error.retryAfterSeconds = Math.max(2, Math.ceil((leaseMs - waitMs) / 1000) + 1);
      throw error;
    }
    await new Promise(resolve => setTimeout(resolve, Math.min(SHARED_REQUEST_LOCK_POLL_MS, deadline - Date.now())));
  }
}

async function anilist(query, variables, fetchTimeoutMs = FETCH_TIMEOUT_MS) {
  const now = Date.now();
  const key = JSON.stringify([query, variables]);
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > now) return cached.data;
  responseCache.delete(key);

  // Prefer an existing request over cache and cooldown lookups. The second
  // in-flight check below closes the race introduced by the shared-cache read.
  const existing = inFlight.get(key);
  if (existing) return existing;

  const sharedKey = catalogCacheKey("anilist-response", [query, variables]);
  const sharedCached = await getCatalogRuntimeCache(sharedKey);
  if (sharedCached && typeof sharedCached === "object") {
    responseCache.set(key, { data: sharedCached, expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS });
    return sharedCached;
  }

  const concurrent = inFlight.get(key);
  if (concurrent) return concurrent;

  const sharedCooldownUntil = await getSharedAniListCooldownUntil();
  const cooldownUntil = Math.max(rateLimitedUntil, sharedCooldownUntil);
  if (Date.now() < cooldownUntil) {
    rateLimitedUntil = cooldownUntil;
    const error = new Error(`AniList rate limit cooldown active until ${new Date(cooldownUntil).toISOString()}`);
    error.code = "ANILIST_RATE_LIMIT_COOLDOWN";
    throw error;
  }

  // Cache and cooldown lookups yield to the event loop; re-check immediately
  // before starting the request so concurrent misses still coalesce locally.
  const latestInFlight = inFlight.get(key);
  if (latestInFlight) return latestInFlight;

  // Reserve the in-flight key before awaiting Redis so identical callers share
  // both the limiter decision and the upstream request.
  const request = fetchAniListWithSharedLock(sharedKey, key, query, variables, fetchTimeoutMs);
  inFlight.set(key, request);
  try {
    return await request;
  } finally {
    inFlight.delete(key);
  }
}

export function getAniListRetryDelayMs(headers, now = Date.now()) {
  const retryAfter = String(headers?.get?.("retry-after") || "").trim();
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const retryAt = Number.isFinite(seconds) && seconds > 0
      ? now + (seconds * 1000)
      : Date.parse(retryAfter);
    if (Number.isFinite(retryAt) && retryAt > now) {
      return Math.min(Math.ceil(retryAt - now), 60 * 60 * 1000);
    }
  }

  const reset = Number(headers?.get?.("x-ratelimit-reset"));
  if (Number.isFinite(reset) && reset > 0) {
    const resetAt = reset > 1_000_000_000_000
      ? reset
      : reset > now / 1000
        ? reset * 1000
        : now + (reset * 1000);
    if (resetAt > now) return Math.min(Math.ceil(resetAt - now), 60 * 60 * 1000);
  }
  return 60 * 1000;
}

export function classifyAniListFailure(error) {
  if (error?.code === "ANILIST_RATE_LIMIT_COOLDOWN") return "rate_limit_cooldown";
  if (error?.code === "ANILIST_RATE_LIMIT_BUDGET") return "rate_limit_budget";
  if (error?.code === "ANILIST_REQUEST_IN_PROGRESS") return "request_in_progress";
  if (error?.code === "ANILIST_HTTP_429" || Number(error?.status) === 429) return "rate_limited";
  if (error?.code === "ANILIST_HTTP_ERROR" || (Number(error?.status) >= 400 && Number(error?.status) <= 599)) {
    return "upstream_http";
  }
  if (error?.code === "ANILIST_GRAPHQL_ERROR") return "graphql";
  if (error?.name === "TimeoutError" || error?.name === "AbortError" || error?.code === "ANILIST_TIMEOUT") return "timeout";
  if (error instanceof TypeError || /ECONN|ENOTFOUND|EAI_AGAIN|fetch failed/i.test(String(error?.message || ""))) {
    return "network";
  }
  return "upstream";
}

async function fetchAniList(query, variables, fetchTimeoutMs = FETCH_TIMEOUT_MS) {
  const startedAt = Date.now();
  let response;
  let json;
  try {
    ({ response, json } = await fetchWithTimeout(ANILIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables }),
    }, fetchTimeoutMs));
  } catch (error) {
    console.warn("[anilist] upstream request failed", {
      kind: classifyAniListFailure(error),
      durationMs: Math.max(0, Date.now() - startedAt),
      timeoutMs: fetchTimeoutMs,
    });
    throw error;
  }

  const durationMs = Math.max(0, Date.now() - startedAt);
  if (response.ok && !json.errors) {
    const cacheKey = JSON.stringify([query, variables]);
    responseCache.set(cacheKey, {
      data: json.data,
      expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS,
    });
    await setCatalogRuntimeCache(
      catalogCacheKey("anilist-response", [query, variables]),
      json.data,
      Math.ceil(RESPONSE_CACHE_TTL_MS / 1000),
    );
    return json.data;
  }

  const error = new Error(
    json.errors?.map((x) => x.message).join("; ") || `AniList HTTP ${response.status}`,
  );
  error.status = Number(response.status) || 0;
  error.code = response.status === 429
    ? "ANILIST_HTTP_429"
    : (Array.isArray(json.errors) && json.errors.length > 0 && response.ok)
      ? "ANILIST_GRAPHQL_ERROR"
      : "ANILIST_HTTP_ERROR";
  const retryAfter = response.headers?.get?.("retry-after") || null;
  const rateLimitReset = response.headers?.get?.("x-ratelimit-reset") || null;
  console.warn("[anilist] upstream response error", {
    status: Number(response.status) || 0,
    durationMs,
    rateLimitLimit: response.headers?.get?.("x-ratelimit-limit") || null,
    rateLimitRemaining: response.headers?.get?.("x-ratelimit-remaining") || null,
    rateLimitReset,
    retryAfter,
    graphqlErrorCount: Array.isArray(json.errors) ? json.errors.length : 0,
  });

  if (response.status === 429) {
    rateLimitedUntil = Date.now() + getAniListRetryDelayMs(response.headers);
    await setSharedAniListCooldownUntil(rateLimitedUntil);
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
      error.code = "ANILIST_TIMEOUT";
      error.timeoutMs = timeout;
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
