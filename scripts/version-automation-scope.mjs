import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const SHA = /^[0-9a-f]{40}$/i;

export function shouldCreateVersionPR(changedPaths) {
  if (!Array.isArray(changedPaths) || changedPaths.length === 0) return true;
  const ignored = (file) =>
    typeof file === "string" && (
      file === "README.md" ||
      file === "CHANGELOG.md" ||
      file === "LICENSE" ||
      file === ".gitignore" ||
      file === "ops/release-state.json" ||
      (file.startsWith("docs/") && file.length > "docs/".length) ||
      (file.startsWith("test/") && file.length > "test/".length) ||
      (file.startsWith(".github/") && file.length > ".github/".length)
    );
  return !changedPaths.every(ignored);
}

export function changedPathsFromPush(beforeSha, afterSha) {
  if (!SHA.test(String(beforeSha || "")) || !SHA.test(String(afterSha || ""))) return null;
  // A missing, divergent or shallow history means a version check is needed,
  // rather than silently ignoring a possible runtime change.
  const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", beforeSha, afterSha], {
    encoding: "utf8",
  });
  if (ancestor.error || ancestor.status !== 0) return null;
  try {
    return execFileSync("git", ["diff", "--name-only", "--no-renames", beforeSha, afterSha, "--"], {
      encoding: "utf8",
    }).split("\n").filter(Boolean);
  } catch {
    return null;
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const paths = changedPathsFromPush(process.env.BEFORE_SHA, process.env.GITHUB_SHA);
  const update = shouldCreateVersionPR(paths);
  console.log(`Version metadata automation: ${update ? "required" : "skipped"} (${paths ? paths.length + " changed paths" : "unverified diff"})`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `update=${update}\n`);
  }
}
