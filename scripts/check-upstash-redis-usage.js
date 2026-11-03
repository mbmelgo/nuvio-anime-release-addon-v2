import { buildUsageReport, fetchUpstashUsage } from "./upstash-redis-usage.js";
import fs from "node:fs";

const usage = await fetchUpstashUsage({
  email: process.env.UPSTASH_API_EMAIL,
  apiKey: process.env.UPSTASH_API_KEY,
  databaseId: process.env.UPSTASH_REDIS_DATABASE_ID,
});

const report = buildUsageReport(usage);
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
}

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
