export function parseVersion(value) {
  const match = String(value || "").match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`Invalid semantic version: ${value}`);
  return match.slice(1).map(Number);
}

export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

export function incrementMinor(version) {
  const [major, minor] = parseVersion(version);
  return `${major}.${minor + 1}.0`;
}

export function incrementMajor(version) {
  const [major] = parseVersion(version);
  return `${major + 1}.0.0`;
}

export function isValidNextReleaseVersion(productionVersion, nextReleaseVersion, supersededReleaseVersions = []) {
  const baselineVersions = [productionVersion, ...(Array.isArray(supersededReleaseVersions) ? supersededReleaseVersions : [])];
  const highestBaseline = baselineVersions
    .map((version) => {
      try { return { version, parsed: parseVersion(version) }; } catch { return null; }
    })
    .filter(Boolean)
    .sort((left, right) => {
      for (let i = 0; i < 3; i += 1) {
        if (left.parsed[i] !== right.parsed[i]) return left.parsed[i] - right.parsed[i];
      }
      return 0;
    })
    .at(-1)?.version || productionVersion;

  return nextReleaseVersion === incrementMinor(highestBaseline) ||
    nextReleaseVersion === incrementMajor(productionVersion);
}

export function validateVersionConsistency({
  addonVersion,
  packageVersion,
  productionVersion,
  productionTag,
  nextReleaseVersion,
  supersededReleaseVersions = [],
  deploymentsSincePause,
  deploymentLimit,
  paused,
}) {
  if (addonVersion !== packageVersion) {
    throw new Error(`api/version.js (${addonVersion}) does not match package.json (${packageVersion}).`);
  }
  const isUnreleasedBaseline = productionVersion === "0.0.0" && productionTag === null && deploymentsSincePause === 0;
  if (!isUnreleasedBaseline && (!/^v\d+\.\d+\.\d+$/.test(productionTag) || productionTag !== `v${productionVersion}`)) {
    throw new Error(`Production tag ${productionTag} does not match production version ${productionVersion}.`);
  }
  if (!isValidNextReleaseVersion(productionVersion, nextReleaseVersion, supersededReleaseVersions)) {
    throw new Error(`Next release ${nextReleaseVersion} must be either the minor increment or major baseline of production ${productionVersion}.`);
  }
  if (!Number.isInteger(deploymentsSincePause) || !Number.isInteger(deploymentLimit) ||
      deploymentsSincePause < 0 || deploymentLimit <= 0 || deploymentsSincePause > deploymentLimit) {
    throw new Error("Deployment checkpoint state is invalid.");
  }
  if (typeof paused !== "boolean") throw new Error("Deployment checkpoint paused flag is invalid.");
  if (paused !== (deploymentsSincePause >= deploymentLimit)) {
    throw new Error("Deployment checkpoint paused flag does not match the deployment count.");
  }
  if (compareVersions(addonVersion, productionVersion) < 0) {
    throw new Error(`Development version ${addonVersion} is behind production version ${productionVersion}.`);
  }
  return true;
}

export function validateReleaseTarget({ targetVersion, expectedVersion, targetSha }) {
  if (!/^[0-9a-f]{40}$/i.test(String(targetSha || ""))) throw new Error("Release target SHA must be a full 40-character commit SHA.");
  if (targetVersion !== expectedVersion) throw new Error(`Release target version ${targetVersion} does not match expected release version ${expectedVersion}.`);
  return true;
}

