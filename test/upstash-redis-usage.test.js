import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUsageReport,
  classifyUsage,
  fetchUpstashUsage,
  formatBytes,
  parseUsageStats,
} from "../scripts/upstash-redis-usage.js";

const LIMITS = { requests: 500_000, bandwidthBytes: 10 * 1024 ** 3 };
const statsResponse = {
  total_monthly_requests: 107,
  total_monthly_bandwidth: 7_479,
};
const metadataResponse = {
  db_request_limit: 500_000,
  db_monthly_bandwidth_limit: 10,
};

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; },
  };
}

function usageFetch(fetchImpl = globalThis.fetch) {
  return fetchUpstashUsage({
    email: "owner@example.test",
    apiKey: "test-api-key",
    databaseId: "test-db-123",
    fetchImpl,
  });
}

test("parses independent monthly command and bandwidth totals", () => {
  const usage = parseUsageStats(statsResponse, LIMITS);
  assert.equal(usage.requests, 107);
  assert.equal(usage.bandwidthBytes, 7_479);
  assert.equal(usage.commandsPercentage, 0.0214);
  assert.equal(usage.bandwidthPercentage, (7_479 / LIMITS.bandwidthBytes) * 100);
  assert.equal(usage.commandsSeverity, "normal");
  assert.equal(usage.bandwidthSeverity, "normal");
});

test("classifies exact and above threshold boundaries", () => {
  assert.equal(classifyUsage(49.99), "normal");
  assert.equal(classifyUsage(50), "notice");
  assert.equal(classifyUsage(69.99), "notice");
  assert.equal(classifyUsage(70), "warning");
  assert.equal(classifyUsage(85), "critical");
  assert.equal(classifyUsage(95), "urgent");
  assert.equal(classifyUsage(100), "urgent");
  assert.equal(classifyUsage(125), "urgent");
});

test("validates all usage fields and limits", () => {
  for (const value of [undefined, null, "1", NaN, Infinity, -1]) {
    assert.throws(() => parseUsageStats({
      total_monthly_requests: value,
      total_monthly_bandwidth: 0,
    }, LIMITS));
  }
  assert.throws(() => parseUsageStats({
    total_monthly_requests: 0,
    total_monthly_bandwidth: 0,
  }, { requests: 0, bandwidthBytes: 1 }));
  assert.throws(() => parseUsageStats(null, LIMITS));
  assert.throws(() => parseUsageStats({}, LIMITS));
});

test("reports commands and bandwidth alerts independently", () => {
  const commandsOnly = parseUsageStats({
    total_monthly_requests: 350_000,
    total_monthly_bandwidth: 0,
  }, LIMITS);
  assert.equal(commandsOnly.commandsSeverity, "warning");
  assert.equal(commandsOnly.bandwidthSeverity, "normal");

  const bandwidthOnly = parseUsageStats({
    total_monthly_requests: 0,
    total_monthly_bandwidth: LIMITS.bandwidthBytes * 0.9,
  }, LIMITS);
  assert.equal(bandwidthOnly.commandsSeverity, "normal");
  assert.equal(bandwidthOnly.bandwidthSeverity, "critical");
});

test("formats bandwidth using binary units", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1024), "1.00 KiB");
  assert.equal(formatBytes(1024 ** 3), "1.00 GiB");
});

test("generates a clear report with both usage percentages", () => {
  const usage = parseUsageStats({
    total_monthly_requests: 250_000,
    total_monthly_bandwidth: LIMITS.bandwidthBytes / 2,
  }, LIMITS);
  const report = buildUsageReport(usage);
  assert.match(report, /Commands: 250,000 \/ 500,000 \(50\.00%\) — notice/);
  assert.match(report, /Bandwidth: 5\.00 GiB \/ 10\.00 GiB \(50\.00%\) — notice/);
});

test("fetches monthly stats and credential-hidden metadata using Basic API auth", async () => {
  const calls = [];
  const usage = await usageFetch(async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1 ? jsonResponse(statsResponse) : jsonResponse(metadataResponse);
  });

  const authorization = `Basic ${Buffer.from("owner@example.test:test-api-key").toString("base64")}`;
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/v2\/redis\/stats\/test-db-123$/);
  assert.match(calls[1].url, /\/v2\/redis\/database\/test-db-123\?credentials=hide$/);
  for (const call of calls) {
    assert.equal(call.options.method, "GET");
    assert.equal(call.options.headers.Authorization, authorization);
  }
  assert.equal(usage.requests, 107);
  assert.equal(usage.requestLimit, 500_000);
  assert.equal(usage.bandwidthLimitBytes, 10 * 1024 ** 3);
});

test("rejects missing credentials and malformed database identifiers before making requests", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return jsonResponse({}); };
  await assert.rejects(fetchUpstashUsage({
    email: "",
    apiKey: "key",
    databaseId: "db",
    fetchImpl,
  }), /API email is required/);
  await assert.rejects(fetchUpstashUsage({
    email: "owner@example.test",
    apiKey: "",
    databaseId: "db",
    fetchImpl,
  }), /API key is required/);
  await assert.rejects(fetchUpstashUsage({
    email: "owner@example.test",
    apiKey: "key",
    databaseId: "invalid/id",
    fetchImpl,
  }), /database ID is invalid/);
  assert.equal(calls, 0);
});

test("surfaces stats API authentication and service failures without leaking credentials", async () => {
  await assert.rejects(
    usageFetch(async () => jsonResponse({}, 401)),
    (error) => error.message.includes("HTTP 401") && !error.message.includes("test-api-key"),
  );
  await assert.rejects(
    usageFetch(async () => jsonResponse({}, 503)),
    /HTTP 503/,
  );
});

test("rejects malformed JSON and missing monthly counters or limits", async () => {
  await assert.rejects(usageFetch(async () => ({
    ok: true,
    status: 200,
    async json() { throw new SyntaxError("bad json"); },
  })), /invalid JSON/);

  await assert.rejects(usageFetch(async (url) => (
    url.includes("/stats/") ? jsonResponse({}) : jsonResponse(metadataResponse)
  )), /total_monthly_requests/);

  await assert.rejects(usageFetch(async (url) => (
    url.includes("/stats/") ? jsonResponse(statsResponse) : jsonResponse({ db_request_limit: 500_000 })
  )), /db_monthly_bandwidth_limit/);
});

test("surfaces metadata API errors without attempting to parse an invalid limit", async () => {
  let calls = 0;
  await assert.rejects(usageFetch(async () => {
    calls += 1;
    return calls === 1 ? jsonResponse(statsResponse) : jsonResponse({}, 403);
  }), /metadata API returned HTTP 403/);
});
