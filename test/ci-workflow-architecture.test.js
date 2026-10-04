import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("main CI owns normal push testing and patch versioning without a PR trigger", () => {
  const ci = read("../.github/workflows/ci.yml");
  const githubRefExpression = "$" + "{{ github.ref }}";
  const escapedExpression = "\\" + "$" + "{{";

  assert.ok(ci.includes("on:\n  push:\n    branches: [main]"));
  assert.ok(!ci.includes("pull_request:"));
  assert.ok(ci.includes("permissions:\n  contents: write"));
  assert.ok(ci.includes("group: ci-main-" + githubRefExpression));
  assert.ok(!ci.includes(escapedExpression));
  assert.ok(ci.includes("cancel-in-progress: true"));
  assert.ok(ci.includes("!contains(github.event.head_commit.message || '', '[deploy-prod]')"));
  assert.ok(ci.includes("name: Run tests\n        run: npm test\n      - name: Bump patch version and sync metadata"));
  assert.ok(ci.includes('git commit -m "chore: bump patch version [skip-release-pipeline]"'));
});

test("pull request CI remains the single PR test workflow", () => {
  const pr = read("../.github/workflows/pr-ci.yml");

  assert.ok(pr.includes("on:\n  pull_request:\n    branches: [main]"));
  assert.ok(pr.includes("cancel-in-progress: true"));
  assert.ok(pr.includes("run: npm test"));
});

test("release pipeline only allocates a runner for release or manual requests", () => {
  const sync = read("../.github/workflows/sync-version.yml");

  assert.ok(sync.includes("github.event_name == 'workflow_dispatch'"));
  assert.ok(sync.includes("'[deploy-prod]'"));
  assert.ok(sync.includes("'[finalize-prod:'"));
  assert.ok(!sync.includes("name: Bump patch version and sync metadata"));
  assert.ok(sync.includes("name: Run full CI"));
});