export function validateReleaseConcurrencyState({ state, targetVersion }) {
  if (!state || typeof state !== "object") throw new Error("Current release state is missing.");
  if (state.paused || state.deploymentsSincePause >= state.deploymentLimit) {
    throw new Error("Deployment checkpoint reached on current main; release target is stale.");
  }
  if (state.nextReleaseVersion !== targetVersion) {
    throw new Error(`Release target ${targetVersion} is stale; current main expects ${state.nextReleaseVersion}.`);
  }
  return true;
}
export function validateLastDeploymentMetadata(state) {
  const deployment = state?.lastDeployment;
  if (state?.lastDeploymentVersion === "0.0.0" && state?.lastDeploymentTag === null && deployment === null) {
    if (state.lastDeploymentSha !== null || state.lastDeploymentId !== null) {
      throw new Error("Unreleased baseline must not contain deployment identifiers.");
    }
    return true;
  }
  if (!deployment || typeof deployment !== "object") {
    throw new Error("lastDeployment metadata is missing.");
  }

  if (deployment.version !== state.lastDeploymentVersion) {
    throw new Error("lastDeployment version does not match lastDeploymentVersion.");
  }
  if (!/^[0-9a-f]{40}$/i.test(String(deployment.sha || "")) || deployment.sha !== state.lastDeploymentSha) {
    throw new Error("lastDeployment SHA does not match lastDeploymentSha.");
  }
  if (!/^dpl_[A-Za-z0-9]+$/.test(String(deployment.vercelDeploymentId || "")) ||
      deployment.vercelDeploymentId !== state.lastDeploymentId) {
    throw new Error("lastDeployment deployment ID does not match lastDeploymentId.");
  }
  if (!/^v\d+\.\d+\.\d+$/.test(String(deployment.tag || "")) ||
      deployment.tag !== state.lastDeploymentTag ||
      deployment.tag !== `v${deployment.version}`) {
    throw new Error("lastDeployment tag does not match the authoritative release version.");
  }
  if (deployment.releasedAt !== null && (!Number.isFinite(Date.parse(deployment.releasedAt)))) {
    throw new Error("lastDeployment releasedAt is invalid.");
  }
  if (deployment.ciRunId !== null && !/^\d+$/.test(String(deployment.ciRunId))) {
    throw new Error("lastDeployment ciRunId is invalid.");
  }
  if (deployment.ciRunUrl !== null) {
    try {
      const url = new URL(deployment.ciRunUrl);
      if (url.protocol !== "https:" || url.hostname !== "github.com") throw new Error();
    } catch {
      throw new Error("lastDeployment ciRunUrl is invalid.");
    }
  }
  if (deployment.smokeTest !== "passed") {
    throw new Error("lastDeployment smokeTest must be passed.");
  }
  return true;
}

import fs from "node:fs";
import path from "node:path";

function readVersionFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const match = content.match(/ADDON_VERSION = "([^"]+)"/);
  if (!match) throw new Error(`Missing ADDON_VERSION in ${filePath}.`);
  return match[1];
}

function readReadmeVersions(readme) {
  const badge = readme.match(/version-(\d+\.\d+\.\d+)-blue/);
  const production = readme.match(/\*\*Production:\*\*\s*`([^`]+)`/);
  const development = readme.match(/\*\*Development:\*\*\s*`([^`]+)`/);
  if (!badge || !production || !development) throw new Error("README release version markers are incomplete.");
  return { badge: badge[1], production: production[1], development: development[1] };
}

export function validateRepositoryReleaseState(root = process.cwd()) {
  const addonVersion = readVersionFile(path.join(root, "api/version.js"));
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const state = JSON.parse(fs.readFileSync(path.join(root, "ops/release-state.json"), "utf8"));
  const readmeVersions = readReadmeVersions(fs.readFileSync(path.join(root, "README.md"), "utf8"));

  validateVersionConsistency({
    addonVersion,
    packageVersion: packageJson.version,
    productionVersion: state.lastDeploymentVersion,
    productionTag: state.lastDeploymentTag,
    nextReleaseVersion: state.nextReleaseVersion,
    supersededReleaseVersions: state.supersededReleaseVersions,
    deploymentsSincePause: state.deploymentsSincePause,
    deploymentLimit: state.deploymentLimit,
    paused: state.paused,
  });

  validateLastDeploymentMetadata(state);

  if (readmeVersions.badge !== addonVersion || readmeVersions.development.replace(/^v/, "") !== addonVersion) {
    throw new Error("README development version is out of sync with api/version.js.");
  }
  if (readmeVersions.production.replace(/^v/, "") !== state.lastDeploymentVersion) {
    throw new Error("README production version is out of sync with ops/release-state.json.");
  }
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  validateRepositoryReleaseState();
  console.log("Release metadata validation passed.");
}
