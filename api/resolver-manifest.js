import { catalogDefinitions, getSeasonInfo } from "./catalog-source.js";
import { ADDON_VERSION } from "./version.js";

export default function handler(req, res) {
  const current = getSeasonInfo(new Date());

  res.status(200);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60, stale-while-revalidate=300");

  if (req.method === "OPTIONS") return res.json({});
  return res.json(buildManifest(current));
}

export function buildManifest(info) {
  return {
    id: "com.marki.nuvio.anime-releases",
    version: ADDON_VERSION,
    name: "Anime Releases for Nuvio",
    description: "Season-aware anime release catalogs using validated BingeCat-compatible identities, with ARM-first cross-provider mapping and secondary identity resolution. Detailed metadata is delegated to the user's preferred metadata addon.",
    resources: [
      { name: "catalog", types: ["anime"] },
    ],
    types: ["anime"],
    catalogs: catalogDefinitions(info, "mal"),
    identityMode: "provider",
  };
}
