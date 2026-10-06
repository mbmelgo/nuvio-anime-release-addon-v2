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
import { resolveAniListMappingsFribb } from "../lib/fribb-mapping.js";
import { resolveAniListExternalMappings } from "../lib/external-provider-mapping.js";
import { resolveAniListMappingsAnimap } from "../lib/animap-mapping.js";
import { resolveAniListMappingsIdMapper } from "../lib/idmapper-mapping.js";
import { resolveAniListMappingsByTMDB, selectTMDBIdentity } from "../lib/tmdb-mapping.js";
import { resolveAniListMappingsByAnimeMapper, resolveAniListRelatedProviderIdsByAnimeMapper, resolveAniListCanonicalSeriesByAnimeMapper } from "../lib/anime-mapper-mapping.js";
import { resolveAniListMappingsByAniBridge } from "../lib/anibridge-mapping.js";
import { resolveAniListMappingsByImdbSearch } from "../lib/imdb-search-mapping.js";
import { resolveAniListMappingsFromAnimeApiTsv } from "../lib/animeapi-tsv-mapping.js";
import { getProviderCandidates, selectProviderIdentity } from "../lib/provider-identity.js";
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

export function filterAiringRowsBySearch(rows, search) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  if (!String(search || "").trim()) return normalizedRows;
  return normalizedRows.filter((row) =>
    filterCatalogMetasBySearch(
      [toMetaFromAniList(Number(row?.media?.id), row?.media)],
      search,
    ).length > 0
  );
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
    resolveFribbMappings = resolveAniListMappingsFribb,
    resolveExternalMappings = resolveAniListExternalMappings,
    resolveAnimapMappings = resolveAniListMappingsAnimap,
    resolveIdMapperMappings = resolveAniListMappingsIdMapper,
    resolveTMDBMappings = resolveAniListMappingsByTMDB,
    resolveAnimeMapperMappings = resolveAniListMappingsByAnimeMapper,
    resolveAnimeMapperRelatedProviderIds = resolveAniListRelatedProviderIdsByAnimeMapper,
    resolveCanonicalSeriesMappings = resolveAniListCanonicalSeriesByAnimeMapper,
    resolveAniBridgeMappings = resolveAniListMappingsByAniBridge,
    resolveTsvMappings = resolveAniListMappingsFromAnimeApiTsv,
    resolveImdbMappings = resolveAniListMappingsByImdbSearch,
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

  let unresolvedRows = rows.filter((row) => !selectProviderIdentity(
    { ...row, anilistId: Number(row.id) },
    getProviderCandidates({ ...row, anilistId: Number(row.id) }, mappings.get(Number(row.id)) || []),
  ));

  if (unresolvedRows.length) {
    try {
      mappings = mergeMappings(mappings, await resolveFribbMappings(unresolvedRows.map((row) => Number(row.id))));
    } catch (error) {
      console.error("[identity] Fribb mapping source failed; trying AniList external links", error);
    }
  }

  unresolvedRows = rows.filter((row) => !selectProviderIdentity(
    { ...row, anilistId: Number(row.id) },
    getProviderCandidates({ ...row, anilistId: Number(row.id) }, mappings.get(Number(row.id)) || []),
  ));

  if (unresolvedRows.length) {
    try {
      mappings = mergeMappings(mappings, resolveExternalMappings(unresolvedRows));
    } catch (error) {
      console.error("[identity] AniList external mapping failed; trying AniBridge", error);
    }
  }

  unresolvedRows = rows.filter((row) => !selectProviderIdentity(
    { ...row, anilistId: Number(row.id) },
    getProviderCandidates({ ...row, anilistId: Number(row.id) }, mappings.get(Number(row.id)) || []),
  ));

  if (unresolvedRows.length) {
    try {
      mappings = mergeMappings(mappings, await resolveAniBridgeMappings(unresolvedRows));
    } catch (error) {
      console.error("[identity] AniBridge bulk mapping failed; trying TMDB", error);
    }
  }

  const tmdbRows = rows.filter((row) => {
    const candidates = getProviderCandidates(
      { ...row, anilistId: Number(row.id) },
      mappings.get(Number(row.id)) || [],
    );
    const selected = selectProviderIdentity(
      { ...row, anilistId: Number(row.id) },
      candidates,
    );
    return !selected || selected.provider !== "imdb";
  });
  if (tmdbRows.length) {
    try {
      mappings = mergeMappings(mappings, await resolveTMDBMappings(tmdbRows));
    } catch (error) {
      console.error("[identity] TMDB mapping failed; trying AniMap", error);
    }
  }

  // A TMDB match without an IMDb external ID is a useful fallback, but it is
  // not proof that IMDb has no current identity. Verify TMDB-only matches
  // through the independent IMDb title search before allowing the TMDB
  // fallback to become terminal. Existing relation/title validation still
  // applies when the candidate is selected.
  const tmdbImdbVerificationRows = rows.filter((row) => {
    const media = { ...row, anilistId: Number(row.id) };
    const tmdbSelected = selectTMDBIdentity(media, mappings.get(Number(row.id)) || []);
    return tmdbSelected?.provider === "tmdb" || tmdbSelected?.provider === "imdb";
  });
  if (tmdbImdbVerificationRows.length) {
    try {
      mappings = mergeMappings(mappings, await resolveImdbMappings(tmdbImdbVerificationRows));
    } catch (error) {
      console.error("[identity] post-TMDB IMDb verification failed", error);
    }
  }

  unresolvedRows = rows.filter((row) => !selectProviderIdentity(
    { ...row, anilistId: Number(row.id) },
    getProviderCandidates({ ...row, anilistId: Number(row.id) }, mappings.get(Number(row.id)) || []),
  ));

  if (unresolvedRows.length) {
    try {
      mappings = mergeMappings(mappings, await resolveAnimapMappings(unresolvedRows.map((row) => Number(row.id))));
    } catch (error) {
      console.error("[identity] AniMap mapping failed; trying IDMapper", error);
    }
  }

  unresolvedRows = rows.filter((row) => !selectProviderIdentity(
    { ...row, anilistId: Number(row.id) },
    getProviderCandidates({ ...row, anilistId: Number(row.id) }, mappings.get(Number(row.id)) || []),
  ));

  if (unresolvedRows.length) {
    try {
      mappings = mergeMappings(mappings, await resolveIdMapperMappings(unresolvedRows.map((row) => Number(row.id))));
    } catch (error) {
      console.error("[identity] IDMapper mapping failed; trying Anime Mapper", error);
    }
  }

  unresolvedRows = rows.filter((row) => !selectProviderIdentity(
    { ...row, anilistId: Number(row.id) },
    getProviderCandidates({ ...row, anilistId: Number(row.id) }, mappings.get(Number(row.id)) || []),
  ));

  if (unresolvedRows.length) {
    try {
      mappings = mergeMappings(mappings, await resolveAnimeMapperMappings(unresolvedRows));
    } catch (error) {
      console.error("[identity] Anime Mapper mapping source failed; trying AnimeAPI TSV", error);
    }
  }

  unresolvedRows = rows.filter((row) => !selectProviderIdentity(
    { ...row, anilistId: Number(row.id) },
    getProviderCandidates({ ...row, anilistId: Number(row.id) }, mappings.get(Number(row.id)) || []),
  ));

  if (unresolvedRows.length) {
    try {
      mappings = mergeMappings(mappings, await resolveTsvMappings(unresolvedRows));
    } catch (error) {
      console.error("[identity] AnimeAPI TSV mapping failed; trying IMDb search", error);
    }
  }

  unresolvedRows = rows.filter((row) => {
    const selected = selectProviderIdentity(
      { ...row, anilistId: Number(row.id) },
      getProviderCandidates({ ...row, anilistId: Number(row.id) }, mappings.get(Number(row.id)) || []),
    );
    return !selected || selected.provider !== "imdb";
  });

  if (unresolvedRows.length) {
    try {
      mappings = mergeMappings(mappings, await resolveImdbMappings(unresolvedRows));
    } catch (error) {
      console.error("[identity] IMDb mapping failed; trying secondary sources", error);
    }
  }

  unresolvedRows = rows.filter((row) => !selectProviderIdentity(
    { ...row, anilistId: Number(row.id) },
    getProviderCandidates({ ...row, anilistId: Number(row.id) }, mappings.get(Number(row.id)) || []),
  ));

  if (unresolvedRows.length) {
    try {
      mappings = mergeMappings(mappings, await resolveSecondaryMappings(unresolvedRows.map((row) => Number(row.id))));
    } catch (error) {
      console.error("[identity] secondary mapping source failed; trying MAL identity bridge", error);
    }
  }

  const stillUnresolvedRows = rows.filter((row) => !selectProviderIdentity(
    { ...row, anilistId: Number(row.id) },
    getProviderCandidates({ ...row, anilistId: Number(row.id) }, mappings.get(Number(row.id)) || []),
  ));

  if (stillUnresolvedRows.length) {
    try {
      mappings = mergeMappings(mappings, await resolveAlternativeMappings(stillUnresolvedRows));
    } catch (error) {
      console.error("[identity] MAL identity bridge failed", error);
    }
  }

  if (stillUnresolvedRows.length) {
    try {
      const relationMappings = await resolveRelationMappings(stillUnresolvedRows, {
        resolveMappings,
        resolveFribbMappings,
        resolveExternalMappings,
        resolveImdbMappings,
      });
      mappings = mergeMappings(mappings, relationMappings);
    } catch (error) {
      console.error("[identity] relation-id mapping fallback failed", error);
    }
  }

  await applyRelatedProviderProtection(rows, mappings, {
    resolveMappings,
    resolveFribbMappings,
    resolveExternalMappings,
    resolveAnimeMapperMappings,
    resolveAnimeMapperRelatedProviderIds,
  });


  // Resolve season/installment entries to the canonical series root used by
  // downstream scrapers. This is deliberately additive: the source row's
  // AniList identity and display metadata remain unchanged while the
  // scraper-facing provider identity is anchored to the canonical series.
  try {
    const canonicalRoots = await resolveCanonicalSeriesMappings(rows);
    const canonicalRows = [];
    const canonicalByCurrentId = new Map();
    for (const [currentId, root] of canonicalRoots instanceof Map ? canonicalRoots : []) {
      if (!root?.canonicalTitle || !root?.canonicalMalId) continue;
      const currentRow = rows.find((row) => Number(row?.id) === Number(currentId));
      if (!currentRow) continue;
      canonicalByCurrentId.set(Number(currentId), root);
      canonicalRows.push({
        ...currentRow,
        id: Number(currentId),
        idMal: Number(root.canonicalMalId),
        format: "TV",
        title: { english: root.canonicalTitle, romaji: root.canonicalTitle, native: root.canonicalTitle },
        synonyms: [],
        startDate: { year: root.canonicalYear },
        relations: { edges: [] },
      });
    }
    if (canonicalRows.length) {
      const canonicalImdb = await resolveImdbMappings(canonicalRows);
      for (const [currentId, records] of canonicalImdb instanceof Map ? canonicalImdb : []) {
        const root = canonicalByCurrentId.get(Number(currentId));
        if (!root) continue;
        const canonicalRecords = (Array.isArray(records) ? records : []).map((record) => ({
          ...record,
          source: "imdb-search-canonical-series",
          canonicalSeries: true,
          canonicalSeriesAnilistId: root.canonicalAnilistId,
          canonicalSeriesMalId: root.canonicalMalId,
          canonicalSeriesTitle: root.canonicalTitle,
          relation: false,
        }));
        if (canonicalRecords.length) {
          mappings = mergeMappings(mappings, new Map([[Number(currentId), canonicalRecords]]));
        }
      }
    }
  } catch (error) {
    console.error("[identity] canonical series root resolution failed; preserving current identity", error);
  }

  // Relation protection can invalidate an identity that was valid before
  // related provider ownership was known. Re-run IMDb verification for only
  // those rows so a corroborated current-title identity can replace a
  // protected parent/franchise identity instead of falling directly to MAL.
  const relationRetryRows = rows.filter((row) => {
    const media = { ...row, anilistId: Number(row.id) };
    const candidates = getProviderCandidates(media, mappings.get(Number(row.id)) || []);
    return candidates.some((candidate) =>
      candidate.relatedProviderIds?.includes(`${candidate.provider}:${candidate.id}`),
    );
  });
  if (relationRetryRows.length) {
    try {
      const retryMappings = await resolveImdbMappings(relationRetryRows);
      for (const [id, records] of retryMappings instanceof Map ? retryMappings : []) {
        const existing = mappings.get(id) || [];
        mappings.set(id, [
          ...(Array.isArray(records) ? records : []),
          ...existing,
        ]);
      }
    } catch (error) {
      console.error("[identity] post-protection IMDb verification failed", error);
    }
  }

  return mappings;
}

