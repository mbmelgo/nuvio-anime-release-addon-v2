import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("main CI uses a scoped GitHub App token for automated PR events", () => {
  const ci = read("../.github/workflows/ci.yml");
  const escapedExpression = "\\" + "$" + "{{";

  assert.ok(ci.includes("on:\n  push:\n    branches: [main]"));
  assert.ok(!ci.includes("pull_request:"));
  assert.ok(ci.includes("permissions:\n  contents: read"));
  assert.ok(ci.includes("group: ci-main-"));
  assert.ok(ci.includes("github.ref"));
  assert.ok(!ci.includes(escapedExpression));
  assert.ok(ci.includes("cancel-in-progress: true"));
  assert.ok(ci.includes("name: Install locked dependencies\n        run: npm ci --ignore-scripts"));
  assert.ok(ci.includes("npm audit --omit=dev --audit-level=high"));
  assert.ok(ci.includes("name: Run tests\n        run: npm test"));
  assert.ok(ci.includes("node-version: 26"));
  assert.ok(ci.includes("actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1"));
  assert.ok(ci.includes("actions/setup-node@820762786026740c76f36085b0efc47a31fe5020"));
  assert.ok(ci.includes("version-automation:\n    needs: test"));
  assert.ok(ci.includes("permissions:\n      contents: write"));
  assert.ok(ci.includes("name: Create automation GitHub App token"));
  assert.ok(ci.includes("uses: actions/create-github-app-token@64ab729a6294000f5aa4a4bc0b73d1f32bc45510"));
  assert.ok(ci.includes("client-id: ${{ vars.AUTOMATION_APP_CLIENT_ID || secrets.AUTOMATION_APP_CLIENT_ID }}"));
  assert.ok(ci.includes("private-key: ${{ secrets.AUTOMATION_APP_PRIVATE_KEY }}"));
  assert.ok(ci.includes("repositories: AniBloom"));
  assert.ok(ci.includes("permission-pull-requests: write"));
  assert.ok(ci.includes("GH_TOKEN: ${{ steps.automation-app-token.outputs.token }}"));
  assert.ok(ci.includes('git commit -m "chore: bump patch version [skip-version-automation]"'));
  assert.ok(ci.includes("git add api/version.js package.json package-lock.json README.md"));
  assert.ok(ci.includes('lock["version"] = next_version'));
  assert.ok(ci.includes('lock["packages"][""]["version"] = next_version'));
  assert.ok(ci.includes("gh pr create"));
  assert.ok(ci.includes("--base main"));
  assert.ok(!ci.includes("gh workflow run pr-ci.yml"));
  assert.ok(!ci.includes("git push origin HEAD:main"));
});

test("pull request CI supports both automatic PR events and explicit dispatch", () => {
  const pr = read("../.github/workflows/pr-ci.yml");

  assert.ok(pr.includes("on:\n  pull_request:\n    branches: [main]"));
  assert.ok(pr.includes("workflow_dispatch:"));
  assert.ok(pr.includes("cancel-in-progress: true"));
  assert.ok(pr.includes("run: npm ci --ignore-scripts"));
  assert.ok(pr.includes("npm audit --omit=dev --audit-level=high"));
  assert.ok(pr.includes("run: npm test"));
  assert.ok(pr.includes("persist-credentials: false"));
  assert.ok(pr.includes("node-version: 26"));
});

test("release pipeline uses the scoped GitHub App token only for release-state PR automation", () => {
  const sync = read("../.github/workflows/sync-version.yml");

  assert.ok(sync.includes("github.event_name == 'workflow_dispatch'"));
  assert.ok(sync.includes("'[deploy-prod]'"));
  assert.ok(sync.includes("'[finalize-prod:'"));
  assert.ok(!sync.includes("name: Bump patch version and sync metadata"));
  assert.ok(sync.includes("name: Install locked dependencies\n        run: npm ci --ignore-scripts"));
  assert.ok(sync.includes("npm audit --omit=dev --audit-level=high"));
  assert.ok(sync.includes("name: Run full CI"));
  assert.ok(!sync.includes("actions: write"), "release pipeline should not retain dispatch-only permission");
  assert.ok(sync.includes("automation/release-state-v$release_version"));
  assert.ok(sync.includes("[skip-version-automation]"));
  assert.ok(sync.includes("gh pr create"));
  assert.ok(sync.includes("name: Create automation GitHub App token"));
  assert.ok(sync.includes("uses: actions/create-github-app-token@64ab729a6294000f5aa4a4bc0b73d1f32bc45510"));
  assert.ok(sync.includes("client-id: ${{ vars.AUTOMATION_APP_CLIENT_ID || secrets.AUTOMATION_APP_CLIENT_ID }}"));
  assert.ok(sync.includes("private-key: ${{ secrets.AUTOMATION_APP_PRIVATE_KEY }}"));
  assert.ok(sync.includes("repositories: AniBloom"));
  assert.ok(sync.includes("permission-pull-requests: write"));
  assert.ok(sync.includes("AUTOMATION_TOKEN: ${{ steps.automation-app-token.outputs.token }}"));
  assert.ok(sync.includes('GH_TOKEN="$AUTOMATION_TOKEN" gh pr create'));
  assert.ok(!sync.includes("git push origin HEAD:main"));
  assert.ok(!sync.includes("name: Trigger post-release catalog snapshot"));
  assert.ok(!sync.includes("gh workflow run catalog-snapshot.yml"));
  assert.ok(!sync.includes("[capture-catalog]"), "release state updates must not trigger snapshot captures");
  assert.ok(!sync.includes("pull-requests: write\n  actions: write"));
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

test("all GitHub Actions dependencies are pinned to immutable full commit SHAs", () => {
  const workflowsDirectory = new URL("../.github/workflows/", import.meta.url);
  const files = fs.readdirSync(workflowsDirectory).filter((name) => name.endsWith(".yml"));
  const references = files.flatMap((name) => {
    const content = fs.readFileSync(new URL(name, workflowsDirectory), "utf8");
    return [...content.matchAll(/^\s*uses:\s*([^\s#]+)/gm)].map((match) => ({ file: name, ref: match[1] }));
  });
  assert.ok(references.length > 0);
  for (const { file, ref } of references) {
    assert.match(ref, /^.+@[a-f0-9]{40}$/, `${file} contains a mutable or invalid action reference: ${ref}`);
  }
});

test("periodic production availability monitor stays removed without affecting release safeguards", () => {
  const workflowsDirectory = new URL("../.github/workflows/", import.meta.url);
  const files = fs.readdirSync(workflowsDirectory).filter((name) => name.endsWith(".yml"));

  assert.ok(!files.includes("production-health-check.yml"), "retired monitor must not be scheduled");
  for (const name of files) {
    const workflow = fs.readFileSync(new URL(name, workflowsDirectory), "utf8");
    assert.ok(!workflow.includes("production-availability-monitor"), `${name} references removed monitor`);
    assert.ok(!workflow.includes("Production availability monitor"), `${name} reintroduces monitor`);
  }

  for (const preserved of ["ci.yml", "pr-ci.yml", "secret-history-scan.yml", "sync-version.yml", "catalog-snapshot.yml"]) {
    assert.ok(files.includes(preserved), `${preserved} must remain in place`);
  }
});
