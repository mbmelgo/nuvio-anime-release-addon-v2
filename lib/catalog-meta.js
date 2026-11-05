export function filterCatalogMetasBySearch(metas, search) {
  const needle = String(search || "").trim().toLocaleLowerCase();
  if (!needle) return metas;
  return metas.filter((meta) =>
    [meta.name, meta.extra?.titleEnglish, meta.extra?.titleRomaji, meta.extra?.titleNative]
      .some((value) => String(value || "").toLocaleLowerCase().includes(needle))
  );
}

// Preserve AniList's supplied URL (no filename/path substitutions); allow only
// usable HTTPS variants and fall back gracefully when a preferred size is absent.
export function selectAniListPoster(coverImage) {
  if (!coverImage || typeof coverImage !== "object" || Array.isArray(coverImage)) return undefined;
  for (const size of ["extraLarge", "large", "medium"]) {
    const value = coverImage[size];
    if (typeof value !== "string") continue;
    const candidate = value.trim();
    if (!candidate || /\s/.test(candidate)) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === "https:" && url.hostname && !url.username && !url.password) {
        return candidate;
      }
    } catch {
      // Ignore invalid upstream data; the next available cover is still usable.
    }
  }
  return undefined;
}

export function toMetaFromAniList(anilistId, media = {}) {
  const id = `anilist:${String(anilistId)}`;
  const title = media.title || {};
  const poster = selectAniListPoster(media.coverImage);
  const extra = {
    anilistId: Number(anilistId),
    ...(media.idMal ? { malId: media.idMal } : {}),
    ...(title.english ? { titleEnglish: title.english } : {}),
    ...(title.romaji ? { titleRomaji: title.romaji } : {}),
    ...(title.native ? { titleNative: title.native } : {}),
    ...(media.status ? { status: media.status } : {}),
    ...(media.format ? { format: media.format } : {}),
  };

  if (media.nextAiringEpisode) {
    extra.nextEpisode = media.nextAiringEpisode.episode;
    extra.nextAiringAt = media.nextAiringEpisode.airingAt;
  }

  const meta = {
    id,
    type: media.format === "MOVIE" ? "movie" : "series",
    name: title.english || title.romaji || title.native || `Anime ${anilistId}`,
    posterShape: "poster",
    ...(poster ? { poster } : {}),
    ...(Array.isArray(media.genres) && media.genres.length ? { genres: media.genres } : {}),
    extra,
  };

  if (media.startDate?.year) {
    const startYear = media.startDate.year;
    const endYear = media.endDate?.year;
    meta.releaseInfo = media.status === "RELEASING"
      ? `${startYear}-`
      : endYear && endYear !== startYear
        ? `${startYear}-${endYear}`
        : String(startYear);
    if (media.startDate.month && media.startDate.day) {
      meta.released = new Date(Date.UTC(
        media.startDate.year,
        media.startDate.month - 1,
        media.startDate.day,
      )).toISOString();
    }
  }

  return meta;
}
