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

test("home page uses generic product descriptions without exposing implementation details", () => {
  const html = renderHome();
  assert.doesNotMatch(html, /github\\.com|>GitHub<|>Releases</);
  assert.doesNotMatch(html, /AniList|\\bARM\\b|IMDb|TVDB|TMDB|identity|mapping|provider ID|airing schedules/i);
  assert.match(html, /Discover anime across seasonal releases, movies, and episode schedules/);
  assert.match(html, /Browse anime and movie selections organized by season/);
  assert.match(html, /Install addon/);
  assert.match(html, /Explore the addon interface through these representative Nuvio views/);
});;

test("home page renders a configured PayPal donation link securely", () => {
  const html = renderHome("https://www.paypal.me/MarkVincentMelgo");
  assert.match(html, /href="https:\/\/www\.paypal\.me\/MarkVincentMelgo"/);
  assert.match(html, /target="_blank" rel="noopener noreferrer">Donate via PayPal</);
  assert.match(html, /Install addon/);
});

test("home page suppresses unsafe or non-PayPal donation URLs", () => {
  const html = renderHome('https://attacker.example/" onmouseover="alert(1)');
  assert.doesNotMatch(html, /Donate via PayPal|onmouseover/);
});
