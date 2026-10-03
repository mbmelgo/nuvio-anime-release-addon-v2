const mode = process.argv[2];
const sha = process.argv[3] || process.env.GITHUB_SHA || "";
const explicit = process.argv[3] || process.env.RELEASE_TARGET_SHA || "";

if (mode === "deploy") {
  if (!sha) throw new Error("GITHUB_SHA is required for deploy releases.");
  console.log(sha);
} else if (mode === "finalize") {
  if (!explicit) throw new Error("RELEASE_TARGET_SHA is required for finalized releases.");
  if (!/^[0-9a-f]{40}$/i.test(explicit)) throw new Error("RELEASE_TARGET_SHA must be a full 40-character commit SHA.");
  console.log(explicit);
} else {
  throw new Error("Usage: release-target.mjs <deploy|finalize> [sha]");
}
