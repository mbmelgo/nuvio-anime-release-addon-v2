import { getAniListRedisCredentials } from "./catalog-rate-limiter.js";
import { getCatalogClientIdentifier } from "./catalog-request-guard.js";

const REQUESTS_PER_MINUTE = 120;
const BURST_CAPACITY = 60;
const REDIS_TIMEOUT_MS = 800;
const RATE_LIMIT_PREFIX = "anibloom:catalog:incoming:v1";
const MAX_LOCAL_BUCKETS = 10_000;

let sharedLimiterPromise = null;
let injectedLimiter = null;
let warnedAboutFallback = false;
const localBuckets = new Map();

function getRateLimitPrefix() {
  const environment = process.env.VERCEL_ENV || (process.env.NODE_ENV === "production" ? "production" : "development");
  return `${RATE_LIMIT_PREFIX}:${environment}`;
}

async function getSharedLimiter() {
  if (injectedLimiter) return injectedLimiter;
  if (!getAniListRedisCredentials()) return null;
  if (!sharedLimiterPromise) {
    sharedLimiterPromise = Promise.all([
      import("@upstash/redis"),
      import("@upstash/ratelimit"),
    ]).then(([{ Redis }, { Ratelimit }]) => {
      const credentials = getAniListRedisCredentials();
      if (!credentials) return null;
      return new Ratelimit({
        redis: new Redis(credentials),
        limiter: Ratelimit.tokenBucket(REQUESTS_PER_MINUTE, "60 s", BURST_CAPACITY),
        prefix: getRateLimitPrefix(),
        analytics: false,
        enableTelemetry: false,
        timeout: REDIS_TIMEOUT_MS,
        ephemeralCache: new Map(),
      });
    }).catch(() => null);
  }
  return sharedLimiterPromise;
}

function takeLocalPermit(identifier, now = Date.now()) {
  let bucket = localBuckets.get(identifier);
  if (!bucket) bucket = { tokens: BURST_CAPACITY, updatedAt: now };
  const elapsed = Math.max(0, now - bucket.updatedAt);
  bucket.tokens = Math.min(BURST_CAPACITY, bucket.tokens + elapsed * REQUESTS_PER_MINUTE / 60_000);
  bucket.updatedAt = now;
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    localBuckets.delete(identifier);
    localBuckets.set(identifier, bucket);
    if (localBuckets.size > MAX_LOCAL_BUCKETS) localBuckets.delete(localBuckets.keys().next().value);
    return { allowed: true, source: "instance-fallback", retryAfterMs: 0 };
  }
  localBuckets.set(identifier, bucket);
  return {
    allowed: false,
    source: "instance-fallback",
    retryAfterMs: Math.max(1, Math.ceil((1 - bucket.tokens) * 60_000 / REQUESTS_PER_MINUTE)),
  };
}

export async function acquireCatalogRequestPermit(request, now = Date.now()) {
  const identifier = getCatalogClientIdentifier(request);
  const limiter = await getSharedLimiter();
  if (limiter) {
    try {
      const result = await limiter.limit(identifier);
      return {
        allowed: Boolean(result.success),
        source: "upstash",
        retryAfterMs: result.success ? 0 : Math.max(1_000, Number(result.reset || 0) - now),
      };
    } catch (error) {
      if (!warnedAboutFallback) {
        warnedAboutFallback = true;
        console.warn("[catalog] distributed incoming request limiter unavailable; using instance-local fallback", {
          kind: error?.name || "error",
        });
      }
    }
  } else if (!warnedAboutFallback) {
    warnedAboutFallback = true;
    console.warn("[catalog] distributed incoming request limiter is not configured; using instance-local fallback");
  }
  return takeLocalPermit(identifier, now);
}

export function setCatalogRequestRateLimiterForTests(limiter) {
  injectedLimiter = limiter || null;
  sharedLimiterPromise = null;
  warnedAboutFallback = false;
  localBuckets.clear();
}

export function resetCatalogRequestRateLimiterForTests() {
  localBuckets.clear();
  warnedAboutFallback = false;
}
