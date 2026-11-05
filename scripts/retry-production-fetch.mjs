const RETRYABLE_STATUSES = new Set([408, 429, 502, 503, 504]);

export function isTransientProductionStatus(status) {
  return RETRYABLE_STATUSES.has(Number(status));
}

export function retryAfterDelayMs(response, now = Date.now()) {
  const retryAfter = response?.headers?.get?.("retry-after");
  if (!retryAfter) return null;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(60_000, Math.ceil(seconds * 1000));
  }
  const absolute = Date.parse(retryAfter);
  return Number.isFinite(absolute) ? Math.min(60_000, Math.max(0, absolute - now)) : null;
}

/**
 * Retries only network failures and transient HTTP responses. The existing
 * production validator still sees all terminal status codes (notably 404).
 * Successful pages are never requested again merely because a later page
 * encounters a temporary 429 or 503.
 */
export async function retryTransientProductionFetch(fetchImpl, url, {
  attempts = 3,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  init,
} = {}) {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 5) {
    throw new RangeError("Production fetch attempts must be between 1 and 5");
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, init);
    } catch (error) {
      if (attempt === attempts) throw error;
      await sleep(Math.min(5000, 1000 * 2 ** (attempt - 1)));
      continue;
    }
    if (!isTransientProductionStatus(response.status) || attempt === attempts) {
      return response;
    }
    const delay = retryAfterDelayMs(response) ?? Math.min(5000, 1000 * 2 ** (attempt - 1));
    await sleep(delay);
  }
  throw new Error("Production fetch attempts exhausted");
}