async function applyRelatedProviderProtection(rows, mappings, dependencies) {
  const relationProtectedRows = rows.filter((row) => {
    if (!hasExplicitProviderRelations(row)) return false;
    const candidates = getProviderCandidates(
      { ...row, anilistId: Number(row.id) },
      mappings.get(Number(row.id)) || [],
    );
    return candidates.some((candidate) => !candidate.evidence?.some(
      (entry) => false,
    ));
  });

  if (!relationProtectedRows.length) return new Map();

  try {
    const protectedIds = await resolveRelatedProviderIds(relationProtectedRows, dependencies);
    for (const row of relationProtectedRows) {
      const relatedProviderIds = protectedIds.get(Number(row.id)) || [];
      row.relatedProviderIds = relatedProviderIds;
      row.relatedProviderTitles = getRelatedProviderTitles(row);
      const records = mappings.get(Number(row.id)) || [];
      if (relatedProviderIds.length && records.length) {
        mappings.set(Number(row.id), records.map((record) => ({
          ...record,
          relatedProviderIds: [...new Set([
            ...(Array.isArray(record?.relatedProviderIds) ? record.relatedProviderIds : []),
            ...relatedProviderIds,
          ])],
        })));
      }
    }
    return protectedIds;
  } catch (error) {
    console.error("[identity] related provider protection failed; preserving existing fallbacks", error);
    return new Map();
  }
}

