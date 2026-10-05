const PROVIDER_PRIORITY = { imdb: 0, tvdb: 1, tmdb: 2 };

export function normalizeTitle(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function titlesCompatible(leftTitles, rightTitles) {
  const left = uniqueNormalized(leftTitles);
  const right = uniqueNormalized(rightTitles);
  if (!left.length || !right.length) return true;

  for (const a of left) {
    for (const b of right) {
      if (a === b) return true;
      const aTokens = new Set(a.split(" "));
      const bTokens = new Set(b.split(" "));
      const overlap = [...aTokens].filter((token) => bTokens.has(token)).length;
      const ratio = overlap / Math.max(aTokens.size, bTokens.size);
      if (ratio >= 0.75 && overlap >= 2) return true;
    }
  }
  return false;
}

export function getProviderCandidates(media, records) {
  const list = [];
  for (const record of Array.isArray(records) ? records : []) {
    const movie = media?.format === "MOVIE";
    for (const id of Array.isArray(record?.imdbIds) ? record.imdbIds : []) {
      if (/^tt\d+$/.test(String(id))) list.push(candidate("imdb", String(id), record, media));
    }
    if (Number.isInteger(Number(record?.tvdbId)) && Number(record.tvdbId) > 0) {
      list.push(candidate("tvdb", String(record.tvdbId), record, media));
    }
    if (movie) {
      for (const id of Array.isArray(record?.tmdbMovieIds) ? record.tmdbMovieIds : []) {
        if (Number.isInteger(Number(id)) && Number(id) > 0) {
          list.push(candidate("tmdb", String(id), record, media));
        }
      }
    } else if (Number.isInteger(Number(record?.tmdbTvId)) && Number(record.tmdbTvId) > 0) {
      list.push(candidate("tmdb", String(record.tmdbTvId), record, media));
    }
  }

  const grouped = new Map();
  for (const item of list) {
    const key = `${item.provider}:${item.id}`;
    const aggregate = grouped.get(key);
    if (!aggregate) {
      grouped.set(key, {
        item,
        evidence: [...(Array.isArray(item.evidence) ? item.evidence : [])],
        sources: new Set((Array.isArray(item.evidence) ? item.evidence : [])
          .map((entry) => String(entry?.source || ""))
          .filter(Boolean)),
        directlyCorroborated: (Array.isArray(item.evidence) ? item.evidence : [])
          .some((entry) => entry?.relation !== true),
        relatedProviderIds: new Set(item.relatedProviderIds || []),
        relatedProviderTitles: new Set(item.relatedProviderTitles || []),
        semanticEvidence: Boolean(
          item.title
            || (Array.isArray(item.titles) && item.titles.length)
            || (item.year != null && Number.isInteger(Number(item.year))),
        ),
      });
      continue;
    }

    aggregate.evidence.push(...(Array.isArray(item.evidence) ? item.evidence : []));
    for (const entry of Array.isArray(item.evidence) ? item.evidence : []) {
      if (entry?.source) aggregate.sources.add(String(entry.source));
      if (entry?.relation !== true) aggregate.directlyCorroborated = true;
    }
    for (const providerId of item.relatedProviderIds || []) {
      aggregate.relatedProviderIds.add(providerId);
    }
    for (const title of item.relatedProviderTitles || []) {
      aggregate.relatedProviderTitles.add(title);
    }
    if (item.title || (Array.isArray(item.titles) && item.titles.length)
        || (item.year != null && Number.isInteger(Number(item.year)))) {
      aggregate.semanticEvidence = true;
    }

  }

  return [...grouped.values()]
    .map(({ item, evidence, sources, directlyCorroborated, semanticEvidence, relatedProviderIds, relatedProviderTitles }) => ({
      ...item,
      evidence: uniqueEvidence(evidence),
      corroborated: sources.size > 1,
      directlyCorroborated,
      semanticEvidence,
      relatedProviderIds: [...relatedProviderIds],
      relatedProviderTitles: [...relatedProviderTitles],
    }))
    .sort((a, b) => PROVIDER_PRIORITY[a.provider] - PROVIDER_PRIORITY[b.provider]);
}

function uniqueEvidence(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = JSON.stringify([
      entry?.source || "",
      entry?.season || null,
      entry?.episodeOffset || null,
      entry?.relation === true,
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function selectProviderIdentity(media, candidates, { excludeIds = new Set() } = {}) {
  const eligible = (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => !excludeIds.has(candidate.id) && !excludeIds.has(candidate.stremioId))
    .map((candidate) => ({ ...candidate, validation: validateCandidate(media, candidate) }))
    .filter((candidate) => candidate.validation.valid)
    .sort((a, b) => PROVIDER_PRIORITY[a.provider] - PROVIDER_PRIORITY[b.provider]
      || b.validation.score - a.validation.score);
  const selected = eligible[0];
  if (!selected) return null;
  return { provider: selected.provider, id: selected.id, stremioId: selected.stremioId, validation: selected.validation, evidence: selected.evidence || [] };
}
export function validateCandidate(media, candidate) {
  if (!candidate || !["imdb", "tvdb", "tmdb"].includes(candidate.provider)) {
    return { valid: false, score: -Infinity, reasons: ["unsupported-provider"] };
  }

  const evidenceSources = Array.isArray(candidate?.evidence)
    ? candidate.evidence.map((entry) => String(entry?.source || "")).filter(Boolean)
    : [];
  if (evidenceSources.some((source) => source === "animap" || source.startsWith("animap-"))
      && candidate.corroborated !== true) {
    return { valid: false, score: -Infinity, reasons: ["animap-provider-not-corroborated"] };
  }

  const mediaTitles = [
    media?.title?.english,
    media?.title?.romaji,
    media?.title?.native,
    ...(Array.isArray(media?.synonyms) ? media.synonyms : []),
  ];
  const relatedSearchCompatible = candidate.relatedTitleSearch === true
    && Array.isArray(candidate.relatedSearchTitles)
    && candidate.relatedSearchTitles.some((title) =>
      derivedTitleCompatible(mediaTitles, [title])
      || installmentBaseCompatible(mediaTitles, [title]));
  if (candidate.relatedTitleSearch === true && !relatedSearchCompatible) {
    return { valid: false, score: -Infinity, reasons: ["related-search-title-mismatch"] };
  }

  const semanticEvidence = candidate.semanticEvidence === true || Boolean(
    candidate.title
      || (Array.isArray(candidate.titles) && candidate.titles.length)
      || (candidate.year != null && Number.isInteger(Number(candidate.year))),
  );

  // A provider mapping can carry the correct AniList ID while still pointing
  // at a franchise parent/prequel. Never accept such an identity merely
  // because the source IDs agree. Use both the related title and the related
  // entry's provider links because bulk mapping sources may copy the current
  // AniList title onto a bad provider ID.
  const relatedProviderCollision = candidate.relatedProviderIds?.includes(
    `${candidate.provider}:${candidate.id}`,
  );
  const candidateRelatedTitleShared = isKnownRelatedTitle(media, candidate.title)
    && relatedProviderInstallmentCompatible(mediaTitles, [candidate.title]);
  const sharedRelatedProvider = relatedProviderInstallmentCompatible(
    mediaTitles,
    candidate.relatedProviderTitles,
  ) || candidateRelatedTitleShared;

  if (!candidate.relation
      && candidate.relatedTitleSearch !== true
      && candidate.derivedTitle !== true
      && ((isKnownRelatedTitle(media, candidate.title)
        || isKnownRelatedProviderIdentity(media, candidate)
        || relatedProviderCollision)
        && !sharedRelatedProvider)) {
    return { valid: false, score: -Infinity, reasons: ["related-identity-mismatch"] };
  }
  const strongDirectSources = new Set([
    "anilist-external",
    "provider-search",
    "animeapi",
    "anime-mapper",
    "animap",
    "idmapper",
  ]);
  const hasStrongDirectSource = evidenceSources.some((source) => strongDirectSources.has(source));
  const weakMappingOnly = evidenceSources.length > 0
    && evidenceSources.every((source) => ["arm", "fribb"].includes(source));
  const hasExplicitRelations = Array.isArray(media?.relations?.edges)
    && media.relations.edges.some((edge) => ["PARENT", "PREQUEL", "SEQUEL", "SPIN_OFF", "SIDE_STORY"]
      .includes(String(edge?.relationType || "").toUpperCase()));
  if (["tvdb", "tmdb"].includes(candidate.provider)
      && weakMappingOnly
      && hasExplicitRelations
      && !evidenceSources.includes("provider-search")) {
    return { valid: false, score: -Infinity, reasons: ["unverified-related-weak-mapping"] };
  }
  if (["tvdb", "tmdb"].includes(candidate.provider)
      && weakMappingOnly
      && !semanticEvidence
      && !hasStrongDirectSource) {
    return { valid: false, score: -Infinity, reasons: ["insufficient-provider-evidence"] };
  }

  const reasons = [];
  let score = 0;

  const format = String(media?.format || "").toUpperCase();
  const expectedMovie = format === "MOVIE";
  const candidateMovie = candidate.mediaType === "movie";
  const standaloneFormatsCanUseMovieIdentity = ["OVA", "SPECIAL", "ONA"].includes(format);
  if (candidate.mediaType && expectedMovie !== candidateMovie) {
    if (!(standaloneFormatsCanUseMovieIdentity && candidateMovie)) {
      return { valid: false, score: -Infinity, reasons: ["format-mismatch"] };
    }
    score += 10;
    reasons.push("standalone-movie-compatible");
  }

  if (candidate.relation) {
    if (candidate.directlyCorroborated !== true) {
      return { valid: false, score: -Infinity, reasons: ["relation-provider-not-corroborated"] };
    }
    score += 40;
    reasons.push("explicit-relation");
  } else if (candidate.title || candidate.titles) {
    const targetTitles = [
      media?.title?.english,
      media?.title?.romaji,
      media?.title?.native,
      ...(Array.isArray(media?.synonyms) ? media.synonyms : []),
    ];
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
    providerExactTitle: record?.providerExactTitle === true,
    providerAuthoritative: record?.providerAuthoritative === true,
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
      season: record?.season || null,
      episodeOffset: record?.episodeOffset || null,
      relation: record?.relation === true,
    }],
  };
}

function isKnownRelatedProviderIdentity(media, candidate) {
  if (!candidate?.provider || !candidate?.id) return false;

  const relations = Array.isArray(media?.relations?.edges) ? media.relations.edges : [];
  return relations
    .filter((edge) => ["PARENT", "PREQUEL", "SEQUEL", "SPIN_OFF", "SIDE_STORY"].includes(
      String(edge?.relationType || "").toUpperCase(),
    ))
    .some((edge) => (Array.isArray(edge?.node?.externalLinks) ? edge.node.externalLinks : [])
      .some((link) => providerLinkMatches(candidate.provider, candidate.id, link?.url, link?.site)));
}

function providerLinkMatches(provider, id, url, site) {
  const value = String(url || "");
  const siteName = String(site || "").toLowerCase();
  const candidateId = String(id);

  if (provider === "imdb") {
    const match = value.match(/\/title\/(tt\d+)/i);
    return match ? match[1] === candidateId : siteName.includes("imdb") && siteName.includes(candidateId);
  }

  if (provider === "tvdb") {
    const match = value.match(/\/series\/(\d+)|[?&](?:id|seriesid)=(\d+)/i);
    return match ? (match[1] || match[2]) === candidateId
      : siteName.includes("tvdb") && siteName.includes(candidateId);
  }

  if (provider === "tmdb") {
    const match = value.match(/\/(?:tv|movie)\/(\d+)/i);
    return match ? match[1] === candidateId
      : siteName.includes("tmdb") && siteName.includes(candidateId);
  }

  return false;
}

function isKnownRelatedTitle(media, candidateTitle) {
  const candidate = normalizeTitle(candidateTitle);
  if (!candidate) return false;

  const relations = Array.isArray(media?.relations?.edges) ? media.relations.edges : [];
  return relations
    .filter((edge) => ["PARENT", "PREQUEL", "SEQUEL", "SPIN_OFF", "SIDE_STORY"].includes(
      String(edge?.relationType || "").toUpperCase(),
    ))
    .flatMap((edge) => [
      edge?.node?.title?.english,
      edge?.node?.title?.romaji,
      edge?.node?.title?.native,
      ...(Array.isArray(edge?.node?.synonyms) ? edge.node.synonyms : []),
    ])
    .some((title) => normalizeTitle(title) === candidate);
}

function relatedProviderInstallmentCompatible(leftTitles, rightTitles) {
  const left = uniqueNormalized(leftTitles);
  const right = uniqueNormalized(rightTitles);
  if (!left.length || !right.length) return false;

  const installmentMarker = /\b(?:season|saison|part|cour|file)\s*\d+(?:st|nd|rd|th)?\b|\bs\d+\b|\b(?:first|second|third|fourth|fifth|final)\b|\b(?:i|ii|iii|iv|v|vi)\b/i;
  const stripInstallment = (value) => normalizeTitle(value)
    .replace(/\b(?:season|saison|part|cour|cour\s+part|file)\s*\d+(?:st|nd|rd|th)?\b/g, " ")
    .replace(/\b\d+(?:st|nd|rd|th)?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const a of left) {
    for (const b of right) {
      if (a === b) return true;

      if (stripInstallment(a) === stripInstallment(b)
          && (installmentMarker.test(a) || installmentMarker.test(b))) {
        return true;
      }

      if (installmentBaseCompatible([a], [b])
          && (installmentMarker.test(a) || installmentMarker.test(b))) {
        return true;
      }

      const aTokens = new Set(a.split(" "));
      const bTokens = new Set(b.split(" "));
      const overlap = [...aTokens].filter((token) => bTokens.has(token)).length;
      const ratio = overlap / Math.max(aTokens.size, bTokens.size);
      if (overlap >= 4 && ratio >= 0.8) return true;
    }
  }
  return false;
}

function installmentBaseCompatible(leftTitles, rightTitles) {
  const stripInstallment = (value) => normalizeTitle(value)
    .replace(/\b(?:season|saison|part|cour|cour\s+part|file)\s*\d+(?:st|nd|rd|th)?\b/g, " ")
    .replace(/\b\d+(?:st|nd|rd|th)?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const left = uniqueNormalized(leftTitles).map(stripInstallment).filter(Boolean);
  const right = uniqueNormalized(rightTitles).map(stripInstallment).filter(Boolean);
  for (const a of left) {
    const aTokens = new Set(a.split(" "));
    for (const b of right) {
      const bTokens = b.split(" ");
      const distinctive = bTokens.filter((token) => token.length >= 4);
      if (distinctive.length < 2) continue;
      if (bTokens.every((token) => aTokens.has(token))) return true;
    }
  }
  return false;
}

function oneWordInstallmentTitleCompatible(leftTitles, rightTitles) {
  const left = uniqueNormalized(leftTitles);
  const right = uniqueNormalized(rightTitles);
  return right.some((title) => {
    const tokens = title.split(" ");
    if (tokens.length !== 1 || tokens[0].length < 5) return false;
    return left.some((sourceTitle) => new Set(sourceTitle.split(" ")).has(tokens[0]));
  });
}

function derivedTitleCompatible(leftTitles, rightTitles) {
  const left = uniqueNormalized(leftTitles);
  const right = uniqueNormalized(rightTitles);
  for (const a of left) {
    const aTokens = new Set(a.split(" "));
    for (const b of right) {
      const bTokens = b.split(" ");
      if (bTokens.length < 2) continue;
      const contained = bTokens.every((token) => aTokens.has(token));
      const distinctive = bTokens.filter((token) => token.length >= 4);
      if (contained && distinctive.length >= 2) return true;
    }
  }
  return false;
}

function uniqueNormalized(values) {
  return [...new Set((Array.isArray(values) ? values : [values]).map(normalizeTitle).filter(Boolean))];
}