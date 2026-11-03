# Public-service incident response

## Scope and operating assumptions

This runbook covers the public AniBloom website and catalog API.

- The GitHub Actions production availability workflow checks the homepage, manifest contract, and current-season catalog every 30 minutes.
- That workflow is an availability check, not request-volume monitoring, an error-rate dashboard, a latency-percentile monitor, or a guaranteed paging system. GitHub notification behavior depends on repository and user notification settings.
- Vercel runtime logs and the Upstash console are the primary operational evidence currently available. No dedicated paid monitoring or alerting dependency is configured.
- Do not infer an outage solely from a single client-side HTTP 429. Distinguish the incoming per-client limiter from AniList's separate upstream request budget.

## Initial triage

1. Record the UTC time, affected public URL, HTTP status, response body code, Retry-After header if present, and deployment/version.
2. Check the latest production availability workflow run. Confirm whether the homepage, manifest, and catalog steps failed independently.
3. Inspect Vercel production runtime logs around the incident. Search for [catalog] request failed, [catalog] background refresh failed, [anilist] upstream request failed, [anilist] upstream response error, and [identity] provider failures.
4. Check Upstash request/error metrics and database availability. Keep incident notes free of customer identifiers and operational access material.
5. Compare the affected request with a second catalog endpoint and the homepage/manifest. Avoid load testing production during an incident.

## Symptom guide

### HTTP 429 with RATE_LIMITED

This is the incoming per-client catalog limiter (nominally 120 requests/minute with burst capacity 60), not proof that AniList is rate-limiting AniBloom.

- Honor Retry-After; do not immediately retry or launch repeated probes from the same client.
- Check whether one client or test runner generated many requests.
- Check whether Upstash is healthy. If Redis is unavailable or times out, the app logs that it has fallen back to an instance-local limiter; cross-instance enforcement is then not guaranteed.
- Do not attempt to bypass the client limiter or raise its limits as an incident workaround.

### AniList 429 or upstream rate-limit cooldown

- Look for [anilist] upstream response error and HTTP 429 details.
- The AniList client applies a bounded cooldown using Retry-After or rate-limit reset headers.
- Pause repeated synthetic requests. Allow the cooldown to expire and check a normal catalog request.
- Do not change the upstream budget during an incident without a separately reviewed change and regression tests.

### HTTP 503 or cold-cache catalog failure

A 503 can mean the upstream catalog could not be built and no successful cached response was available.

- Check whether the same catalog can be served from a warmed cache and whether the response includes X-Nuvio-Catalog-Stale: 1.
- Inspect AniList timeout, network, HTTP, GraphQL, and rate-limit classifications.
- If AniList is unavailable, avoid repeatedly forcing cold requests. Wait for upstream recovery and verify a successful refresh.
- Do not convert upstream failures into empty successful catalogs; that would hide data loss from clients.

### Stale catalog responses

A stale successful response is an intentional fallback while a background refresh runs.

- Confirm X-Nuvio-Catalog-Stale: 1 and Cache-Control: no-store.
- Inspect the background-refresh failure log and the relevant upstream/provider errors.
- If stale responses persist, pause promotion and investigate the upstream/cache path. Do not clear caches blindly during an incident.

### Identity-provider failures

- Identity resolution is a fallback chain. One provider failure does not necessarily make the catalog endpoint unavailable.
- Identify the failing provider and whether fallback resolution continues. Check whether output identity quality has degraded before treating an isolated provider warning as a service outage.
- Keep provider access details out of issue comments and logs.

### Vercel runtime or deployment errors

- Check function logs, deployment status, and whether errors began immediately after a new production deployment.
- Compare with the last known-good production deployment and inspect the release diff.
- For a confirmed regression introduced by the latest deployment, use the Vercel rollback/promote-previous-deployment procedure. Verify the production domain points to the intended deployment and smoke-test homepage, manifest, and a representative catalog afterward.
- Do not roll back for an upstream AniList outage unless evidence shows the deployed code caused or materially worsened it.

## Promotion pause and rollback criteria

Pause public promotion (do not amplify traffic) when any of the following is observed:

- Two consecutive scheduled production availability checks fail for the same critical endpoint.
- Homepage or manifest is unavailable to independent checks.
- A representative catalog returns sustained 5xx/503 responses for approximately five minutes, confirmed by repeated low-rate checks and runtime evidence.
- Ordinary low-volume catalog use repeatedly receives RATE_LIMITED, after ruling out one client exhausting its own bucket.
- Catalog responses are malformed, unexpectedly empty due to upstream failure, or consistently stale beyond the documented fallback window.
- A deployment causes a clear regression in catalog correctness, security, or request handling.

Rollback only when the incident is attributable to a recent deployment and the previous deployment is a known-good version. Otherwise, keep the deployment stable while diagnosing provider, cache, or infrastructure failures. After rollback, verify homepage, manifest, current-season catalog, and one rolling catalog; inspect logs for recurrence.

These are operational decision thresholds, not measured service-level objectives. Current monitoring does not provide complete traffic-level error rates or latency percentiles.

## Recovery and follow-up

1. Confirm the upstream/dependency recovery or successful rollback.
2. Verify the affected endpoint and representative unrelated endpoints with low request volume.
3. Check that errors have stopped and that stale responses transition back to fresh responses.
4. Record timeline, impact, root cause, mitigation, and follow-up actions in a GitHub issue. Redact request identifiers and private operational details.
5. Add a regression test for code defects. Update this runbook and the privacy disclosure if data flows, providers, monitoring, or operational behavior changed.

## Related documentation

- [Catalog upstream resilience](./catalog-resilience.md)
- [Production availability workflow](../.github/workflows/production-health-check.yml)
- [Release state](../ops/release-state.json)