function getRelatedProviderTitles(row) {
  const titles = [];
  for (const edge of Array.isArray(row?.relations?.edges) ? row.relations.edges : []) {
    const relationType = String(edge?.relationType || "").toUpperCase();
    if (!["PARENT", "PREQUEL", "SEQUEL", "SPIN_OFF", "SIDE_STORY"].includes(relationType)) continue;
    const title = edge?.node?.title || {};
    for (const value of [title.english, title.romaji, title.native]) {
      if (String(value || "").trim()) titles.push(String(value).trim());
    }
    for (const value of Array.isArray(edge?.node?.synonyms) ? edge.node.synonyms : []) {
      if (String(value || "").trim()) titles.push(String(value).trim());
    }
  }
  return [...new Set(titles)];
}

function hasExplicitProviderRelations(row) {
  return Array.isArray(row?.relations?.edges)
    && row.relations.edges.some((edge) => ["PARENT", "PREQUEL", "SEQUEL", "SPIN_OFF", "SIDE_STORY"]
      .includes(String(edge?.relationType || "").toUpperCase()));
}

async function resolveRelatedProviderIds(rows, {
  resolveMappings,
  resolveFribbMappings,
  resolveExternalMappings,
  resolveAnimeMapperMappings,
  resolveAnimeMapperRelatedProviderIds,
}) {
  const relationIds = new Set();
  const result = new Map();
  const relationRows = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const currentId = Number(row?.id);
    if (!Number.isInteger(currentId) || currentId <= 0) continue;
    const edges = (Array.isArray(row?.relations?.edges) ? row.relations.edges : [])
      .filter((edge) => ["PARENT", "PREQUEL", "SEQUEL", "SPIN_OFF", "SIDE_STORY"]
        .includes(String(edge?.relationType || "").toUpperCase()))
      .filter((edge) => Number.isInteger(Number(edge?.node?.id)) && Number(edge.node.id) > 0);

    const providerIds = new Set();
    for (const edge of edges) {
      for (const providerId of parseRelatedProviderLinks(edge?.node?.externalLinks)) {
        providerIds.add(providerId);
      }
      const relatedId = Number(edge.node.id);
      relationIds.add(relatedId);
      if (!relationRows.has(relatedId)) {
        relationRows.set(relatedId, {
          id: relatedId,
          format: edge.node.format,
          title: edge.node.title,
          startDate: edge.node.startDate,
          externalLinks: edge.node.externalLinks || [],
        });
      }
    }
    result.set(currentId, providerIds);
  }

  const ids = [...relationIds];
  if (!ids.length) return new Map();

  let mappings = new Map();
  try {
    mappings = await resolveMappings(ids);
  } catch (error) {
    console.error("[identity] related ARM protection lookup failed", error);
  }

  if (typeof resolveAnimeMapperRelatedProviderIds === "function") {
    try {
      const animeMapperProviderIds = await resolveAnimeMapperRelatedProviderIds(rows);
      for (const [currentId, providerIds] of animeMapperProviderIds instanceof Map ? animeMapperProviderIds : []) {
        const protectedIds = result.get(Number(currentId));
        if (!protectedIds) continue;
        for (const providerId of providerIds || []) protectedIds.add(providerId);
      }
    } catch (error) {
      console.error("[identity] related Anime Mapper protection lookup failed", error);
    }
  }

  const missing = ids.filter((id) => !(mappings.get(id)?.length));
  if (missing.length) {
    try {
      mappings = mergeMappings(mappings, await resolveFribbMappings(missing));
    } catch (error) {
      console.error("[identity] related Fribb protection lookup failed", error);
    }
  }

  const stillMissing = ids.filter((id) => !(mappings.get(id)?.length));
  if (stillMissing.length && typeof resolveExternalMappings === "function") {
    try {
      const externalRows = stillMissing.map((id) => relationRows.get(id)).filter(Boolean);
      mappings = mergeMappings(mappings, resolveExternalMappings(externalRows));
    } catch (error) {
      console.error("[identity] related external protection lookup failed", error);
    }
  }

  for (const row of Array.isArray(rows) ? rows : []) {
    const currentId = Number(row?.id);
    const protectedIds = result.get(currentId);
    if (!protectedIds) continue;

    const edges = Array.isArray(row?.relations?.edges) ? row.relations.edges : [];
    for (const edge of edges) {
      const relationType = String(edge?.relationType || "").toUpperCase();
      if (!["PARENT", "PREQUEL", "SEQUEL", "SPIN_OFF", "SIDE_STORY"].includes(relationType)) continue;
      const relatedId = Number(edge?.node?.id);
      for (const record of mappings.get(relatedId) || []) {
        for (const providerId of providerIdsFromRecord(record)) protectedIds.add(providerId);
      }
    }
  }

  return new Map([...result.entries()].map(([id, idsForRow]) => [id, [...idsForRow]]));
}

