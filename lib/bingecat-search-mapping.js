    }

    const payload = await response.json();
    const hasResults = (Array.isArray(payload?.movies) && payload.movies.length > 0)
      || (Array.isArray(payload?.series) && payload.series.length > 0);
    if (hasResults) {
      searchResponseCache.set(cacheKey, {
        payload,
        expiresAt: now() + SEARCH_RESPONSE_CACHE_TTL_MS,
      });
    } else {
      searchResponseCache.delete(cacheKey);
    }
    return payload;
  })();

  searchResponseInFlight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    searchResponseInFlight.delete(cacheKey);
  }
}

export function selectExactCandidate(payload, row, {
  allowDerivedTitle = false,
  allowRelatedTitle = false,
} = {}) {
  const expectedType = row.type === "MOVIE" ? "movie" : null;
  const candidates = [
    ...(Array.isArray(payload?.movies) ? payload.movies : []),
    ...(Array.isArray(payload?.series) ? payload.series : []),
  ];

  let fallbackRecord = null;

  for (const candidate of candidates) {
    const candidateType = String(candidate?.contentType || "").toLowerCase();
    if (expectedType && candidateType !== expectedType) continue;

    const candidateYear = positiveInt(candidate?.year);
    const candidateTitle = normalizeTitle(candidate?.name);
    const exactTitle = row.titles.some((title) => normalizeTitle(title) === candidateTitle);
    const searchTitles = buildSearchTitles(row);
    const derivedTitleEntry = allowDerivedTitle && searchTitles.find((title) =>
      title.derived && normalizeTitle(title.value) === candidateTitle);
    const derivedTitle = Boolean(derivedTitleEntry);
    const derivedInstallmentTitle = Boolean(
      derivedTitleEntry && !derivedTitleEntry.prefix,
    );
    const derivedPrefixCompatibleTitle = allowDerivedTitle && searchTitles
      .some((title) => title.derived && title.prefix
        && candidateContainsAllDistinctiveTokens(title.value, candidate?.name));
    const relatedSearchTitles = allowRelatedTitle ? [...row.relatedTitles] : [];
    const relatedTitle = allowRelatedTitle && relatedSearchTitles
      .some((title) => normalizeTitle(title) === candidateTitle);
    const tokenCompatibleTitle = !exactTitle && !derivedTitle && !relatedTitle && !derivedPrefixCompatibleTitle
      && titlesCompatibleByTokenContainment(row.titles, candidate?.name);
    if (!candidateTitle || (!exactTitle && !derivedTitle && !relatedTitle && !derivedPrefixCompatibleTitle && !tokenCompatibleTitle)) continue;
    if (row.year && candidateYear && candidateYear !== row.year && !derivedTitle && !relatedTitle && !derivedPrefixCompatibleTitle) continue;

    const meiliRankingScore = finiteNumber(candidate?.meiliRankingScore);
    const imdbId = /^tt\d+$/.test(String(candidate?.id || "")) ? String(candidate.id) : null;
    const tmdbId = positiveInt(candidate?.tmdbId);
    if (!imdbId && !tmdbId) continue;

    const record = {
      source: "bingecat-search",
      anilistId: row.anilistId,
      type: row.type,
      malId: row.malId,
      imdbIds: imdbId ? [imdbId] : [],
      tvdbId: null,
      tmdbTvId: row.type === "MOVIE" ? null : tmdbId,
      tmdbMovieIds: row.type === "MOVIE" && tmdbId ? [tmdbId] : [],
      season: null,
      episodeOffset: null,
      title: candidate.name || null,
      year: allowDerivedTitle || allowRelatedTitle || derivedPrefixCompatibleTitle || tokenCompatibleTitle ? null : candidateYear,
      meiliRankingScore,
      bingecatExactTitle: exactTitle,
      bingecatAuthoritative: exactTitle && meiliRankingScore === 1,
      // A related-title query is still direct evidence from BingeCat. Treat it as a derived-title
      // candidate rather than relation provenance so semantic title validation decides whether the
      // provider identity belongs to this installment. This prevents unrelated franchise leakage.
      relation: false,
      relatedTitleSearch: relatedTitle,
      relatedSearchTitles: relatedTitle ? [...row.relatedTitles] : [],
      derivedTitle: derivedTitle || relatedTitle || derivedPrefixCompatibleTitle || tokenCompatibleTitle,
      derivedInstallmentTitle,
    };

    if (record.bingecatAuthoritative) return record;
    if (!fallbackRecord) fallbackRecord = record;
  }

  return fallbackRecord;
}

export function clearBingeCatSearchCache() {
  cache.clear();
  inFlight.clear();
  searchResponseCache.clear();
  searchResponseInFlight.clear();
  upstreamCircuitOpenUntil = 0;
}

function getSearchCacheKey(url) {
  const parsed = new URL(url);
  parsed.searchParams.delete("shuffle_session_seed");
  return parsed.toString();