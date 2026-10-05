import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const deployWorkflow = fs.readFileSync(new URL("../.github/workflows/sync-version.yml", import.meta.url), "utf8");

test("release workflow exposes manual dispatch inputs", () => {
  assert.match(deployWorkflow, /workflow_dispatch:/);
  assert.match(deployWorkflow, /deploy_prod:/);
  assert.match(deployWorkflow, /finalize_release:/);
  assert.match(deployWorkflow, /release_target_sha:/);
});

test("release finalizer synchronizes the README production version", () => {
  assert.equal(
    deployWorkflow.includes('readme = re.sub(r"(\\*\\*Production:\\*\\*\\s*)`[^`]+`", rf"\\g<1>`v{version}`", readme)'),
    true,
  );
  assert.equal(
    deployWorkflow.includes('readme = re.sub(r"(\\\\*\\\\*Production:'),
    false,
  );
});

test("release finalization validates the deployed target version", () => {
  assert.match(deployWorkflow, /git show/);
  assert.equal(deployWorkflow.includes("api/version.js"), true);
  assert.match(deployWorkflow, /Release target version.*next release baseline/);
});

test("release smoke test uses the deployed target version during finalization", () => {
  assert.match(deployWorkflow, /steps\.gate\.outputs\.redeploy/);
  assert.match(deployWorkflow, /release_target_sha.*api\/version\.js/);
});

test("release workflow runs CI before deployment", () => {
  assert.match(deployWorkflow, /Run full CI/);
  assert.match(deployWorkflow, /npm test/);
  assert.match(deployWorkflow, /\[deploy-prod\]/);
});

test("release workflow tags and summarizes the production release", () => {
  assert.match(deployWorkflow, /git tag -a \"\$tag\" \"\$target\"/);
  assert.match(deployWorkflow, /git tag --merged \"\$target\^\"/);
  assert.match(deployWorkflow, /git.*log.*--reverse.*--no-merges/);
  assert.match(deployWorkflow, /git push origin \"refs\/tags\/\$tag\"/);
});

test("release workflow contains one production smoke test and one release finalizer", () => {
  assert.equal((deployWorkflow.match(/- name: Production smoke test/g) || []).length, 1);
  assert.equal((deployWorkflow.match(/- name: Create annotated release tag, GitHub Release, and update release state/g) || []).length, 1);
  assert.doesNotMatch(deployWorkflow, /assert any\(m\.get\('id'\) == 'anilist:195604' for m in metas\)/);
  assert.doesNotMatch(deployWorkflow, /\n,str\(m\.get\('id',''\)\) for m in metas\)/);
});

test("release smoke test validates the provider catalog identity", () => {
  assert.match(deployWorkflow, /https:\/\/nuvio-anime-release-addon-v2\.vercel\.app\/manifest\.json/);
  assert.match(deployWorkflow, /https:\/\/nuvio-anime-release-addon-v2\.vercel\.app\/catalog\/anime\/current_season\.json/);
  assert.doesNotMatch(deployWorkflow, /\/catalog\/series\/ongoing\.json/);
  assert.match(deployWorkflow, /com\.marki\.nuvio\.anime-releases/);
  assert.doesNotMatch(deployWorkflow, /com\.marki\.nuvio\.anime-releases\.v5/);
  assert.doesNotMatch(deployWorkflow, /\/v5\//);
  assert.match(deployWorkflow, /identityMode.*provider/);
  assert.ok(deployWorkflow.includes('r"^(tt\\d+|tvdb:[1-9]\\d*|tmdb:[1-9]\\d*|mal:[1-9]\\d*)$"'));
  assert.match(deployWorkflow, /assert all\(m\.get\("type"\) == "series" for m in metas\)/);
});


test("release workflow resolves and records the actual Vercel deployment ID", () => {
  assert.match(deployWorkflow, /Resolve Vercel deployment ID/);
  assert.match(deployWorkflow, /commits\/\\?\$\{target\}\/status/);
  assert.match(deployWorkflow, /resolve-vercel-deployment-id\.mjs/);
  assert.match(deployWorkflow, /steps\.vercel_deployment\.outputs\.deployment_id/);
  assert.match(deployWorkflow, /state\["lastDeploymentId"\] = os\.environ\["VERCEL_DEPLOYMENT_ID"\]/);
  assert.doesNotMatch(deployWorkflow, /state\["lastDeploymentId"\] = ""/);
});

test("dry-run validates the existing production version instead of the unreleased target version", () => {
  assert.equal(deployWorkflow.includes('if [ "${{ inputs.dry_run }}" = "true" ]; then'), true);
  assert.equal(deployWorkflow.includes('production_expected="$(curl --fail --silent --show-error https://nuvio-anime-release-addon-v2.vercel.app/manifest.json'), true);
  assert.equal(deployWorkflow.includes('EXPECTED="$production_expected" TARGET="$expected"'), true);
  assert.equal(deployWorkflow.includes('EXPECTED_VERSION="$production_expected" PRODUCTION_BASE_URL='), true);
});

test("dry-run trims whitespace from a manually supplied release target SHA", () => {
  assert.equal(deployWorkflow.includes("target=\"$(printf '%s' '${{ inputs.release_target_sha }}' | xargs)\""), true);
});


test("extended production validation defines its production version within the same shell", () => {
  assert.equal(
    deployWorkflow.includes('EXPECTED_VERSION="$production_expected" PRODUCTION_BASE_URL=') &&
    deployWorkflow.includes('production_expected="$(curl --fail --silent --show-error https://nuvio-anime-release-addon-v2.vercel.app/manifest.json'),
    true,
  );
});
