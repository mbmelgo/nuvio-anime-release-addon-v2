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

test("home page presents generic product information without implementation details", () => {
  const html = renderHome();
  assert.doesNotMatch(html, /github\.com|>GitHub<|>Releases</);
  assert.doesNotMatch(html, /AniList|ARM mapping|identity mapping|provider identity|TMDB|TVDB|IMDb|metadata addon|airing schedules/i);
  assert.match(html, /Discover anime releases with convenient catalogs/);
  assert.match(html, /Explore seasonal anime and movie collections/);
  assert.match(html, /Install in Nuvio/);
});

test("install action opens Nuvio with the addon manifest and retains a browser fallback", () => {
  const html = renderHome();
  assert.match(html, /href="nuvio:\/\/nuvio-anime-release-addon-v2\.vercel\.app\/manifest\.json">Install in Nuvio</);
  assert.match(html, /https:\/\/nuvio-anime-release-addon-v2\.vercel\.app\/manifest\.json/);
  assert.match(html, /If the app does not open automatically/);
});

test("home page renders a configured PayPal donation link securely", () => {
  const html = renderHome("https://www.paypal.me/MarkVincentMelgo");
  assert.match(html, /href="https:\/\/www\.paypal\.me\/MarkVincentMelgo"/);
  assert.match(html, /target="_blank" rel="noopener noreferrer">Donate via PayPal</);
  assert.match(html, /Install in Nuvio/);
});

test("home page suppresses unsafe or non-PayPal donation URLs", () => {
  const html = renderHome('https://attacker.example/" onmouseover="alert(1)');
  assert.doesNotMatch(html, /Donate via PayPal|onmouseover/);
});
