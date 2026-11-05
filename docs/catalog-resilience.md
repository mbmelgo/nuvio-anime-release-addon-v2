# Catalog upstream resilience

## Current safeguards

AniBloom uses Vercel Runtime Cache through `@vercel/functions` for successful AniList GraphQL responses and normalized catalog responses.

- Exact, complete AniList seasonal search responses are cached for 5 minutes; all other AniList GraphQL responses, including rolling airing schedules, remain cached for 60 seconds. Cached data always retains the original upstream ordering and page; no prefix-derived partial search index is used.
- Rolling catalogs are fresh for 30 seconds and retained for up to 5 additional minutes for stale fallback.
- Seasonal catalogs are fresh for 1 hour and retained for up to 24 additional hours for stale fallback.
- Cache reads and writes fail open: a cache outage does not prevent a direct upstream request.
- Cache keys are SHA-256 digests of the request dimensions; raw GraphQL query text, search strings, and variables are not used as visible cache keys.
- The Runtime Cache namespace is `anibloom-catalog-v1`.

Runtime Cache is regional and isolated by Vercel project and deployment environment. It is not a globally shared store across regions. It also has a 2 MB per-entry limit. Cache entries are an optimization and recovery layer, not durable storage.

## Catalog cover quality

Seasonal, movie, and rolling AniList GraphQL requests include `coverImage.extraLarge`, `large`, and `medium`. The shared catalog metadata conversion selects the first valid HTTPS cover in that order. This uses AniList-provided URLs as-is (without guessing image variants from filenames). Missing or malformed cover variants fall back safely; no poster is emitted if none is usable.

The change affects AniBloom's catalog `poster` field only. Nuvio and independently installed metadata providers can choose different artwork on detail pages or in certain layouts. The additional GraphQL fields modestly increase response metadata but do not create extra upstream requests.

### Poster-schema cache isolation (v2.15.0)

Normalized catalog response keys incorporate an explicit `CATALOG_RESPONSE_SCHEMA_VERSION` (currently 2). The v2.14.0 release changed image selection while retaining the legacy normalized-response key, so even a newly deployed function could serve v2.13.0-era medium-poster responses until cache expiry or a successful background refresh. A version-specific key makes those older serialized responses unreachable by new catalog requests, including seasonal first pages, movies, and rolling catalogs. Future changes to serialized catalog metadata must deliberately advance this schema version when old entries are incompatible.

This migration **does not** change the shared Runtime Cache namespace, AniList GraphQL response keys, Redis rate budgets, upstream cooldown or client limiter settings. Catalogs rebuild on first use and then regain the usual freshness/stale fallback; no blanket cache purge or extra AniList fields are required. CDN and client caches remain independent and can temporarily display pre-release posters until their own existing lifetimes expire. Verify an uncached origin request as well as the canonical client URL after deployment; the normalized cache fix does not itself invalidate edge responses.

## Request behavior

1. A fresh normalized catalog response is returned from Runtime Cache.
2. A stale successful response is returned with `X-Nuvio-Catalog-Stale: 1` and `Cache-Control: no-store`; a background refresh is scheduled with Vercel `waitUntil`.
3. A cold cache miss is fetched synchronously and cached only after successful catalog construction.
4. If a cold request fails upstream and no successful cache entry exists, the API returns HTTP 503 with an explicit temporary-unavailability error. It does not report the failure as a successful empty catalog.
5. Production diagnostic parameters are ignored so they cannot bypass the application catalog cache. Preview/development diagnostic requests may bypass the cache for controlled investigation.

A background refresh is deduplicated within one warm function instance. This is not a distributed lock.

## AniList request safeguards

- Successful AniList GraphQL responses are shared through Runtime Cache and optional Redis for 60 seconds by default. Complete exact seasonal search results use a 5-minute TTL to reduce repeated prefix requests across users, regions, and title variants. This is shorter than the existing 1-hour canonical seasonal catalog freshness policy.
- Identical concurrent requests are coalesced within a function instance.
- HTTP 429 opens a local and Runtime Cache-backed cooldown.
- `Retry-After` is preferred; `X-RateLimit-Reset` is used when present. Parsed cooldowns are bounded to one hour.
- Error logs include HTTP status, duration, rate-limit headers, GraphQL error count, and a timeout/network classification. They do not log GraphQL variables or search strings.
- Rolling schedule pagination is bounded to 8 AniList pages per catalog request.
- Incoming catalog requests are rate-limited per client IP with a distributed Upstash token bucket (120 requests/minute, burst capacity 60). Client IPs are hashed before being used as limiter identifiers; raw IP addresses are not stored in limiter keys. If Redis is unavailable, an instance-local fallback limiter is used, which is not a cross-instance guarantee.
- Catalog requests accept only GET and OPTIONS. Search queries are limited to 200 characters, and offsets must be non-negative integers no greater than 1,000.

