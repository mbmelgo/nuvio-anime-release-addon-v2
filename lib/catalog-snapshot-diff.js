const IDENTITY_RANK = Object.freeze({
  unknown: 0,
  anilist: 1,
  mal: 2,
  tmdb: 3,
  tvdb: 3,
  imdb: 4,
});

export const DEFAULT_CATALOGS = Object.freeze([
  "current_season",
  "previous_season",
  "upcoming_season",
  "upcoming_5_days",
  "previous_7_days",
]);

export function normalizeCatalogTitle(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\\p{L}\\p{N}]+/gu, " ")
    .trim()
    .replace(/\\s+/g, " ");
}

export function compareCatalogSnapshots(beforeSnapshot, afterSnapshot, {
  catalogs = DEFAULT_CATALOGS,
} = {}) {
  const beforeCatalogs = normalizeSnapshotCatalogs(beforeSnapshot);
  const afterCatalogs = normalizeSnapshotCatalogs(afterSnapshot);

  const beforeNames = new Set(Object.keys(beforeCatalogs));
  const afterNames = new Set(Object.keys(afterCatalogs));
  const names = catalogs.length
    ? [...catalogs]
    : [...new Set([...beforeNames, ...afterNames])];

  const missingBefore = names.filter((name) => !beforeNames.has(name));
  const missingAfter = names.filter((name) => !afterNames.has(name));
  if (missingBefore.length || missingAfter.length) {
    throw new Error(
      `Snapshot catalog sets differ. Missing before: ${missingBefore.join(", ") || "none"}; missing after: ${missingAfter.join(", ") || "none"}`,
    );
  }

  const resultCatalogs = {};
  for (const name of names) {
    resultCatalogs[name] = compareCatalog(
      beforeCatalogs[name],
      afterCatalogs[name],
      name,
    );
  }

  const totals = summarizeCatalogs(resultCatalogs);
  return {
    schemaVersion: 1,
    beforeReleaseVersion: String(beforeSnapshot?.releaseVersion || ""),
    afterReleaseVersion: String(afterSnapshot?.releaseVersion || ""),
    catalogs: resultCatalogs,
    totals,
  };
}

function compareCatalog(beforeMetas, afterMetas, catalog) {
  const matches = matchEntries(beforeMetas, afterMetas);
  const matchedAfter = new Set(matches.map((match) => match.afterIndex));
  const matchedBefore = new Set(matches.map((match) => match.beforeIndex));

  const orderingChanged = findOrderingChanges(matches);
  const changes = [];

  for (const match of matches) {
    const before = beforeMetas[match.beforeIndex];
    const after = afterMetas[match.afterIndex];
    const changeTypes = classifyEntryChange(before, after);
    if (orderingChanged.has(match.beforeIndex)) changeTypes.push("ordering_changed");

    changes.push({
      key: match.key,
      matchMethod: match.matchMethod,
      beforeIndex: match.beforeIndex,
      afterIndex: match.afterIndex,
      changeTypes: [...new Set(changeTypes)],
      before: summarizeMeta(before),
      after: summarizeMeta(after),
    });
  }

  for (let index = 0; index < beforeMetas.length; index += 1) {
    if (matchedBefore.has(index)) continue;
    changes.push({
      key: stableFallbackKey(beforeMetas[index], index),
      matchMethod: null,
      beforeIndex: index,
      afterIndex: null,
      changeTypes: ["removed"],
      before: summarizeMeta(beforeMetas[index]),
      after: null,
    });
  }

  for (let index = 0; index < afterMetas.length; index += 1) {
    if (matchedAfter.has(index)) continue;
    changes.push({
      key: stableFallbackKey(afterMetas[index], index),
      matchMethod: null,
      beforeIndex: null,
      afterIndex: index,
      changeTypes: ["added"],
      before: null,
      after: summarizeMeta(afterMetas[index]),
    });
  }

  changes.sort(compareChangeOrder);

  const summary = {
    before: beforeMetas.length,
    after: afterMetas.length,
    added: countType(changes, "added"),
    removed: countType(changes, "removed"),
    matched: matches.length,
    unchanged: countUnchanged(changes),
    identityImproved: countType(changes, "identity_improved"),
    identityDegraded: countType(changes, "identity_degraded"),
    identityChanged: countType(changes, "identity_changed"),
    providerChanged: countType(changes, "provider_changed"),
    titleChanged: countType(changes, "title_changed"),
    seasonChanged: countType(changes, "season_changed"),
    yearChanged: countType(changes, "year_changed"),
    orderingChanged: countType(changes, "ordering_changed"),
  };

  return { catalog, summary, changes };
}

