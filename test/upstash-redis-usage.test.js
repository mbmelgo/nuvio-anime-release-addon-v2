import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUsageReport,
  classifyUsage,
  formatBytes,
  parseUsageStats,
} from "../scripts/upstash-redis-usage.js";

const LIMITS = { requests: 500_000, bandwidthBytes: 10 * 1024 ** 3 };

test("parses independent monthly command and bandwidth totals", () => {
  const usage = parseUsageStats({
    total_monthly_requests: 107,
    total_monthly_bandwidth: 7_479,
  }, LIMITS);

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
