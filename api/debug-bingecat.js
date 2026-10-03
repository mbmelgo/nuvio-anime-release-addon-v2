const ENDPOINT = "https://bingecat.com/public/meilisearch/api";

export default async function handler(req, res) {
  const title = String(req.query?.title || "").trim();
  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  const strategies = [
    { name: "exact-default", params: { mode: "exact", semantic_ratio: "0.55" } },
    { name: "exact-keyword", params: { mode: "exact", semantic_ratio: "0" } },
    { name: "exact-semantic", params: { mode: "exact", semantic_ratio: "1" } },
    { name: "default", params: {} },
  ];

  const results = {};
  for (const strategy of strategies) {
    const params = new URLSearchParams({
      query: title,
      exploration: "0.55",
      quality_bias: "0.6",
      newness_bias: "0.4",
      exclude_history: "0",
      page: "1",
      shuffle_session_seed: "nuvio-anime-addon-debug",
      include_reservoir: "1",
      ...strategy.params,
    });

    try {
      const response = await fetch(`${ENDPOINT}?${params}`, {
        headers: {
          Accept: "application/json",
          "X-Requested-With": "XMLHttpRequest",
          Referer: "https://bingecat.com/",
        },
      });
      const payload = await response.json().catch(() => ({}));
      results[strategy.name] = {
        status: response.status,
        movies: Array.isArray(payload?.movies) ? payload.movies.slice(0, 10) : [],
        series: Array.isArray(payload?.series) ? payload.series.slice(0, 10) : [],
        keys: Object.keys(payload || {}),
      };
    } catch (error) {
      results[strategy.name] = { error: String(error?.message || error) };
    }
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ title, results });
}
