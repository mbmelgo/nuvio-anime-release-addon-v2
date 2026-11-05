import test from "node:test";
import assert from "node:assert/strict";

import { CATALOG_MEDIA_FIELDS, SCHEDULE_MEDIA_FIELDS } from "../lib/catalog-anilist.js";
import { selectAniListPoster, toMetaFromAniList } from "../lib/catalog-meta.js";

const EXTRA_LARGE = "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx187316-example.jpg";
const LARGE = "https://example.test/cover-large.jpg";
const MEDIUM = "https://example.test/cover-medium.jpg";

test("seasonal and rolling GraphQL queries request AniList-provided cover variants", () => {
  for (const fields of [CATALOG_MEDIA_FIELDS, SCHEDULE_MEDIA_FIELDS]) {
    assert.match(fields, /coverImage\s*\{\s*extraLarge\s+large\s+medium\s*\}/);
  }
});

test("poster selection prefers upstream extraLarge over large and medium without rewriting URLs", () => {
  const cover = { extraLarge: EXTRA_LARGE, large: LARGE, medium: MEDIUM };
  assert.equal(selectAniListPoster(cover), EXTRA_LARGE);

  const meta = toMetaFromAniList(187316, {
    idMal: 123456,
    title: { english: "Example anime" },
    format: "TV",
    coverImage: cover,
  });
  assert.equal(meta.poster, EXTRA_LARGE);
  assert.equal(meta.id, "anilist:187316");
  assert.equal(meta.extra.malId, 123456);
  assert.equal(meta.name, "Example anime");
  assert.equal(meta.posterShape, "poster");
});

test("poster selection falls back through large and medium when high-resolution covers are unavailable", () => {
  assert.equal(selectAniListPoster({ large: LARGE, medium: MEDIUM }), LARGE);
  assert.equal(selectAniListPoster({ extraLarge: null, large: LARGE, medium: MEDIUM }), LARGE);
  assert.equal(selectAniListPoster({ extraLarge: "", large: " ", medium: MEDIUM }), MEDIUM);
  assert.equal(selectAniListPoster({ extraLarge: "not-a-url", large: LARGE, medium: MEDIUM }), LARGE);
  assert.equal(toMetaFromAniList(12, { coverImage: { medium: MEDIUM } }).poster, MEDIUM);
});

test("invalid or unsafe cover variants are skipped and no poster is emitted if all are unusable", () => {
  const malicious = [
    "javascript:alert(1)",
    "data:image/svg+xml;base64,abcd",
    "ftp://example.test/a.jpg",
    "https://user:password@example.test/a.jpg",
    "not-a-url",
    "",
    "   ",
    17,
  ];
  for (const value of malicious) {
    assert.equal(selectAniListPoster({ extraLarge: value, large: LARGE }), LARGE);
  }
  assert.equal(selectAniListPoster(null), undefined);
  assert.equal(selectAniListPoster({ extraLarge: "bad", large: null, medium: "" }), undefined);
  assert.equal(Object.hasOwn(toMetaFromAniList(123, { coverImage: {} }), "poster"), false);
});
