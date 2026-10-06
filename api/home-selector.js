import { ADDON_VERSION } from "./version.js";

const BASE_URL = "https://nuvio-anime-release-addon-v2.vercel.app";
const GITHUB_URL = "https://github.com/mbmelgo/nuvio-anime-release-addon-v2";
const RELEASES_URL = "https://github.com/mbmelgo/nuvio-anime-release-addon-v2/releases";
const SAMPLE_IMAGES = [
  ["Seasonal Catalogs", "/docs/images/readme-nuvio-home.png", "Representative seasonal catalog view"],
  ["Season Listing", "/docs/images/readme-nuvio-season.png", "Representative season listing"],
  ["Metadata Detail Flow", "/docs/images/readme-nuvio-detail.png", "Representative anime detail flow"],
  ["Upcoming — 5 days", "/docs/images/nuvio-upcoming-5-days.png", "Nuvio-style upcoming rolling catalog"],
  ["Previous — 7 days", "/docs/images/nuvio-previous-7-days.png", "Nuvio-style previous rolling catalog"],
];

const CATALOGS = [
  ["Upcoming Season", "upcoming_season", "Anime scheduled for the next season"],
  ["Current Season", "current_season", "Anime in the current season"],
  ["Previous Season", "previous_season", "Anime from the immediately preceding season"],
  ["Upcoming — 5 days", "upcoming_5_days", "Unique anime with an upcoming airing in the next five days"],
  ["Previous — 7 days", "previous_7_days", "Unique anime with an airing in the previous seven days"],
];

export default function handler(req, res) {
  const manifest = `${BASE_URL}/manifest.json`;
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0b0f14">
  <title>Anime Releases for Nuvio · v${ADDON_VERSION}</title>
  <style>
    :root{color-scheme:dark;--bg:#0b0f14;--panel:#121821;--panel2:#18212c;--text:#f4f7fb;--muted:#9da9b8;--accent:#ff6f61;--border:#283341}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 50% -10%,#1c2633 0,var(--bg) 45%);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;line-height:1.6}.wrap{width:min(1100px,calc(100% - 28px));margin:0 auto}header{padding:62px 0 30px}.eyebrow{color:var(--accent);font-weight:800;letter-spacing:.08em;text-transform:uppercase;font-size:.82rem}h1{font-size:clamp(2.4rem,7vw,4.5rem);line-height:1.02;margin:12px 0 18px;letter-spacing:-.04em}.lead{max-width:800px;color:var(--muted);font-size:1.15rem}.panel{margin:22px 0;padding:26px;border:1px solid var(--border);border-radius:18px;background:linear-gradient(135deg,var(--panel2),var(--panel))}.url{display:block;padding:14px 16px;border:1px solid var(--border);border-radius:10px;background:#090d12;overflow-wrap:anywhere;margin:10px 0 18px}code{color:#e7edf5}.button{display:inline-flex;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:800;background:var(--accent);color:#101419}.secondary{background:var(--panel);color:var(--text);border:1px solid var(--border);margin-left:8px}.catalog{display:grid;grid-template-columns:1fr auto;gap:12px 18px;align-items:center;padding:15px 0;border-top:1px solid var(--border)}.catalog:first-child{border-top:0}.catalog h3{margin:0;font-size:1rem}.catalog p{margin:3px 0 0;color:var(--muted);font-size:.9rem}.catalog a{overflow-wrap:anywhere}.samples{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:18px}.sample{min-width:0}.sample-image{width:100%;display:block;border-radius:10px;background:#22364d;border:1px solid var(--border)}.sample h3{font-size:1rem;line-height:1.25;margin:10px 0 2px}.sample p{margin:0;color:var(--muted);font-size:.82rem}.note{color:var(--muted);font-size:.92rem}footer{padding:35px 0 55px;color:var(--muted)}a{color:#dfe7f0}@media(max-width:900px){.samples{grid-template-columns:1fr}}@media(max-width:700px){.catalog{grid-template-columns:1fr}.secondary{margin:10px 0 0}}
  </style>
</head>
<body>
  <header class="wrap">
    <div class="eyebrow">Nuvio anime catalog addon · v${ADDON_VERSION}</div>
    <h1>Anime Releases for Nuvio</h1>
    <p class="lead">Dynamic seasonal and rolling anime release catalogs. AniList supplies release and airing data; the addon resolves validated provider identities through ARM and secondary cross-provider mapping sources.</p>
  </header>
  <main class="wrap">
    <section class="panel">
      <h2>Install the addon</h2>
      <p>The production addon resolves a validated provider identity, preferring IMDb and falling back to TVDB or TMDB when validated. Detailed metadata is delegated to the metadata addon configured in Nuvio.</p>
      <div class="url"><code>${manifest}</code></div>
      <a class="button" href="${manifest}">Install addon</a>
      <a class="button secondary" href="${GITHUB_URL}">GitHub</a>
      <a class="button secondary" href="${RELEASES_URL}">Releases</a>
    </section>

    <section class="panel">
      <h2>Supported catalogs</h2>
      <p class="note">Three seasonal and two rolling catalogs are exposed. Rolling catalogs use AniList airing schedules, deduplicate by anime, and include only non-adult TV, TV Short, ONA, OVA, Special, and Movie entries.</p>
      ${CATALOGS.map(([name, id, description]) => `
      <div class="catalog">
        <div><h3>${name}</h3><p>${description}</p></div>
        <a href="${BASE_URL}/catalog/series/${id}.json">${BASE_URL}/catalog/series/${id}.json</a>
      </div>`).join("")}
    </section>

    <section class="panel">
      <h2>Sample Nuvio views</h2>
      <p class="note">Representative showcase images from the repository. These are Nuvio-style showcase screenshots with representative anime artwork.</p>
      <div class="samples">
        ${SAMPLE_IMAGES.map(([title, image, description]) => `<article class="sample"><img class="sample-image" src="${image}" alt="${title}" loading="lazy"><h3>${title}</h3><p>${description}</p></article>`).join("")}
      </div>
    </section>

    <section class="panel">
      <h2>Production status</h2>
      <p class="note">Version ${ADDON_VERSION} is the current addon version. Seasonal catalogs support TV, TV Short, ONA, OVA, Special, and Movie formats and exclude adult entries.</p>
    </section>

    <section class="panel">
      <h2>Identity and metadata flow</h2>
      <p class="note"><code>AniList → ARM mapping → validated provider ID → Nuvio → configured metadata addon</code></p>
      <p class="note">This addon is catalog-focused. It does not duplicate detailed metadata, provider mapping, or playback resolution.</p>
    </section>
  </main>
  <footer class="wrap">Anime Releases for Nuvio · v${ADDON_VERSION}</footer>
</body>
</html>`;

  res.status(200);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=1800");
  return res.send(html);
}
