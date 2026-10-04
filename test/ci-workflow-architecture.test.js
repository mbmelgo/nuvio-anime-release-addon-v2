import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("main CI owns normal push testing and patch versioning without a PR trigger", () => {
  const ci = read("../.github/workflows/ci.yml");

  assert.match(ci, /on:\\n  push:\\n    branches: \\[main\\]/);
  assert.doesNotMatch(ci, /pull_request:/);
  assert.match(ci, /permissions:\\n  contents: write/);
  assert.match(ci, /concurrency:\\n  group: ci-main-\\$\\{\\{ github\\.ref \\}\\}\\n  cancel-in-progress: true/);
  assert.match(ci, /!contains\\(github\\.event\\.head_commit\\.message \\|\\| '', '\\[deploy-prod\\]'\\)/);
  assert.match(ci, /name: Run tests[\\s\\S]*name: Bump patch version and sync metadata/);
  assert.match(ci, /git commit -m "chore: bump patch version \\[skip-release-pipeline\\]"/);
});

test("pull request CI remains the single PR test workflow", () => {
  const pr = read("../.github/workflows/pr-ci.yml");

  assert.match(pr, /on:\\n  pull_request:\\n    branches: \\[main\\]/);
  assert.match(pr, /concurrency:[\\s\\S]*cancel-in-progress: true/);
  assert.match(pr, /run: npm test/);
});

test("release pipeline only allocates a runner for release or manual requests", () => {
  const sync = read("../.github/workflows/sync-version.yml");

  assert.match(sync, /if: \\$\\{\\{ github\\.event_name == 'workflow_dispatch' \\|\\| contains\\(github\\.event\\.head_commit\\.message \\|\\| '', '\\[deploy-prod\\]'\\) \\|\\| contains\\(github\\.event\\.head_commit\\.message \\|\\| '', '\\[finalize-prod:'\\) \\}\\}/);
  assert.doesNotMatch(sync, /name: Bump patch version and sync metadata/);
  assert.match(sync, /name: Run full CI/);
});
