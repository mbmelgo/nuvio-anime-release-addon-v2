import { buildUsageReport, parseUsageStats } from "./upstash-redis-usage.js";
import fs from "node:fs";

const REQUIRED_ENV = ["UPSTASH_API_EMAIL", "UPSTASH_API_KEY", "UPSTASH_REDIS_DATABASE_ID"];
const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);

const DATABASE_ID = process.env.UPSTASH_REDIS_DATABASE_ID;
if (!/^[A-Za-z0-9-]{1,128}$/.test(DATABASE_ID)) {
  throw new Error("UPSTASH_REDIS_DATABASE_ID must be a valid database identifier");
}

const credentials = Buffer.from(`${process.env.UPSTASH_API_EMAIL}:${process.env.UPSTASH_API_KEY}`, "utf8").toString("base64");
const response = await fetch(`https://api.upstash.com/v2/redis/stats/${encodeURIComponent(DATABASE_ID)}`, {
  method: "GET",
  headers: { Authorization: `Basic ${credentials}`, Accept: "application/json" },
  signal: AbortSignal.timeout(15_000),
});
if (!response.ok) throw new Error(`Upstash Developer API returned HTTP ${response.status}`);

let stats;
try { stats = await response.json(); }
catch { throw new Error("Upstash Developer API returned invalid JSON"); }

const metadataResponse = await fetch(`https://api.upstash.com/v2/redis/database/${encodeURIComponent(DATABASE_ID)}?credentials=hide`, {
  method: "GET",
  headers: { Authorization: `Basic ${credentials}`, Accept: "application/json" },
  signal: AbortSignal.timeout(15_000),
});
if (!metadataResponse.ok) throw new Error(`Upstash database metadata API returned HTTP ${metadataResponse.status}`);

let metadata;
try { metadata = await metadataResponse.json(); }
catch { throw new Error("Upstash database metadata API returned invalid JSON"); }

const limits = {
  requests: metadata.db_request_limit,
  bandwidthBytes: typeof metadata.db_monthly_bandwidth_limit === "number"
    ? metadata.db_monthly_bandwidth_limit * 1024 ** 3
    : 10 * 1024 ** 3,
};
const usage = parseUsageStats(stats, limits);
const report = buildUsageReport(usage);
console.log(report);

const alerts = [
  { name: "commands", severity: usage.commandsSeverity, percentage: usage.commandsPercentage },
  { name: "bandwidth", severity: usage.bandwidthSeverity, percentage: usage.bandwidthPercentage },
].filter((metric) => metric.severity !== "normal");

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `usage_alerts=${alerts.length > 0}\n`);
}
if (alerts.length) {
  const levels = alerts.map((metric) => `${metric.name}=${metric.severity}(${metric.percentage.toFixed(2)}%)`);
  console.log(`::warning::Upstash usage threshold reached: ${levels.join(", ")}`);
}