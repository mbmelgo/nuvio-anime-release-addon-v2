import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("main CI owns normal push testing and patch versioning without a PR trigger", () => {
  const ci = read("../.github/workflows/ci.yml");
  const escapedExpression = "\\" + "$" + "{{";

  assert.ok(ci.includes("on:\n  push:\n    branches: [main]"));
  assert.ok(!ci.includes("pull_request:"));
  assert.ok(ci.includes("permissions:\n  contents: write"));
  assert.ok(ci.includes("group: ci-main-"));
  assert.ok(ci.includes("github.ref"));
  assert.ok(!ci.includes(escapedExpression));
  assert.ok(ci.includes("cancel-in-progress: true"));
  assert.ok(!ci.includes("steps.gate.outputs.release"));
  assert.ok(ci.includes("!contains(github.event.head_commit.message || '', '[deploy-prod]')"));
  assert.ok(ci.includes("name: Run tests\n        run: npm test\n      - name: Bump patch version and sync metadata"));
  assert.ok(ci.includes("name: Verify versioned tree\n        run: npm test\n      - name: Commit version metadata"));
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
  assert.ok(sync.includes("actions: write"));
  assert.ok(sync.includes("name: Trigger post-release catalog snapshot"));
  assert.ok(sync.includes("gh workflow run catalog-snapshot.yml"));
  assert.ok(sync.includes("-f release_version="));
  assert.ok(sync.includes("-f release_sha="));
});

test("release workflow shell blocks do not contain inline GitHub expressions", () => {
  const sync = read("../.github/workflows/sync-version.yml");
  const lines = sync.split("\n");
  const scripts = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s*)run:\s*[|>]\s*$/);
    if (!match) continue;
    const indent = match[1].length;
    const body = [];
    for (let next = index + 1; next < lines.length; next += 1) {
      const line = lines[next];
      if (line.trim() && line.match(/^\s*/)[0].length <= indent) break;
      body.push(line);
    }
    scripts.push(body.join("\n"));
  }
  assert.ok(scripts.every((script) => !script.includes("$" + "{{")));
});

test("historical secret scan uses full git history with minimal permissions and redacted outputs", () => {
  const scan = read("../.github/workflows/secret-history-scan.yml");

  assert.ok(scan.includes("push:\n    branches: [main]"));
  assert.ok(scan.includes("pull_request:\n    branches: [main]"));
  assert.ok(scan.includes("workflow_dispatch:"));
  assert.ok(scan.includes("schedule:"));
  assert.ok(scan.includes("permissions:\n  contents: read\n  pull-requests: read"));
  assert.ok(scan.includes("fetch-depth: 0"));
  assert.ok(scan.includes("name: Scan complete Git history"));
  assert.ok(scan.includes("if: github.event_name == 'pull_request' || github.event_name == 'push'"));
  assert.ok(scan.includes("run: gitleaks detect --redact --no-banner --exit-code=2"));
  assert.ok(scan.includes("persist-credentials: false"));
  assert.ok(scan.includes("gitleaks/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e"));
  assert.ok(scan.includes("actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1"));
  assert.ok(scan.includes('GITLEAKS_VERSION: "8.30.1"'));
  assert.ok(scan.includes('GITLEAKS_ENABLE_COMMENTS: "false"'));
  assert.ok(scan.includes('GITLEAKS_ENABLE_UPLOAD_ARTIFACT: "false"'));
  assert.ok(scan.includes('GITLEAKS_ENABLE_SUMMARY: "false"'));
  assert.ok(!scan.includes("pull-requests: write"));
});
