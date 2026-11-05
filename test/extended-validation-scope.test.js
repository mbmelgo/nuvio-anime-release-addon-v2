import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { classifyExtendedValidation } from "../scripts/extended-validation-scope.mjs";

const workflow = fs.readFileSync(new URL("../.github/workflows/sync-version.yml", import.meta.url), "utf8");

test("catalog changes always require exhaustive live validation", () => {
  for (const path of [
    "api/catalog-source.js",
    "lib/catalog-runtime-cache.js",
    "lib/anilist.js",
    "data/some-mapping.json",
    "vercel.json",
    "package.json",
    "package-lock.json",
    "scripts/validate-production.mjs",
    "public/logo.png",
    "api/resolver-manifest.js",
  ]) {
    assert.equal(classifyExtendedValidation({ changedPaths: [path] }).full, true, path);
  }
});

test("known non-runtime-only releases can skip the full catalog crawl", () => {
  const change = classifyExtendedValidation({
    changedPaths: ["README.md", "docs/catalog-resilience.md", "test/catalog-search.test.js", ".github/workflows/pr-ci.yml", "ops/release-state.json", "api/version.js"],
  });
  assert.deepEqual(change, { full: false, reason: "non-runtime-changes" });
});

test("mixed, unknown, or incomplete release history conservatively runs full validation", () => {
  assert.equal(classifyExtendedValidation({ changedPaths: ["README.md", "lib/new-feature.js"] }).full, true);
  assert.equal(classifyExtendedValidation({ changedPaths: ["README.md", ".env"] }).full, true);
  assert.equal(classifyExtendedValidation({ changedPaths: [] }).full, true);
  assert.equal(classifyExtendedValidation({ changedPaths: null }).full, true);
  assert.equal(classifyExtendedValidation({ changedPaths: ["test/fixture.js"], baselineVerified: false }).full, true);
  assert.equal(classifyExtendedValidation({ changedPaths: ["README.md"], force: true }).full, true);
  assert.equal(classifyExtendedValidation({ changedPaths: ["README.md"], dryRun: true }).full, true);
});

test("release workflow gates only the extended crawl, never smoke, CI, or security", () => {
  assert.ok(workflow.includes("name: Determine extended validation scope"));
  assert.ok(workflow.includes("node scripts/extended-validation-scope.mjs"));
  assert.ok(workflow.includes("steps.validation_scope.outputs.full == 'true'"));
  assert.ok(workflow.includes("full_validation:"));
  assert.ok(workflow.includes("name: Production smoke test"));
  assert.ok(workflow.includes("name: Run full CI"));
  assert.ok(workflow.includes("npm audit --omit=dev --audit-level=high"));
  assert.ok(!workflow.includes("gh workflow run catalog-snapshot.yml"));
});
