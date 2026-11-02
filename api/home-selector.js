import { BASE_URL, REPOSITORY_URL } from "./config.js";

const CATALOGS = [
  ["Upcoming 3 days", "upcoming_3_days", "Anime with new episodes airing in the next 3 days."],
  ["Previous 3 days", "previous_3_days", "Anime that aired in the last 3 days."],
  ["Current Season", "current_season", "Anime in the current season."],
  ["Current Season Movies", "current_season_movies", "Movies from the current season."],
  ["Previous Season", "previous_season", "Anime from the recently ended season."],
  ["Previous Season Movies", "previous_season_movies", "Movies from the recently ended season."],
  ["Upcoming Season", "upcoming_season", "Anime from the next upcoming season."],
  ["Upcoming Season Movies", "upcoming_season_movies", "Movies from the next upcoming season."]
];

function safeDonationUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    const hosts = ["paypal.me", "www.paypal.me", "paypal.com", "www.paypal.com"];
    if (url.protocol !== "https:" || !hosts.includes(url.hostname) || url.username || url.password) return "";
    return url.href.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  } catch { return ""; }
}

function icon(id) {
  const paths = {
    upcoming_3_days: '<rect x="7" y="10" width="27" height="29" rx="4"/><path d="M14 6v9M27 6v9M8 19h25"/><circle cx="33" cy="31" r="10" fill="#fce5ef" stroke="currentColor" stroke-width="2.5"/><path d="M33 25v6l4 2"/>',
    current_season: '<circle cx="24" cy="24" r="8"/><path d="M24 5v6M24 37v6M5 24h6M37 24h6M10.6 10.6l4.2 4.2m18.4 18.4 4.2 4.2m0-26.8-4.2 4.2M14.8 33.2l-4.2 4.2"/>',
    previous_season: '<rect x="7" y="9" width="34" height="32" rx="4"/><path d="M15 5v9M33 5v9M8 18h32"/><path d="m17 29 5 5 10-11"/>',
    upcoming_season: '<rect x="7" y="10" width="34" height="31" rx="4"/><path d="M15 6v9M33 6v9M8 19h32M24 35V24m-5 5 5-5 5 5"/>',
    previous_3_days: '<path d="M7 7v10h10"/><path d="M7 17a17 17 0 1 1 2 15"/><path d="M24 14v10l7 5"/>',
    current_season_movies: '<rect x="5" y="9" width="38" height="30" rx="4"/><path d="M13 9v30M35 9v30M5 17h8m-8 14h8m22-14h8m-8 14h8"/>',
    previous_season_movies: '<rect x="5" y="9" width="38" height="30" rx="4"/><path d="M13 9v30M35 9v30M5 17h8m-8 14h8m22-14h8m-8 14h8"/><circle cx="35" cy="32" r="10" fill="#fce5ef" stroke="currentColor" stroke-width="2.5"/><path d="m30 32 3 3 6-7"/>',
    upcoming_season_movies: '<rect x="5" y="9" width="38" height="30" rx="4"/><path d="M13 9v30M35 9v30M5 17h8m-8 14h8m22-14h8m-8 14h8"/><circle cx="35" cy="32" r="10" fill="#fce5ef" stroke="currentColor" stroke-width="2.5"/><path d="M35 37V27m-4 4 4-4 4 4"/>'
  };
  return '<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' + paths[id] + '</svg>';
}

function iconName(id) {
  const names = {
    upcoming_3_days: "calendar-clock",
    current_season: "sun",
    previous_season: "calendar-check",
    upcoming_season: "calendar-arrow-up",
    previous_3_days: "history",
    current_season_movies: "film",
    previous_season_movies: "film-check",
    upcoming_season_movies: "film-up"
  };
  return names[id] || "calendar";
}
function card(item) {
  const [name, id, description] = item;
  const type = id.endsWith("_movies") ? "movie" : "series";
  const url = `${BASE_URL}/catalog/${type}/${id}.json`;
  return '<a class="catalog-card" href="' + url + '" aria-label="Open ' + name + ' catalog"><span class="catalog-icon" data-icon="' + iconName(id) + '" aria-hidden="true">' + icon(id) + '</span><span class="catalog-copy"><strong>' + name + '</strong><span>' + description + '</span></span><svg class="catalog-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-7-7 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>';
}

