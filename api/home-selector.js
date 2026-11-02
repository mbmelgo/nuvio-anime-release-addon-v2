import { ADDON_VERSION } from "./version.js";

const BASE_URL = "https://nuvio-anime-release-addon-v2.vercel.app";
const GITHUB_URL = "https://github.com/mbmelgo/nuvio-anime-release-addon-v2";
const RELEASES_URL = `${GITHUB_URL}/releases`;

function getPayPalDonateUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    const allowedHosts = new Set(["paypal.me", "www.paypal.me", "paypal.com", "www.paypal.com"]);
    if (url.protocol !== "https:" || !allowedHosts.has(url.hostname) || url.username || url.password) return "";
    return url.href.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  } catch {
    return "";
  }
}

const SAMPLE_IMAGES = [
  ["Seasonal Catalogs", "/docs/images/readme-nuvio-home.png", "Representative seasonal catalog view"],
  ["Season Listing", "/docs/images/readme-nuvio-season.png", "Representative season listing"],
  ["Anime Details", "/docs/images/readme-nuvio-detail.png", "Representative anime detail view"],
];

const CATALOGS = [
  ["Upcoming Season", "upcoming_season", "Anime scheduled for the next season"],
  ["Current Season", "current_season", "Anime in the current season"],
  ["Previous Season", "previous_season", "Episodic anime from the immediately preceding season"],
  ["Upcoming Season Movies", "upcoming_season_movies", "Movies scheduled for the next season"],
  ["Current Season Movies", "current_season_movies", "Movies scheduled for the current season"],
  ["Previous Season Movies", "previous_season_movies", "Movies from the immediately preceding season"],
  ["Upcoming — 3 days", "upcoming_3_days", "Unique anime with an upcoming airing within the next three days"],
  ["Previous — 3 days", "previous_3_days", "Unique anime with an airing within the previous three days"],
];

function renderCatalog([name, id, description]) {
  const type = id.endsWith("_movies") ? "movie" : "series";
  const url = `${BASE_URL}/catalog/${type}/${id}.json`;
  return `
    <li class="catalog-item">
      <div class="catalog-copy">
        <h3>${name}</h3>
        <p>${description}</p>
      </div>
      <a class="catalog-link" href="${url}" aria-label="Open ${name} catalog">View catalog <span aria-hidden="true">↗</span></a>
    </li>`;
}

function renderSample([title, image, description]) {
  return `
    <figure class="sample">
      <img src="${image}" alt="${title}" loading="lazy">
      <figcaption>
        <h3>${title}</h3>
        <p>${description}</p>
      </figcaption>
    </figure>`;
}

