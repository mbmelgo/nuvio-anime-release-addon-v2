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
  for (const text of ["AniBloom — Anime Discovery for Nuvio", "Discover anime.<br>Every season.", "Anime discovery catalogs, organized for Nuvio.", "Seasonal discovery", "Airing now &amp; next", "One-click installation", "Explore catalogs", "Catalogs, not metadata", "Add AniBloom to Nuvio.", "Where anime blooms.", "Open Source"]) assert.ok(html.includes(text), text);
  assert.match(html, /href="\/assets\/anibloom\.css"/);
  assert.doesNotMatch(html, /AniList|ARM mapping|identity mapping|TMDB|TVDB|IMDb/i);
});

test("stylesheet keeps monochrome palette, responsive layout and accessibility", async () => {
  const css = await readFile(new URL("../assets/anibloom.css", import.meta.url), "utf8");
  for (const token of ["#090b0d", "#ff79b9", "#f3a6cf", "#b65bea", "prefers-reduced-motion", ":focus-visible", "@media(max-width:700px)"]) assert.ok(css.includes(token), token);
});

test("catalogs render in the requested two-column order with all original endpoints", () => {
  const html = render();
  const columns = [...html.matchAll(/<div class="catalog-column" data-column="([^"]+)">([\s\S]*?)<\/div>\s*<\/div>/g)];
  assert.equal(columns.length, 2, "two catalog columns");
  const labels = columns.map(([, , body]) => [...body.matchAll(/<strong>([^<]+)<\/strong>/g)].map(([, label]) => label));
  assert.deepEqual(labels, [
    ["Upcoming 3 days", "Current Season", "Previous Season", "Upcoming Season"],
    ["Previous 3 days", "Current Season Movies", "Previous Season Movies", "Upcoming Season Movies"],
  ]);
  const ids = ["upcoming_3_days", "current_season", "previous_season", "upcoming_season", "previous_3_days", "current_season_movies", "previous_season_movies", "upcoming_season_movies"];
  for (const id of ids) assert.ok(html.includes("/" + id + ".json"), id);
  assert.equal((html.match(/class="catalog-card"/g) || []).length, 8);
});

test("catalog iconography distinguishes rolling windows, seasons and movies", () => {
  const html = render();
  for (const icon of ["calendar-clock", "sun", "calendar-check", "calendar-arrow-up", "history", "film", "film-check", "film-up"]) {
    assert.ok(html.includes('data-icon="' + icon + '"'), icon);
  }
});

test("Nuvio deep links and HTTPS manifest fallback are preserved", () => {
  const html = render();
  assert.match(html, /nuvio:\/\/anibloom\.vercel\.app\/manifest\.json/);
  assert.match(html, /https:\/\/anibloom\.vercel\.app\/manifest\.json/);
  assert.match(html, /Manual installation:/);
});

test("PayPal donations remain optional and strictly host-validated", () => {
  assert.match(render("https://www.paypal.me/example"), />Donate<\/a>/);
  for (const unsafe of ["http://www.paypal.me/example", "https://paypal.example/attacker", "https://user:pass@paypal.me/example", "javascript:alert(1)"]) assert.doesNotMatch(render(unsafe), />Donate<\/a>/);
  assert.doesNotMatch(render(), />Donate<\/a>/);
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
  assert.match(html, /<div class="hero-grid container"><div class="hero-copy">[\s\S]*?<\/div><\/div><div class="hero-art">/);
  const css = await readFile(new URL("../assets/anibloom.css", import.meta.url), "utf8");
  assert.match(css, /\.hero-art\{[^}]*position:absolute[^}]*top:0[^}]*right:0[^}]*bottom:0/);
  assert.match(css, /\.hero-art img\{[^}]*width:100%[^}]*height:100%[^}]*object-fit:cover/);
  assert.match(css, /@media\(max-width:700px\)[\s\S]*?\.hero-art\{[^}]*position:relative/);
});

test("About notice keeps its icon and heading readable on the light surface", async () => {
  const html = render();
  assert.match(html, /<section class="about-section" id="about">[\s\S]*?<span class="info-icon"[^>]*>ⓘ<\/span><div><h3>Catalogs, not metadata<\/h3>/);
  const css = await readFile(new URL("../assets/anibloom.css", import.meta.url), "utf8");
  assert.match(css, /\.metadata-notice\{[^}]*color:var\(--ink\)/);
});

test("section navigation recalculates the active section from scroll position", () => {
  const html = render();
  assert.match(html, /addEventListener\("scroll"/);
  assert.match(html, /getBoundingClientRect\(\)\.top/);
  assert.match(html, /aria-current/);
  assert.doesNotMatch(html, /new IntersectionObserver/);
});
