import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import handler from "../api/home-selector.js";
import { createPreviewServer } from "../scripts/dev-server.js";

function render() {
  let html = "";
  const res = { status() { return this; }, setHeader() {}, send(value) { html = value; return value; } };
  handler({}, res);
  return html;
}

test("homepage links to the public privacy and service disclosure", () => {
  const html = render();
  assert.match(html, /href="\/privacy\.html"/);
  assert.doesNotMatch(html, /document\.cookie|localStorage|sessionStorage|sendBeacon|google-analytics|googletagmanager|posthog/i);
  assert.match(html, /Privacy &amp; data/);
  assert.equal((html.match(/href="\/privacy\.html"/g) || []).length, 1);
});

test("privacy disclosure accurately describes app data, third parties, and limits", async () => {
  const html = await readFile(new URL("../privacy.html", import.meta.url), "utf8");
  for (const phrase of [
    "No AniBloom account or sign-in",
    "IP address",
    "SHA-256",
    "search",
    "AniList",
    "The Movie Database",
    "Upstash",
    "Vercel",
    "IMDb",
    "Kitsu",
    "ARM",
    "Fribb",
    "AniBridge",
    "AniMap",
    "IDMapper",
    "Anime Mapper",
    "AnimeAPI",
    "does not set analytics or advertising cookies",
    "retention period",
    "third-party services",
  ]) assert.ok(html.toLowerCase().includes(phrase.toLowerCase()), phrase);
  assert.match(html, /https:\/\/anilist\.co\/privacy/);
  assert.match(html, /https:\/\/vercel\.com\/legal\/privacy-notice/);
  assert.match(html, /https:\/\/upstash\.com\/trust\/privacy/);
  assert.match(html, /https:\/\/www\.themoviedb\.org\/privacy-policy/);
  assert.doesNotMatch(html, /we never collect ip|we delete all data after|gdpr compliant/i);
});


test("preview server serves the privacy disclosure page", async (t) => {
  const server = createPreviewServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/privacy.html`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.match(await response.text(), /Privacy &amp; service data/);
});
