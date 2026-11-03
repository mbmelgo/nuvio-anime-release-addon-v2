import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULTS = Object.freeze({
  path: "/catalog/series/current_season.json",
  requests: 30,
  concurrency: 5,
  timeoutMs: 15_000,
});

const MAX_REQUESTS = 100;
const MAX_CONCURRENCY = 20;
const MAX_TIMEOUT_MS = 30_000;
const CATALOG_PATH = /^\/catalog\/(?:series|movie)\/[a-z0-9_-]+\.json$/;

export function parseLoadTestArgs(argv = []) {
  const config = { ...DEFAULTS, target: "", allowProduction: false };
  const values = new Map([
    ["--target", "target"],
    ["--path", "path"],
    ["--requests", "requests"],
    ["--concurrency", "concurrency"],
    ["--timeout-ms", "timeoutMs"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--allow-production") {
      config.allowProduction = true;
      continue;
    }
    if (flag === "--help" || flag === "-h") {
      config.help = true;
      continue;
    }
    const key = values.get(flag);
    if (!key) throw new Error(`Unknown option: ${flag}`);
    const value = argv[index + 1];
    if (value == null || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    config[key] = key === "target" || key === "path" ? value : Number(value);
    index += 1;
  }

  return validateLoadTestConfig(config);
}

export function validateLoadTestConfig(config) {
  const target = new URL(String(config.target || ""));
  if (target.protocol !== "https:" || target.username || target.password || target.pathname !== "/" || target.search || target.hash) {
    throw new Error("Target must be an HTTPS origin without credentials, path, query, or fragment");
  }

  const hostname = target.hostname.toLowerCase();
  const isProduction = hostname === "anibloom.vercel.app";
  const isAniBloomPreview = /^anibloom-[a-z0-9-]+\.vercel\.app$/.test(hostname);
  if (!isProduction && !isAniBloomPreview) {
    throw new Error("Target must be the AniBloom production domain or an AniBloom Vercel preview deployment");
  }
  if (isProduction && config.allowProduction !== true) {
    throw new Error("Production target requires the explicit --allow-production flag");
  }

  const path = String(config.path || "");
  if (path !== "/manifest.json" && !CATALOG_PATH.test(path)) {
    throw new Error("Path must be /manifest.json or a catalog JSON endpoint");
  }

  for (const [name, value, min, max] of [
    ["requests", config.requests, 1, MAX_REQUESTS],
    ["concurrency", config.concurrency, 1, MAX_CONCURRENCY],
    ["timeoutMs", config.timeoutMs, 1_000, MAX_TIMEOUT_MS],
  ]) {
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(`${name} must be an integer between ${min} and ${max}`);
    }
  }

  if (isProduction && (config.requests > 40 || config.concurrency > 10)) {
    throw new Error("Production runs are limited to 40 requests and 10 concurrent requests");
  }

  return Object.freeze({
    target: target.origin,
    path,
    requests: config.requests,
    concurrency: config.concurrency,
    timeoutMs: config.timeoutMs,
    allowProduction: isProduction,
  });
}

function percentile(sorted, fraction) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

export function summarizeLoadResults(results, elapsedMs) {
  const durations = results
    .filter((result) => Number.isFinite(result.durationMs))
    .map((result) => result.durationMs)
    .sort((left, right) => left - right);
  const statuses = {};
  const cache = {};
  let failures = 0;
  let staleResponses = 0;
  let responseBytes = 0;

  for (const result of results) {
    const status = String(result.status || "network_error");
    statuses[status] = (statuses[status] || 0) + 1;
    if (!result.ok) failures += 1;
    if (result.stale) staleResponses += 1;
    if (Number.isFinite(result.bytes)) responseBytes += result.bytes;
    const cacheStatus = result.cache || "unknown";
    cache[cacheStatus] = (cache[cacheStatus] || 0) + 1;
  }

  return {
    requests: results.length,
    failures,
    staleResponses,
    elapsedMs: Math.round(elapsedMs),
    requestsPerSecond: elapsedMs > 0 ? Number((results.length * 1000 / elapsedMs).toFixed(2)) : 0,
    latencyMs: {
      p50: Number(percentile(durations, 0.50).toFixed(1)),
      p95: Number(percentile(durations, 0.95).toFixed(1)),
      p99: Number(percentile(durations, 0.99).toFixed(1)),
      max: Number((durations.at(-1) || 0).toFixed(1)),
    },
    statuses,
    vercelCache: cache,
    responseBytes,
  };
}

export async function runLoadTest(config, { fetchImpl = globalThis.fetch } = {}) {
  const safeConfig = validateLoadTestConfig(config);
  const results = new Array(safeConfig.requests);
  let nextIndex = 0;
  const startedAt = performance.now();

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= safeConfig.requests) return;

      const url = new URL(safeConfig.path, safeConfig.target);
      // A unique harmless query parameter bypasses the CDN URL cache while
      // leaving AniBloom's normalized catalog cache key unchanged.
      url.searchParams.set("_load_probe", randomUUID());
      const requestStartedAt = performance.now();
      try {
        const response = await fetchImpl(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
          redirect: "error",
          signal: AbortSignal.timeout(safeConfig.timeoutMs),
        });
        const body = await response.text();
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          parsed = null;
        }
        const isCatalog = safeConfig.path.startsWith("/catalog/");
        const contractValid = parsed !== null
          && typeof parsed === "object"
          && (!isCatalog || Array.isArray(parsed.metas));
        results[index] = {
          ok: response.status === 200 && contractValid,
          status: response.status,
          durationMs: performance.now() - requestStartedAt,
          bytes: Buffer.byteLength(body),
          cache: response.headers.get("x-vercel-cache") || "unknown",
          stale: response.headers.get("x-nuvio-catalog-stale") === "1",
          contractValid,
        };
      } catch (error) {
        results[index] = {
          ok: false,
          status: "network_error",
          durationMs: performance.now() - requestStartedAt,
          bytes: 0,
          cache: "unknown",
          error: error?.name === "TimeoutError" ? "timeout" : "request_failed",
        };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(safeConfig.concurrency, safeConfig.requests) }, () => worker()),
  );

  const elapsedMs = performance.now() - startedAt;
  const summary = summarizeLoadResults(results, elapsedMs);
  return {
    target: safeConfig.target,
    path: safeConfig.path,
    concurrency: safeConfig.concurrency,
    summary,
    results,
  };
}

function printHelp() {
  process.stdout.write([
    "AniBloom bounded HTTP load probe",
    "",
    "Usage:",
    "  node scripts/load-probe.mjs --target https://<anibloom-deployment>.vercel.app [options]",
    "",
    "Options:",
    "  --path <path>          Catalog JSON endpoint or /manifest.json",
    "  --requests <count>     Total requests (1-100; default 30)",
    "  --concurrency <count>  Concurrent requests (1-20; default 5)",
    "  --timeout-ms <ms>      Per-request timeout (1000-30000; default 15000)",
    "  --allow-production     Explicit opt-in; production capped at 40 requests / 10 concurrent",
    "  --help                 Show this help",
    "",
    "This probes the warm application-cache path. It does not simulate cold-cache",
    "refreshes or justify a production stress test.",
  ].join("\n") + "\n");
}

async function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }
  const config = parseLoadTestArgs(argv);
  const report = await runLoadTest(config);
  const { results, ...summary } = report;
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  if (summary.summary.failures > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`Load test refused or failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
