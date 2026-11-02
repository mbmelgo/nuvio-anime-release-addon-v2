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

test("homepage uses the approved minimalist structure and navigation", () => {
  const html = renderHome();
  for (const value of [
    'id="home"',
    'href="#features"',
    'href="#catalogs"',
    'href="#releases"',
    "Nuvio Addon",
    "An anime releases addon for Nuvio.",
    "Install on Nuvio",
    "View Details",
    'id="features"',
    'id="catalogs"',
    'id="releases"',
    "New Releases",
    "Multiple Catalogs",
    "Regular Updates",
    "GitHub",
  ]) {
    assert.ok(html.includes(value), `Expected homepage to include: ${value}`);
  }
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

test("homepage keeps product copy generic and excludes implementation details", () => {
  const html = renderHome();
  assert.match(html, /Discover anime releases/);
  assert.doesNotMatch(html, /AniList|ARM mapping|identity mapping|provider identity|TMDB|TVDB|IMDb|metadata addon|airing schedules/i);
});

test("homepage renders only validated PayPal donation URLs", () => {
  const safe = renderHome("https://www.paypal.me/example");
  assert.match(safe, /href="https:\/\/www\.paypal\.me\/example"/);
  assert.match(safe, /target="_blank" rel="noopener noreferrer"/);
  assert.match(safe, /Support \/ Donate/);

  const unsafe = renderHome('https://attacker.example/" onmouseover="alert(1)');
  assert.doesNotMatch(unsafe, /Donate via PayPal|onmouseover/);
});
