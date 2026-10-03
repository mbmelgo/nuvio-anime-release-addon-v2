export const PRODUCTION_CATALOG_IDS = [
  "upcoming_season",
  "current_season",
  "previous_season",
  "upcoming_5_days",
  "previous_7_days",
];

const ID_PATTERN = /^(tt\d+|tvdb:[1-9]\d*|tmdb:[1-9]\d*|mal:[1-9]\d*)$/;

export function validateManifest(manifest, expectedVersion) {
  if (!manifest || typeof manifest !== "object") throw new Error("Manifest is not an object.");
  if (manifest.version !== expectedVersion) throw new Error(`Manifest version ${manifest.version} does not match expected ${expectedVersion}.`);
  if (manifest.id !== "com.marki.nuvio.anime-releases") throw new Error("Manifest addon id is invalid.");
  if (manifest.identityMode !== "bingecat") throw new Error("Manifest identity mode must be bingecat.");
  if (JSON.stringify(manifest.resources) !== JSON.stringify([{ name: "catalog", types: ["anime"] }])) {
    throw new Error("Manifest resources do not match the Nuvio catalog contract.");
  }
  if (JSON.stringify(manifest.types) !== JSON.stringify(["anime"])) throw new Error("Manifest types do not match the Nuvio catalog contract.");
  const ids = (manifest.catalogs || []).map((catalog) => catalog.id);
  if (JSON.stringify(ids) !== JSON.stringify(PRODUCTION_CATALOG_IDS)) throw new Error("Manifest catalogs do not match the five supported catalogs.");
  if ((manifest.catalogs || []).some((catalog) => catalog.type !== "anime")) throw new Error("Manifest contains a non-anime catalog.");
  return true;
}

export function validateCatalog(catalog, catalogId) {
  if (!catalog || typeof catalog !== "object") throw new Error(`${catalogId}: catalog is not an object.`);
  if (!Array.isArray(catalog.metas)) throw new Error(`${catalogId}: catalog metas must be an array.`);
  if (catalogId === "current_season" && catalog.metas.length === 0) throw new Error("current_season: catalog has no metas.");

  const ids = catalog.metas.map((meta) => meta?.id);
  if (new Set(ids).size !== ids.length) throw new Error(`${catalogId}: duplicate catalog identities detected.`);
  for (const meta of catalog.metas) {
    if (meta?.type !== "series") throw new Error(`${catalogId}: catalog entry is not a series.`);
    if (!ID_PATTERN.test(String(meta.id || ""))) throw new Error(`${catalogId}: invalid catalog identity ${meta.id}.`);
  }

  if (catalogId === "upcoming_5_days") {
    if (catalog.metas.some((meta) => !Number.isInteger(Number(meta?.extra?.nextEpisode)) || !Number.isInteger(Number(meta?.extra?.nextAiringAt)))) {
      throw new Error("upcoming_5_days: entries must expose next episode and next airing metadata.");
    }
  }

  if (catalogId === "previous_7_days") {
    if (catalog.metas.some((meta) => Object.hasOwn(meta?.extra || {}, "nextEpisode") || Object.hasOwn(meta?.extra || {}, "nextAiringAt"))) {
      throw new Error("previous_7_days: future-only airing metadata must not be present.");
    }
  }

  return true;
}

export async function validateProduction(baseUrl, expectedVersion, fetchImpl = fetch) {
  const base = String(baseUrl).replace(/\/$/, "");
  const manifestResponse = await fetchImpl(`${base}/manifest.json`);
  if (!manifestResponse.ok) throw new Error(`Manifest request failed: HTTP ${manifestResponse.status}`);
  const manifest = await manifestResponse.json();
  validateManifest(manifest, expectedVersion);

  for (const catalogId of PRODUCTION_CATALOG_IDS) {
    const response = await fetchImpl(`${base}/catalog/anime/${catalogId}.json`);
    if (!response.ok) throw new Error(`${catalogId}: HTTP ${response.status}`);
    const catalog = await response.json();
    validateCatalog(catalog, catalogId);
  }

  const metaResponse = await fetchImpl(`${base}/meta/series/mal%3A39535.json`);
  if (metaResponse.status !== 404) throw new Error(`Metadata boundary expected HTTP 404, received ${metaResponse.status}.`);
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const baseUrl = process.env.PRODUCTION_BASE_URL || "https://nuvio-anime-release-addon-v2.vercel.app";
  const expectedVersion = process.env.EXPECTED_VERSION;
  if (!expectedVersion) throw new Error("EXPECTED_VERSION is required.");
  await validateProduction(baseUrl, expectedVersion);
  console.log("Production validation passed.");
}
