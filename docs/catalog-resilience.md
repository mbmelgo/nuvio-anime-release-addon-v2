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

## Runtime Cache and limiter limitations

Vercel Runtime Cache is regional and does not provide atomic increment or compare-and-set operations. It is used for response reuse and the reactive shared 429 cooldown, not as the global request-budget primitive.

The Upstash token bucket is the proactive shared limiter when its Vercel Marketplace credentials are available and Redis responds within the configured timeout. The limiter deliberately fails open to a bounded per-instance token bucket when Redis is missing, unavailable, or times out. Therefore a strict global request budget is **not guaranteed during Redis outages or timeouts**. Do not interpret fail-open operation as globally enforced rate limiting.

## Upstash distributed limiter

- Redis client: `@upstash/redis` 1.41.0.
- Rate limiter: `@upstash/ratelimit` 2.2.0.
- Algorithm: atomic token bucket, 20-token refill per 60 seconds, maximum burst of 5.
- Shared identifier: `global`; do not derive the identifier from user input or catalog query parameters. The Redis key prefix is also scoped by `VERCEL_ENV`, keeping Preview traffic separate from the Production budget even though both environments share the same database.
- Redis timeout: 800 ms; analytics disabled; denied decisions are cached in-process by the SDK.
- Vercel Marketplace environment variables are sensitive and must never be copied into source, logs, tests, or public artifacts.

## Diagnostic counters

Append `?diagnostics=1` to a catalog endpoint to bypass the normalized catalog cache and return aggregate timing/count headers. The `X-Nuvio-Catalog-Stages` header includes:

- `rollingSchedulePages` and `rollingScheduleRows`: schedule pages requested and rows retained inside the requested time window.
- `rollingEligibleRows`: rows passing media ID, adult-content, and format eligibility checks.
- `rollingUniqueEligibleRows`: eligible rows after AniList ID deduplication.
- `rollingSearchedRows`: rows remaining after the optional catalog search filter.
- `rollingMetas`: canonicalized rolling metadata entries after Kitsu fallback and final search filtering, before cross-page identity deduplication and page slicing.
- `rollingReturnedMetas`: actual entries returned by the endpoint after cross-page identity deduplication and the requested page-size/skip window.
- `rollingFallbackMetas`: final entries still using `mal:` or `anilist:` IDs.
- `seasonAnilistRows` and `seasonCanonicalMetas`: seasonal source rows and canonicalized metadata entries.

Counters are aggregate counts only. They do not include AniList IDs, titles, search terms, or provider credentials. Rolling counters accumulate across all pages fetched for one diagnostic request.

## Operational validation

After a controlled deployment:

- Check runtime logs for `[anilist] upstream request failed` and `[anilist] upstream response error`.
- Compare timeout counts with HTTP 429, 403, and 5xx counts.
- Verify fresh and stale cache response headers.
- Test a cold cache with AniList unavailable and confirm HTTP 503.
- Test a warmed cache with AniList unavailable and confirm stale HTTP 200.
- Confirm the actual Vercel function region and that all AniBloom function regions use the connected Singapore Redis primary.
- Exercise concurrent requests across separate function instances and confirm aggregate upstream calls remain within the shared token-bucket budget.
- Inspect Upstash command usage against the 500,000-command monthly Free-plan allowance.