function featureIcon(kind) {
  const paths = {
    layers: '<path d="m24 5 18 10-18 10L6 15 24 5Z"/><path d="m6 23 18 10 18-10M6 31l18 10 18-10"/>',
    radio: '<path d="M14 10Q2 24 14 38M34 10Q46 24 34 38M20 17Q13 24 20 31M28 17Q35 24 28 31"/><circle cx="24" cy="38" r="3" fill="currentColor" stroke="none"/>',
    bolt: '<path d="m27 3-19 24h14l-2 18 20-26H26l1-16Z" fill="currentColor" stroke="none"/>'
  };
  return '<svg viewBox="0 0 48 48" aria-hidden="true">' + paths[kind] + '</svg>';
}

export default function handler(req, res) {
  const manifest = BASE_URL + "/manifest.json";
  const install = manifest.replace("https://", "nuvio://");
  const donate = safeDonationUrl(process.env.PAYPAL_DONATE_URL) || "https://paypal.me/AniBloom";
  const html = [
    '<!doctype html><html lang="en"><head>',
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="dark light"><meta name="theme-color" content="#090B0D">',
    '<meta name="description" content="Anime discovery catalogs, organized for Nuvio. Discover upcoming seasons, current releases, and recently aired anime through focused catalogs.">',
    '<title>AniBloom — Anime Discovery for Nuvio</title><link rel="stylesheet" href="/assets/anibloom.css"></head><body>',
    '<header class="site-header"><div class="container header-inner">',
    '<a class="brand" href="#home" aria-label="AniBloom home"><img src="/assets/anibloom-icon.png" width="43" height="43" alt=""><span class="brand-name">AniBloom</span><span class="brand-tagline">Anime Discovery for Nuvio</span></a>',
    '<nav class="desktop-nav" aria-label="Main navigation"><a class="active" href="#home" data-section-link="home" aria-current="location">Overview</a><a href="#catalogs" data-section-link="catalogs">Catalogs</a><a href="#about" data-section-link="about">About</a></nav>',
    '<a class="install-button header-install" href="' + install + '"><span aria-hidden="true">↓</span> Add to Nuvio</a>',
    '<details class="mobile-menu"><summary aria-label="Open navigation menu"><span class="menu-icon" aria-hidden="true"><span></span></span></summary><nav aria-label="Mobile navigation"><a class="active" href="#home" data-section-link="home" aria-current="location">Overview</a><a href="#catalogs" data-section-link="catalogs">Catalogs</a><a href="#about" data-section-link="about">About</a><a href="' + install + '">Add to Nuvio</a></nav></details>',
    '</div></header><main>',
    '<section class="hero-section" id="home"><div class="hero-stage"><div class="container hero-grid"><div class="hero-copy">',
    '<h1>Discover anime.<br>Every season.</h1><p class="hero-lead">Anime discovery catalogs, organized for Nuvio.</p>',
    '<p class="hero-description">Find upcoming seasons, current releases, and recently aired anime through focused catalogs built for a better Nuvio experience.</p>',
    '<div class="hero-actions"><a class="install-button" href="' + install + '">↓ &nbsp; Add to Nuvio</a><a class="outline-button" href="#catalogs">Explore catalogs →</a></div>',
    '<p class="metadata-provider-note">Catalogs only. Use a separate metadata provider in Nuvio<br>(e.g., ioametadata, Xperience, BingeCat, or other compatible providers).</p>',
    '<p class="manual-install">Manual installation: <a href="' + manifest + '">' + manifest + '</a></p></div></div>',
    '<div class="hero-art"><img src="/assets/anibloom-anime-hero-artwork.webp" width="1024" height="683" alt="Anime-inspired Nuvio discovery interface on a tablet and phone, framed by cherry blossoms" fetchpriority="high"></div></div>',
    '<div class="container features"><article class="feature"><span class="feature-icon">' + featureIcon("layers") + '</span><div><h2>Seasonal discovery</h2><p>Browse anime by season, including upcoming, current, and previous releases.</p></div></article>',
    '<article class="feature"><span class="feature-icon" data-icon="radio">' + featureIcon("radio") + '</span><div><h2>Airing now &amp; next</h2><p>Follow what is airing now and what is coming up next.</p></div></article>',
    '<article class="feature"><span class="feature-icon">' + featureIcon("bolt") + '</span><div><h2>One-click installation</h2><p>Add the addon to Nuvio with a single tap or use the manifest URL.</p></div></article></div></section>',
    '<section class="catalog-section" id="catalogs"><div class="container"><div class="section-heading"><h2>Explore catalogs</h2><p>Eight focused catalogs to help you discover and follow anime releases in Nuvio.</p></div>',
    '<div class="catalog-grid">' + CATALOGS.map((item) => card(item)).join("") + '</div>',
    '',
    '</div></section><section class="about-section" id="about"><div class="container"><div class="about-grid"><div class="about-label"><span class="about-kicker">About AniBloom</span><h2>What AniBloom is</h2></div><div class="about-copy"><p>AniBloom is a catalog-only Nuvio addon for discovering anime. It organizes titles into focused catalogs for upcoming episodes, recently aired episodes, and current, previous, and upcoming seasons—including seasonal movies.</p><p>It helps you find what to watch. Nuvio and your separately installed providers handle the metadata and playback experience.</p></div><div class="about-label about-label-secondary"><h2>What AniBloom is not</h2></div><div class="about-copy"><p>AniBloom is not a streaming service, media host, or metadata provider. It does not host, store, stream, or distribute anime, and it does not provide metadata such as descriptions, artwork, or episode information.</p><p>To see detailed titles and artwork in Nuvio, use a compatible metadata provider alongside AniBloom.</p></div></div><section class="donation-section" id="support" aria-labelledby="support-heading"><div><h2 id="support-heading">Support the addon</h2><p>Your support helps keep AniBloom maintained.</p></div>' + (donate ? '<a class="button donation-button" href="' + donate + '" target="_blank" rel="noopener noreferrer">Support development</a>' : '') + '</section></div></section></main>',
    '<footer class="site-footer">',
    '<div class="container footer-inner"><div><div class="footer-brand"><img src="/assets/anibloom-icon.png" width="40" height="40" alt="">AniBloom</div><p class="footer-subtitle">Anime Discovery for Nuvio · Where anime blooms.</p></div>',
    '<nav class="footer-links" aria-label="Footer links"><a href="' + REPOSITORY_URL + '" target="_blank" rel="noopener noreferrer">◉ &nbsp; Open Source</a>',
    '</nav></div></footer>',
    '<script>(function(){const links=Array.from(document.querySelectorAll("[data-section-link]"));const sections=links.map(link=>document.getElementById(link.dataset.sectionLink)).filter(Boolean);const header=document.querySelector(".site-header");const revealItems=Array.from(document.querySelectorAll(".feature,.catalog-card,.about-label,.about-copy,.donation-section"));if(!links.length||!sections.length)return;const setActive=id=>links.forEach(link=>{const active=link.dataset.sectionLink===id;link.classList.toggle("active",active);if(active)link.setAttribute("aria-current","location");else link.removeAttribute("aria-current");});const updateActive=()=>{header?.classList.toggle("is-floating",window.scrollY>24);const marker=Math.min(window.innerHeight*0.35,260);let current=sections[0];for(const section of sections){if(section.getBoundingClientRect().top<=marker)current=section;else break;}setActive(current.id);header?.classList.toggle("is-floating",window.scrollY>24);};const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add("is-visible");observer.unobserve(entry.target);}}),{threshold:.08,rootMargin:"0px 0px -12%"});revealItems.forEach(item=>{item.classList.add("reveal-on-scroll");observer.observe(item);});links.forEach(link=>link.addEventListener("click",()=>setActive(link.dataset.sectionLink)));window.addEventListener("scroll",updateActive,{passive:true});window.addEventListener("resize",updateActive);window.addEventListener("hashchange",updateActive);updateActive();})();</script></body></html>'
  ].join("");
  res.status(200);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=1800");
  return res.send(html);
}
