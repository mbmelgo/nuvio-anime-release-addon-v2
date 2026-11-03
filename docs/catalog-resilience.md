# Catalog upstream resilience

## Current safeguards

AniBloom uses Vercel Runtime Cache through `@vercel/functions` for successful AniList GraphQL responses and normalized catalog responses.

- AniList GraphQL responses are cached for 60 seconds.
- Rolling catalogs are fresh for 30 seconds and retained for up to 5 additional minutes for stale fallback.
- Seasonal catalogs are fresh for 1 hour and retained for up to 24 additional hours for stale fallback.
- Cache reads and writes fail open: a cache outage does not prevent a direct upstream request.
- Cache keys are SHA-256 digests of the request dimensions; raw GraphQL query text, search strings, and variables are not used as visible cache keys.
- The Runtime Cache namespace is `anibloom-catalog-v1`.

Runtime Cache is regional and isolated by Vercel project and deployment environment. It is not a globally shared store across regions. It also has a 2 MB per-entry limit. Cache entries are an optimization and recovery layer, not durable storage.

## Request behavior

1. A fresh normalized catalog response is returned from Runtime Cache.
2. A stale successful response is returned with `X-Nuvio-Catalog-Stale: 1` and `Cache-Control: no-store`; a background refresh is scheduled with Vercel `waitUntil`.
3. A cold cache miss is fetched synchronously and cached only after successful catalog construction.
4. If a cold request fails upstream and no successful cache entry exists, the API returns HTTP 503 with an explicit temporary-unavailability error. It does not report the failure as a successful empty catalog.
5. Diagnostic requests bypass the application catalog cache.

A background refresh is deduplicated within one warm function instance. This is not a distributed lock.

## AniList request safeguards

- Successful AniList GraphQL responses are shared through Runtime Cache for 60 seconds.
- Identical concurrent requests are coalesced within a function instance.
- HTTP 429 opens a local and Runtime Cache-backed cooldown.
- `Retry-After` is preferred; `X-RateLimit-Reset` is used when present. Parsed cooldowns are bounded to one hour.
- Error logs include HTTP status, duration, rate-limit headers, GraphQL error count, and a timeout/network classification. They do not log GraphQL variables or search strings.
- Rolling schedule pagination is bounded to 8 AniList pages per catalog request.

The page budget intentionally bounds worst-case upstream fan-out. If validation removes many candidates or a client requests a deep offset, the catalog may return fewer than the requested page size after the budget is exhausted.

## Known limitation: proactive global rate limiting

The Runtime Cache API exposes get/set/delete but no atomic increment or compare-and-set operation. Therefore the shared 429 cooldown is reactive and regional; it is **not** a proactive global requests-per-minute limiter and cannot prevent simultaneous cold misses across separate function instances or regions.

A true global limiter still requires an atomic coordination primitive (for example, a Redis-backed token bucket/lease) or a queue worker with a verified, supported global concurrency setting. No Redis/Upstash integration or corresponding project environment configuration was present during this implementation. Do not claim that AniBloom has a globally enforced AniList request budget until that component is provisioned and validated.

## Operational validation

After a controlled deployment:

- Check runtime logs for `[anilist] upstream request failed` and `[anilist] upstream response error`.
- Compare timeout counts with HTTP 429, 403, and 5xx counts.
- Verify fresh and stale cache response headers.
- Test a cold cache with AniList unavailable and confirm HTTP 503.
- Test a warmed cache with AniList unavailable and confirm stale HTTP 200.
- Confirm the actual Vercel function region; Runtime Cache sharing is regional.
