    const candidateTitles = [
      candidate.title,
      ...(Array.isArray(candidate.titles) ? candidate.titles : []),
    ];
    const sourceIdMatch = Number.isInteger(Number(candidate.anilistId))
      && Number.isInteger(Number(media?.anilistId))
      && Number(candidate.anilistId) === Number(media.anilistId);
    if (!titlesCompatible(targetTitles, candidateTitles)) {
      if (candidate.relatedTitleSearch === true && relatedSearchCompatible) {
        score += 100;
        reasons.push("related-search-title-match");
      } else if (candidate.derivedTitle && (
        derivedTitleCompatible(targetTitles, candidateTitles)
        || (candidate.derivedInstallmentTitle === true
          && oneWordInstallmentTitleCompatible(targetTitles, candidateTitles))
      )) {
        score += 100;
        reasons.push(
          candidate.derivedInstallmentTitle === true && !derivedTitleCompatible(targetTitles, candidateTitles)
            ? "derived-installment-one-word-match"
            : "derived-title-match",
        );
      } else if (sourceIdMatch && !candidate.relation && candidate.relatedTitleSearch !== true && candidate.derivedTitle !== true && hasStrongDirectSource) {
        score += 90;
        reasons.push("source-id-title-mismatch");
      } else {
        return { valid: false, score: -Infinity, reasons: ["title-mismatch"] };
      }
    } else {
      score += 100;
      reasons.push("title-match");
    }
  }

  if (!candidate.relation && candidate.year != null && Number.isInteger(Number(candidate.year)) && Number.isInteger(Number(media?.startDate?.year))) {
    const delta = Math.abs(Number(candidate.year) - Number(media.startDate.year));
    if (delta > 2) return { valid: false, score: -Infinity, reasons: ["year-mismatch"] };
    score += delta === 0 ? 30 : 15;
    reasons.push("year-compatible");
  }

  if (candidate.anilistId && Number.isInteger(Number(media.anilistId))) {
    if (Number(candidate.anilistId) !== Number(media.anilistId)) {
      return { valid: false, score: -Infinity, reasons: ["source-id-mismatch"] };
    }
    score += 50;
    reasons.push("source-id-match");
  }

  if (candidate.provider === "imdb") score += 3;
  if (candidate.provider === "tvdb") score += 2;
  if (candidate.provider === "tmdb") score += 1;

  return { valid: true, score, reasons };
}

function candidate(provider, id, record, media) {
  return {
    provider,
    id,
    stremioId: provider === "imdb" ? id : `${provider}:${id}`,
    anilistId: record?.anilistId,
    mediaType: record?.type === "MOVIE" ? "movie" : record?.type === "TV" ? "tv" : (media?.format === "MOVIE" ? "movie" : "tv"),
    title: record?.title || null,
    titles: record?.titles || null,
    year: record?.year || null,
    relation: record?.relation === true,
    derivedTitle: record?.derivedTitle === true,
    derivedInstallmentTitle: record?.derivedInstallmentTitle === true,
    relatedTitleSearch: record?.relatedTitleSearch === true,
    relatedSearchTitles: Array.isArray(record?.relatedSearchTitles) ? record.relatedSearchTitles : [],
    meiliRankingScore: Number.isFinite(Number(record?.meiliRankingScore))
      ? Number(record.meiliRankingScore)
      : null,
    bingecatExactTitle: record?.bingecatExactTitle === true,
    bingecatAuthoritative: record?.bingecatAuthoritative === true,
    relatedProviderIds: [...new Set([
      ...(Array.isArray(record?.relatedProviderIds) ? record.relatedProviderIds : []),
      ...(Array.isArray(media?.relatedProviderIds) ? media.relatedProviderIds : []),
    ])],
    relatedProviderTitles: [...new Set([
      ...(Array.isArray(record?.relatedProviderTitles) ? record.relatedProviderTitles : []),
      ...(Array.isArray(media?.relatedProviderTitles) ? media.relatedProviderTitles : []),
    ])],
    evidence: [{
      source: record?.source || "mapping",