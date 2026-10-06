const SEARCH_URL = "https://v3.sg.media-imdb.com/suggestion/x/";
const cache = new Map();
const inFlight = new Map();

export function clearImdbSearchCache() {
  cache.clear();
  inFlight.clear();
}

export function buildImdbSearchTitles(row) {
  return buildSearchTitles(row);
}

export async function resolveAniListMappingsByImdbSearch(rows, {
  fetchImpl = fetch,
  endpoint = SEARCH_URL,
  concurrency = 4,
} = {}) {
  const items = (Array.isArray(rows) ? rows : [])
    .map((row) => ({ row, anilistId: Number(row?.id), title: bestTitle(row) }))
    .filter((item) => Number.isInteger(item.anilistId) && item.anilistId > 0 && item.title);

  const result = new Map();
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const item = items[cursor++];
      const searchTitles = [
        ...buildSearchTitles(item.row).map((search) => ({ ...search, related: false })),
        ...(Array.isArray(item.row?.relations?.edges) ? item.row.relations.edges : [])
          .filter((edge) => ["PARENT", "PREQUEL", "SEQUEL", "SPIN_OFF", "SIDE_STORY"].includes(String(edge?.relationType || "").toUpperCase()))
          .flatMap((edge) => [
            edge?.node?.title?.english,
            edge?.node?.title?.romaji,
            edge?.node?.title?.native,
          ])
          .filter(Boolean)
          .flatMap((title) => buildTitleVariants(String(title)))
          .map((search) => ({ ...search, related: true })),
      ];

      for (const search of searchTitles) {
        const key = normalizeKey(search.title);
        let suggestions = cache.get(key);
        if (!suggestions) {
          const existing = inFlight.get(key);
          if (existing) {
            suggestions = await existing;
          } else {
            const request = fetchSuggestions(search.title, { fetchImpl, endpoint });
            inFlight.set(key, request);
            try {
              suggestions = await request;
              cache.set(key, suggestions);
            } finally {
              inFlight.delete(key);
            }
          }
        }
        const match = selectMatch(
          item.row,
          suggestions,
          search.related ? [search.title] : null,
          search.related,
          search.derived,
          search.derivedInstallment === true,
          search.title,
        );
        if (!match) continue;

        result.set(item.anilistId, [{
          source: search.related ? "imdb-search-relation" : "imdb-search",
          anilistId: item.anilistId,
          type: String(item.row?.format || "").toUpperCase() === "MOVIE" ? "MOVIE" : "TV",
          malId: Number.isInteger(Number(item.row?.idMal)) && Number(item.row.idMal) > 0 ? Number(item.row.idMal) : null,
          imdbIds: [match.id],
          tvdbId: null,
          tmdbTvId: null,
          tmdbMovieIds: [],
          title: item.row?.title?.english || item.row?.title?.romaji || match.title,
          titles: [match.title],
          year: search.related || search.derived ? null : match.year,
          derivedTitle: search.derived === true,
          derivedInstallmentTitle: search.derivedInstallment === true,
          derivedSearchTitle: search.derived ? search.title : null,
          relation: search.related === true,
          season: null,
          episodeOffset: null,
        }]);
        break;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return result;
}

function selectMatch(row, suggestions, relatedTitles = null, relationSearch = false, derivedTitle = false, derivedInstallmentTitle = false, derivedSearchTitle = null) {
  const targetYear = relationSearch || derivedTitle ? null : Number(row?.startDate?.year);
  const titles = (relatedTitles || [row?.title?.english, row?.title?.romaji, row?.title?.native, ...(row?.synonyms || [])]).filter(Boolean);
  const candidates = suggestions
    .filter((item) => /^tt\d+$/.test(String(item?.id || "")))
    .map((item) => ({
      id: String(item.id),
      title: String(item.l || item.title || ""),
      year: Number.isInteger(Number(item.y)) ? Number(item.y) : null,
      compatible: titlesCompatibleLocal(titles, item.l || item.title || "")
        || (derivedTitle && derivedTitleCompatible(titles, item.l || item.title || ""))
        || (derivedTitle && oneWordDerivedTitleCompatible(
          titles,
          item.l || item.title || "",
          derivedSearchTitle,
        )),
    }))
    .filter((item) => item.compatible && (item.year == null || !Number.isInteger(targetYear) || Math.abs(item.year - targetYear) <= 2));

  candidates.sort((a, b) => {
    const ay = Number.isInteger(targetYear) && a.year != null ? Math.abs(a.year - targetYear) : 99;
    const by = Number.isInteger(targetYear) && b.year != null ? Math.abs(b.year - targetYear) : 99;
    return ay - by || b.title.length - a.title.length;
  });
  return candidates[0] || null;
}

async function fetchSuggestions(title, { fetchImpl, endpoint }) {
  const response = await fetchImpl(endpoint + encodeURIComponent(title) + ".json", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => ({}));
  return Array.isArray(payload?.d) ? payload.d : [];
}

function bestTitle(row) {
  return row?.title?.english || row?.title?.romaji || row?.title?.native || row?.synonyms?.[0] || null;
}

function buildSearchTitles(row) {
  return [...new Map(
    [
      row?.title?.english,
      row?.title?.romaji,
      row?.title?.native,
    ]
      .filter(Boolean)
      .flatMap((title) => buildTitleVariants(title))
      .concat(
        (Array.isArray(row?.synonyms) ? row.synonyms : [])
          .filter(Boolean)
          .flatMap((title) => buildTitleVariants(title, true)),
      )
      .map((search) => [normalizeKey(search.title), search]),
  ).values()];
}

function buildTitleVariants(title, derivedBase = false) {
  const value = String(title || "").trim();
  if (!value) return [];

  const variants = [
    { title: value, derived: derivedBase, derivedInstallment: false },
    { title: value.replace(/\s*\/?\s*\(?(?:Zoku-hen|続編|Sequel)\)?$/i, "").trim(), derived: true },
    { title: value.replace(/\s*[-–—:]?\s*(?:\d+(?:st|nd|rd|th)?\s*Season|Season\s*\d+|\d+(?:st|nd|rd|th)?)$/i, "").trim(), derived: true, derivedInstallment: true },
    { title: value.replace(/\s+(?:File|Part|Episode)\s+\d+$/i, "").trim(), derived: true, derivedInstallment: true },
    { title: value.split(/[:：]/, 1)[0].trim(), derived: true, derivedInstallment: false },
    { title: value.replace(/\s*\(\d{4}\)\s*$/i, "").trim(), derived: true, derivedInstallment: false },
    ...buildInstallmentAliases(value),
  ];

  return [...new Map(
    variants
      .map((item) => ({ ...item, title: String(item.title || "").trim() }))
      .filter((item) => item.title)
      .map((item) => [normalizeKey(item.title), item]),
  ).values()];
}

function buildInstallmentAliases(title) {
  const match = String(title || "").match(/\b(File|Part|Episode|Season)\s*([0-9]+)\b/i);
  if (!match) return [];

  const prefix = String(title).slice(0, match.index).trim();
  const tokens = prefix.split(/\s+/).filter(Boolean);
  const aliases = [];

  for (const count of [2, 3]) {
    if (tokens.length < count) continue;
    const base = tokens.slice(-count).join(" ");
    if (base.split(/\s+/).filter((token) => token.length >= 3).length < 2) continue;
    aliases.push({
      title: `${base} ${match[1]} ${match[2]}`,
      derived: true,
      derivedInstallment: true,
    });
  }

  return aliases;
}

function oneWordDerivedTitleCompatible(leftTitles, rightTitle, derivedSearchTitle) {
  const right = normalizeTitle(rightTitle);
  const search = normalizeTitle(derivedSearchTitle);
  if (!right || !search || right !== search) return false;
  const tokens = right.split(" ").filter(Boolean);
  if (tokens.length !== 1 || tokens[0].length < 5) return false;
  return leftTitles.some((left) => new Set(normalizeTitle(left).split(" ").filter(Boolean)).has(tokens[0]));
}

function normalizeKey(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function titlesCompatibleLocal(leftTitles, rightTitle) {
  const right = normalizeTitle(rightTitle);
  if (!right) return false;
  return leftTitles.some((left) => {
    const a = normalizeTitle(left);
    if (!a) return false;
    if (a === right) return true;

    // Short function words such as "of" and "the" are too common to establish
    // identity. Require the fuzzy overlap to be based on meaningful tokens.
    const at = new Set(a.split(" ").filter((token) => token.length >= 4));
    const bt = new Set(right.split(" ").filter((token) => token.length >= 4));
    const overlap = [...at].filter((token) => bt.has(token)).length;
    return overlap >= 2 && overlap / Math.max(at.size, bt.size) >= 0.75;
  });
}

function derivedTitleCompatible(leftTitles, rightTitle) {
  const right = normalizeTitle(rightTitle);
  const rightTokens = right.split(" ").filter(Boolean);
  if (rightTokens.length < 2) return false;
  const distinctive = rightTokens.filter((token) => token.length >= 4);
  if (distinctive.length < 2) return false;
  return leftTitles.some((left) => {
    const leftTokens = new Set(normalizeTitle(left).split(" ").filter(Boolean));
    return rightTokens.every((token) => leftTokens.has(token));
  });
}

function normalizeTitle(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}
