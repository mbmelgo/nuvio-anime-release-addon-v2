export function resolveAniListExternalMappings(rows) {
  const result = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const anilistId = Number(row?.id);
    if (!Number.isInteger(anilistId) || anilistId <= 0) continue;

    const mappings = [];
    const direct = normalizeExternalLinks(row);
    if (direct) mappings.push(direct);

    for (const edge of Array.isArray(row?.relations?.edges) ? row.relations.edges : []) {
      const relation = edge?.node;
      const relationMapping = normalizeExternalLinks({
        id: anilistId,
        idMal: row?.idMal,
        format: relation?.format,
        externalLinks: relation?.externalLinks,
      });
      if (relationMapping) {
        relationMapping.source = "anilist-relation-external";
        relationMapping.relationAnilistId = Number(relation?.id) || null;
        mappings.push(relationMapping);
      }
    }

    if (mappings.length) result.set(anilistId, dedupeMappings(mappings));
  }
  return result;
}

export function normalizeExternalLinks(row) {
  const anilistId = Number(row?.id);
  if (!Number.isInteger(anilistId) || anilistId <= 0) return null;

  const links = Array.isArray(row?.externalLinks) ? row.externalLinks : [];
  const imdbIds = [];
  let tvdbId = null;
  let tmdbTvId = null;
  const tmdbMovieIds = [];

  for (const link of links) {
    const url = String(link?.url || "");
    const site = String(link?.site || "").toLowerCase();
    if (site.includes("imdb") || /imdb\.com\/title\/tt\d+/i.test(url)) {
      const match = url.match(/imdb\.com\/title\/(tt\d+)/i);
      if (match) imdbIds.push(match[1]);
    }
    if (site.includes("tvdb") || /thetvdb\.com\/(?:dereferrer\/)?series\/\d+/i.test(url)) {
      const match = url.match(/thetvdb\.com\/(?:dereferrer\/)?series\/(\d+)/i);
      if (match) tvdbId = Number(match[1]);
    }
    if (site.includes("movie database") || site.includes("tmdb") || /themoviedb\.org\/(?:tv|movie)\/\d+/i.test(url)) {
      const match = url.match(/themoviedb\.org\/(tv|movie)\/(\d+)/i);
      if (match) {
        if (match[1] === "tv") tmdbTvId = Number(match[2]);
        else tmdbMovieIds.push(Number(match[2]));
      }
    }
  }

  const type = String(row?.format || "").toUpperCase() === "MOVIE" ? "MOVIE" : "TV";
  const validImdbIds = [...new Set(imdbIds.filter((id) => /^tt\d+$/.test(id)))];
  const validTvdbId = Number.isInteger(tvdbId) && tvdbId > 0 ? tvdbId : null;
  const validTmdbTvId = Number.isInteger(tmdbTvId) && tmdbTvId > 0 ? tmdbTvId : null;
  const validTmdbMovieIds = [...new Set(tmdbMovieIds.filter((id) => Number.isInteger(id) && id > 0))];

  if (!validImdbIds.length && !validTvdbId && !validTmdbTvId && !validTmdbMovieIds.length) return null;

  return {
    source: "anilist-external",
    anilistId,
    type,
    malId: Number.isInteger(Number(row?.idMal)) && Number(row.idMal) > 0 ? Number(row.idMal) : null,
    imdbIds: validImdbIds,
    tvdbId: validTvdbId,
    tmdbTvId: type === "MOVIE" ? null : validTmdbTvId,
    tmdbMovieIds: type === "MOVIE" ? validTmdbMovieIds : [],
    season: null,
    episodeOffset: null,
  };
}

function dedupeMappings(records) {
  const seen = new Set();
  return records.filter((record) => {
    const key = JSON.stringify([
      record.source,
      record.imdbIds,
      record.tvdbId,
      record.tmdbTvId,
      record.tmdbMovieIds,
      record.type,
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
