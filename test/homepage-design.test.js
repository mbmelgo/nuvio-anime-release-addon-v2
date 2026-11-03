import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import handler from "../api/home-selector.js";

function render(donate) {
  const previous = process.env.PAYPAL_DONATE_URL;
  if (donate === undefined) delete process.env.PAYPAL_DONATE_URL;
  else process.env.PAYPAL_DONATE_URL = donate;
  let html = "";
  const res = { status() { return this; }, setHeader() {}, send(value) { html = value; return value; } };
  try { handler({}, res); return html; }
  finally { if (previous === undefined) delete process.env.PAYPAL_DONATE_URL; else process.env.PAYPAL_DONATE_URL = previous; }
}

test("AniBloom homepage follows approved brand and content structure", () => {
  const html = render();
  for (const text of ["AniBloom — Anime Discovery for Nuvio", "Discover anime.<br>Every season.", "Anime discovery catalogs, organized for Nuvio.", "Seasonal discovery", "Airing now &amp; next", "One-click installation", "Explore catalogs", "What AniBloom is", "What AniBloom is not", "Support the addon", "Where anime blooms.", "Open Source"]) assert.ok(html.includes(text), text);
  assert.match(html, /href="\/assets\/anibloom\.css"/);
  assert.doesNotMatch(html, /AniList|ARM mapping|identity mapping|TMDB|TVDB|IMDb/i);
});

test("homepage Open Source footer points to the canonical organization repository", () => {
  const html = render();
  assert.match(html, /<a href="https:\/\/github\.com\/AniBloomHQ\/AniBloom" target="_blank" rel="noopener noreferrer">◉ &nbsp; Open Source<\/a>/);
  assert.doesNotMatch(html, /github\.com\/mbmelgo\/AniBloom/i);
});

test("stylesheet keeps monochrome palette, responsive layout and accessibility", async () => {
  const css = await readFile(new URL("../assets/anibloom.css", import.meta.url), "utf8");
  for (const token of ["#090b0d", "#ff79b9", "#f3a6cf", "#b65bea", "prefers-reduced-motion", ":focus-visible", "@media(max-width:700px)"]) assert.ok(css.includes(token), token);
});

test("all eight catalogs render in one uncategorized grid with original endpoints", () => {
  const html = render();
  const labels = [...html.matchAll(/<strong>([^<]+)<\/strong>/g)].map(([, label]) => label);
  assert.deepEqual(labels, [
    "Upcoming 3 days", "Previous 3 days", "Current Season", "Current Season Movies",
    "Previous Season", "Previous Season Movies", "Upcoming Season", "Upcoming Season Movies",
  ]);
  const ids = ["upcoming_3_days", "current_season", "previous_season", "upcoming_season", "previous_3_days", "current_season_movies", "previous_season_movies", "upcoming_season_movies"];
  for (const id of ids) assert.ok(html.includes("/" + id + ".json"), id);
  assert.equal((html.match(/class="catalog-card"/g) || []).length, 8);
  assert.equal((html.match(/class="catalog-grid"/g) || []).length, 1);
  assert.doesNotMatch(html, /catalog-column|Anime series|Recent releases &amp; movies/);
});
test("catalog iconography distinguishes rolling windows, seasons and movies", () => {
  const html = render();
  for (const icon of ["calendar-clock", "sun", "calendar-check", "calendar-arrow-up", "history", "film", "film-check", "film-up"]) {
    assert.ok(html.includes('data-icon="' + icon + '"'), icon);
  }
});

test("mobile navigation uses an accessible hamburger icon instead of visible Menu text", async () => {
  const html = render();
  assert.match(html, /<details class="mobile-menu"><summary aria-label="Open navigation menu"><span class="menu-icon" aria-hidden="true"><span><\/span><\/span><\/summary>/);
  assert.doesNotMatch(html, /<summary[^>]*>\s*Menu\s*<\/summary>/);
  const css = await readFile(new URL("../assets/anibloom.css", import.meta.url), "utf8");
  assert.match(css, /\.menu-icon::before/);
  assert.match(css, /\.menu-icon::after/);
  assert.match(css, /\.menu-icon span/);
});

test("previous three days and airing now icons use complete in-bounds SVG paths", () => {
  const html = render();
  assert.match(html, /data-icon="history"[^>]*>[\s\S]*?<svg viewBox="0 0 48 48"[^>]*>[\s\S]*?<path d="M7 7v10h10"\/><path d="M7 17a17 17 0 1 1 2 15"\/><path d="M24 14v10l7 5"\/>[\s\S]*?<\/svg>/);
  assert.doesNotMatch(html, /<text[^>]*>3D<\/text>/);
  assert.match(html, /<span class="feature-icon" data-icon="radio"><svg viewBox="0 0 48 48"[^>]*><path d="M14 10Q2 24 14 38M34 10Q46 24 34 38M20 17Q13 24 20 31M28 17Q35 24 28 31"\/><circle cx="24" cy="38" r="3"[^>]*\/><\/svg>/);
});