function matchEntries(beforeMetas, afterMetas) {
  const usedAfter = new Set();
  const matches = [];

  for (const method of ["anilist", "mal", "title"]) {
    const afterIndex = buildUniqueIndex(afterMetas, method);
    for (let beforeIndex = 0; beforeIndex < beforeMetas.length; beforeIndex += 1) {
      if (matches.some((match) => match.beforeIndex === beforeIndex)) continue;
      const key = entryMatchKey(beforeMetas[beforeIndex], method);
      if (!key) continue;
      const candidate = afterIndex.get(key);
      if (candidate === undefined || usedAfter.has(candidate)) continue;
      usedAfter.add(candidate);
      matches.push({
        beforeIndex,
        afterIndex: candidate,
        matchMethod: method,
        key: stableMatchKey(beforeMetas[beforeIndex], afterMetas[candidate]),
      });
    }
  }

  return matches.sort((a, b) => a.beforeIndex - b.beforeIndex);
}

function buildUniqueIndex(metas, method) {
  const candidates = new Map();
  for (let index = 0; index < metas.length; index += 1) {
    const key = entryMatchKey(metas[index], method);
    if (!key) continue;
    const list = candidates.get(key) || [];
    list.push(index);
    candidates.set(key, list);
  }

  const unique = new Map();
  for (const [key, indexes] of candidates) {
    if (indexes.length === 1) unique.set(key, indexes[0]);
  }
  return unique;
}

function entryMatchKey(meta, method) {
  if (method === "anilist") {
    const id = positiveInteger(meta?.extra?.anilistId);
    return id ? `anilist:${id}` : null;
  }
  if (method === "mal") {
    const id = positiveInteger(meta?.extra?.malId);
    return id ? `mal:${id}` : null;
  }
  const title = normalizeCatalogTitle(meta?.name);
  return title ? `title:${title}` : null;
}

function stableMatchKey(before, after) {
  const anilistId = positiveInteger(before?.extra?.anilistId) || positiveInteger(after?.extra?.anilistId);
  if (anilistId) return `anilist:${anilistId}`;
  const malId = positiveInteger(before?.extra?.malId) || positiveInteger(after?.extra?.malId);
  if (malId) return `mal:${malId}`;
  return `title:${normalizeCatalogTitle(before?.name || after?.name)}`;
}

function stableFallbackKey(meta, index) {
  const anilistId = positiveInteger(meta?.extra?.anilistId);
  if (anilistId) return `anilist:${anilistId}`;
  const malId = positiveInteger(meta?.extra?.malId);
  if (malId) return `mal:${malId}`;
  const title = normalizeCatalogTitle(meta?.name);
  return title ? `title:${title}` : `index:${index}`;
}

function classifyEntryChange(before, after) {
  const changeTypes = [];
  const beforeIdentity = getResolvedIdentity(before);
  const afterIdentity = getResolvedIdentity(after);

  if (beforeIdentity.key !== afterIdentity.key) {
    changeTypes.push("identity_changed");
  }
  if (beforeIdentity.provider !== afterIdentity.provider) {
    changeTypes.push("provider_changed");
  }

  const beforeRank = IDENTITY_RANK[beforeIdentity.provider] ?? 0;
  const afterRank = IDENTITY_RANK[afterIdentity.provider] ?? 0;
  if (afterRank > beforeRank) changeTypes.push("identity_improved");
  if (afterRank < beforeRank) changeTypes.push("identity_degraded");

  if (normalizeCatalogTitle(before?.name) !== normalizeCatalogTitle(after?.name)) {
    changeTypes.push("title_changed");
  }

  const beforeYear = getReleaseStartYear(before);
  const afterYear = getReleaseStartYear(after);
  if (beforeYear !== afterYear) changeTypes.push("year_changed");

  const beforeSeason = getExplicitSeason(before);
  const afterSeason = getExplicitSeason(after);
  if (beforeSeason !== null && afterSeason !== null && beforeSeason !== afterSeason) {
    changeTypes.push("season_changed");
  }

  return changeTypes;
}

function getResolvedIdentity(meta) {
  const rawId = String(meta?.id || "").trim();
  const match = rawId.match(/^([a-z0-9_-]+):(.*)$/i);
  if (match) {
    const provider = normalizeProvider(match[1]);
    const id = match[2].trim();
    if (provider && id) return { provider, id, key: `${provider}:${id}` };
  }

  if (/^tt\\d+$/i.test(rawId)) {
    return { provider: "imdb", id: rawId, key: `imdb:${rawId}` };
  }

  const identityProvider = normalizeProvider(meta?.extra?.identityProvider);
  const identityId = String(meta?.extra?.identityId || "").trim();
  if (identityProvider && identityId) {
    return {
      provider: identityProvider,
      id: identityId,
      key: `${identityProvider}:${identityId}`,
    };
  }

  return { provider: "unknown", id: "", key: "unknown:" };
}

