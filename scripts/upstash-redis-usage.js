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

function parseJson(response, context) {
  try {
    return response.json();
  } catch {
    throw new Error(`${context} returned invalid JSON`);
  }
}

export function classifyUsage(percentage, thresholds = DEFAULT_THRESHOLDS) {
  requireNonNegativeFiniteNumber(percentage, "percentage");
  if (!Array.isArray(thresholds)) throw new TypeError("Usage thresholds must be an array");

  const normalized = thresholds.map((threshold) => {
    if (
      !threshold ||
      typeof threshold.percentage !== "number" ||
      !Number.isFinite(threshold.percentage) ||
      threshold.percentage < 0 ||
      threshold.percentage > 100 ||
      typeof threshold.severity !== "string" ||
      !threshold.severity.trim()
    ) throw new TypeError("Invalid usage threshold");
    return threshold;
  }).sort((a, b) => b.percentage - a.percentage);

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

export async function fetchUpstashUsage({
  email,
  apiKey,
  databaseId,
  fetchImpl = fetch,
}) {
  if (typeof email !== "string" || !email.trim()) throw new TypeError("Upstash API email is required");
  if (typeof apiKey !== "string" || !apiKey.trim()) throw new TypeError("Upstash API key is required");
  if (typeof databaseId !== "string" || !/^[A-Za-z0-9-]{1,128}$/.test(databaseId)) {
    throw new TypeError("Upstash Redis database ID is invalid");
  }
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required");

  const authorization = `Basic ${Buffer.from(`${email}:${apiKey}`, "utf8").toString("base64")}`;
  const headers = { Authorization: authorization, Accept: "application/json" };
  const id = encodeURIComponent(databaseId);

  const statsResponse = await fetchImpl(`https://api.upstash.com/v2/redis/stats/${id}`, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!statsResponse?.ok) {
    throw new Error(`Upstash stats API returned HTTP ${statsResponse?.status ?? "unknown"}`);
  }
  const stats = await parseJson(statsResponse, "Upstash stats API");

  const metadataResponse = await fetchImpl(`https://api.upstash.com/v2/redis/database/${id}?credentials=hide`, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!metadataResponse?.ok) {
    throw new Error(`Upstash database metadata API returned HTTP ${metadataResponse?.status ?? "unknown"}`);
  }
  const metadata = await parseJson(metadataResponse, "Upstash database metadata API");

  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new TypeError("Upstash database metadata response must be an object");
  }

  const requestLimit = metadata.db_request_limit;
  const monthlyBandwidthLimitGb = metadata.db_monthly_bandwidth_limit;
  requireNonNegativeFiniteNumber(requestLimit, "db_request_limit");
  requireNonNegativeFiniteNumber(monthlyBandwidthLimitGb, "db_monthly_bandwidth_limit");

  return parseUsageStats(stats, {
    requests: requestLimit,
    bandwidthBytes: monthlyBandwidthLimitGb * 1024 ** 3,
  });
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
  return [
    "# Upstash Redis monthly usage",
    "",
    `- Commands: ${usage.requests.toLocaleString("en-US")} / ${usage.requestLimit.toLocaleString("en-US")} (${usage.commandsPercentage.toFixed(2)}%) — ${usage.commandsSeverity}`,
    `- Bandwidth: ${formatBytes(usage.bandwidthBytes)} / ${formatBytes(usage.bandwidthLimitBytes)} (${usage.bandwidthPercentage.toFixed(2)}%) — ${usage.bandwidthSeverity}`,
    "",
    "Alerts are evaluated independently for commands and bandwidth.",
  ].join("\n");
}
