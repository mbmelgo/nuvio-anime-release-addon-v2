import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/release-target.mjs", import.meta.url));

function run(args, env = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env }
  });
}

test("deploy releases use the exact workflow commit", () => {
  const sha = "0123456789abcdef0123456789abcdef01234567";
  const result = run(["deploy", sha]);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), sha);
});

test("finalize releases require an explicit full deployment SHA", () => {
  const sha = "fedcba9876543210fedcba9876543210fedcba98";
  const result = run(["finalize", sha]);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), sha);
});

test("finalize releases reject implicit or malformed targets", () => {
  for (const args of [["finalize"], ["finalize", "abc123"]]) {
    const result = run(args, { RELEASE_TARGET_SHA: "" });
    assert.notEqual(result.status, 0);
  }
});
