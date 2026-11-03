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

The catalog refresh coordinator and resolver work remain process-local, so separate serverless instances may still perform duplicate catalog assembly and non-AniList provider lookups. Identical AniList GraphQL requests are additionally coalesced across instances by a Redis request lock:

- The lock uses the same Upstash Redis client as the shared AniList token bucket and an environment-scoped key derived from the hashed request signature.
- Acquisition uses `SET NX PX` with a bounded lease sized to cover the configured permit wait and upstream timeout. Each owner has a unique token; release uses an atomic compare-and-delete Lua script.
- A contending instance checks the shared response cache and retries lock acquisition for up to the bounded request wait (at most 25 seconds). If the result is still in progress, the API returns HTTP 503 with a `Retry-After` value aligned to the remaining lock lease rather than duplicating the upstream request.
- If Redis is unavailable, locking fails open to the existing request-permit path. The lock is not a replacement for the shared token bucket, and no cross-instance guarantee exists while Redis is unavailable.

The deterministic integration test uses two isolated Node workers, a shared fake cache/lock service, and a mocked AniList endpoint. It verifies that two simultaneous cold misses produce one upstream request; it also covers cache-write failure, shared 429 and token-budget cooldown propagation, lock contention, lease expiry, owner-token-safe release, and Redis unavailability. This does not validate the full catalog refresh across Vercel instances or duplicate work in other provider resolvers.

Do not generate cold-cache fan-out against live AniList or against a preview connected to live upstreams. Any broader multi-instance test must keep all upstreams mocked and record AniList request counts, cache writes, lock contention, completion time, and failure behavior. Do not use Vercel Runtime Cache as a lock primitive.