The page budget intentionally bounds worst-case upstream fan-out. If validation removes many candidates or a client requests a deep offset, the catalog may return fewer than the requested page size after the budget is exhausted.

## Runtime Cache and limiter limitations

Vercel Runtime Cache is regional and does not provide atomic increment or compare-and-set operations. It is used for response reuse and the reactive shared 429 cooldown, not as the global request-budget primitive.

The Upstash token bucket is the proactive shared limiter when its Vercel Marketplace credentials are available and Redis responds within the configured timeout. The limiter deliberately fails open to a bounded per-instance token bucket when Redis is missing, unavailable, or times out. Therefore a strict global request budget is **not guaranteed during Redis outages or timeouts**. Do not interpret fail-open operation as globally enforced rate limiting.

## Upstash distributed limiter

- Redis client: `@upstash/redis` 1.41.0.
- Rate limiter: `@upstash/ratelimit` 2.2.0.
- Algorithm: atomic token bucket, one token every 3 seconds (20 requests/minute), maximum burst of 5. The refill interval is deliberately short: Upstash's token-bucket algorithm adds the configured refill amount only when the interval elapses, capped at the burst capacity. A 20-token refill every 60 seconds with a burst of 5 would therefore refill only 5 usable tokens per minute.
- Permit acquisition waits for the next shared refill when the bucket is exhausted, with an 18-second per-request wait ceiling. If a permit is still unavailable at the deadline, the catalog request fails with a retryable budget error rather than exceeding the upstream budget.
- Shared identifier: `global`; do not derive the identifier from user input or catalog query parameters. The Redis key prefix is also scoped by `VERCEL_ENV`, keeping Preview traffic separate from the Production budget even though both environments share the same database.
- Redis timeout: 800 ms; analytics disabled; denied decisions are cached in-process by the SDK.
- Vercel Marketplace environment variables are sensitive and must never be copied into source, logs, tests, or public artifacts.

## Diagnostic counters

In preview/development, append `?diagnostics=1` to a catalog endpoint to bypass the normalized catalog cache and return aggregate timing/count headers. Production ignores this parameter and serves the normal cached response path. The `X-Nuvio-Catalog-Stages` header includes:

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

A GitHub Actions availability monitor checks the production homepage, manifest contract, and current-season catalog every 30 minutes. It uses no credentials and has no repository write permissions; failed runs provide a basic availability signal, not full traffic-level error-rate or latency observability.

After a controlled deployment:

- Check runtime logs for `[anilist] upstream request failed` and `[anilist] upstream response error`.
- Compare timeout counts with HTTP 429, 403, and 5xx counts.
- Verify fresh and stale cache response headers.
- Test a cold cache with AniList unavailable and confirm HTTP 503.
- Test a warmed cache with AniList unavailable and confirm stale HTTP 200.
- Confirm the actual Vercel function region and that all AniBloom function regions use the connected Singapore Redis primary.
- Exercise concurrent requests across separate function instances and confirm aggregate upstream calls remain within the shared token-bucket budget.
- Inspect Upstash command usage against the 500,000-command monthly Free-plan allowance.

## Cross-region AniList response reuse

Successful AniList GraphQL responses are also stored in the existing
Upstash Redis database, using hashed query keys and a separate versioned namespace. Exact seasonal search pages use a 5-minute TTL; unsearched and rolling responses use 60 seconds.
This allows Singapore and Mumbai functions to reuse the same successful upstream
response after a regional Runtime Cache miss, including while another region holds
the shared request lock. Entries over 256 KiB are not written to Redis; the existing
regional cache and upstream fallback remain operational. Redis cache failures are
non-fatal. The additional Redis commands consume Free-plan quota, so monitor
monthly command usage after rollout.

## v2.13.0 search-budget regression evidence

The deterministic eight-query simulation consists of six distinct seasonal/format searches plus the two rolling schedules. The first cold burst requires eight AniList requests. After 90 seconds, a new instance requesting the same eight exact query shapes now requires two upstream requests (rolling schedule refresh only); before this change, all eight would have expired. At 330 seconds, the seasonal query responses refresh again. The test also verifies retained response order and IDs.

A separate mocked token-bucket test demonstrates recovery after six three-second refill waits (18 seconds) without permitting requests beyond the existing 20/minute shared budget. The extended wait can increase latency and function duration; fully saturated traffic still receives bounded retryable HTTP 503 with `Retry-After`, and real AniList HTTP 429 still opens a shared cooldown. The distributed request-lock contention deadline was extended to allow its owner to finish the new bounded wait plus its upstream request.

These are mock results, **not** measured production success rates. Request-volume denominators and latency percentiles could not be established through the available read-only observability query. Do not claim that the changes eliminate genuinely distinct prefix requests or resolve every budget-related 503; follow-up production observability remains tracked in #511. No live AniList load tests are permitted.
