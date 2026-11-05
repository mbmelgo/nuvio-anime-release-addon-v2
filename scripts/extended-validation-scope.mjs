import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";

const EXACT_SHA = /^[0-9a-f]{40}$/i;

export function classifyExtendedValidation({
  changedPaths,
  baselineVerified = true,
  force = false,
  dryRun = false,
} = {}) {
  if (force) return { full: true, reason: "explicit-override" };
  if (dryRun) return { full: true, reason: "explicit-dry-run" };
  if (!baselineVerified || !Array.isArray(changedPaths)) {
    return { full: true, reason: "unverified-release-baseline" };
  }
  if (changedPaths.length === 0) {
    return { full: true, reason: "empty-release-diff" };
  }

  const nonRuntimeFile = (path) =>
    typeof path === "string" && (
      path === "README.md" ||
      path === "CHANGELOG.md" ||
      path === "LICENSE" ||
      path === ".gitignore" ||
      path === "api/version.js" ||
      path === "ops/release-state.json" ||
      (path.startsWith("docs/") && path.length > "docs/".length) ||
      (path.startsWith("test/") && path.length > "test/".length) ||
      (path.startsWith(".github/") && path.length > ".github/".length)
    );

  return changedPaths.every(nonRuntimeFile)
    ? { full: false, reason: "non-runtime-changes" }
    : { full: true, reason: "runtime-or-unknown-changes" };
}

function changedPathsFromReleaseBaseline(baseSha, targetSha) {
  if (!EXACT_SHA.test(baseSha) || !EXACT_SHA.test(targetSha)) return null;
  const ancestry = spawnSync("git", ["merge-base", "--is-ancestor", baseSha, targetSha], {
    encoding: "utf8",
  });
  if (ancestry.error || ancestry.status !== 0) return null;
  try {
    const output = execFileSync("git", [
      "diff", "--name-only", "--no-renames", baseSha, targetSha, "--",
    ], { encoding: "utf8" });
    return output.split("\n").filter(Boolean);
  } catch {
    return null;
  }
}

export function inspectExtendedValidation({
  baseSha,
  targetSha,
  force = false,
  dryRun = false,
  changedPaths = undefined,
} = {}) {
  const paths = changedPaths === undefined
    ? changedPathsFromReleaseBaseline(baseSha, targetSha)
    : changedPaths;
  return classifyExtendedValidation({
    changedPaths: paths,
    baselineVerified: Array.isArray(paths),
    force,
    dryRun,
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const state = JSON.parse(readFileSync("ops/release-state.json", "utf8"));
  const result = inspectExtendedValidation({
    baseSha: state.lastDeploymentSha,
    targetSha: process.env.RELEASE_TARGET_SHA,
    force: process.env.FORCE_FULL_VALIDATION === "true",
    dryRun: process.env.DRY_RUN === "true",
  });
  const runFull = String(result.full);
  console.log(`Extended production validation: ${runFull} (${result.reason})`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `full=${runFull}\nreason=${result.reason}\n`);
  }
}