function normalizeProvider(value) {
  const provider = String(value || "").trim().toLowerCase();
  return provider === "imdb" || provider === "tvdb" || provider === "tmdb"
    || provider === "mal" || provider === "anilist"
    ? provider
    : provider ? provider : "unknown";
}

function getReleaseStartYear(meta) {
  const releaseInfo = String(meta?.releaseInfo || "").trim();
  const match = releaseInfo.match(/^(\\d{4})/);
  if (match) return Number(match[1]);
  const released = String(meta?.released || "").trim();
  const dateMatch = released.match(/^(\\d{4})-/);
  return dateMatch ? Number(dateMatch[1]) : null;
}

function getExplicitSeason(meta) {
  const value = meta?.extra?.season ?? meta?.extra?.seasonName ?? meta?.extra?.season?.season;
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object") {
    return String(value.season || value.name || "").trim().toUpperCase() || null;
  }
  return String(value).trim().toUpperCase() || null;
}

function summarizeMeta(meta) {
  if (!meta) return null;
  const identity = getResolvedIdentity(meta);
  return {
    id: String(meta.id || ""),
    name: String(meta.name || ""),
    anilistId: positiveInteger(meta.extra?.anilistId),
    malId: positiveInteger(meta.extra?.malId),
    provider: identity.provider,
    providerId: identity.id || null,
    releaseInfo: String(meta.releaseInfo || ""),
    year: getReleaseStartYear(meta),
    season: getExplicitSeason(meta),
  };
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function findOrderingChanges(matches) {
  const byAfter = [...matches].sort((a, b) => a.afterIndex - b.afterIndex);
  const sequence = byAfter.map((match) => match.beforeIndex);
  const kept = longestIncreasingSubsequence(sequence);
  const keptSet = new Set(kept);
  return new Set(sequence.filter((beforeIndex) => !keptSet.has(beforeIndex)));
}

function longestIncreasingSubsequence(values) {
  if (!values.length) return [];
  const lengths = new Array(values.length).fill(1);
  const previous = new Array(values.length).fill(-1);
  let best = 0;

  for (let i = 0; i < values.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if (values[j] >= values[i] || lengths[j] + 1 <= lengths[i]) continue;
      lengths[i] = lengths[j] + 1;
      previous[i] = j;
    }
    if (lengths[i] > lengths[best]) best = i;
  }

  const result = [];
  for (let index = best; index >= 0; index = previous[index]) {
    result.push(values[index]);
    if (previous[index] < 0) break;
  }
  return result.reverse();
}

function normalizeSnapshotCatalogs(snapshot) {
  if (snapshot?.catalogs && !Array.isArray(snapshot.catalogs)) {
    return Object.fromEntries(
      Object.entries(snapshot.catalogs).map(([name, value]) => [name, extractMetas(value)]),
    );
  }
  return {};
}

function extractMetas(value) {
  const metas = Array.isArray(value) ? value : value?.metas;
  if (!Array.isArray(metas)) {
    throw new Error("Catalog snapshot entries must contain a metas array");
  }
  return metas;
}

function countType(changes, type) {
  return changes.filter((change) => change.changeTypes.includes(type)).length;
}

function countUnchanged(changes) {
  return changes.filter((change) => change.before && change.after && change.changeTypes.length === 0).length;
}

function summarizeCatalogs(catalogs) {
  const totals = {
    before: 0,
    after: 0,
    added: 0,
    removed: 0,
    matched: 0,
    unchanged: 0,
    identityImproved: 0,
    identityDegraded: 0,
    identityChanged: 0,
    providerChanged: 0,
    titleChanged: 0,
    seasonChanged: 0,
    yearChanged: 0,
    orderingChanged: 0,
  };
  for (const catalog of Object.values(catalogs)) {
    for (const [key, value] of Object.entries(catalog.summary)) {
      if (key in totals) totals[key] += value;
    }
  }
  return totals;
}

function compareChangeOrder(a, b) {
  const aIndex = a.beforeIndex ?? a.afterIndex;
  const bIndex = b.beforeIndex ?? b.afterIndex;
  return aIndex - bIndex || String(a.key).localeCompare(String(b.key));
}
