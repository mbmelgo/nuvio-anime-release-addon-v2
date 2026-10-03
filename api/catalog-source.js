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
  const id = String(meta.id || "");
  if (/^tt\d+$/.test(id) || /^tvdb:[1-9]\d*$/.test(id) || /^tmdb:[1-9]\d*$/.test(id)) {
    return { ...meta, id };
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

async function resolveMappingsForRows(
  rows,
  {
    resolveMappings = resolveAniListMappings,
    resolveSecondaryMappings = resolveAniListMappingsSecondary,
    resolveAlternativeMappings = resolveAniListMappingsByMalIds,
  } = {},
) {
  const ids = rows.map((row) => Number(row.id));
  let mappings = new Map();

  try {
    mappings = await resolveMappings(ids);
  } catch (error) {
    console.error("[identity] ARM mapping failed; using secondary mapping sources", error);
  }

  const unresolvedRows = rows.filter((row) => !selectBingeCatIdentity(
    { ...row, anilistId: Number(row.id) },
    getBingeCatCandidates({ ...row, anilistId: Number(row.id) }, mappings.get(Number(row.id)) || []),
  ));

  if (unresolvedRows.length) {
    try {
      const secondary = await resolveSecondaryMappings(unresolvedRows.map((row) => Number(row.id)));
      mappings = mergeMappings(mappings, secondary);
    } catch (error) {
      console.error("[identity] secondary mapping source failed; trying MAL identity bridge", error);
    }
  }

  const stillUnresolvedRows = rows.filter((row) => !selectBingeCatIdentity(
    { ...row, anilistId: Number(row.id) },
    getBingeCatCandidates({ ...row, anilistId: Number(row.id) }, mappings.get(Number(row.id)) || []),
  ));

  if (stillUnresolvedRows.length) {
    try {
      const alternative = await resolveAlternativeMappings(stillUnresolvedRows);
      mappings = mergeMappings(mappings, alternative);
    } catch (error) {
      console.error("[identity] MAL identity bridge failed", error);
    }
  }

  return mappings;
}

function mergeMappings(base, additional) {
  const merged = new Map(base);
  for (const [id, records] of additional instanceof Map ? additional : []) {
    if (!merged.has(id) || !merged.get(id)?.length) merged.set(id, records);
  }
  return merged;
}

export async function canonicalizeCatalogPageWithBingeCat(
  mediaRows,
  {
    resolveMappings = resolveAniListMappings,
    resolveSecondaryMappings = resolveAniListMappingsSecondary,
    resolveAlternativeMappings = resolveAniListMappingsByMalIds,
  } = {},
) {
  const normalizedRows = Array.isArray(mediaRows)
    ? mediaRows
      .map((row) => (typeof row === "object" && row !== null ? row : { id: row }))
      .filter((row) => /^\d+$/.test(String(row.id ?? "").trim()))
    : [];
  if (!normalizedRows.length) return [];

  const mappings = await resolveMappingsForRows(normalizedRows, {
    resolveMappings,
    resolveSecondaryMappings,
    resolveAlternativeMappings,
  });

  const metas = [];
  const usedIdentities = new Set();
  const unresolvedIds = [];

  for (const row of normalizedRows) {
    const anilistId = Number(row.id);
    const rawMeta = toCatalogIdentity(toMetaFromAniList(anilistId, row));
    if (!rawMeta) {
      unresolvedIds.push(anilistId);
      continue;
    }

    const meta = normalizeSeasonalCatalogMetaTypes([rawMeta])[0];
    const media = { ...row, anilistId };
    const records = mappings.get(anilistId) || [];
    const selected = selectBingeCatIdentity(
      media,
      getBingeCatCandidates(media, records),
      { excludeIds: usedIdentities },
    );

    if (!selected) {
      unresolvedIds.push(anilistId);
      continue;
    }

    usedIdentities.add(selected.stremioId);
    metas.push({
      ...meta,
      id: selected.stremioId,
      extra: {
        ...meta.extra,
        bingecatProvider: selected.provider,
        bingecatId: selected.id,
        bingecatEvidence: selected.evidence,
      },
    });
  }

  if (unresolvedIds.length || metas.length !== normalizedRows.length) {
    throw new Error(
      `BingeCat identity resolution exhausted; unresolved AniList IDs: ${unresolvedIds.join(",") || "unknown"}`,
    );
  }

  return metas;
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
  useBingeCatIdentity = false,
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
      if (!useBingeCatIdentity) {
        const metas = [];
        for (const row of eligibleRows) {
          const media = row.media;
          const baseMeta = toCatalogIdentity(toMetaFromAniList(Number(media.id), media));
          if (baseMeta) metas.push(baseMeta);
        }
        return filterCatalogMetasBySearch(metas, search);
      }

      const mediaRows = eligibleRows.map((row) => row.media);
      const mappings = await resolveMappingsForRows(mediaRows, {\n        resolveMappings,\n        resolveSecondaryMappings,\n        resolveAlternativeMappings,\n      });
      const metas = [];
      const usedIdentities = new Set();
      const unresolvedIds = [];

      for (const row of eligibleRows) {
        const media = row.media;
        const mediaId = Number(media.id);
        const baseMeta = toCatalogIdentity(toMetaFromAniList(mediaId, media));
        if (!baseMeta) {
          unresolvedIds.push(mediaId);
          continue;
        }

        const selected = selectBingeCatIdentity(
          { ...media, anilistId: mediaId },
          getBingeCatCandidates(media, mappings.get(mediaId) || []),
          { excludeIds: usedIdentities },
        );
        if (!selected) {
          unresolvedIds.push(mediaId);
          continue;
        }

        usedIdentities.add(selected.stremioId);
        const meta = {
          ...baseMeta,
          id: selected.stremioId,
          extra: {
            ...baseMeta.extra,
            bingecatProvider: selected.provider,
            bingecatId: selected.id,
            bingecatEvidence: selected.evidence,
          },
        };

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

      if (unresolvedIds.length || metas.length !== eligibleRows.length) {
        throw new Error(
          `BingeCat identity resolution exhausted for rolling catalog; unresolved AniList IDs: ${unresolvedIds.join(",") || "unknown"}`,
        );
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
  if (getRollingCatalogRange(id, new Date())) {
    return buildRollingCatalog(id, new Date(), skip, search, { useBingeCatIdentity: true });
  }
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
