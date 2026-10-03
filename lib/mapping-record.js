export function normalizeMappingRecord(record, source = "mapping") {
  if (!record || typeof record !== "object") return null;
  const anilistId = Number(record.anilistId ?? record.anilist_id);
  if (!Number.isInteger(anilistId) || anilistId <= 0) return null;

  const tmdb = record.themoviedb_id || record.tmdb || {};
  return {
    source,
    anilistId,
    type: record.type || null,
    malId: positiveInt(record.malId ?? record.mal_id),
    kitsuId: positiveInt(record.kitsuId ?? record.kitsu_id),
    anidbId: positiveInt(record.anidbId ?? record.anidb_id),
    imdbIds: normalizeImdbIds(record.imdbIds ?? record.imdb_id),
    tvdbId: positiveInt(record.tvdbId ?? record.tvdb_id),
    tmdbTvId: positiveInt(record.tmdbTvId ?? tmdb.tv),
    tmdbMovieIds: normalizePositiveInts(record.tmdbMovieIds ?? tmdb.movie),
    season: record.season || null,
    episodeOffset: record.episodeOffset ?? record.episode_offset ?? null,
  };
}

function positiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function normalizePositiveInts(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.map(positiveInt).filter(Boolean);
}

function normalizeImdbIds(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.map(String).filter((id) => /^tt\d+$/.test(id));
}