test("Nuvio deep links and HTTPS manifest fallback are preserved", () => {
  const html = render();
  assert.match(html, /nuvio:\/\/anibloom\.vercel\.app\/manifest\.json/);
  assert.match(html, /https:\/\/anibloom\.vercel\.app\/manifest\.json/);
  assert.match(html, /Manual installation:/);
});

test("support CTA always uses the canonical Buy Me a Coffee destination", async () => {
  const html = render("https://www.paypal.me/legacy");
  assert.match(html, /href="https:\/\/buymeacoffee\.com\/mark475" target="_blank" rel="noopener noreferrer">Support development<\/a>/);
  assert.doesNotMatch(html, /paypal\.me|paypal\.com/i);
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  assert.match(readme, /\[Support the addon\]\(https:\/\/buymeacoffee\.com\/mark475\)/);
  assert.doesNotMatch(html, /buymeacoffee\.com\/melgom475/i);
  assert.doesNotMatch(readme, /buymeacoffee\.com\/melgom475|paypal\.me|paypal\.com/i);
});

test("desktop and mobile section navigation tracks the visible page section", () => {
  const html = render();
  for (const id of ["home", "catalogs", "about"]) assert.ok(html.includes('data-section-link="' + id + '"'), id + " navigation link");
  assert.match(html, /getBoundingClientRect/);
  assert.match(html, /addEventListener\("scroll"/);
  assert.match(html, /aria-current/);
});

test("hero artwork fills the right viewport edge and shares the copy's bottom boundary", async () => {
  const html = render();
  assert.match(html, /anibloom-anime-hero-artwork\.webp/);
  assert.match(html, /<div class="container hero-grid"><div class="hero-copy">[\s\S]*?<\/div><\/div><div class="hero-art">/);
  const css = await readFile(new URL("../assets/anibloom.css", import.meta.url), "utf8");
  assert.match(css, /\.hero-art\{[^}]*position:absolute[^}]*top:0[^}]*right:0[^}]*bottom:0/);
  assert.match(css, /\.hero-art img\{[^}]*width:100%[^}]*height:100%[^}]*object-fit:cover/);
  assert.match(css, /@media\(max-width:700px\)[\s\S]*?\.hero-art\{[^}]*position:relative/);
});

test("About section presents AniBloom identity with readable dark-theme typography", async () => {
  const html = render();
  assert.match(html, /<section class="about-section(?: section-reveal)?" id="about">[\s\S]*?<h2>What AniBloom is<\/h2>/);
  assert.match(html, /<h2>What AniBloom is not<\/h2>/);
  const css = await readFile(new URL("../assets/anibloom.css", import.meta.url), "utf8");
  assert.match(css, /\.about-section\{[^}]*background:var\(--midnight\)/);
  assert.match(css, /\.about-copy\{[^}]*color:#b9bbc1/);
});
test("section navigation recalculates the active section from scroll position", () => {
  const html = render();
  assert.match(html, /addEventListener\("scroll"/);
  assert.match(html, /getBoundingClientRect\(\)\.top/);
  assert.match(html, /aria-current/);
  assert.match(html, /new IntersectionObserver/);
});

test("About section explains what AniBloom is and is not in a two-column disclosure layout", async () => {
  const html = render();
  assert.match(html, /<section class="about-section(?: section-reveal)?" id="about">[\s\S]*?<h2>What AniBloom is<\/h2>/);
  assert.match(html, /<h2>What AniBloom is not<\/h2>/);
  for (const phrase of [
    "catalog-only Nuvio addon",
    "upcoming episodes",
    "recently aired episodes",
    "seasonal movies",
    "does not host, store, stream, or distribute anime",
    "does not provide metadata",
    "descriptions, artwork, or episode information",
    "compatible metadata provider"
  ]) assert.ok(html.includes(phrase), phrase);
  const css = await readFile(new URL("../assets/anibloom.css", import.meta.url), "utf8");
  assert.match(css, /\.about-grid\{[^}]*grid-template-columns:.*\}/);
  assert.match(css, /@media\(max-width:700px\)[\s\S]*?\.about-grid\{[^}]*grid-template-columns:1fr/);
});

test("About contains only identity details and support, without a duplicate install CTA", () => {
  const html = render("https://www.paypal.me/example");
  const about = html.match(/<section class="about-section(?: section-reveal)?" id="about">([\s\S]*?)<\/main>/)?.[1] || "";
  assert.match(about, /What AniBloom is/);
  assert.match(about, /What AniBloom is not/);
  assert.match(about, /id="support"/);
  assert.match(about, /Support the addon/);
  assert.match(about, /Support development/);
  assert.doesNotMatch(html, /class="final-cta"|Add AniBloom to Nuvio\./);
  assert.equal((html.match(/class="donation-section(?: reveal-on-scroll)?"/g) || []).length, 1);
  assert.doesNotMatch(html, /footer[^]*Donate/);
});
