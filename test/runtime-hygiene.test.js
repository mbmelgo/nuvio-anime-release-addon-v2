import test from "node:test";
import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  compareVersions,
  incrementMinor,
  validateVersionConsistency,
  validateReleaseTarget,
  validateLastDeploymentMetadata,
} from "../scripts/release-integrity.mjs";
import {
  PRODUCTION_CATALOG_IDS,
  validateCatalog,
  validateManifest,
} from "../scripts/validate-production.mjs";

async function collectJsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await collectJsFiles(path));
    else if (entry.name.endsWith(".js")) files.push(path);
  }
  return files;
}

test("runtime source does not use deprecated url.parse API", async () => {
  const files = await collectJsFiles(".");
  const offenders = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (/\burl\.parse\s*\(/.test(source)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

test("retired runtime entrypoints and helpers stay removed", async () => {
  const retired = ["api/home.js", "api/stremio.js", "api/catalog-delegation.js", "lib/http.js", "lib/catalog-identity.js", "lib/release-version.js"];
  for (const file of retired) {
    await assert.rejects(access(file), undefined, `${file} should remain removed`);
  }
});

test("catalog source is the only retained catalog runtime implementation", async () => {
  await access("api/catalog-source.js");
  await assert.rejects(access("api/catalog-delegation.js"));
  await assert.rejects(access("api/stremio.js"));
});

test("every retained Vercel runtime module has a serverless default export", async () => {
  const runtimeFiles = ["api/catalog-source.js", "api/home-selector.js", "api/resolver-manifest.js"];
  for (const file of runtimeFiles) {
    const source = await readFile(file, "utf8");
    assert.match(source, /export default (?:async )?function\s+\w+\s*\(/, `${file} must export a default handler`);
  }
});

test("README and home page describe the current BingeCat identity release", async () => {
  const readme = await readFile("README.md", "utf8");
  const home = await readFile("api/home-selector.js", "utf8");
  const versionSource = await readFile("api/version.js", "utf8");
  const releaseState = JSON.parse(await readFile("ops/release-state.json", "utf8"));
  const addonVersion = versionSource.match(/ADDON_VERSION = "([^"]+)"/)?.[1];
  assert.ok(addonVersion);
  assert.match(readme, /\[!\[MAL\]\(https:\/\/img\.shields\.io\/badge\/MyAnimeList-identity-2e51a2\.svg\)\]\(https:\/\/myanimelist\.net\)/);
  assert.ok(readme.includes("version-" + addonVersion + "-blue"));
  assert.match(readme, /BingeCat-compatible identity/);
  assert.ok(readme.includes("**Production:** `v" + releaseState.lastDeploymentVersion + "`"));
  assert.ok(readme.includes("**Development:** `v" + addonVersion + "`"));
  assert.doesNotMatch(readme, /AniList-only/);
  assert.match(home, /BingeCat-compatible identity/);
  assert.doesNotMatch(home, /AniList-only/);
});

test("home page uses only canonical unversioned catalog URLs", async () => {
  const source = await readFile("api/home-selector.js", "utf8");
  assert.doesNotMatch(source, /\/v5\//);
  assert.doesNotMatch(source, /v5 resolver/i);
  assert.match(source, /\$\{BASE_URL\}\/catalog\/anime\/\$\{id\}\.json/);
});


test("release version helpers enforce semantic versioning and minor baselines", () => {
  assert.equal(compareVersions("5.5.3", "5.5.0") > 0, true);
  assert.equal(compareVersions("5.5.0", "5.5.0"), 0);
  assert.equal(incrementMinor("5.5.3"), "5.6.0");
});

test("unreleased v2 baseline is valid without a fabricated deployment or tag", () => {
  assert.equal(validateVersionConsistency({
    addonVersion: "0.0.0",
    packageVersion: "0.0.0",
    productionVersion: "0.0.0",
    productionTag: null,
    nextReleaseVersion: "0.1.0",
    deploymentsSincePause: 0,
    deploymentLimit: 10,
    paused: false,
  }), true);
  assert.equal(validateLastDeploymentMetadata({
    lastDeploymentVersion: "0.0.0",
    lastDeploymentSha: null,
    lastDeploymentId: null,
    lastDeploymentTag: null,
    lastDeployment: null,
  }), true);
});

test("release state rejects inconsistent production and development metadata", () => {
  assert.throws(
    () => validateVersionConsistency({
      addonVersion: "5.5.3",
      packageVersion: "5.5.2",
      productionVersion: "5.5.0",
      productionTag: "v5.5.0",
      nextReleaseVersion: "5.6.0",
      deploymentsSincePause: 6,
      deploymentLimit: 10,
      paused: false,
    }),
    /does not match/,
  );

  assert.throws(
    () => validateVersionConsistency({
      addonVersion: "5.5.3",
      packageVersion: "5.5.3",
      productionVersion: "5.5.0",
      productionTag: "v5.5.0",
      nextReleaseVersion: "5.7.0",
      deploymentsSincePause: 6,
      deploymentLimit: 10,
      paused: false,
    }),
    /Next release/,
  );

  assert.equal(validateVersionConsistency({
    addonVersion: "5.5.3",
    packageVersion: "5.5.3",
    productionVersion: "5.5.0",
    productionTag: "v5.5.0",
    nextReleaseVersion: "5.6.0",
    deploymentsSincePause: 6,
    deploymentLimit: 10,
    paused: false,
  }), true);
});

test("production manifest validator enforces the exact five-catalog contract", () => {
  const manifest = {
    id: "com.marki.nuvio.anime-releases",
    version: "5.5.3",
    identityMode: "bingecat",
    resources: [{ name: "catalog", types: ["anime"] }],
    types: ["anime"],
    catalogs: PRODUCTION_CATALOG_IDS.map((id) => ({ id, type: "anime" })),
  };
  assert.equal(validateManifest(manifest, "5.5.3"), true);
  assert.throws(() => validateManifest({
    ...manifest,
    catalogs: manifest.catalogs.slice(0, 4),
  }, "5.5.3"), /five supported catalogs/);
});

test("production rolling catalog validators enforce their distinct metadata contracts", () => {
  assert.equal(validateCatalog({
    metas: [{ id: "tt1234567", type: "series", extra: { nextEpisode: 2, nextAiringAt: 123 } }],
  }, "upcoming_5_days"), true);

  assert.throws(() => validateCatalog({
    metas: [{ id: "tmdb:12345", type: "series", extra: { nextEpisode: 2 } }],
  }, "upcoming_5_days"), /next episode and next airing/);

  assert.equal(validateCatalog({
    metas: [{ id: "tvdb:12345", type: "series", extra: {} }],
  }, "previous_7_days"), true);

  assert.throws(() => validateCatalog({
    metas: [{ id: "tt1234567", type: "series", extra: { nextEpisode: 2, nextAiringAt: 123 } }],
  }, "previous_7_days"), /future-only/);
});


test("last deployment metadata must mirror the authoritative release state", () => {
  const state = {
    lastDeploymentVersion: "5.5.0",
    lastDeploymentSha: "afcb1604426af1d1fe4e02931c9dc1579c7f69c7",
    lastDeploymentId: "dpl_Cja365dcwSHTN2BsSttr2nE8VrCU",
    lastDeploymentTag: "v5.5.0",
    lastDeployment: {
      version: "5.5.0",
      sha: "afcb1604426af1d1fe4e02931c9dc1579c7f69c7",
      vercelDeploymentId: "dpl_Cja365dcwSHTN2BsSttr2nE8VrCU",
      tag: "v5.5.0",
      releasedAt: "2026-10-01T00:00:00.000Z",
      ciRunId: "12345",
      ciRunUrl: "https://github.com/mbmelgo/nuvio-anime-releases-addon/actions/runs/12345",
      smokeTest: "passed",
    },
  };

  assert.equal(validateLastDeploymentMetadata(state), true);

  assert.throws(
    () => validateLastDeploymentMetadata({
      ...state,
      lastDeployment: { ...state.lastDeployment, sha: "different" },
    }),
    /SHA/,
  );

  assert.throws(
    () => validateLastDeploymentMetadata({
      ...state,
      lastDeployment: { ...state.lastDeployment, vercelDeploymentId: "wrong" },
    }),
    /deployment ID/,
  );

  assert.throws(
    () => validateLastDeploymentMetadata({
      ...state,
      lastDeployment: { ...state.lastDeployment, releasedAt: "not-a-date" },
    }),
    /releasedAt/,
  );
});

test("release workflow keeps dry runs non-mutating and deploys idempotently", async () => {
  const workflow = await readFile(".github/workflows/sync-version.yml", "utf8");
  assert.match(workflow, /inputs\.dry_run/);
  assert.match(workflow, /inputs\.dry_run.*true.*release=true|release=true.*inputs\.dry_run.*true/s);
  assert.ok(workflow.includes("steps.existing_vercel.outputs.needs_deploy == 'true'"));
  assert.ok(workflow.includes("inputs.dry_run != true"));
  assert.match(workflow, /Create annotated release tag, GitHub Release, and update release state[\\s\\S]*inputs\.dry_run != true/);
  assert.ok(workflow.includes('re.match(r"^(tt\\\\d+|tvdb:\\\\d+|tmdb:\\\\d+)$"'));
  assert.ok(workflow.includes('root.get("identityMode") == "bingecat"'));
  assert.match(workflow, /Check for an existing Vercel deployment/);
  assert.match(workflow, /state\["lastDeployment"\] = \{/);
  assert.match(workflow, /GITHUB_RUN_ID/);
});
test("release workflow grants read access to commit statuses", async () => {
  const workflow = await readFile(".github/workflows/sync-version.yml", "utf8");
  assert.ok(workflow.includes("permissions:\n  contents: write\n  statuses: read"));
});

test("production dispatch honors an explicit release target SHA over workflow HEAD", async () => {
  const workflow = await readFile(".github/workflows/sync-version.yml", "utf8");
  const deployMarker = 'elif [[ "${{ github.event_name }}" == "workflow_dispatch" && "${{ inputs.deploy_prod }}" == "true" ]]; then';
  const finalizeMarker = 'elif [[ "${{ github.event_name }}" == "workflow_dispatch" && "${{ inputs.finalize_release }}" == "true" ]]; then';
  const deployStart = workflow.indexOf(deployMarker);
  const finalizeStart = workflow.indexOf(finalizeMarker, deployStart);
  assert.ok(deployStart >= 0);
  assert.ok(finalizeStart > deployStart);
  const deployBlock = workflow.slice(deployStart, finalizeStart);
  assert.ok(deployBlock.includes('target="$(printf \'%s\' \'${{ inputs.release_target_sha }}\' | xargs)"'));
  assert.ok(deployBlock.includes('if [ -z "$target" ]; then target="$GITHUB_SHA"; fi'));
  assert.ok(deployBlock.includes('echo "release_target_sha=$target"'));
});

test("release target validator requires an exact SHA and expected version", () => {
  assert.equal(validateReleaseTarget({
    targetVersion: "5.6.0",
    expectedVersion: "5.6.0",
    targetSha: "0123456789abcdef0123456789abcdef01234567",
  }), true);
  assert.throws(
    () => validateReleaseTarget({
      targetVersion: "5.5.5",
      expectedVersion: "5.6.0",
      targetSha: "0123456789abcdef0123456789abcdef01234567",
    }),
    /does not match expected/,
  );
  assert.throws(
    () => validateReleaseTarget({
      targetVersion: "5.6.0",
      expectedVersion: "5.6.0",
      targetSha: "short",
    }),
    /full 40-character/,
  );
});