export default function handler(req, res) {
  const manifest = `${BASE_URL}/manifest.json`;
  const nuvioInstallUrl = manifest.replace(/^https:\/\//, "nuvio://");
  const donateUrl = getPayPalDonateUrl(process.env.PAYPAL_DONATE_URL);
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#15151a" media="(prefers-color-scheme: dark)">
  <meta name="description" content="Discover current, upcoming, and recently aired anime with Anime Releases for Nuvio.">
  <title>Nuvio Addon · Anime Releases</title>
  <style>
    :root {
      color-scheme: light dark;
      --color-background: #ffffff;
      --color-surface: #ffffff;
      --color-text: #17171c;
      --color-muted: #666675;
      --color-border: #e7e7ed;
      --color-accent: #6538d6;
      --color-accent-hover: #5128bd;
      --color-accent-soft: #f2edff;
      --color-button-text: #ffffff;
      --content-width: 1080px;
      --page-gutter: clamp(22px, 5vw, 64px);
      --section-space: clamp(76px, 11vw, 132px);
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --color-background: #15151a;
        --color-surface: #1c1c23;
        --color-text: #f3f3f7;
        --color-muted: #a4a4b2;
        --color-border: #33333d;
        --color-accent: #a88aff;
        --color-accent-hover: #bea8ff;
        --color-accent-soft: #2a223d;
        --color-button-text: #17121f;
      }
    }

    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; scroll-padding-top: 92px; }
    body {
      margin: 0;
      background: var(--color-background);
      color: var(--color-text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 16px;
      line-height: 1.65;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    a { color: inherit; }
    a:focus-visible, summary:focus-visible {
      outline: 3px solid var(--color-accent);
      outline-offset: 4px;
      border-radius: 4px;
    }
    .container { width: min(var(--content-width), calc(100% - var(--page-gutter) * 2)); margin-inline: auto; }
    .site-header { border-bottom: 1px solid var(--color-border); }
    .header-inner {
      min-height: 84px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 28px;
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 11px;
      text-decoration: none;
      font-size: 1.12rem;
      font-weight: 650;
      letter-spacing: -0.035em;
      white-space: nowrap;
    }
    .brand-mark { width: 30px; height: 30px; color: var(--color-accent); flex: 0 0 auto; }
    .desktop-nav { display: flex; align-items: center; gap: clamp(18px, 3vw, 38px); }
    .desktop-nav a, .mobile-nav a {
      color: var(--color-muted);
      text-decoration: none;
      font-size: .92rem;
      font-weight: 520;
      transition: color .16s ease;
    }
    .desktop-nav a:hover, .mobile-nav a:hover, .footer-links a:hover { color: var(--color-accent); }
    .desktop-nav .github-link { color: var(--color-text); }
    .mobile-menu { display: none; position: relative; }
    .mobile-menu summary {
      list-style: none;
      cursor: pointer;
      color: var(--color-text);
      font-size: .92rem;
      font-weight: 550;
      padding: 8px 0 8px 12px;
    }
    .mobile-menu summary::-webkit-details-marker { display: none; }
    .mobile-menu nav {
      position: absolute;
      z-index: 2;
      right: 0;
      top: calc(100% + 14px);
      min-width: 190px;
      display: grid;
      gap: 4px;
      padding: 12px;
      border: 1px solid var(--color-border);
      border-radius: 12px;
      background: var(--color-surface);
      box-shadow: 0 12px 32px rgb(0 0 0 / .12);
    }
    .mobile-menu nav a { padding: 9px 10px; }
    .hero {
      min-height: 470px;
      display: grid;
      place-items: center;
      text-align: center;
      padding-block: clamp(94px, 13vw, 150px) clamp(84px, 10vw, 112px);
    }
    .hero-content { max-width: 760px; }
    .hero h1 {
      margin: 0;
      font-size: clamp(2.8rem, 7.2vw, 5.25rem);
      line-height: 1.08;
      letter-spacing: -.065em;
      font-weight: 720;
    }
    .hero h1 span { color: var(--color-accent); }
    .hero-copy {
      margin: 20px auto 0;
      color: var(--color-muted);
      font-size: clamp(1.08rem, 2.3vw, 1.35rem);
      letter-spacing: -.018em;
    }
    .hero-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-top: 34px; }
    .button {
      min-height: 50px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 12px 23px;
      border: 1px solid transparent;
      border-radius: 9px;
      background: var(--color-accent);
      color: var(--color-button-text);
      font: inherit;
      font-size: .96rem;
      font-weight: 620;
      text-decoration: none;
      transition: background-color .16s ease, border-color .16s ease, transform .16s ease;
    }
    .button:hover { background: var(--color-accent-hover); }
    .button:active { transform: translateY(1px); }
    .button-secondary {
      border-color: var(--color-border);
      background: transparent;
      color: var(--color-text);
    }
    .button-secondary:hover { border-color: var(--color-accent); background: var(--color-accent-soft); }
    .button-icon { width: 18px; height: 18px; }
    .features {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      padding-block: 26px;
      border-top: 1px solid var(--color-border);
      border-bottom: 1px solid var(--color-border);
    }
    .feature {
      display: flex;
      align-items: center;
      gap: 17px;
      padding: 12px clamp(12px, 2.7vw, 34px);
    }
    .feature + .feature { border-left: 1px solid var(--color-border); }
    .feature-icon { width: 29px; height: 29px; color: var(--color-accent); flex: 0 0 auto; }
    .feature h2 { margin: 0; font-size: 1rem; font-weight: 640; letter-spacing: -.025em; }
    .feature p { margin: 2px 0 0; color: var(--color-muted); font-size: .88rem; line-height: 1.5; }
    .section { padding-top: var(--section-space); }
    .section-heading { margin-bottom: 30px; }
    .section-heading h2 { margin: 0; font-size: clamp(1.65rem, 3vw, 2.05rem); line-height: 1.2; letter-spacing: -.045em; font-weight: 680; }
    .section-heading p { margin: 9px 0 0; color: var(--color-muted); max-width: 620px; }
    .catalog-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 52px; margin: 0; padding: 0; list-style: none; }
    .catalog-item { min-width: 0; display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 20px 0; border-top: 1px solid var(--color-border); }
    .catalog-copy h3, .sample h3 { margin: 0; font-size: .98rem; line-height: 1.4; font-weight: 620; letter-spacing: -.018em; }
    .catalog-copy p, .sample p { margin: 4px 0 0; color: var(--color-muted); font-size: .86rem; line-height: 1.5; }
    .catalog-link { flex: 0 0 auto; color: var(--color-accent); font-size: .84rem; font-weight: 600; text-decoration: none; white-space: nowrap; }
    .catalog-link:hover { text-decoration: underline; text-underline-offset: 3px; }
    .samples { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; }
    .sample { min-width: 0; margin: 0; }
    .sample img { display: block; width: 100%; height: auto; border: 1px solid var(--color-border); border-radius: 10px; background: var(--color-surface); }
    .sample figcaption { padding-top: 13px; }
    .about-copy { max-width: 690px; color: var(--color-muted); font-size: 1rem; }
    .release-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 18px; padding: 23px 0; border-top: 1px solid var(--color-border); border-bottom: 1px solid var(--color-border); }
    .release-version { font-weight: 620; letter-spacing: -.02em; }
    .release-version span { display: block; color: var(--color-muted); font-size: .86rem; font-weight: 400; }
    .text-link { color: var(--color-accent); font-size: .9rem; font-weight: 600; text-decoration: none; }
    .text-link:hover { text-decoration: underline; text-underline-offset: 3px; }
    .site-footer { margin-top: var(--section-space); border-top: 1px solid var(--color-border); }
    .footer-inner { min-height: 112px; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding-block: 25px; }
    .footer-brand { font-weight: 640; letter-spacing: -.025em; }
    .footer-copy { margin: 3px 0 0; color: var(--color-muted); font-size: .86rem; }
    .footer-links { display: flex; flex-wrap: wrap; gap: 24px; }
    .footer-links a { color: var(--color-muted); font-size: .9rem; text-decoration: none; transition: color .16s ease; }
    .manual-install { margin-top: 22px; color: var(--color-muted); font-size: .9rem; }
    .manifest-url { display: inline-block; margin-left: 5px; color: var(--color-accent); overflow-wrap: anywhere; }
    @media (max-width: 760px) {
      .header-inner { min-height: 72px; }
      .desktop-nav { display: none; }
      .mobile-menu { display: block; }
      .hero { min-height: 0; padding-block: 100px 88px; }
      .features { grid-template-columns: 1fr; padding-block: 8px; }
      .feature { padding: 19px 4px; }
      .feature + .feature { border-left: 0; border-top: 1px solid var(--color-border); }
      .catalog-list { grid-template-columns: 1fr; }
      .samples { grid-template-columns: 1fr; gap: 28px; }
      .sample img { max-width: 560px; }
      .footer-inner { align-items: flex-start; flex-direction: column; justify-content: center; }
    }
    @media (max-width: 430px) {
      .hero { padding-block: 82px 72px; }
      .hero-actions { flex-direction: column; align-items: stretch; }
      .button { width: 100%; }
      .catalog-item { align-items: flex-start; flex-direction: column; gap: 9px; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; }
    }
  </style>