function parseRelatedProviderLinks(links) {
  const ids = [];
  for (const link of Array.isArray(links) ? links : []) {
    const url = String(link?.url || "");
    const site = String(link?.site || "").toLowerCase();
    let match;
    if ((site.includes("imdb") || /imdb\.com\/title\/tt\d+/i.test(url))
        && (match = url.match(/imdb\.com\/title\/(tt\d+)/i))) {
      ids.push("imdb:" + match[1]);
    }
    if ((site.includes("tvdb") || /thetvdb\.com\/.*series\/\d+/i.test(url))
        && (match = url.match(/thetvdb\.com\/.*series\/(\d+)/i))) {
      ids.push("tvdb:" + match[1]);
    }
    if ((site.includes("tmdb") || /themoviedb\.org\/(?:tv|movie)\/\d+/i.test(url))
        && (match = url.match(/themoviedb\.org\/(tv|movie)\/(\d+)/i))) {
      ids.push("tmdb:" + match[2]);
    }
  }
  return ids;
}

function providerIdsFromRecord(record) {
  const ids = [];
  for (const imdbId of Array.isArray(record?.imdbIds) ? record.imdbIds : []) {
    if (/^tt\d+$/.test(String(imdbId))) ids.push("imdb:" + imdbId);
  }
  if (Number.isInteger(Number(record?.tvdbId)) && Number(record.tvdbId) > 0) {
    ids.push("tvdb:" + Number(record.tvdbId));
  }
  if (Number.isInteger(Number(record?.tmdbTvId)) && Number(record.tmdbTvId) > 0) {
    ids.push("tmdb:" + Number(record.tmdbTvId));
  }
  for (const tmdbId of Array.isArray(record?.tmdbMovieIds) ? record.tmdbMovieIds : []) {
    if (Number.isInteger(Number(tmdbId)) && Number(tmdbId) > 0) ids.push("tmdb:" + Number(tmdbId));
  }
  return ids;
}

