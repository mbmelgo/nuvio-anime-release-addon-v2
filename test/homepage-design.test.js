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

test("all eight original catalog IDs and endpoints remain available", () => {
  const html = render();
  const ids = ["upcoming_season", "current_season", "previous_season", "upcoming_season_movies", "current_season_movies", "previous_season_movies", "upcoming_3_days", "previous_3_days"];
  for (const id of ids) assert.ok(html.includes("/" + id + ".json"), id);
  assert.equal((html.match(/class="catalog-card"/g) || []).length, 8);
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
  for (const id of ["home", "catalogs", "about"]) {
    assert.ok(html.includes('data-section-link="' + id + '"'), id + " navigation link");
  }
  assert.match(html, /IntersectionObserver/);
  assert.match(html, /aria-current/);
  assert.match(html, /rootMargin/);
});


test("hero artwork stays within its source resolution and does not overscale", async () => {
  const html = render();
  assert.match(html, /anibloom-anime-hero-artwork\.webp/);
  const css = await readFile(new URL("../assets/anibloom.css", import.meta.url), "utf8");
  assert.match(css, /\.hero-art img\{[^}]*width:100%/);
  assert.match(css, /\.hero-art img\{[^}]*max-width:570px/);
  assert.doesNotMatch(css, /\.hero-art img\{[^}]*width:min\(112%/);\n  assert.doesNotMatch(css, /\.hero-art:before/);
});
