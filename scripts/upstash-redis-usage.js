const DEFAULT_THRESHOLDS = Object.freeze([
  { percentage: 95, severity: "urgent" },
  { percentage: 85, severity: "critical" },
  { percentage: 70, severity: "warning" },
  { percentage: 50, severity: "notice" },
]);

function requireNonNegativeFiniteNumber(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`Invalid Upstash stats field: ${field}`);
  }
  return value;
}

export function classifyUsage(percentage, thresholds = DEFAULT_THRESHOLDS) {
  requireNonNegativeFiniteNumber(percentage, "percentage");
  if (!Array.isArray(thresholds)) {
    throw new TypeError("Usage thresholds must be an array");
  }

  const normalized = thresholds
    .map((threshold) => {
      if (
        !threshold ||
        typeof threshold.percentage !== "number" ||
        !Number.isFinite(threshold.percentage) ||
        threshold.percentage < 0 ||
        threshold.percentage > 100 ||
        typeof threshold.severity !== "string" ||
        !threshold.severity.trim()
      ) {
        throw new TypeError("Invalid usage threshold");
      }
      return threshold;
    })
    .sort((a, b) => b.percentage - a.percentage);

  return normalized.find((threshold) => percentage >= threshold.percentage)?.severity ?? "normal";
}

export function parseUsageStats(stats, limits) {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) {
    throw new TypeError("Upstash stats response must be an object");
  }
  if (!limits || typeof limits !== "object" || Array.isArray(limits)) {
    throw new TypeError("Usage limits must be an object");
  }

  const requests = requireNonNegativeFiniteNumber(stats.total_monthly_requests, "total_monthly_requests");
  const bandwidthBytes = requireNonNegativeFiniteNumber(stats.total_monthly_bandwidth, "total_monthly_bandwidth");
  const requestLimit = requireNonNegativeFiniteNumber(limits.requests, "requests");
  const bandwidthLimitBytes = requireNonNegativeFiniteNumber(limits.bandwidthBytes, "bandwidthBytes");

  if (requestLimit === 0 || bandwidthLimitBytes === 0) {
    throw new RangeError("Usage limits must be greater than zero");
  }

  const commandsPercentage = (requests / requestLimit) * 100;
  const bandwidthPercentage = (bandwidthBytes / bandwidthLimitBytes) * 100;

  return {
    requests,
    requestLimit,
    commandsPercentage,
    commandsSeverity: classifyUsage(commandsPercentage),
    bandwidthBytes,
    bandwidthLimitBytes,
    bandwidthPercentage,
    bandwidthSeverity: classifyUsage(bandwidthPercentage),
  };
}

export function formatBytes(bytes) {
  requireNonNegativeFiniteNumber(bytes, "bytes");
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value.toFixed(2)} ${units[unit]}`;
}

export function buildUsageReport(usage) {
  const lines = [
    "# Upstash Redis monthly usage",
    "",
    `- Commands: ${usage.requests.toLocaleString("en-US")} / ${usage.requestLimit.toLocaleString("en-US")} (${usage.commandsPercentage.toFixed(2)}%) — ${usage.commandsSeverity}`,
    `- Bandwidth: ${formatBytes(usage.bandwidthBytes)} / ${formatBytes(usage.bandwidthLimitBytes)} (${usage.bandwidthPercentage.toFixed(2)}%) — ${usage.bandwidthSeverity}`,
    "",
    "Alerts are evaluated independently for commands and bandwidth.",
  ];
  return lines.join("\n");
}
