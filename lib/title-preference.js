// Presentation-only selection. Do not use it for identity mapping, filtering,
// upstream requests, or canonical catalog cache keys.
export const TITLE_PREFERENCES = Object.freeze(["english", "romaji", "native"]);

export function normalizeTitlePreference(value) {
  return value === "romaji" || value === "native" ? value : "english";
}

export function projectCatalogMetas(metas, preference = "english") {
  const mode = normalizeTitlePreference(preference);
  if (!Array.isArray(metas) || mode === "english") return metas;
  return metas.map((meta) => {
    const extra = meta?.extra || {};
    const candidates = mode === "native"
      ? [extra.titleNative, extra.titleRomaji, extra.titleEnglish]
      : [extra.titleRomaji, extra.titleEnglish, extra.titleNative];
    const name = candidates.find((value) => typeof value === "string" && value.trim()) || meta.name;
    return name === meta.name ? meta : { ...meta, name };
  });
}
