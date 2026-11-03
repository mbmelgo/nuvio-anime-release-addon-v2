import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const REFILL_TOKENS = 20;
const REFILL_INTERVAL = "60 s";
const MAX_BURST_TOKENS = 5;
const REDIS_TIMEOUT_MS = 800;
const RATE_LIMIT_PREFIX = "anibloom:anilist:upstream:v1";

let sharedLimiterPromise = null;
let injectedLimiter = null;
let warnedAboutFallback = false;
let localBucket = {
  tokens: MAX_BURST_TOKENS,
  updatedAt: Date.now(),
};

function getRedisCredentials() {
  const url = process.env.UPSTASH_REDIS_REST_KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

async function getSharedLimiter() {
  if (injectedLimiter) return injectedLimiter;
  if (!getRedisCredentials()) return null;

  if (!sharedLimiterPromise) {
    sharedLimiterPromise = Promise.resolve().then(() => {
      const credentials = getRedisCredentials();
      if (!credentials) return null;
      const redis = new Redis({ ...credentials, enableTelemetry: false });
      return new Ratelimit({
        redis,
        limiter: Ratelimit.tokenBucket(REFILL_TOKENS, REFILL_INTERVAL, MAX_BURST_TOKENS),
        prefix: RATE_LIMIT_PREFIX,
        analytics: false,
        timeout: REDIS_TIMEOUT_MS,
        ephemeralCache: new Map(),
      });
    }).catch(() => null);
  }
  return sharedLimiterPromise;
}

function takeLocalFallbackToken(now = Date.now()) {
  const elapsed = Math.max(0, now - localBucket.updatedAt);
  const refillPerMs = REFILL_TOKENS / 60_000;
  localBucket.tokens = Math.min(MAX_BURST_TOKENS, localBucket.tokens + elapsed * refillPerMs);
  localBucket.updatedAt = now;

  if (localBucket.tokens >= 1) {
    localBucket.tokens -= 1;
    return { allowed: true, source: "instance-fallback", retryAfterMs: 0 };
  }

  const retryAfterMs = Math.ceil((1 - localBucket.tokens) / refillPerMs);
  return { allowed: false, source: "instance-fallback", retryAfterMs };
}

export async function acquireAniListRequestPermit() {
  if (injectedLimiter) {
    const result = await injectedLimiter();
    return {
      allowed: Boolean(result?.success ?? result?.allowed),
      source: "injected",
      retryAfterMs: Math.max(0, Number(result?.reset || 0) - Date.now()),
    };
  }

  const limiter = await getSharedLimiter();
  if (limiter) {
    try {
      const result = await limiter.limit("global");
      if (result.success) return { allowed: true, source: "upstash", retryAfterMs: 0 };
      return {
        allowed: false,
        source: "upstash",
        retryAfterMs: Math.max(1_000, Number(result.reset || 0) - Date.now()),
      };
    } catch (error) {
      if (!warnedAboutFallback) {
        warnedAboutFallback = true;
        console.warn("[anilist] distributed rate limiter unavailable; using instance-local fallback", {
          kind: error?.name || "error",
        });
      }
    }
  } else if (!warnedAboutFallback) {
    warnedAboutFallback = true;
    console.warn("[anilist] distributed rate limiter is not configured; using instance-local fallback");
  }

  return takeLocalFallbackToken();
}

export function setAniListRateLimiterForTests(limiter) {
  injectedLimiter = limiter || null;
  sharedLimiterPromise = null;
  warnedAboutFallback = false;
  resetAniListLocalFallbackForTests();
}

export function resetAniListLocalFallbackForTests(now = Date.now()) {
  localBucket = { tokens: MAX_BURST_TOKENS, updatedAt: now };
  warnedAboutFallback = false;
}
