import test from "node:test";
import assert from "node:assert/strict";

import {
  incrementMajor,
  incrementMinor,
  isValidNextReleaseVersion,
  validateVersionConsistency,
  validateReleaseConcurrencyState,
} from "../scripts/release-integrity.mjs";

test("release increments support both minor releases and major baselines", () => {
  assert.equal(incrementMinor("0.15.0"), "0.16.0");
  assert.equal(incrementMajor("0.15.0"), "1.0.0");
  assert.equal(incrementMajor("1.133.0"), "2.0.0");
  assert.equal(isValidNextReleaseVersion("0.15.0", "0.16.0"), true);
  assert.equal(isValidNextReleaseVersion("0.15.0", "1.0.0"), true);
  assert.equal(isValidNextReleaseVersion("1.133.0", "2.0.0"), true);
  assert.equal(isValidNextReleaseVersion("0.15.0", "1.1.0"), false);
  assert.equal(isValidNextReleaseVersion("0.15.0", "0.15.1"), false);
});

test("v2.0.0 major rebrand baseline passes release-state consistency validation", () => {
  assert.doesNotThrow(() => validateVersionConsistency({
    addonVersion: "2.0.0",
    packageVersion: "2.0.0",
    productionVersion: "1.133.0",
    productionTag: "v1.133.0",
    nextReleaseVersion: "2.0.0",
    supersededReleaseVersions: ["1.24.0", "1.25.0", "1.26.0", "1.27.0"],
    deploymentsSincePause: 5,
    deploymentLimit: 10,
    paused: false,
  }));
});
test("release concurrency gate rejects a stale target after another release advances main", () => {
  assert.throws(() => validateReleaseConcurrencyState({
    state: { paused: true, deploymentsSincePause: 10, deploymentLimit: 10, nextReleaseVersion: "1.5.0" },
    targetVersion: "1.4.0",
  }), /Deployment checkpoint reached/);

  assert.throws(() => validateReleaseConcurrencyState({
    state: { paused: false, deploymentsSincePause: 1, deploymentLimit: 10, nextReleaseVersion: "1.5.0" },
    targetVersion: "1.4.0",
  }), /Release target 1.4.0 is stale/);
});