async function resolveRelationMappings(rows, {
  resolveMappings,
  resolveFribbMappings,
  resolveExternalMappings,
  resolveImdbMappings,
}) {
  const relationIds = [];
  const rowRelations = new Map();
  const currentRows = new Map();
  const relationRows = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const currentId = Number(row?.id);
    if (!Number.isInteger(currentId) || currentId <= 0) continue;
    const relationEdges = (Array.isArray(row?.relations?.edges) ? row.relations.edges : [])
      .filter((edge) => ["PARENT", "PREQUEL", "SEQUEL", "SPIN_OFF", "SIDE_STORY"].includes(
        String(edge?.relationType || "").toUpperCase(),
      ))
      .filter((edge) => Number.isInteger(Number(edge?.node?.id)) && Number(edge.node.id) > 0);
    if (!relationEdges.length) continue;

    const relations = relationEdges.map((edge) => Number(edge.node.id));
    rowRelations.set(currentId, relations);
    currentRows.set(currentId, row);
    relationIds.push(...relations);

    for (const edge of relationEdges) {
      const relation = edge.node;
      const relationId = Number(relation.id);
      if (!relationRows.has(relationId)) {
        relationRows.set(relationId, {
          id: relationId,
          idMal: relation.idMal,
          format: relation.format,
          startDate: relation.startDate,
          title: relation.title,
          synonyms: relation.synonyms || [],
          externalLinks: relation.externalLinks || [],
          relations: { edges: [] },
        });
      }
    }
  }

  const uniqueRelationIds = [...new Set(relationIds)];
  if (!uniqueRelationIds.length) return new Map();

  let relationMappings = new Map();
  try {
    relationMappings = await resolveMappings(uniqueRelationIds);
  } catch (error) {
    console.error("[identity] ARM relation-id mapping failed; trying Fribb", error);
  }

  const missingRelationIds = uniqueRelationIds.filter((id) => !(relationMappings.get(id)?.length));
  if (missingRelationIds.length) {
    try {
      relationMappings = mergeMappings(
        relationMappings,
        await resolveFribbMappings(missingRelationIds),
      );
    } catch (error) {
      console.error("[identity] Fribb relation-id mapping failed", error);
    }
  }

  const stillMissingRelationIds = uniqueRelationIds.filter((id) => !(relationMappings.get(id)?.length));
  if (stillMissingRelationIds.length && typeof resolveExternalMappings === "function") {
    try {
      const externalRows = stillMissingRelationIds
        .map((id) => relationRows.get(id))
        .filter(Boolean);
      relationMappings = mergeMappings(
        relationMappings,
        resolveExternalMappings(externalRows),
      );
    } catch (error) {
      console.error("[identity] AniList relation external mapping failed", error);
    }
  }

  const stillMissingAfterExternalIds = uniqueRelationIds.filter((id) => !(relationMappings.get(id)?.length));
  if (stillMissingAfterExternalIds.length && typeof resolveImdbMappings === "function") {
    try {
      const imdbRows = stillMissingAfterExternalIds
        .map((id) => relationRows.get(id))
        .filter(Boolean);
      relationMappings = mergeMappings(
        relationMappings,
        await resolveImdbMappings(imdbRows),
      );
    } catch (error) {
      console.error("[identity] IMDb relation-id mapping failed", error);
    }
  }

  const installmentRows = [];
  let installmentMappings = new Map();
  if (typeof resolveImdbMappings === "function") {
    for (const [currentId, relatedIds] of rowRelations) {
      const currentRow = currentRows.get(currentId);
      for (const relatedId of relatedIds) {
        const providerRecords = relationMappings.get(relatedId) || [];
        const relatedRow = relationRows.get(relatedId);
        for (const record of providerRecords) {
          const providerTitle = record?.title || record?.titles?.[0];
          const derivedTitle = deriveRelatedInstallmentProviderTitle(
            currentRow,
            relatedRow,
            providerTitle,
          );
          if (!derivedTitle) continue;
          installmentRows.push({
            ...currentRow,
            id: currentId,
            title: { english: derivedTitle, romaji: derivedTitle, native: derivedTitle },
            synonyms: [],
            relations: { edges: [] },
          });
        }
      }
    }
  }

  if (installmentRows.length && typeof resolveImdbMappings === "function") {
    try {
      const resolvedInstallmentMappings = await resolveImdbMappings(installmentRows);
      installmentMappings = new Map(
        [...(resolvedInstallmentMappings instanceof Map ? resolvedInstallmentMappings : [])]
          .map(([id, records]) => [
            id,
            (Array.isArray(records) ? records : []).map((record) => ({
              ...record,
              derivedTitle: true,
            })),
          ]),
      );
    } catch (error) {
      console.error("[identity] IMDb related-installment mapping failed", error);
    }
  }

  const result = new Map();
  for (const [currentId, relatedIds] of rowRelations) {
    const exactInstallmentRecords = installmentMappings.get(currentId) || [];
    if (exactInstallmentRecords.length) {
      result.set(currentId, exactInstallmentRecords);
      continue;
    }

    const records = [];
    for (const relatedId of relatedIds) {
      const relatedRow = relationRows.get(relatedId);
      for (const record of relationMappings.get(relatedId) || []) {
        const relatedTitles = [
          relatedRow?.title?.english,
          relatedRow?.title?.romaji,
          relatedRow?.title?.native,
          ...(Array.isArray(relatedRow?.synonyms) ? relatedRow.synonyms : []),
        ].map((value) => String(value || "").trim()).filter(Boolean);
        const providerTitle = record?.title || record?.titles?.[0] || relatedTitles[0];
        if (!providerTitle) continue;

        records.push({
          ...record,
          anilistId: currentId,
          source: `${record.source || "mapping"}-relation`,
          relationAnilistId: relatedId,
          relation: true,
          title: providerTitle,
          titles: Array.isArray(record?.titles) && record.titles.length
            ? record.titles
            : relatedTitles.length ? relatedTitles : [providerTitle],
          year: record?.year ?? relatedRow?.startDate?.year ?? null,
        });
      }
    }
    if (records.length) result.set(currentId, records);
  }

  return result;
}

