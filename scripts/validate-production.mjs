export const PRODUCTION_CATALOG_IDS = [
  "upcoming_season",
  "current_season",
  "previous_season",
  "upcoming_season_movies",
  "current_season_movies",
  "previous_season_movies",
  "upcoming_3_days",
  "previous_3_days",
];

const LEGACY_PRODUCTION_CATALOG_IDS = [
  "upcoming_season",
  "current_season",
  "previous_season",
  "upcoming_3_days",
  "previous_3_days",
];

const MOVIE_CATALOG_IDS = new Set([
  "upcoming_season_movies",
  "current_season_movies",
  "previous_season_movies",
]);

export function catalogTypeForId(catalogId) {
  return MOVIE_CATALOG_IDS.has(catalogId) ? "movie" : "series";
}

const ID_PATTERN = /^(tt\d+|tvdb:[1-9]\d*|tmdb:[1-9]\d*|mal:[1-9]\d*|anilist:[1-9]\d*|kitsu:[1-9]\d*)$/;

export function validateManifest(manifest, expectedVersion, { allowLegacy = false } = {}) {
  if (!manifest || typeof manifest !== "object") throw new Error("Manifest is not an object.");
  if (manifest.version !== expectedVersion) throw new Error(`Manifest version ${manifest.version} does not match expected ${expectedVersion}.`);
  if (manifest.id !== "com.marki.nuvio.anime-releases") throw new Error("Manifest addon id is invalid.");
  if (manifest.identityMode !== "provider") throw new Error("Manifest identity mode must be provider.");
  const catalogs = manifest.catalogs || [];
  const ids = catalogs.map((catalog) => catalog.id);
  const newContract = JSON.stringify(manifest.resources) === JSON.stringify([{ name: "catalog", types: ["series", "movie"] }])
    && JSON.stringify(manifest.types) === JSON.stringify(["series", "movie"])
    && JSON.stringify(ids) === JSON.stringify(PRODUCTION_CATALOG_IDS)
    && catalogs.every((catalog) => catalog.type === catalogTypeForId(catalog.id));
  const legacyContract = allowLegacy
    && JSON.stringify(manifest.resources) === JSON.stringify([{ name: "catalog", types: ["series"] }])
    && JSON.stringify(manifest.types) === JSON.stringify(["series"])
    && JSON.stringify(ids) === JSON.stringify(LEGACY_PRODUCTION_CATALOG_IDS)
    && catalogs.every((catalog) => catalog.type === "series");
  if (!newContract && !legacyContract) {
    if (JSON.stringify(ids) !== JSON.stringify(PRODUCTION_CATALOG_IDS) && JSON.stringify(ids) !== JSON.stringify(LEGACY_PRODUCTION_CATALOG_IDS)) {
      throw new Error("Manifest catalogs do not match the eight supported catalogs.");
    }
    if (catalogs.some((catalog) => catalog.type !== catalogTypeForId(catalog.id))) {
      throw new Error("Manifest catalog types do not match their catalog IDs.");
    }
    throw new Error("Manifest resources do not match the Nuvio catalog contract.");
  }
  return true;
}

export function validateCatalog(catalog, catalogId, expectedType = catalogTypeForId(catalogId)) {
  if (!catalog || typeof catalog !== "object") throw new Error(`${catalogId}: catalog is not an object.`);
  if (!Array.isArray(catalog.metas)) throw new Error(`${catalogId}: catalog metas must be an array.`);
  if (catalogId === "current_season" && catalog.metas.length === 0) throw new Error("current_season: catalog has no metas.");

  const ids = catalog.metas.map((meta) => meta?.id);
  if (new Set(ids).size !== ids.length) throw new Error(`${catalogId}: duplicate catalog identities detected.`);
  for (const meta of catalog.metas) {
    if (meta?.type !== expectedType) throw new Error(`${catalogId}: catalog entry is not a ${expectedType}.`);
    if (!ID_PATTERN.test(String(meta.id || ""))) throw new Error(`${catalogId}: invalid catalog identity ${meta.id}.`);
  }

  if (catalogId === "upcoming_3_days") {
    if (catalog.metas.some((meta) => !Number.isInteger(Number(meta?.extra?.nextEpisode)) || !Number.isInteger(Number(meta?.extra?.nextAiringAt)))) {
      throw new Error("upcoming_3_days: entries must expose next episode and next airing metadata.");
    }
  }

  if (catalogId === "previous_3_days") {
    if (catalog.metas.some((meta) => Object.hasOwn(meta?.extra || {}, "nextEpisode") || Object.hasOwn(meta?.extra || {}, "nextAiringAt"))) {
      throw new Error("previous_3_days: future-only airing metadata must not be present.");
    }
  }

  return true;
}

export async function validateProduction(baseUrl, expectedVersion, fetchImpl = fetch, { allowLegacy = false } = {}) {
  const base = String(baseUrl).replace(/\/$/, "");
  const manifestResponse = await fetchImpl(`${base}/manifest.json`);
  if (!manifestResponse.ok) throw new Error(`Manifest request failed: HTTP ${manifestResponse.status}`);
  const manifest = await manifestResponse.json();
  validateManifest(manifest, expectedVersion, { allowLegacy });

  for (const catalogInfo of manifest.catalogs) {
    const { id: catalogId } = catalogInfo;
    const pageSize = Number(catalogInfo.pageSize);
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
      throw new Error(`${catalogId}: manifest page size is invalid.`);
    }

    const seenIds = new Set();
    let skip = 0;
    let page = 0;
    let reachedEnd = false;
    while (page < 1000) {
      const catalogType = catalogTypeForId(catalogId);
      const response = await fetchImpl(`${base}/catalog/${catalogType}/${catalogId}.json?skip=${skip}`);
      if (!response.ok) throw new Error(`${catalogId}: HTTP ${response.status} at skip=${skip}`);
      const catalog = await response.json();
      if (!Array.isArray(catalog?.metas)) {
        throw new Error(`${catalogId}: catalog metas must be an array.`);
      }

      if (catalog.metas.length === 0) {
        if (skip === 0) validateCatalog(catalog, catalogId, catalogTypeForId(catalogId));
        reachedEnd = true;
        break;
      }

      validateCatalog(catalog, catalogId, catalogTypeForId(catalogId));
      for (const meta of catalog.metas) {
        const id = String(meta.id);
        if (seenIds.has(id)) {
          throw new Error(`${catalogId}: duplicate catalog identity across pages: ${id}.`);
        }
        seenIds.add(id);
      }

      page += 1;
      if (catalog.metas.length < pageSize) {
        reachedEnd = true;
        break;
      }
      skip += pageSize;
    }

    if (!reachedEnd) throw new Error(`${catalogId}: exceeded the 1000-page validation limit.`);
  }

  const metaResponse = await fetchImpl(`${base}/meta/series/mal%3A39535.json`);
  if (metaResponse.status !== 404) throw new Error(`Metadata boundary expected HTTP 404, received ${metaResponse.status}.`);
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const baseUrl = process.env.PRODUCTION_BASE_URL || "https://nuvio-anime-release-addon-v2.vercel.app";
  const expectedVersion = process.env.EXPECTED_VERSION;
  if (!expectedVersion) throw new Error("EXPECTED_VERSION is required.");
  await validateProduction(baseUrl, expectedVersion, fetch, { allowLegacy: process.env.ALLOW_LEGACY_PRODUCTION_CONTRACT === "true" });
  console.log("Production validation passed.");
}

// Release finalization target: production deployment already exists for a7bb721c66dadc526dc8cec3d776405ac4f11667.
