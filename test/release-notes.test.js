import test from "node:test";
import assert from "node:assert/strict";
import { generateReleaseNotes } from "../scripts/release-notes.mjs";

test("release notes retain conventional feature and fix summaries", () => {
  const notes = generateReleaseNotes([
    { subject: "feat: Add movie catalog support", body: "" },
    { subject: "fix: Preserve stale catalog responses during upstream cooldown", body: "" },
  ], "v2.9.0");
  assert.match(notes, /This release adds new user-facing functionality\./);
  assert.match(notes, /Add movie catalog support\./);
  assert.match(notes, /Preserve stale catalog responses during upstream cooldown\./);
});

test("release notes use meaningful non-conventional commit subjects", () => {
  const notes = generateReleaseNotes([
    { subject: "Add public privacy disclosure and incident response runbook", body: "## Summary\n\n- Add a public privacy and service-data disclosure.\n- Document incident response for upstream and runtime failures.\n\n## Validation\n\n- npm test passed." },
  ], "v2.9.0");
  assert.match(notes, /privacy/i);
  assert.match(notes, /incident response/i);
  assert.match(notes, /service transparency/i);
  assert.doesNotMatch(notes, /new user-facing functionality/i);
  assert.doesNotMatch(notes, /npm test/i);
  assert.doesNotMatch(notes, /This release contains improvements to the addon\./);
});

test("release notes deduplicate equivalent highlights", () => {
  const notes = generateReleaseNotes([
    { subject: "fix: Improve catalog fallback", body: "" },
    { subject: "fix: Improve catalog fallback", body: "" },
  ], "v2.9.0");
  assert.equal((notes.match(/Improve catalog fallback\./g) || []).length, 1);
});

test("automation-only release ranges produce a safe concise fallback", () => {
  const notes = generateReleaseNotes([
    { subject: "chore: bump patch version [skip-version-automation]", body: "" },
    { subject: "release: record v2.8.0 production release", body: "" },
    { subject: "test: update workflow assertions", body: "" },
  ], "v2.9.0");
  assert.match(notes, /General reliability and maintenance improvements\./);
  assert.doesNotMatch(notes, /bump patch version|workflow assertions|record v2\.8\.0/i);
});

test("release notes can recover user-facing details from a non-conventional summary body", () => {
  const notes = generateReleaseNotes([
    { subject: "Improve the addon", body: "## Summary\n\n- Add a dedicated movie catalog.\n- Improve fallback when AniList is unavailable.\n\n## Validation\n\n- 400 tests passed." },
  ], "v2.9.0");
  assert.match(notes, /movie catalog/i);
  assert.match(notes, /fallback/i);
  assert.doesNotMatch(notes, /400 tests/i);
});

test("release notes sanitize Markdown and URLs from commit-body highlights", () => {
  const notes = generateReleaseNotes([
    { subject: "Improve the addon", body: "## Summary\n\n- Add [a dedicated movie catalog](https://example.invalid/catalog) for users.\n- Improve <b>upstream fallback</b> behavior.\n- Improve <script behavior for upstream fallback." },
  ], "v2.9.0");
  assert.match(notes, /dedicated movie catalog for users/i);
  assert.match(notes, /upstream fallback behavior/i);
  assert.ok(!notes.includes("https://"));
  assert.ok(!notes.includes("<b>"));
  assert.ok(!notes.includes("<"));
  assert.ok(!notes.includes(">"));
});