function deriveRelatedInstallmentProviderTitle(currentRow, relatedRow, providerTitle) {
  const currentTitle = [
    currentRow?.title?.english,
    currentRow?.title?.romaji,
    currentRow?.title?.native,
    ...(Array.isArray(currentRow?.synonyms) ? currentRow.synonyms : []),
  ].find(Boolean);
  const relatedTitle = [
    relatedRow?.title?.english,
    relatedRow?.title?.romaji,
    relatedRow?.title?.native,
    ...(Array.isArray(relatedRow?.synonyms) ? relatedRow.synonyms : []),
  ].find(Boolean);
  if (!currentTitle || !relatedTitle || !providerTitle) return null;

  const currentMarker = extractInstallmentMarker(currentTitle);
  const relatedMarker = extractInstallmentMarker(relatedTitle);
  const providerMarker = extractInstallmentMarker(providerTitle);
  if (!currentMarker || !relatedMarker || !providerMarker) return null;
  if (currentMarker.kind !== relatedMarker.kind || currentMarker.number === relatedMarker.number) return null;
  if (!providerMarker.kind || providerMarker.kind !== relatedMarker.kind) return null;

  const currentBase = normalizeProviderTitleTokens(currentTitle.replace(currentMarker.raw, ""));
  const relatedBase = normalizeProviderTitleTokens(relatedTitle.replace(relatedMarker.raw, ""));
  const overlap = currentBase.filter((token) => relatedBase.includes(token));
  const distinctiveOverlap = overlap.filter((token) => token.length >= 4);
  if (distinctiveOverlap.length < 2) return null;

  return providerTitle.replace(
    providerMarker.raw,
    providerMarker.raw.replace(String(providerMarker.number), String(currentMarker.number)),
  );
}

