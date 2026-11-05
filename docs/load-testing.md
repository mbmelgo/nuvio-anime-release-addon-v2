# AniBloom load testing

## Scope

The bounded probe in `scripts/load-probe.mjs` measures HTTP latency and availability for a warmed catalog-cache path. It sends GET requests only, validates JSON/catalog response shape, reports p50/p95/p99 latency and HTTP/cache status counts, and never prints response bodies.

The probe adds a unique `_load_probe` query parameter to each request. This is ignored by AniBloom's normalized catalog cache key but gives the CDN a unique URL, so requests reach the application instead of being satisfied by the same CDN object. The endpoint's application-level Runtime Cache should already be warm before the run.

This is not a cold-cache, AniList, or cross-instance refresh-stampede test. Do not use `?diagnostics=1` for load testing: it intentionally bypasses the normalized catalog cache and can amplify upstream requests.

## Safety limits

- HTTPS only; only the canonical AniBloom production hostname or an AniBloom Vercel preview hostname is accepted.
- Preview runs: maximum 100 requests, 20 concurrent requests, 30-second timeout.
- Production runs: explicit `--allow-production` opt-in and a stricter maximum of 40 requests / 10 concurrent requests.
- GET only, no retries, no arbitrary paths, and no request bodies.
- Production probes should target a warmed seasonal catalog and remain a small verification, not a stress test.
- Do not run cold-cache or diagnostics-bypass tests against production or against a preview environment connected to live upstreams.

## Usage

Warm the target catalog with one ordinary request first, then run a preview test:

```sh
vercel curl https://<anibloom-preview>.vercel.app/catalog/series/current_season.json >/dev/null
vercel env run -- node scripts/load-probe.mjs \
  --target https://<anibloom-preview>.vercel.app \
  --path /catalog/series/current_season.json \
  --requests 40 \
  --concurrency 20
```

A production smoke-level probe is intentionally more constrained:

```sh
curl -fsS https://anibloom.vercel.app/catalog/series/current_season.json >/dev/null
node scripts/load-probe.mjs \
  --target https://anibloom.vercel.app \
  --path /catalog/series/current_season.json \
  --requests 20 \
  --concurrency 5 \
  --allow-production
```

For protected previews, run these commands from the repository directory linked to the same Vercel project. `vercel curl` uses the existing Vercel CLI authentication to warm the preview catalog. `vercel env run` supplies a short-lived `VERCEL_OIDC_TOKEN`; the probe forwards it as `x-vercel-trusted-oidc-idp-token` for preview requests only. The token is never printed or persisted. This uses the existing Trusted Sources access path and does not disable Deployment Protection or create a bypass secret. If the CLI does not supply the token or Trusted Sources rejects it, stop rather than weakening protection.\n\nFor preview-only stages, run separate bounded passes at 5, 10, and 20 concurrent requests. Keep the total request count within the stated limit for each invocation and inspect runtime errors and Upstash usage between stages. A preview uses an environment-specific AniList limiter key, but still shares the connected Redis database and its command allowance.

## Per-client rate limiting

The catalog endpoint also enforces an incoming per-client rate limit of 120 requests per minute with a burst capacity of 60. All requests from one load generator share the same client-IP bucket, including requests across separate probe invocations. A response of HTTP 429 with body code `RATE_LIMITED` and a `Retry-After` header means this guard has been reached; it is not an AniList upstream failure or proof that the server is overloaded. Stop the run, honor `Retry-After`, and allow the bucket to refill before another stage. Do not immediately repeat a failed stage, spoof `X-Forwarded-For`, or disable the limiter. Testing aggregate multi-user throughput above one client's allowance requires multiple legitimate source IPs and a separately approved distributed test plan.

## AniList upstream budget and retry behavior

AniBloom also has a **shared outbound AniList token bucket** (currently 20 requests per minute with a five-token burst and up to 18 seconds of bounded permit waiting). This is distinct from the 120 requests/minute incoming per-client guard and from AniList's own HTTP 429 responses:

