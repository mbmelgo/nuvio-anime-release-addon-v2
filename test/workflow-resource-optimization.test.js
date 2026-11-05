import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { shouldCreateVersionPR } from "../scripts/version-automation-scope.mjs";
import { validatePackageLockVersion } from "../scripts/release-integrity.mjs";
import { retryTransientProductionFetch, isTransientProductionStatus } from "../scripts/retry-production-fetch.mjs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("historical secret scanning runs for every enabled trigger and keeps PR and push safeguards", () => {
  const workflow = read("../.github/workflows/secret-history-scan.yml");
  assert.ok(workflow.includes("pull_request:"));
  assert.ok(workflow.includes("push:"));
  assert.ok(workflow.includes("workflow_dispatch:"));
  assert.ok(!/\n  schedule:/.test(workflow), "daily no-op scheduled scan should be disabled");
  const step = workflow.slice(workflow.indexOf("      - name: Scan complete Git history"));
  assert.ok(step.includes('gitleaks git --log-opts="--full-history --all" --redact --no-banner --exit-code=2 .'));
  assert.ok(!/^\s+if:/m.test(step), "manual dispatch must execute the actual Gitleaks command");
});

test("standalone catalog diff is manual-only while snapshot capture still compares against prior release", () => {
  const diff = read("../.github/workflows/catalog-diff.yml");
  const trigger = diff.split("\non:\n")[1]?.split("\npermissions:")[0] ?? "";
  assert.ok(trigger.includes("workflow_dispatch:"));
  assert.ok(!/^\s*(push|schedule|workflow_run|repository_dispatch):/m.test(trigger));
  assert.ok(diff.includes("node scripts/compare-catalog-snapshots.js"));
  const snapshot = read("../.github/workflows/catalog-snapshot.yml");
  assert.ok(snapshot.includes("node scripts/compare-catalog-snapshots.js"));
});

test("version automation runs only after green full CI and validates generated metadata without rerunning all tests", () => {
  const ci = read("../.github/workflows/ci.yml");
  const versionJob = ci.slice(ci.indexOf("  version-automation:"));
  assert.ok(versionJob.includes("needs: test"));
  assert.ok(ci.includes("name: Run tests\n        run: npm test"));
  assert.ok(versionJob.includes("node scripts/version-automation-scope.mjs"));
  assert.ok(versionJob.includes("node scripts/release-integrity.mjs"));
  assert.ok(versionJob.includes("steps.scope.outputs.update == 'true'"));
  assert.ok(!versionJob.includes("npm test"));
  assert.ok(!versionJob.includes("npm audit"));
  assert.ok(!versionJob.includes("npm ci"));
});

test("version-bump scope ignores docs, workflow and test-only pushes but fails safe for runtime changes", () => {
  assert.equal(shouldCreateVersionPR(["README.md", "docs/guide.md", ".github/workflows/pr-ci.yml", "test/ci-workflow-architecture.test.js"]), false);
  assert.equal(shouldCreateVersionPR(["ops/release-state.json", "LICENSE", ".gitignore"]), false);
  assert.equal(shouldCreateVersionPR(["api/catalog-source.js", "docs/guide.md"]), true);
  assert.equal(shouldCreateVersionPR(["api/version.js"]), true);
  assert.equal(shouldCreateVersionPR(["package-lock.json"]), true);
  assert.equal(shouldCreateVersionPR([".env"]), true);
  assert.equal(shouldCreateVersionPR([]), true);
  assert.equal(shouldCreateVersionPR(null), true);
});

test("package lock version metadata is checked before an automated version PR", () => {
  assert.doesNotThrow(() => validatePackageLockVersion("2.16.1", { version: "2.16.1", packages: { "": { version: "2.16.1" } } }));
  assert.throws(() => validatePackageLockVersion("2.16.1", { version: "2.16.0", packages: { "": { version: "2.16.1" } } }), /lock/i);
  assert.throws(() => validatePackageLockVersion("2.16.1", { version: "2.16.1", packages: { "": { version: "2.16.0" } } }), /lock/i);
  assert.throws(() => validatePackageLockVersion("2.16.1", {}), /lock/i);
});

test("production retry only retries transient responses with a hard bound, retaining terminal failures", async () => {
  assert.equal(isTransientProductionStatus(429), true);
  assert.equal(isTransientProductionStatus(503), true);
  assert.equal(isTransientProductionStatus(502), true);
  assert.equal(isTransientProductionStatus(404), false);
  assert.equal(isTransientProductionStatus(400), false);
  assert.equal(isTransientProductionStatus(500), false);

  const delays = [];
  const statuses = [503, 429, 200];
  let calls = 0;
  const fetchImpl = async () => {
    const status = statuses[calls++];
    return { ok: status === 200, status, headers: { get: () => null } };
  };
  const result = await retryTransientProductionFetch(fetchImpl, "https://example.test/catalog", {
    attempts: 3, sleep: async (ms) => delays.push(ms),
  });
  assert.equal(result.status, 200);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [1000, 2000]);

  let permanentlyFailingCalls = 0;
  const terminal = await retryTransientProductionFetch(async () => {
    permanentlyFailingCalls++;
    return { status: 404, ok: false };
  }, "https://example.test/meta", { attempts: 3, sleep: async () => {} });
  assert.equal(terminal.status, 404);
  assert.equal(permanentlyFailingCalls, 1);

  let exhausted = 0;
  const failed = await retryTransientProductionFetch(async () => {
    exhausted++;
    return { status: 503, ok: false, headers: { get: () => null } };
  }, "https://example.test/catalog", { attempts: 3, sleep: async () => {} });
  assert.equal(failed.status, 503);
  assert.equal(exhausted, 3);
});

test("release waits for manifest readiness without repeatedly crawling every catalog", () => {
  const release = read("../.github/workflows/sync-version.yml");
  assert.ok(release.includes("name: Production smoke test"));
  assert.ok(release.includes("name: Extended production validation"));
  assert.ok(release.includes("node scripts/validate-production.mjs"));
  assert.ok(release.includes("Production manifest is ready"));
  assert.ok(release.includes("seq 1 3"), "smoke suite retries only a small number of times");
  assert.ok(!release.includes("for attempt in $(seq 1 30); do\n            if EXPECTED_VERSION="), "full validator must not be rerun thirty times");
  assert.ok(!release.includes("for attempt in $(seq 1 30); do\n            root_manifest="), "readiness polls should not fetch full catalogs");
  assert.ok(release.includes("run: npm test"), "release must retain full predeploy tests");
});
