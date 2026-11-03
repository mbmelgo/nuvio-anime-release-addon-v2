import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("main CI separates read-only tests from GITHUB_TOKEN version automation", () => {
  const ci = read("../.github/workflows/ci.yml");
  const escapedExpression = "\\" + "$" + "{{";

  assert.ok(ci.includes("on:\n  push:\n    branches: [main]"));
  assert.ok(!ci.includes("pull_request:"));
  assert.ok(ci.includes("permissions:\n  contents: read"));
  assert.ok(ci.includes("group: ci-main-"));
  assert.ok(ci.includes("github.ref"));
  assert.ok(!ci.includes(escapedExpression));
  assert.ok(ci.includes("cancel-in-progress: true"));
  assert.ok(ci.includes("name: Run tests\n        run: npm test"));
  assert.ok(ci.includes("version-automation:\n    needs: test"));
  assert.ok(ci.includes("contents: write\n      pull-requests: write\n      actions: write"));
  assert.ok(ci.includes("GH_TOKEN: ${{ github.token }}"));
  assert.ok(ci.includes('git commit -m "chore: bump patch version [skip-version-automation]"'));
  assert.ok(ci.includes("gh pr create"));
  assert.ok(ci.includes("--base main"));
  assert.ok(ci.includes("gh workflow run pr-ci.yml"));
  assert.ok(ci.includes('--ref "$branch"'));
  assert.ok(!ci.includes("create-github-app-token"));
  assert.ok(!ci.includes("APP_PRIVATE_KEY"));
  assert.ok(!ci.includes("vars.APP_ID"));
  assert.ok(!ci.includes("git push origin HEAD:main"));
});

test("pull request CI supports both automatic PR events and explicit dispatch", () => {
  const pr = read("../.github/workflows/pr-ci.yml");

  assert.ok(pr.includes("on:\n  pull_request:\n    branches: [main]"));
  assert.ok(pr.includes("workflow_dispatch:"));
  assert.ok(pr.includes("cancel-in-progress: true"));
  assert.ok(pr.includes("run: npm test"));
});

test("release pipeline retains controlled release behavior without a custom App token", () => {
  const sync = read("../.github/workflows/sync-version.yml");

  assert.ok(sync.includes("github.event_name == 'workflow_dispatch'"));
  assert.ok(sync.includes("'[deploy-prod]'"));
  assert.ok(sync.includes("'[finalize-prod:'"));
  assert.ok(!sync.includes("name: Bump patch version and sync metadata"));
  assert.ok(sync.includes("name: Run full CI"));
  assert.ok(sync.includes("actions: write"));
  assert.ok(sync.includes("pull-requests: write"));
  assert.ok(sync.includes("automation/release-state-v$release_version"));
  assert.ok(sync.includes("[skip-version-automation]"));
  assert.ok(sync.includes("gh pr create"));
  assert.ok(sync.includes("gh workflow run pr-ci.yml"));
  assert.ok(sync.includes('--ref "$branch"'));
  assert.ok(!sync.includes("create-github-app-token"));
  assert.ok(!sync.includes("APP_PRIVATE_KEY"));
  assert.ok(!sync.includes("vars.APP_ID"));
  assert.ok(!sync.includes("APP_TOKEN"));
  assert.ok(!sync.includes("git push origin HEAD:main"));
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
  assert.ok(scan.includes("persist-credentials: false"));
  assert.ok(scan.includes("actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1"));
  assert.ok(scan.includes("name: Install pinned Gitleaks CLI"));
  assert.ok(scan.includes("https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz"));
  assert.ok(scan.includes("551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"));
  assert.ok(scan.includes("sha256sum --check --strict"));
  assert.ok(scan.includes('gitleaks git --log-opts="--full-history --all" --redact --no-banner --exit-code=2 .'));
  assert.ok(!scan.includes("GITLEAKS_LICENSE"));
  assert.ok(!scan.includes("gitleaks/gitleaks-action"));
  assert.ok(!scan.includes("pull-requests: write"));
});
