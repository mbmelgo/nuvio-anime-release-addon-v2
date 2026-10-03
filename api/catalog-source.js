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

export function getSeasonInfo(date) {
  return getSeasonInfoValue(date);
}

export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
  const parts = url.pathname.split("/").filter(Boolean);
  const rawExtraPath = req.query?.extra ?? parts.slice(3).join("/");
  const pathExtra = parseCatalogExtraPath(rawExtraPath);
  const query = { ...pathExtra, ...(req.query || {}) };
  const resource = query.resource || parts[0];
  const type = query.type || parts[1];
  const rawId = query.id || parts[2]?.replace(/\.json$/, "");
  const id = rawId ? decodeURIComponent(String(rawId).replace(/\.json$/, "")) : "";
  const now = new Date();
  const seasonInfo = getSeasonInfo(now);

  if (req.method === "OPTIONS") return send(res, {}, 200);

  if (resource === "catalog" && type === "anime") {
    if (!catalogDefinitions(seasonInfo).some((catalog) => catalog.id === id)) {
      return send(res, { metas: [] }, 404);
    }
    try {
      const skip = Math.max(0, Number(query.skip || 0) || 0);
      const search = String(query.search || "").trim();
      return send(res, { metas: await buildCatalog(id, seasonInfo, skip, search) });
    } catch (error) {
      console.error("[catalog] request failed", { id, skip: query.skip, search: query.search, error });
      return send(res, { metas: [] }, 500);
    }
  }

  return send(res, { error: "Not found" }, 404);
}

export function getCatalogFilter(id, info) {
  if (id === "current_season") return { season: info.ongoing, sort: ["ID"] };
  if (id === "previous_season") return { season: info.previous, sort: ["ID"] };
  if (id === "upcoming_season") return { season: info.upcoming, sort: ["ID"] };
  return null;
}

export function normalizeSeasonalCatalogMetaTypes(metas) {
  return metas.map((meta) => ({ ...meta, type: "series" }));
}

export async function canonicalizeCatalogPageWithBingeCat(
  mediaRows,
  { resolveMappings = resolveAniListMappings } = {},
) {
  const normalizedRows = Array.isArray(mediaRows)
    ? mediaRows
      .map((row) => (typeof row === "object" && row !== null ? row : { id: row }))
      .filter((row) => /^\\d+$/.test(String(row.id ?? "").trim()))
    : [];
  if (!normalizedRows.length) return [];

  const ids = normalizedRows.map((row) => Number(row.id));
  let mappings;
  try {
    mappings = await resolveMappings(ids);
  } catch (error) {
    console.error("[identity] ARM mapping failed; retaining legacy catalog identities", error);
    return canonicalizeCatalogPage(normalizedRows);
  }

  return normalizedRows
    .map((row) => {
      const anilistId = Number(row.id);
      const meta = toCatalogIdentity(toMetaFromAniList(anilistId, row));
      if (!meta) return null;

      const media = { ...row, anilistId };
      const records = mappings.get(anilistId) || [];
      const selected = selectBingeCatIdentity(media, getBingeCatCandidates(media, records));
      if (!selected) return meta;

      return {
        ...meta,
        id: selected.stremioId,
        extra: {
          ...meta.extra,
          bingecatProvider: selected.provider,
          bingecatId: selected.id,
          bingecatEvidence: selected.evidence,
        },
      };
    })
    .filter(Boolean);
}

export function canonicalizeCatalogPage(mediaRows) {
  if (!Array.isArray(mediaRows) || mediaRows.length === 0) return [];
  const normalizedRows = mediaRows
    .map((row) => (typeof row === "object" && row !== null ? row : { id: row }))
    .filter((row) => /^\d+$/.test(String(row.id ?? "").trim()));
  if (normalizedRows.length === 0) return [];
  return normalizeSeasonalCatalogMetaTypes(
    normalizedRows
      .map((row) => toCatalogIdentity(toMetaFromAniList(row.id, row)))
      .filter(Boolean),
  );
}