</head>
<body>
  <header class="site-header">
    <div class="container header-inner">
      <a class="brand" href="#home" aria-label="Nuvio Addon home">
        <svg class="brand-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path d="M16 3 28 9.5 16 16 4 9.5 16 3Z" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
          <path d="m4 16 12 6.5L28 16M4 22.5 16 29l12-6.5" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
        </svg>
        <span>Nuvio Addon</span>
      </a>
      <nav class="desktop-nav" aria-label="Main navigation">
        <a href="#home">Home</a>
        <a href="#features">Features</a>
        <a href="#catalogs">Catalogs</a>
        <a href="#releases">Releases</a>
        <a class="github-link" href="${GITHUB_URL}" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
      </nav>
      <details class="mobile-menu">
        <summary aria-label="Open navigation menu">Menu</summary>
        <nav class="mobile-nav" aria-label="Mobile navigation">
          <a href="#home">Home</a>
          <a href="#features">Features</a>
          <a href="#catalogs">Catalogs</a>
          <a href="#releases">Releases</a>
          <a href="${GITHUB_URL}" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
        </nav>
      </details>
    </div>
  </header>

  <main>
    <section class="container hero" id="home" aria-labelledby="hero-title">
      <div class="hero-content">
        <h1 id="hero-title">Nuvio <span>Addon</span></h1>
        <p class="hero-copy">An anime releases addon for Nuvio.</p>
        <div class="hero-actions">
          <a class="button" href="${nuvioInstallUrl}">
            <svg class="button-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M14 3h7v7M10 14 21 3M19 13v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h7"/>
            </svg>
            Install on Nuvio
          </a>
          <a class="button button-secondary" href="#features">View Details</a>
        </div>
        <p class="manual-install">Use the manifest URL below as a manual installation fallback if the app does not open automatically. <a class="manifest-url" href="${manifest}">${manifest}</a></p>
      </div>
    </section>

    <section class="container features" id="features" aria-label="Addon features">
      <article class="feature">
        <svg class="feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="4.5" width="18" height="17" rx="2"/><path d="M16 2.5v4M8 2.5v4M3 9.5h18M8 13h2M14 13h2M8 17h2"/>
        </svg>
        <div><h2>New Releases</h2><p>Keep up with the latest anime.</p></div>
      </article>
      <article class="feature">
        <svg class="feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>
        </svg>
        <div><h2>Multiple Catalogs</h2><p>Browse different collections.</p></div>
      </article>
      <article class="feature">
        <svg class="feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m13 2-3 9H4l7 11 3-9h6L13 2Z"/>
        </svg>
        <div><h2>Regular Updates</h2><p>Improved and maintained.</p></div>
      </article>
    </section>

    <section class="container section" id="catalogs" aria-labelledby="catalogs-title">
      <div class="section-heading">
        <h2 id="catalogs-title">Explore the catalogs</h2>
        <p>Find anime by season or browse recent and upcoming releases.</p>
      </div>
      <ul class="catalog-list">
        ${CATALOGS.map(renderCatalog).join("")}
      </ul>
    </section>

    <section class="container section" aria-labelledby="samples-title">
      <div class="section-heading">
        <h2 id="samples-title">A look inside Nuvio</h2>
        <p>A few examples of how the catalogs appear in the app.</p>
      </div>
      <div class="samples">
        ${SAMPLE_IMAGES.map(renderSample).join("")}
      </div>
    </section>

    <section class="container section" aria-labelledby="about-title">
      <div class="section-heading">
        <h2 id="about-title">About the addon</h2>
      </div>
      <p class="about-copy">Anime Releases brings together useful anime discovery catalogs in one convenient Nuvio addon. Browse seasonal collections and keep up with recent and upcoming releases.</p>
    </section>

    <section class="container section" id="releases" aria-labelledby="releases-title">
      <div class="section-heading">
        <h2 id="releases-title">Releases</h2>
        <p>Follow improvements and updates to the addon.</p>
      </div>
      <div class="release-row">
        <div class="release-version">Version v${ADDON_VERSION}<span>Current addon build</span></div>
        <a class="text-link" href="${RELEASES_URL}" target="_blank" rel="noopener noreferrer">View release history ↗</a>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <div class="container footer-inner">
      <div>
        <div class="footer-brand">Nuvio Addon</div>
        <p class="footer-copy">An anime releases addon for Nuvio.</p>
      </div>
      <nav class="footer-links" aria-label="Footer links">
        ${donateUrl ? `<a href="${donateUrl}" target="_blank" rel="noopener noreferrer">Support / Donate</a>` : ""}
        <a href="${GITHUB_URL}" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
      </nav>
    </div>
  </footer>
</body>
</html>`;

  res.status(200);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=1800");
  return res.send(html);
}