- A request that cannot obtain an outbound token within the deadline returns a retryable catalog HTTP 503 with `Retry-After` where available. **Budget denial does not publish an AniList HTTP 429 cooldown.** A later request must be allowed to recheck the shared bucket and use a newly available permit.
- A real HTTP 429 from AniList triggers the existing shared cooldown, using upstream retry headers. That cooldown remains in place across requests and instances; existing successful caches are checked before new upstream work.
- Repeated **exact** seasonal search GraphQL requests use a five-minute regional/Redis cache TTL. Unsearched requests and rolling schedules keep their existing one-minute upstream TTL. A cache hit must serve the complete upstream page, not a filtered subset of an earlier prefix result.
- Different search prefixes, catalog formats, and pages can generate distinct AniList requests. They cannot always be satisfied from one another's cached results without changing AniList search semantics or risking incomplete data. Cached exact responses and identical-request coalescing remain enabled.
- Repeated 503s under a genuinely exhausted token bucket are expected safety behavior, not evidence of a broken cooldown. Measure errors with request-volume denominators before drawing conclusions about error rates.

The release regression tests use a fake limiter and fake AniList responses to exercise sequential prefix searches, separate catalog formats, rolling schedule requests, and cross-instance recovery. They must not be reproduced by blasting the live AniList API.

## Interpreting results

Record p50/p95/p99 latency, throughput, HTTP status counts, Vercel CDN cache status, stale responses, and failures. The unique query parameter is intended to make CDN cache status show misses; that alone does not prove an application Runtime Cache hit. Compare upstream AniList/provider logs and Redis usage before and after the run to confirm that upstream work did not increase unexpectedly.

Stop if any of the following occurs:
- Any unexpected 429, 5xx, timeout, or invalid response contract.
- A material increase in AniList/provider upstream requests.
- Redis command consumption rises faster than expected.
- Stale responses or refresh failures appear unexpectedly.

## Verified production warm-cache probe

The controlled production probe recorded in PR #499 ran 20 requests at 5 concurrent requests, followed by 40 requests at 10 concurrent requests. All responses were HTTP 200 and no runtime errors were observed. This is evidence for the warmed catalog path only; it is not a stress test and does not establish cold-cache or cross-instance behavior.

## Cold-cache and multi-instance testing

The full catalog refresh is now coordinated across instances with a Redis lock, in addition to the narrower AniList GraphQL request lock. Provider resolver caches remain process-local, but only one `buildCatalog()` operation for a given catalog cache key runs while the shared lock service is available:

- The catalog lock uses the shared Upstash Redis client and an environment-scoped key derived from the hashed catalog cache key. It is separate from the AniList request-lock namespace.
- Acquisition uses `SET NX PX` with a 60-second lease, renewed every 20 seconds while the catalog build or stale background refresh is active. Each owner has a unique token; renew and release use atomic compare-and-PEXPIRE / compare-and-delete Lua scripts.
- On a cold miss, contending instances poll the shared catalog cache for up to 20 seconds. If the owner has not published a fresh catalog by then, the waiting request returns HTTP 503 with `Retry-After: 10` instead of starting a duplicate build.
- On a stale hit, the request still serves stale data immediately. Only the instance that acquires the refresh lock performs the background rebuild; other instances keep serving the stale response.
- If Redis is unavailable, catalog locking fails open to the existing build path. Duplicate builds remain possible during a Redis outage. A lost lease is not allowed to publish over a successor owner's result.

The deterministic catalog integration harness uses two isolated Node workers, a shared fake Runtime Cache/Redis service, a mocked AniList GraphQL endpoint, and mocked responses for every other external provider URL. With the provider fallback path deliberately exercised, the pre-lock behavior performed two catalog builds, two ARM calls, two catalog writes, and 32 other provider requests across two workers. With catalog locking, both simultaneous cold misses and simultaneous stale refreshes perform one build, one ARM call, one catalog write, and 16 provider requests. Tests also cover Redis unavailability, catalog-cache write failure, bounded 503 behavior, lock renewal, owner-token mismatch, and the existing AniList cooldown and request-lock failure modes. These are isolated mocked tests, not production traffic measurements.

Do not generate cold-cache fan-out against live AniList or against a preview connected to live upstreams. Any broader multi-instance test must keep all upstreams mocked and record AniList/provider request counts, cache writes, lock contention, completion time, and failure behavior. Do not use Vercel Runtime Cache as a lock primitive.
