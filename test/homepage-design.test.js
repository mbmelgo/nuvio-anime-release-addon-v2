import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/home-selector.js";

function renderHome(donateUrl) {
  const previous = process.env.PAYPAL_DONATE_URL;
  if (donateUrl === undefined) delete process.env.PAYPAL_DONATE_URL;
  else process.env.PAYPAL_DONATE_URL = donateUrl;

  let html = "";
  const response = {
    status() { return this; },
    setHeader() {},
    send(value) { html = value; return value; },
  };

  try {
    handler({}, response);
    return html;
  } finally {
    if (previous === undefined) delete process.env.PAYPAL_DONATE_URL;
    else process.env.PAYPAL_DONATE_URL = previous;
  }
}

test("homepage uses the approved minimalist structure and Nuvio Anime Addon branding without a releases section", () => {
  const html = renderHome();
  for (const value of [
    'id="home"',
    'href="#features"',
    'href="#about"',
    'id="about"',
    'href="#catalogs"',
    "Nuvio Anime Addon",
    "Install on Nuvio",
    "View Details",
    'id="features"',
    'id="catalogs"',
    "New Releases",
    "Multiple Catalogs",
    "Regular Updates",
    "Catalogs, not metadata",
    "ioametadata",
    "Xperience",
    "BingeCat",
  ]) {
    assert.ok(html.includes(value), `Expected homepage to include: ${value}`);
  }
  assert.doesNotMatch(html, /Nuvio Addon(?![\s\S]*Nuvio Anime Addon)/);
  assert.doesNotMatch(html, /github\.com|GitHub/i);
  assert.match(html, /\.site-header\s*\{[^}]*position:\s*sticky[^}]*top:\s*0/s);
  assert.match(html, /\.site-header\s*\{[^}]*z-index:\s*20/s);
  assert.doesNotMatch(html, /id="releases"|href="#releases"|Releases<\/a>/);
  assert.ok(html.indexOf('id="about"') < html.indexOf('id="features"'), "Addon explanation should appear before feature and catalog sections");
  assert.ok(html.indexOf('id="about"') < html.indexOf('id="catalogs"'), "Addon explanation should appear before catalog listings");
});

test("homepage follows system light and dark appearance without a theme dependency", () => {
  const html = renderHome();
  assert.match(html, /color-scheme:\s*light\s+dark/);
  assert.match(html, /prefers-color-scheme:\s*dark/);
  assert.match(html, /--color-accent:\s*#[0-9a-f]{6}/i);
  assert.match(html, /--color-background:/);
  assert.match(html, /@media\s*\(max-width:/);
});

test("homepage uses minimalist system-fallback typography without external font requests", () => {
  const html = renderHome();
  assert.match(html, /font-family:[^;}]*Inter[^;}]*system-ui/i);
  assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com|@import\s+url/i);
});

test("homepage keeps direct Nuvio installation and manual manifest fallback", () => {
  const html = renderHome();
  assert.match(html, /href="nuvio:\/\/nuvio-anime-release-addon-v2\.vercel\.app\/manifest\.json"[\s\S]*?Install on Nuvio/);
  assert.match(html, /https:\/\/nuvio-anime-release-addon-v2\.vercel\.app\/manifest\.json/);
  assert.match(html, /manual installation fallback/i);
});

test("homepage lists all supported catalogs and preserves sample screenshots", () => {
  const html = renderHome();
  for (const catalog of [
    "Upcoming Season",
    "Current Season",
    "Previous Season",
    "Upcoming Season Movies",
    "Current Season Movies",
    "Previous Season Movies",
    "Upcoming — 3 days",
    "Previous — 3 days",
  ]) assert.ok(html.includes(catalog), `Missing catalog: ${catalog}`);

  for (const image of [
    "/docs/images/readme-nuvio-home.png",
    "/docs/images/readme-nuvio-season.png",
    "/docs/images/readme-nuvio-detail.png",
  ]) assert.ok(html.includes(image), `Missing sample image: ${image}`);
});

test("homepage explains catalog-only scope and required external metadata provider", () => {
  const html = renderHome();
  assert.match(html, /Discover seasonal anime and follow what is airing now, next, and recently released/);
  assert.match(html, /catalog-only addon/i);
  assert.match(html, /not an anime metadata provider/i);
  assert.match(html, /ioametadata[\s\S]*Xperience[\s\S]*BingeCat/);
  assert.doesNotMatch(html, /AniList|ARM mapping|identity mapping|provider identity|TMDB|TVDB|IMDb|airing schedules/i);
});

test("homepage makes configured donations prominent and keeps the PayPal destination validated", () => {
  const safe = renderHome("https://www.paypal.me/example");
  assert.match(safe, /<section class="container donation-section"/);
  assert.match(safe, /Support the addon/);
  assert.match(safe, /Your support helps keep the addon maintained/);
  assert.match(safe, /class="button donation-button"[^>]*href="https:\/\/www\.paypal\.me\/example"/);
  assert.match(safe, /target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(safe, /github\.com|GitHub/i);

  const unsafe = renderHome('https://attacker.example/" onmouseover="alert(1)');
  assert.doesNotMatch(unsafe, /<section class="container donation-section"|<a class="button donation-button"|onmouseover/);
});

test("homepage omits the donation callout when no valid donation destination is configured", () => {
  assert.doesNotMatch(renderHome(), /<section class="container donation-section"/);
});
