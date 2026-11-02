import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/home-selector.js";

test("home page serves AniBloom generic product information", () => {
  let html = "";
  const res = { status() { return this; }, setHeader() {}, send(value) { html = value; return value; } };
  handler({}, res);
  assert.match(html, /AniBloom — Anime Discovery for Nuvio/);
  assert.match(html, /Discover anime\.<br>Every season\./);
  assert.doesNotMatch(html, /AniList|ARM mapping|identity mapping|TMDB|TVDB|IMDb/i);
});

test("home page retains direct Nuvio installation and HTTPS fallback", () => {
  let html = "";
  const res = { status() { return this; }, setHeader() {}, send(value) { html = value; return value; } };
  handler({}, res);
  assert.match(html, /nuvio:\/\/anibloom\.vercel\.app\/manifest\.json/);
  assert.match(html, /https:\/\/anibloom\.vercel\.app\/manifest\.json/);
});
