import {
  ANILIST_PAGE_SIZE,
  MAX_SCHEDULE_PAGES,
  NUVIO_PAGE_SIZE,
  buildCatalogMediaVariables,
  catalogDefinitions as getCatalogDefinitions,
  getNext5DaysRangeManila,
  getPrevious7DaysRangeManila,
  getSeasonInfo as getSeasonInfoValue,
  parseCatalogExtraPath,
} from "../lib/catalog-config.js";
import { collectValidatedCatalogPage } from "../lib/catalog-pagination.js";
import { filterCatalogMetasBySearch, toMetaFromAniList } from "../lib/catalog-meta.js";
import { queryAnime, queryAiringSchedulePage } from "../lib/catalog-anilist.js";
import { resolveAniListMappings } from "../lib/arm-mapping.js";
import { getBingeCatCandidates, selectBingeCatIdentity } from "../lib/bingecat-identity.js";
import {
  resolveAniListMappingsSecondary,
  resolveAniListMappingsByMalIds,
} from "../lib/secondary-mapping.js";

export {
  ANILIST_PAGE_SIZE,
  NUVIO_PAGE_SIZE,
  buildCatalogMediaVariables,
  getNext5DaysRangeManila,
  getPrevious7DaysRangeManila,
  parseCatalogExtraPath,
  filterCatalogMetasBySearch,
  toMetaFromAniList,
};

export function catalogDefinitions(info) {
  return getCatalogDefinitions(info);
}

export function toCatalogIdentity(meta) {
  if (!meta) return null;

  const malId = Number(meta.extra?.malId);
  if (Number.isInteger(malId) && malId > 0) {
    return { ...meta, id: `mal:${malId}` };
  }

  const anilistId = Number(meta.extra?.anilistId);
  if (Number.isInteger(anilistId) && anilistId > 0) {
    return { ...meta, id: `anilist:${anilistId}` };
  }

  return null;
}
