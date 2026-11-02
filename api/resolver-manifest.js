import { catalogDefinitions, getSeasonInfo } from "./catalog-source.js";
import { ADDON_VERSION } from "./version.js";
import { BASE_URL } from "./config.js";

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
    name: "AniBloom",
    description: "Anime discovery catalogs organized by season, release timing, and movies for Nuvio.",
    logo: BASE_URL + "/assets/anibloom-icon.png",
    resources: [
      { name: "catalog", types: ["series", "movie"] },
    ],
    types: ["series", "movie"],
    catalogs: catalogDefinitions(info, "mal"),
    identityMode: "provider"
  };
}