export async function fetchValidatedSeasonCatalogPage({
  filter,
  skip = 0,
  search = "",
  fetchPage = queryAnime,
  canonicalizePage = canonicalizeCatalogPage,
}) {
  const normalizedSkip = Math.max(0, Number(skip) || 0);
  const anilistPage = Math.floor(normalizedSkip / NUVIO_PAGE_SIZE) + 1;
  const pageOffset = normalizedSkip % NUVIO_PAGE_SIZE;
  const rows = await fetchPage(filter, anilistPage, search, { includeMalId: true });
  const canonical = await canonicalizePage(rows);
  return canonical.slice(pageOffset, pageOffset + NUVIO_PAGE_SIZE);
}

export function getRollingCatalogRange(id, date) {
  if (id === "upcoming_5_days") return getNext5DaysRangeManila(date);
  if (id === "previous_7_days") return getPrevious7DaysRangeManila(date);
  return null;
}

export function isEligibleRollingMedia(media) {
  return media?.isAdult === false
    && ["TV", "TV_SHORT", "ONA", "OVA", "SPECIAL", "MOVIE"].includes(media?.format);
}

export async function buildRollingCatalog(id, date, skip, search, {
  fetchPage = queryAiringSchedulePage,
  maxPages = MAX_SCHEDULE_PAGES,
  pageSize = NUVIO_PAGE_SIZE,
} = {}) {
  const range = getRollingCatalogRange(id, date);
  if (!range) return [];

  const futureOnly = id === "upcoming_5_days";
  const sort = futureOnly ? "TIME" : "TIME_DESC";

  return collectValidatedCatalogPage({
    skip,
    pageSize,
    maxPages,
    fetchPage: (page) => fetchPage(range.start, range.end, futureOnly, page, sort),
    canonicalizePage: async (rows) => {
      const eligibleRows = (Array.isArray(rows) ? rows : []).filter((row) => {
        const media = row?.media;
        return Number.isInteger(Number(media?.id))
          && Number(media.id) > 0
          && isEligibleRollingMedia(media);
      });
      let mappings = new Map();
      try {
        mappings = await resolveAniListMappings(
          eligibleRows.map((row) => Number(row.media.id)),
        );
      } catch (error) {
        console.error("[identity] ARM rolling mapping failed; retaining legacy catalog identities", error);
      }
      const metas = [];
      for (const row of eligibleRows) {
        const media = row.media;
        const mediaId = Number(media.id);
        const baseMeta = toCatalogIdentity(toMetaFromAniList(mediaId, media));
        if (!baseMeta) continue;
        const selected = selectBingeCatIdentity(
          { ...media, anilistId: mediaId },
          getBingeCatCandidates(media, mappings.get(mediaId) || []),
        );
        const meta = selected
          ? {
              ...baseMeta,
              id: selected.stremioId,
              extra: {
                ...baseMeta.extra,
                bingecatProvider: selected.provider,
                bingecatId: selected.id,
                bingecatEvidence: selected.evidence,
              },
            }
          : baseMeta;
        meta.type = "series";
        meta.extra = {
          ...meta.extra,
          episode: row.episode,
          airingAt: row.airingAt,
          ...(futureOnly ? {
            nextEpisode: row.episode,
            nextAiringAt: row.airingAt,
          } : {}),
        };
        metas.push(meta);
      }
      return filterCatalogMetasBySearch(metas, search);
    },
  });
}

export async function buildCatalog(id, info, skip, search) {
  const filter = getCatalogFilter(id, info);
  if (filter) {
    return fetchValidatedSeasonCatalogPage({
      filter,
      skip,
      search,
      canonicalizePage: canonicalizeCatalogPageWithBingeCat,
    });
  }
  if (getRollingCatalogRange(id, new Date())) return buildRollingCatalog(id, new Date(), skip, search);
  return [];
}

function send(res, body, status = 200) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400, stale-if-error=86400");
  return res.json(body);
}
