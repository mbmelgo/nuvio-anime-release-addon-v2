const SEARCH_URL = "https://v3.sg.media-imdb.com/suggestion/x/";
const cache = new Map();

export function clearImdbSearchCache() {
  cache.clear();
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
      const key = normalizeKey(item.title);
      let suggestions = cache.get(key);
      if (!suggestions) {
        suggestions = await fetchSuggestions(item.title, { fetchImpl, endpoint });
        cache.set(key, suggestions);
      }
      const match = selectMatch(item.row, suggestions);
      if (match) {
        result.set(item.anilistId, [{
          source: "imdb-search",
          anilistId: item.anilistId,
          type: String(item.row?.format || "").toUpperCase() === "MOVIE" ? "MOVIE" : "TV",
          malId: Number.isInteger(Number(item.row?.idMal)) && Number(item.row.idMal) > 0 ? Number(item.row.idMal) : null,
          imdbIds: [match.id],
          tvdbId: null,
          tmdbTvId: null,
          tmdbMovieIds: [],
          title: match.title,
          titles: [match.title],
          year: match.year,
          season: null,
          episodeOffset: null,
        }]);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return result;
}

function selectMatch(row, suggestions) {
  const targetYear = Number(row?.startDate?.year);
  const titles = [row?.title?.english, row?.title?.romaji, row?.title?.native, ...(row?.synonyms || [])].filter(Boolean);
  const candidates = suggestions
    .filter((item) => /^tt\d+$/.test(String(item?.id || "")))
    .map((item) => ({
      id: String(item.id),
      title: String(item.l || item.title || ""),
      year: Number.isInteger(Number(item.y)) ? Number(item.y) : null,
      compatible: titlesCompatibleLocal(titles, item.l || item.title || ""),
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
  return row?.title?.english || row?.title?.romaji || row?.title?.native || null;
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
    const at = new Set(a.split(" "));
    const bt = new Set(right.split(" "));
    const overlap = [...at].filter((token) => bt.has(token)).length;
    return overlap >= 2 && overlap / Math.max(at.size, bt.size) >= 0.75;
  });
}

function normalizeTitle(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}
