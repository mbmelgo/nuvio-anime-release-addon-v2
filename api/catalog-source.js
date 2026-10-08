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
import {
  resolveAniListMappingsByImdbSearch,
  validateImdbMappingsByKnownIds,
} from "../lib/imdb-search-mapping.js";
import { PRODUCTION_IDENTITY_CACHE, PRODUCTION_IDENTITY_CACHE_VERSION } from "../lib/production-identity-cache.js";
import { resolveAniListMappingsFromAnimeApiTsv } from "../lib/animeapi-tsv-mapping.js";
import { getProviderCandidates, hasStrongDirectProviderEvidence, selectProviderIdentity } from "../lib/provider-identity.js";
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

let catalogRequestSeen = false;

export function formatCatalogDiagnostics(durationMs, coldStart, stages = {}, processUptimeMs = null) {
  const normalizedDuration = Math.max(0, Math.round(Number(durationMs) || 0));
  const normalizedStages = Object.fromEntries(
    Object.entries(stages || {})
      .filter(([, value]) => Number.isFinite(Number(value)))
      .map(([name, value]) => [name, Math.max(0, Math.round(Number(value)))])
  );
  return {
    "X-Nuvio-Catalog-Duration-Ms": String(normalizedDuration),
    "X-Nuvio-Cold-Start": coldStart ? "1" : "0",
    ...(Number.isFinite(Number(processUptimeMs))
      ? { "X-Nuvio-Process-Uptime-Ms": String(Math.max(0, Math.round(Number(processUptimeMs)))) }
      : {}),
    ...(Object.keys(normalizedStages).length
      ? { "X-Nuvio-Catalog-Stages": JSON.stringify(normalizedStages) }
      : {}),
  };
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
  const diagnosticsEnabled = String(query.diagnostics || "") === "1";
  const diagnosticsStart = diagnosticsEnabled ? performance.now() : 0;
  const diagnosticsStages = diagnosticsEnabled ? {} : null;
  const coldStart = !catalogRequestSeen;
  catalogRequestSeen = true;

  if (req.method === "OPTIONS") return send(res, {}, 200);

  if (resource === "catalog" && ["series", "anime"].includes(String(type || "").toLowerCase())) {
    if (!catalogDefinitions(seasonInfo).some((catalog) => catalog.id === id)) {
      return send(res, { metas: [] }, 404);
    }
    try {
      const skip = Math.max(0, Number(query.skip || 0) || 0);
      const search = String(query.search || "").trim();
      const metas = await buildCatalog(id, seasonInfo, skip, search, diagnosticsStages);
      return send(res, { metas }, 200, diagnosticsEnabled ? formatCatalogDiagnostics(performance.now() - diagnosticsStart, coldStart, diagnosticsStages, process.uptime() * 1000) : null, diagnosticsEnabled);
    } catch (error) {
      console.error("[catalog] request failed", { id, skip: query.skip, search: query.search, error });
      return send(res, { metas: [] }, 500, diagnosticsEnabled ? formatCatalogDiagnostics(performance.now() - diagnosticsStart, coldStart, diagnosticsStages, process.uptime() * 1000) : null, diagnosticsEnabled);
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
    validateImdbMappings = validateImdbMappingsByKnownIds,
    resolveSecondaryMappings = resolveAniListMappingsSecondary,
    resolveAlternativeMappings = resolveAniListMappingsByMalIds,
    diagnostics = null,
    allowProductionIdentityCache = false,
  } = {},
) {
  const ids = rows.map((row) => Number(row.id));
  let mappings = new Map();

  try {
    const stageStart = diagnostics ? performance.now() : 0;
    mappings = await resolveMappings(ids);
    if (diagnostics) diagnostics.arm = performance.now() - stageStart;
  } catch (error) {
    if (diagnostics) diagnostics.arm = performance.now() - stageStart;
    console.error("[identity] ARM mapping failed; using secondary mapping sources", error);
  }

  let unresolvedRows = rows.filter((row) => !selectProviderIdentity(
    { ...row, anilistId: Number(row.id) },
    getProviderCandidates({ ...row, anilistId: Number(row.id) }, mappings.get(Number(row.id)) || []),
  ));

  if (unresolvedRows.length) {
    try {
      const stageStart = diagnostics ? performance.now() : 0;
      mappings = mergeMappings(mappings, await resolveFribbMappings(unresolvedRows.map((row) => Number(row.id))));
      if (diagnostics) diagnostics.fribb = performance.now() - stageStart;
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
      const stageStart = diagnostics ? performance.now() : 0;
      mappings = mergeMappings(mappings, await resolveAniBridgeMappings(unresolvedRows));
      if (diagnostics) diagnostics.anibridge = performance.now() - stageStart;
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
      const stageStart = diagnostics ? performance.now() : 0;
      mappings = mergeMappings(mappings, await resolveTMDBMappings(tmdbRows));
      if (diagnostics) diagnostics.tmdb = performance.now() - stageStart;
    } catch (error) {
      console.error("[identity] TMDB mapping failed; trying AniMap", error);
    }
  }

  // A TMDB match without an IMDb external ID is a useful fallback, but it is
  // not proof that IMDb has no current identity. Verify TMDB-only matches
  // through the independent IMDb title search before allowing the TMDB
  // fallback to become terminal. Existing relation/title validation still
  // applies when the candidate is selected.
  const tmdbImdbVerificationStart = diagnostics ? performance.now() : 0;
  const tmdbTitleVerificationRows = rows.filter((row) => {
    const media = { ...row, anilistId: Number(row.id) };
    const tmdbSelected = selectTMDBIdentity(media, mappings.get(Number(row.id)) || []);
    return tmdbSelected?.provider === "tmdb";
  });
  const tmdbKnownImdbRows = rows.filter((row) => {
    const media = { ...row, anilistId: Number(row.id) };
    const tmdbSelected = selectTMDBIdentity(media, mappings.get(Number(row.id)) || []);
    return tmdbSelected?.provider === "imdb";
  });

  const tmdbInvalidKnownImdbRows = [];
  if (tmdbKnownImdbRows.length) {
    try {
      const knownIds = new Map(tmdbKnownImdbRows.map((row) => {
        const selected = selectTMDBIdentity(
          { ...row, anilistId: Number(row.id) },
          mappings.get(Number(row.id)) || [],
        );
        return [Number(row.id), selected?.id];
      }));
      const validated = await validateImdbMappings(tmdbKnownImdbRows, knownIds);
      for (const row of tmdbKnownImdbRows) {
        const rowId = Number(row.id);
        if (!validated.has(rowId)) {
          tmdbInvalidKnownImdbRows.push(row);
          continue;
        }

        const validatedImdbId = knownIds.get(rowId);
        const records = mappings.get(rowId) || [];
        mappings.set(rowId, records.map((record) =>
          record?.source === "tmdb-search"
            && Array.isArray(record.imdbIds)
            && record.imdbIds.some((id) => String(id) === String(validatedImdbId))
            ? { ...record, providerExactTitle: true }
            : record,
        ));
      }
    } catch (error) {
      console.error("[identity] TMDB-provided IMDb validation failed; using title search fallback", error);
      tmdbInvalidKnownImdbRows.push(...tmdbKnownImdbRows);
    }
  }

  const tmdbImdbVerificationRows = [...tmdbTitleVerificationRows, ...tmdbInvalidKnownImdbRows];
  if (tmdbImdbVerificationRows.length) {
    try {
      mappings = mergeMappings(mappings, await resolveImdbMappings(tmdbImdbVerificationRows));
    } catch (error) {
      console.error("[identity] post-TMDB IMDb verification failed", error);
    }
  }
  if (diagnostics) diagnostics.imdbVerification = performance.now() - tmdbImdbVerificationStart;

  unresolvedRows = rows.filter((row) => !selectProviderIdentity(
    { ...row, anilistId: Number(row.id) },
    getProviderCandidates({ ...row, anilistId: Number(row.id) }, mappings.get(Number(row.id)) || []),
  ));

  if (unresolvedRows.length) {
    try {
      const stageStart = diagnostics ? performance.now() : 0;
      mappings = mergeMappings(mappings, await resolveAnimapMappings(unresolvedRows.map((row) => Number(row.id))));
      if (diagnostics) diagnostics.animap = performance.now() - stageStart;
    } catch (error) {
      console.error("[identity] AniMap mapping failed; trying IDMapper", error);
    }
  }

  unresolvedRows = rows.filter((row) => !selectProviderIdentity(
    { ...row, anilistId: Number(row.id) },
    getProviderCandidates({ ...row, anilistId: Number(row.id) }, mappings.get(Number(row.id)) || []),
  ));

  if (unresolvedRows.length) {
    const stageStart = diagnostics ? performance.now() : 0;
    const idMapperStart = diagnostics ? performance.now() : 0;
    const animeMapperStart = diagnostics ? performance.now() : 0;

    const idMapperPromise = (async () => {
      try {
        return await resolveIdMapperMappings(unresolvedRows.map((row) => Number(row.id)));
      } catch (error) {
        console.error("[identity] IDMapper mapping failed; trying Anime Mapper", error);
        return new Map();
      } finally {
        if (diagnostics) diagnostics.idmapper = performance.now() - idMapperStart;
      }
    })();

    const animeMapperPromise = (async () => {
      try {
        return await resolveAnimeMapperMappings(unresolvedRows);
      } catch (error) {
        console.error("[identity] Anime Mapper mapping source failed; trying AnimeAPI TSV", error);
        return new Map();
      } finally {
        if (diagnostics) diagnostics.animeMapper = performance.now() - animeMapperStart;
      }
    })();

    const [idMapperMappings, animeMapperMappings] = await Promise.all([
      idMapperPromise,
      animeMapperPromise,
    ]);

    // Preserve the previous precedence: Anime Mapper records are merged
    // before IDMapper records, even though both network stages now run
    // concurrently.
    mappings = mergeMappings(mappings, animeMapperMappings);
    mappings = mergeMappings(mappings, idMapperMappings);
    if (diagnostics) diagnostics.parallelProviderResolution = performance.now() - stageStart;
  }

  unresolvedRows = rows.filter((row) => !selectProviderIdentity(
    { ...row, anilistId: Number(row.id) },
    getProviderCandidates({ ...row, anilistId: Number(row.id) }, mappings.get(Number(row.id)) || []),
  ));

  if (unresolvedRows.length) {
    try {
      const stageStart = diagnostics ? performance.now() : 0;
      mappings = mergeMappings(mappings, await resolveTsvMappings(unresolvedRows));
      if (diagnostics) diagnostics.animeApiTsv = performance.now() - stageStart;
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
      const stageStart = diagnostics ? performance.now() : 0;
      mappings = mergeMappings(mappings, await resolveImdbMappings(unresolvedRows));
      if (diagnostics) diagnostics.imdb = performance.now() - stageStart;
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
      const stageStart = diagnostics ? performance.now() : 0;
      mappings = mergeMappings(mappings, await resolveSecondaryMappings(unresolvedRows.map((row) => Number(row.id))));
      if (diagnostics) diagnostics.secondary = performance.now() - stageStart;
    } catch (error) {
      console.error("[identity] secondary mapping source failed; trying MAL identity bridge", error);
    }
  }

  let stillUnresolvedRows = rows.filter((row) => !selectProviderIdentity(
    { ...row, anilistId: Number(row.id) },
    getProviderCandidates({ ...row, anilistId: Number(row.id) }, mappings.get(Number(row.id)) || []),
  ));

  // Provider mapping endpoints can transiently return an empty result. Do not
  // let a single failed pass become a terminal MAL/AniList identity when the
  // same media can be resolved successfully on a subsequent request.
  if (stillUnresolvedRows.length) {
    const stageStart = diagnostics ? performance.now() : 0;
    const recoveryIds = stillUnresolvedRows.map((row) => Number(row.id));
    const recoveryStages = [
      ["ARM", () => resolveMappings(recoveryIds)],
      ["Fribb", () => resolveFribbMappings(recoveryIds)],
      ["IDMapper", () => resolveIdMapperMappings(recoveryIds)],
      ["Anime Mapper", () => resolveAnimeMapperMappings(stillUnresolvedRows)],
      ["secondary", () => resolveSecondaryMappings(recoveryIds)],
      ["IMDb", () => resolveImdbMappings(stillUnresolvedRows)],
    ];

    const recoveryResults = await Promise.all(
      recoveryStages.map(async ([sourceName, resolveRecoveryStage]) => {
        try {
          return await resolveRecoveryStage();
        } catch (error) {
          console.error(`[identity] unresolved identity recovery source failed: ${sourceName}`, error);
          return new Map();
        }
      }),
    );

    // Preserve the existing source precedence while allowing independent
    // provider network requests to overlap.
    for (const result of recoveryResults) {
      mappings = mergeMappings(mappings, result);
    }

    if (diagnostics) diagnostics.identityRecovery = performance.now() - stageStart;
  }

  stillUnresolvedRows = rows.filter((row) => !selectProviderIdentity(
    { ...row, anilistId: Number(row.id) },
    getProviderCandidates({ ...row, anilistId: Number(row.id) }, mappings.get(Number(row.id)) || []),
  ));

  if (stillUnresolvedRows.length) {
    try {
      const stageStart = diagnostics ? performance.now() : 0;
      mappings = mergeMappings(mappings, await resolveAlternativeMappings(stillUnresolvedRows));
      if (diagnostics) diagnostics.malBridge = performance.now() - stageStart;
    } catch (error) {
      console.error("[identity] MAL identity bridge failed", error);
    }
  }

  if (stillUnresolvedRows.length) {
    try {
      const stageStart = diagnostics ? performance.now() : 0;
      const relationMappings = await resolveRelationMappings(stillUnresolvedRows, {
        resolveMappings,
        resolveFribbMappings,
        resolveExternalMappings,
        resolveImdbMappings,
      });
      mappings = mergeMappings(mappings, relationMappings);
      if (diagnostics) diagnostics.relations = performance.now() - stageStart;
    } catch (error) {
      console.error("[identity] relation-id mapping fallback failed", error);
    }
  }

  const protectionStart = diagnostics ? performance.now() : 0;
  await applyRelatedProviderProtection(rows, mappings, {
    resolveMappings,
    resolveFribbMappings,
    resolveExternalMappings,
    resolveAnimeMapperMappings,
    resolveAnimeMapperRelatedProviderIds,
  });
  if (diagnostics) diagnostics.relatedProtection = performance.now() - protectionStart;


  // Resolve season/installment entries to the canonical series root used by
  // downstream scrapers. This is deliberately additive: the source row's
  // AniList identity and display metadata remain unchanged while the
  // scraper-facing provider identity is anchored to the canonical series.
  try {
    // Canonical-series traversal is a network-heavy fallback. Keep it for
    // explicit canonical relations and rows whose current identity is not
    // independently verified, while skipping identities it cannot change.
    const canonicalStart = diagnostics ? performance.now() : 0;
    const canonicalCandidates = rows.filter((row) => shouldResolveCanonicalSeries(row, mappings));
    const canonicalRoots = canonicalCandidates.length
      ? await resolveCanonicalSeriesMappings(canonicalCandidates)
      : new Map();
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
        const currentRow = rows.find((row) => Number(row?.id) === Number(currentId));
        const currentCandidates = currentRow
          ? getProviderCandidates(
            { ...currentRow, anilistId: Number(currentId) },
            mappings.get(Number(currentId)) || [],
          )
          : [];
        const independentlyVerifiedCurrentImdb = selectProviderIdentity(
          { ...(currentRow || {}), anilistId: Number(currentId) },
          currentCandidates.filter((candidate) =>
            candidate.provider === "imdb"
            && hasStrongDirectProviderEvidence(candidate),
          ),
        );
        const canonicalImdbIds = new Set(
          canonicalRecords.flatMap((record) =>
            Array.isArray(record?.imdbIds)
              ? record.imdbIds.filter((id) => /^tt\d+$/.test(String(id))).map(String)
              : [],
          ),
        );
        const canonicalWouldOverrideCurrentIdentity = independentlyVerifiedCurrentImdb
          && canonicalImdbIds.size > 0
          && !canonicalImdbIds.has(String(independentlyVerifiedCurrentImdb.id));
        if (canonicalRecords.length && !canonicalWouldOverrideCurrentIdentity) {
          mappings = mergeMappings(mappings, new Map([[Number(currentId), canonicalRecords]]));
        }
      }
    }
    if (diagnostics) diagnostics.canonical = performance.now() - canonicalStart;
  } catch (error) {
    if (diagnostics) diagnostics.canonical = performance.now() - canonicalStart;
    console.error("[identity] canonical series root resolution failed; preserving current identity", error);
  }

  // Relation protection can invalidate an identity that was valid before
  // related provider ownership was known. Re-run IMDb verification for only
  // those rows so a corroborated current-title identity can replace a
  // protected parent/franchise identity instead of falling directly to MAL.
  const relationRetryRows = rows.filter((row) => {
    const media = { ...row, anilistId: Number(row.id) };
    const candidates = getProviderCandidates(media, mappings.get(Number(row.id)) || []);
    return isSelectedIdentityProtected(media, candidates);
  });
  if (relationRetryRows.length) {
    try {
      const stageStart = diagnostics ? performance.now() : 0;
      const retryMappings = await resolveImdbMappings(relationRetryRows);
      for (const [id, records] of retryMappings instanceof Map ? retryMappings : []) {
        const existing = mappings.get(id) || [];
        mappings.set(id, [
          ...(Array.isArray(records) ? records : []),
          ...existing,
        ]);
      }
      if (diagnostics) diagnostics.relationRetry = performance.now() - stageStart;
    } catch (error) {
      if (diagnostics) diagnostics.relationRetry = performance.now() - stageStart;
      console.error("[identity] post-protection IMDb verification failed", error);
    }
  }

  if (allowProductionIdentityCache) {
      const finalUnresolvedRows = rows.filter((row) => !selectProviderIdentity(
        { ...row, anilistId: Number(row.id) },
        getProviderCandidates({ ...row, anilistId: Number(row.id) }, mappings.get(Number(row.id)) || []),
      ));
      const cacheFallbackRows = finalUnresolvedRows.filter((row) =>
        !(mappings.get(Number(row.id)) || []).length
        && PRODUCTION_IDENTITY_CACHE[String(row.id)],
      );
      for (const row of cacheFallbackRows) {
        const cached = PRODUCTION_IDENTITY_CACHE[String(row.id)];
        const records = mappings.get(Number(row.id)) || [];
        mappings.set(Number(row.id), [
          ...records,
          {
            source: cached.source,
            sourceVersion: cached.version || PRODUCTION_IDENTITY_CACHE_VERSION,
            evidence: [{ source: cached.source, relation: false }],
            anilistId: Number(row.id),
            type: row.type,
            malId: row.malId,
            title: row.title?.english || row.title?.romaji || row.title?.native || null,
            titles: [
              row.title?.english,
              row.title?.romaji,
              row.title?.native,
              ...(Array.isArray(row.synonyms) ? row.synonyms : []),
            ].filter(Boolean),
            year: row.startDate?.year || null,
            season: null,
            episodeOffset: null,
            imdbIds: cached.provider === "imdb" ? [cached.id] : [],
            tvdbId: cached.provider === "tvdb" ? Number(cached.id.split(":")[1]) : null,
            tmdbTvId: cached.provider === "tmdb" ? Number(cached.id.split(":")[1]) : null,
            tmdbMovieIds: [],
          },
        ]);
      }
      if (cacheFallbackRows.length && diagnostics) {
        diagnostics.productionIdentityCache = cacheFallbackRows.length;
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

function shouldResolveCanonicalSeries(row, mappings) {
  if (hasCanonicalSeriesRelation(row)) return true;

  const media = { ...row, anilistId: Number(row?.id) };
  const candidates = getProviderCandidates(
    media,
    mappings.get(Number(row?.id)) || [],
  );
  const independentlyVerifiedImdb = selectProviderIdentity(
    media,
    candidates.filter((candidate) =>
      candidate.provider === "imdb"
      && hasStrongDirectProviderEvidence(candidate),
    ),
  );

  return !independentlyVerifiedImdb;
}

function hasCanonicalSeriesRelation(row) {
  return Array.isArray(row?.relations?.edges)
    && row.relations.edges.some((edge) =>
      ["PARENT", "PREQUEL"].includes(String(edge?.relationType || "").toUpperCase())
      && Number.isInteger(Number(edge?.node?.id))
      && Number(edge.node.id) > 0,
    );
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
  const armPromise = (async () => {
    try {
      return await resolveMappings(ids);
    } catch (error) {
      console.error("[identity] related ARM protection lookup failed", error);
      return new Map();
    }
  })();

  const animeMapperPromise = typeof resolveAnimeMapperRelatedProviderIds === "function"
    ? (async () => {
      try {
        return await resolveAnimeMapperRelatedProviderIds(rows);
      } catch (error) {
        console.error("[identity] related Anime Mapper protection lookup failed", error);
        return new Map();
      }
    })()
    : Promise.resolve(new Map());

  const [armMappings, animeMapperProviderIds] = await Promise.all([
    armPromise,
    animeMapperPromise,
  ]);
  mappings = armMappings instanceof Map ? armMappings : new Map();

  for (const [currentId, providerIds] of animeMapperProviderIds instanceof Map ? animeMapperProviderIds : []) {
    const protectedIds = result.get(Number(currentId));
    if (!protectedIds) continue;
    for (const providerId of providerIds || []) protectedIds.add(providerId);
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

export function isSelectedIdentityProtected(media, candidates) {
  const originalCandidates = Array.isArray(candidates) ? candidates : [];
  const preProtectionCandidates = originalCandidates.map((candidate) => ({
    ...candidate,
    relatedProviderIds: [],
    relatedProviderTitles: [],
  }));
  const preProtectionMedia = {
    ...media,
    relatedProviderIds: [],
    relatedProviderTitles: [],
  };

  // Select the identity that would have won before relation protection added
  // its related-provider ownership data. If no identity was valid even then,
  // retain the retry as the recovery path for unresolved/protected mappings.
  const selectedBeforeProtection = selectProviderIdentity(
    preProtectionMedia,
    preProtectionCandidates,
  );
  if (!selectedBeforeProtection) return true;

  // Revalidate only that pre-protection winner against the protected state.
  // This avoids retrying merely because some lower-priority candidate is
  // protected, while preserving the retry when the selected identity itself
  // became invalid.
  const selectedAfterProtection = selectProviderIdentity(
    media,
    originalCandidates.filter((candidate) =>
      candidate.provider === selectedBeforeProtection.provider
      && String(candidate.id) === String(selectedBeforeProtection.id),
    ),
  );
  return !selectedAfterProtection;
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

function getVerifiedProductionFallbackCandidate(row) {
  const cached = PRODUCTION_IDENTITY_CACHE[String(Number(row?.id))];
  if (!cached) return null;
  const id = cached.id;
  if (!/^(tt\d+|tvdb:\d+|tmdb:\d+)$/.test(String(id))) return null;
  const provider = cached.provider;
  const providerId = provider === "imdb" ? id : id.split(":")[1];
  return {
    provider,
    id: providerId,
    stremioId: id,
    evidence: [{ source: cached.source, relation: false, version: cached.version || PRODUCTION_IDENTITY_CACHE_VERSION }],
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

export function normalizeCatalogOptions(options) {
  return options && typeof options === "object" ? options : {};
}

export async function canonicalizeCatalogPage(mediaRows, options = {}) {
  const normalizedOptions = normalizeCatalogOptions(options);
  const normalizedRows = Array.isArray(mediaRows)
    ? mediaRows.map((row) => (typeof row === "object" && row !== null ? row : { id: row }))
      .filter((row) => /^\d+$/.test(String(row.id ?? "").trim()))
    : [];
  if (!normalizedRows.length) return [];
  const mappings = await resolveMappingsForRows(normalizedRows, normalizedOptions);
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
    const tmdbImdbValidated = tmdbSelected?.provider === "imdb"
      ? selectProviderIdentity(
        { ...row, anilistId },
        providerCandidates.filter((candidate) =>
          candidate.provider === "imdb" && candidate.id === tmdbSelected.id),
        { excludeIds: usedIdentities },
      )
      : null;
    const effectiveTmdbSelected = tmdbSelected?.provider === "imdb"
      ? tmdbImdbValidated
      : tmdbSelected;
    const providerSelected = selectProviderIdentity(
      { ...row, anilistId },
      providerCandidates,
      { excludeIds: usedIdentities },
    );
    const independentlyVerifiedImdb = selectProviderIdentity(
      { ...row, anilistId },
      providerCandidates.filter((candidate) =>
        candidate.provider === "imdb"
        && hasStrongDirectProviderEvidence(candidate),
      ),
      { excludeIds: usedIdentities },
    );
    // Nuvio can resolve a tmdb: ID through its metadata addons and has a
    // standalone TMDB fallback when those addons return no meta. A TMDB
    // mapping's IMDb external ID does not carry that fallback behavior when
    // it is not independently verified. Prefer the native TMDB route in that
    // case; keep IMDb when independent evidence exists.
    const nuvioTmdbRoute = tmdbSelected?.tmdbId
      && tmdbSelected.provider === "imdb"
      && !independentlyVerifiedImdb
      ? {
        ...tmdbSelected,
        provider: "tmdb",
        id: String(tmdbSelected.tmdbId),
        stremioId: `tmdb:${tmdbSelected.tmdbId}`,
      }
      : null;
    if (effectiveTmdbSelected?.provider === "imdb" || providerSelected?.provider === "imdb") {
      const selected = independentlyVerifiedImdb
        || nuvioTmdbRoute
        || effectiveTmdbSelected
        || providerSelected;
      usedIdentities.add(selected.stremioId);
      if (independentlyVerifiedImdb) {
        metas.push({ ...meta, id: selected.stremioId, extra: { ...meta.extra, identityProvider: selected.provider, identityId: selected.id, identityEvidence: selected.evidence } });
      } else if (nuvioTmdbRoute) {
        metas.push({ ...meta, id: selected.stremioId, extra: { ...meta.extra, tmdbProvider: selected.provider, tmdbId: selected.id, tmdbEvidence: "tmdb-search", identityFallback: "nuvio-tmdb-route" } });
      } else if (effectiveTmdbSelected?.provider === "imdb") {
        metas.push({ ...meta, id: effectiveTmdbSelected.stremioId, extra: { ...meta.extra, tmdbProvider: effectiveTmdbSelected.provider, tmdbId: effectiveTmdbSelected.id, tmdbEvidence: "tmdb-search" } });
      } else {
        metas.push({ ...meta, id: selected.stremioId, extra: { ...meta.extra, identityProvider: selected.provider, identityId: selected.id, identityEvidence: selected.evidence } });
      }
      continue;
    }
    if (effectiveTmdbSelected) {
      usedIdentities.add(effectiveTmdbSelected.stremioId);
      metas.push({ ...meta, id: effectiveTmdbSelected.stremioId, extra: { ...meta.extra, tmdbProvider: effectiveTmdbSelected.provider, tmdbId: effectiveTmdbSelected.id, tmdbEvidence: "tmdb-search" } });
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
  diagnostics = null,
}) {
  const normalizedSkip = Math.max(0, Number(skip) || 0);
  const anilistPage = Math.floor(normalizedSkip / NUVIO_PAGE_SIZE) + 1;
  const pageOffset = normalizedSkip % NUVIO_PAGE_SIZE;
  const fetchStart = diagnostics ? performance.now() : 0;
  const rows = await fetchPage(filter, anilistPage, search, { includeMalId: true });
  if (diagnostics) diagnostics.anilist = performance.now() - fetchStart;
  const canonicalStart = diagnostics ? performance.now() : 0;
  const canonical = await canonicalizePage(rows, diagnostics);
  if (diagnostics) diagnostics.identity = performance.now() - canonicalStart;
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
    resolveCanonicalSeriesMappings = null,
    resolveImdbMappings = resolveAniListMappingsByImdbSearch,
    diagnostics = null,
  } = {}) {
  const range = getRollingCatalogRange(id, date);
  const canonicalSeriesResolver = resolveCanonicalSeriesMappings
    || (resolveMappings === resolveAniListMappings
      ? resolveAniListCanonicalSeriesByAnimeMapper
      : async () => new Map());
  if (!range) return [];
  const futureOnly = id === "upcoming_5_days";
  const sort = futureOnly ? "TIME" : "TIME_DESC";
  return collectValidatedCatalogPage({
    skip, pageSize, maxPages,
    fetchPage: async (page) => {
      const stageStart = diagnostics ? performance.now() : 0;
      try {
        const rows = await fetchPage(range.start, range.end, futureOnly, page, sort);
        return (Array.isArray(rows) ? rows : []).filter((row) => {
          const airingAt = Number(row?.airingAt);
          const airingAtMs = airingAt > 100_000_000_000 ? airingAt : airingAt * 1000;
          return Number.isFinite(airingAt)
            && airingAtMs > range.start
            && airingAtMs < range.end;
        });
      } finally {
        if (diagnostics) diagnostics.schedule = (diagnostics.schedule || 0) + (performance.now() - stageStart);
      }
    },
    canonicalizePage: async (rows, pageDiagnostics) => {
      const eligibleRows = (Array.isArray(rows) ? rows : []).filter((row) => {
        const media = row?.media;
        return Number.isInteger(Number(media?.id)) && Number(media.id) > 0 && isEligibleRollingMedia(media);
      });
      const uniqueEligibleRows = [];
      const seenMediaIds = new Set();
      for (const row of eligibleRows) { const mediaId = Number(row.media.id); if (seenMediaIds.has(mediaId)) continue; seenMediaIds.add(mediaId); uniqueEligibleRows.push(row); }
      const searchedRows = filterAiringRowsBySearch(uniqueEligibleRows, search);
      const mappingStart = diagnostics ? performance.now() : 0;
    const mappings = await resolveMappingsForRows(searchedRows.map((row) => row.media), { resolveMappings, resolveSecondaryMappings, resolveAlternativeMappings, resolveCanonicalSeriesMappings: canonicalSeriesResolver, resolveImdbMappings, diagnostics, allowProductionIdentityCache: true });
    if (diagnostics) diagnostics.identityResolution = performance.now() - mappingStart;
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
          providerCandidates,
          { excludeIds: usedIdentities },
        );
        const independentlyVerifiedImdb = selectProviderIdentity(
          { ...media, anilistId: mediaId },
          providerCandidates.filter((candidate) =>
            candidate.provider === "imdb"
            && hasStrongDirectProviderEvidence(candidate),
          ),
          { excludeIds: usedIdentities },
        );
        const cachedProductionIdentity = getVerifiedProductionFallbackCandidate(media);
        const nuvioTmdbRoute = tmdbSelected?.tmdbId
          && !independentlyVerifiedImdb
          && providerSelected?.provider === "imdb"
          ? { ...tmdbSelected, provider: "tmdb", id: String(tmdbSelected.tmdbId), stremioId: `tmdb:${tmdbSelected.tmdbId}` }
          : null;
        const selected = independentlyVerifiedImdb
          || (cachedProductionIdentity?.provider === "imdb" ? cachedProductionIdentity : null)
          || nuvioTmdbRoute
          || (tmdbSelected?.provider === "imdb" ? tmdbSelected : null)
          || (providerSelected?.provider === "imdb" ? providerSelected : null)
          || tmdbSelected
          || providerSelected
          || cachedProductionIdentity;
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
export async function buildCatalog(id, info, skip, search, diagnostics = null) {
  const filter = getCatalogFilter(id, info);
  if (filter) {
    return fetchValidatedSeasonCatalogPage({
      filter,
      skip,
      search,
      canonicalizePage: (rows, pageDiagnostics) => canonicalizeCatalogPage(rows, { diagnostics: pageDiagnostics }),
      diagnostics,
    });
  }
  if (getRollingCatalogRange(id, new Date())) {
    return buildRollingCatalog(id, new Date(), skip, search, { diagnostics });
  }
  return [];
}

function send(res, body, status = 200, extraHeaders = null, diagnosticsEnabled = false) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", diagnosticsEnabled ? "no-store" : "public, s-maxage=3600, stale-while-revalidate=86400, stale-if-error=86400");
  for (const [name, value] of Object.entries(extraHeaders || {})) res.setHeader(name, value);
  return res.json(body);
}