function normalizeProviderTitleTokens(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function extractInstallmentMarker(value) {
  const match = String(value || "").match(/\b(File|Part|Episode|Season)\s*([0-9]+)\b/i);
  if (!match) return null;
  return {
    kind: match[1].toLowerCase(),
    number: Number(match[2]),
    raw: match[0],
  };
}

function mergeMappings(base, additional) {
  const merged = new Map(base);
  for (const [id, records] of additional instanceof Map ? additional : []) {
    const existing = merged.get(id) || [];
    merged.set(id, [...existing, ...(Array.isArray(records) ? records : [])]);
  }
  return merged;
}


function getCanonicalMalId(row, meta, mappingRecords) {
  const direct = Number(row?.idMal ?? meta?.extra?.malId);
  if (Number.isInteger(direct) && direct > 0) return direct;
  for (const record of Array.isArray(mappingRecords) ? mappingRecords : []) {
    const candidate = Number(record?.malId ?? record?.idMal);
    if (Number.isInteger(candidate) && candidate > 0) return candidate;
  }
  return null;
}

export async function canonicalizeCatalogPage(mediaRows, options = {}) {
  const normalizedRows = Array.isArray(mediaRows)
    ? mediaRows.map((row) => (typeof row === "object" && row !== null ? row : { id: row }))
      .filter((row) => /^\d+$/.test(String(row.id ?? "").trim()))
    : [];
  if (!normalizedRows.length) return [];
  const mappings = await resolveMappingsForRows(normalizedRows, options);
  const metas = [];
  const usedIdentities = new Set();
  const unresolvedIds = [];
  for (const row of normalizedRows) {
    const anilistId = Number(row.id);
    const rawMeta = toCatalogIdentity(toMetaFromAniList(anilistId, row));
    if (!rawMeta) { unresolvedIds.push(anilistId); continue; }
    const meta = normalizeSeasonalCatalogMetaTypes([rawMeta])[0];
    const canonicalSeriesRecord = (mappings.get(anilistId) || []).find((record) =>
      record?.canonicalSeries === true
      && Array.isArray(record?.imdbIds)
      && record.imdbIds.some((id) => /^tt\d+$/.test(String(id))),
    );
    if (canonicalSeriesRecord) {
      const canonicalImdbId = canonicalSeriesRecord.imdbIds.find((id) => /^tt\d+$/.test(String(id)));
      metas.push({
        ...meta,
        id: canonicalImdbId,
        extra: {
          ...meta.extra,
          identityProvider: "imdb",
          identityId: canonicalImdbId,
          identityCanonicalSeries: true,
          identityCanonicalSeriesAnilistId: canonicalSeriesRecord.canonicalSeriesAnilistId,
          identityCanonicalSeriesMalId: canonicalSeriesRecord.canonicalSeriesMalId,
          identityCanonicalSeriesTitle: canonicalSeriesRecord.canonicalSeriesTitle,
          identityEvidence: [{ source: canonicalSeriesRecord.source || "imdb-search-canonical-series", season: null, episodeOffset: null, relation: false }],
        },
      });
      continue;
    }
    const providerCandidates = getProviderCandidates(
      { ...row, anilistId },
      mappings.get(anilistId) || [],
    );
    const canonicalSeriesSelected = selectProviderIdentity(
      { ...row, anilistId },
      providerCandidates.filter((candidate) => candidate.canonicalSeries === true),
    );
    if (canonicalSeriesSelected) {
      metas.push({
        ...meta,
        id: canonicalSeriesSelected.stremioId,
        extra: {
          ...meta.extra,
          identityProvider: canonicalSeriesSelected.provider,
          identityId: canonicalSeriesSelected.id,
          identityCanonicalSeries: true,
          identityCanonicalSeriesAnilistId: canonicalSeriesSelected.canonicalSeriesAnilistId,
          identityCanonicalSeriesMalId: canonicalSeriesSelected.canonicalSeriesMalId,
          identityCanonicalSeriesTitle: canonicalSeriesSelected.canonicalSeriesTitle,
          identityEvidence: canonicalSeriesSelected.evidence,
        },
      });
      continue;
    }
    const tmdbSelected = selectTMDBIdentity({ ...row, anilistId }, mappings.get(anilistId) || [], { excludeIds: usedIdentities });
    const providerSelected = selectProviderIdentity(
      { ...row, anilistId },
      providerCandidates,
      { excludeIds: usedIdentities },
    );
    const independentlyVerifiedImdb = selectProviderIdentity(
      { ...row, anilistId },
      providerCandidates.filter((candidate) =>
        candidate.provider === "imdb"
        && candidate.evidence?.some((entry) =>
          ["imdb-search", "imdb-search-relation"].includes(entry?.source)),
      ),
      { excludeIds: usedIdentities },
    );
    if (tmdbSelected?.provider === "imdb" || providerSelected?.provider === "imdb") {
      const selected = independentlyVerifiedImdb
        || (tmdbSelected?.provider === "imdb" ? tmdbSelected : providerSelected);
      usedIdentities.add(selected.stremioId);
      if (independentlyVerifiedImdb) {
        metas.push({ ...meta, id: selected.stremioId, extra: { ...meta.extra, identityProvider: selected.provider, identityId: selected.id, identityEvidence: selected.evidence } });
      } else if (tmdbSelected?.provider === "imdb") {
        metas.push({ ...meta, id: tmdbSelected.stremioId, extra: { ...meta.extra, tmdbProvider: tmdbSelected.provider, tmdbId: tmdbSelected.id, tmdbEvidence: "tmdb-search" } });
      } else {
        metas.push({ ...meta, id: selected.stremioId, extra: { ...meta.extra, identityProvider: selected.provider, identityId: selected.id, identityEvidence: selected.evidence } });
      }
      continue;
    }
    if (tmdbSelected) {
      usedIdentities.add(tmdbSelected.stremioId);
      metas.push({ ...meta, id: tmdbSelected.stremioId, extra: { ...meta.extra, tmdbProvider: tmdbSelected.provider, tmdbId: tmdbSelected.id, tmdbEvidence: "tmdb-search" } });
      continue;
    }
    const selected = providerSelected;
    if (selected) {
      usedIdentities.add(selected.stremioId);
      metas.push({ ...meta, id: selected.stremioId, extra: { ...meta.extra, identityProvider: selected.provider, identityId: selected.id, identityEvidence: selected.evidence } });
      continue;
    }
    const malId = getCanonicalMalId(row, meta, mappings.get(anilistId) || []);
    if (Number.isInteger(malId) && malId > 0) {
      metas.push({ ...meta, id: "mal:" + malId, extra: { ...meta.extra, identityProvider: null, identityId: null, identityEvidence: "canonical-mal-id-fallback" } });
      continue;
    }
    metas.push({ ...meta, id: "anilist:" + anilistId, extra: { ...meta.extra, identityProvider: null, identityId: null, identityEvidence: "anilist-id-fallback" } });
  }
  if (unresolvedIds.length) throw new Error("Identity resolution exhausted; unresolved AniList IDs: " + (unresolvedIds.join(",") || "unknown"));
  return metas;
}
export async function fetchValidatedSeasonCatalogPage({
  filter,
  skip = 0,
  search = "",
  fetchPage = queryAnime,
  canonicalizePage,
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
  resolveMappings = resolveAniListMappings,
  resolveSecondaryMappings = resolveAniListMappingsSecondary,
  resolveAlternativeMappings = resolveAniListMappingsByMalIds,
} = {}) {
  const range = getRollingCatalogRange(id, date);
  if (!range) return [];
  const futureOnly = id === "upcoming_5_days";
  const sort = futureOnly ? "TIME" : "TIME_DESC";
  return collectValidatedCatalogPage({
    skip, pageSize, maxPages,
    fetchPage: (page) => fetchPage(range.start, range.end, futureOnly, page, sort),
    canonicalizePage: async (rows) => {
      const eligibleRows = (Array.isArray(rows) ? rows : []).filter((row) => {
        const media = row?.media;
        return Number.isInteger(Number(media?.id)) && Number(media.id) > 0 && isEligibleRollingMedia(media);
      });
      const uniqueEligibleRows = [];
      const seenMediaIds = new Set();
      for (const row of eligibleRows) { const mediaId = Number(row.media.id); if (seenMediaIds.has(mediaId)) continue; seenMediaIds.add(mediaId); uniqueEligibleRows.push(row); }
      const searchedRows = filterAiringRowsBySearch(uniqueEligibleRows, search);
      const mappings = await resolveMappingsForRows(searchedRows.map((row) => row.media), { resolveMappings, resolveSecondaryMappings, resolveAlternativeMappings });
      const metas = [];
      const usedIdentities = new Set();
      for (const row of searchedRows) {
        const media = row.media; const mediaId = Number(media.id);
        const baseMeta = toCatalogIdentity(toMetaFromAniList(mediaId, media));
        if (!baseMeta) continue;
        const canonicalSeriesRecord = (mappings.get(mediaId) || []).find((record) =>
          record?.canonicalSeries === true
          && Array.isArray(record?.imdbIds)
          && record.imdbIds.some((id) => /^tt\d+$/.test(String(id))),
        );
        if (canonicalSeriesRecord) {
          const canonicalImdbId = canonicalSeriesRecord.imdbIds.find((id) => /^tt\d+$/.test(String(id)));
          metas.push({
            ...baseMeta,
            id: canonicalImdbId,
            extra: {
              ...baseMeta.extra,
              identityProvider: "imdb",
              identityId: canonicalImdbId,
              identityCanonicalSeries: true,
              identityCanonicalSeriesAnilistId: canonicalSeriesRecord.canonicalSeriesAnilistId,
              identityCanonicalSeriesMalId: canonicalSeriesRecord.canonicalSeriesMalId,
              identityCanonicalSeriesTitle: canonicalSeriesRecord.canonicalSeriesTitle,
              identityEvidence: [{ source: canonicalSeriesRecord.source || "imdb-search-canonical-series", season: null, episodeOffset: null, relation: false }],
              episode: row.episode,
              airingAt: row.airingAt,
              ...(futureOnly ? { nextEpisode: row.episode, nextAiringAt: row.airingAt } : {}),
            },
            type: "series",
          });
          continue;
        }
        const providerCandidates = getProviderCandidates(media, mappings.get(mediaId) || []);
        const canonicalSeriesSelected = selectProviderIdentity(
          { ...media, anilistId: mediaId },
          providerCandidates.filter((candidate) => candidate.canonicalSeries === true),
        );
        if (canonicalSeriesSelected) {
          metas.push({
            ...baseMeta,
            id: canonicalSeriesSelected.stremioId,
            extra: {
              ...baseMeta.extra,
              identityProvider: canonicalSeriesSelected.provider,
              identityId: canonicalSeriesSelected.id,
              identityCanonicalSeries: true,
              identityCanonicalSeriesAnilistId: canonicalSeriesSelected.canonicalSeriesAnilistId,
              identityCanonicalSeriesMalId: canonicalSeriesSelected.canonicalSeriesMalId,
              identityCanonicalSeriesTitle: canonicalSeriesSelected.canonicalSeriesTitle,
              identityEvidence: canonicalSeriesSelected.evidence,
              episode: row.episode,
              airingAt: row.airingAt,
              ...(futureOnly ? { nextEpisode: row.episode, nextAiringAt: row.airingAt } : {}),
            },
            type: "series",
          });
          continue;
        }
        const tmdbSelected = selectTMDBIdentity({ ...media, anilistId: mediaId }, mappings.get(mediaId) || [], { excludeIds: usedIdentities });
        const providerSelected = selectProviderIdentity(
          { ...media, anilistId: mediaId },
          getProviderCandidates(media, mappings.get(mediaId) || []),
          { excludeIds: usedIdentities },
        );
        const selected = tmdbSelected?.provider === "imdb"
          ? tmdbSelected
          : providerSelected?.provider === "imdb"
            ? providerSelected
            : tmdbSelected || providerSelected;
        const malId = getCanonicalMalId(media, baseMeta, mappings.get(mediaId) || []);
        let meta;
        if (selected) {
          usedIdentities.add(selected.stremioId);
          meta = { ...baseMeta, id: selected.stremioId, extra: { ...baseMeta.extra, ...(tmdbSelected ? { tmdbProvider: selected.provider, tmdbId: selected.id, tmdbEvidence: "tmdb-search" } : { identityProvider: selected.provider, identityId: selected.id, identityEvidence: selected.evidence }), episode: row.episode, airingAt: row.airingAt, ...(futureOnly ? { nextEpisode: row.episode, nextAiringAt: row.airingAt } : {}) }, type: "series" };
        } else if (Number.isInteger(malId) && malId > 0) {
          meta = { ...baseMeta, id: "mal:" + malId, extra: { ...baseMeta.extra, identityProvider: null, identityId: null, identityEvidence: "canonical-mal-id-fallback", episode: row.episode, airingAt: row.airingAt, ...(futureOnly ? { nextEpisode: row.episode, nextAiringAt: row.airingAt } : {}) }, type: "series" };
        } else {
          meta = { ...baseMeta, id: "anilist:" + mediaId, extra: { ...baseMeta.extra, identityProvider: null, identityId: null, identityEvidence: "anilist-id-fallback", episode: row.episode, airingAt: row.airingAt, ...(futureOnly ? { nextEpisode: row.episode, nextAiringAt: row.airingAt } : {}) }, type: "series" };
        }
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
      canonicalizePage: (rows) => canonicalizeCatalogPage(rows),
    });
  }
  if (getRollingCatalogRange(id, new Date())) {
    return buildRollingCatalog(id, new Date(), skip, search);
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
