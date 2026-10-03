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

  const seen = new Set();
  return list
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort((a, b) => PROVIDER_PRIORITY[a.provider] - PROVIDER_PRIORITY[b.provider]);
}

export function selectBingeCatIdentity(media, candidates, { excludeIds = new Set() } = {}) {
  const eligible = (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => !excludeIds.has(candidate.id))
    .map((candidate) => ({
      ...candidate,
      validation: validateCandidate(media, candidate),
    }))
    .filter((candidate) => candidate.validation.valid)
    .sort((a, b) => b.validation.score - a.validation.score
      || PROVIDER_PRIORITY[a.provider] - PROVIDER_PRIORITY[b.provider]);

  const selected = eligible[0];
  if (!selected) return null;

  return {
    provider: selected.provider,
    id: selected.id,
    stremioId: selected.stremioId,
    validation: selected.validation,
    evidence: selected.evidence || [],
  };
}

export function validateCandidate(media, candidate) {
  if (!candidate || !["imdb", "tvdb", "tmdb"].includes(candidate.provider)) {
    return { valid: false, score: -Infinity, reasons: ["unsupported-provider"] };
  }

  const reasons = [];
  let score = 0;

  const expectedMovie = media?.format === "MOVIE";
  const candidateMovie = candidate.mediaType === "movie";
  if (candidate.mediaType && expectedMovie !== candidateMovie) {
    return { valid: false, score: -Infinity, reasons: ["format-mismatch"] };
  }

  if (candidate.title || candidate.titles) {
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
      return { valid: false, score: -Infinity, reasons: ["title-mismatch"] };
    }
    score += 100;
    reasons.push("title-match");
  }

  if (Number.isInteger(Number(candidate.year)) && Number.isInteger(Number(media?.startDate?.year))) {
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
    evidence: [{
      source: record?.source || "mapping",
      season: record?.season || null,
      episodeOffset: record?.episodeOffset || null,
    }],
  };
}

function uniqueNormalized(values) {
  return [...new Set((Array.isArray(values) ? values : [values]).map(normalizeTitle).filter(Boolean))];
}
