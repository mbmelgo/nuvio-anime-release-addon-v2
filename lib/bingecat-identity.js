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

export function getBingeCatCandidates(media, records) {
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

  const evidenceByIdentity = new Map();
  for (const item of list) {
    const key = `${item.provider}:${item.id}`;
    const aggregate = evidenceByIdentity.get(key) || {
      sources: new Set(),
      directlyCorroborated: false,
      semanticEvidence: false,
    };
    for (const entry of Array.isArray(item.evidence) ? item.evidence : []) {
      if (entry?.source) aggregate.sources.add(String(entry.source));
      if (entry?.relation !== true) aggregate.directlyCorroborated = true;
    }
    if (item.title || (Array.isArray(item.titles) && item.titles.length)
        || (item.year != null && Number.isInteger(Number(item.year)))) {
      aggregate.semanticEvidence = true;
    }
    evidenceByIdentity.set(key, aggregate);
  }

  const seen = new Set();
  return list
    .map((item) => {
      const aggregate = evidenceByIdentity.get(`${item.provider}:${item.id}`) || {
        sources: new Set(),
        directlyCorroborated: false,
        semanticEvidence: false,
      };
      return {
        ...item,
        corroborated: aggregate.sources.size > 1,
        directlyCorroborated: aggregate.directlyCorroborated,
        semanticEvidence: aggregate.semanticEvidence,
      };
    })
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort((a, b) => PROVIDER_PRIORITY[a.provider] - PROVIDER_PRIORITY[b.provider]);
}

export function selectBingeCatIdentity(media, candidates, { excludeIds = new Set() } = {}) {
  const eligible = (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => !excludeIds.has(candidate.id) && !excludeIds.has(candidate.stremioId))
    .map((candidate) => ({
      ...candidate,
      validation: validateCandidate(media, candidate),
      bingecatVerified: Array.isArray(candidate.evidence)
        && candidate.evidence.some((entry) => entry?.source === "bingecat-search"),
    }))
    .filter((candidate) => candidate.validation.valid)
    .sort((a, b) => Number(b.bingecatVerified) - Number(a.bingecatVerified)
      || PROVIDER_PRIORITY[a.provider] - PROVIDER_PRIORITY[b.provider]
      || b.validation.score - a.validation.score);

  const selected = eligible[0];
  if (!selected) return null;

  return {
    provider: selected.provider,
    id: selected.id,
    stremioId: selected.stremioId,
    validation: selected.validation,
    evidence: selected.evidence || [],
    bingecatVerified: selected.bingecatVerified,
  };
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
  const strongDirectSources = new Set([
    "anilist-external",
    "bingecat-search",
    "animeapi",
    "anime-mapper",
    "animap",
    "idmapper",
  ]);
  const hasStrongDirectSource = evidenceSources.some((source) => strongDirectSources.has(source));
  const weakMappingOnly = evidenceSources.length > 0
    && evidenceSources.every((source) => ["arm", "fribb"].includes(source));
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
    if (!titlesCompatible(targetTitles, candidateTitles)) {
      if (candidate.relatedTitleSearch === true && relatedSearchCompatible) {
        score += 100;
        reasons.push("related-search-title-match");
      } else if (!candidate.derivedTitle || !derivedTitleCompatible(targetTitles, candidateTitles)) {
        return { valid: false, score: -Infinity, reasons: ["title-mismatch"] };
      }
      score += 100;
      reasons.push("derived-title-match");
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
    relatedTitleSearch: record?.relatedTitleSearch === true,
    relatedSearchTitles: Array.isArray(record?.relatedSearchTitles) ? record.relatedSearchTitles : [],
    evidence: [{
      source: record?.source || "mapping",
      season: record?.season || null,
      episodeOffset: record?.episodeOffset || null,
      relation: record?.relation === true,
    }],
  };
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
