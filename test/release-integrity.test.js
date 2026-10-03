import test from "node:test";
import assert from "node:assert/strict";

import {
  incrementMajor,
  incrementMinor,
  isValidNextReleaseVersion,
  validateVersionConsistency,
} from "../scripts/release-integrity.mjs";

test("release increments support both minor releases and major baselines", () => {
  assert.equal(incrementMinor("0.15.0"), "0.16.0");
  assert.equal(incrementMajor("0.15.0"), "1.0.0");
  assert.equal(isValidNextReleaseVersion("0.15.0", "0.16.0"), true);
  assert.equal(isValidNextReleaseVersion("0.15.0", "1.0.0"), true);
  assert.equal(isValidNextReleaseVersion("0.15.0", "1.1.0"), false);
  assert.equal(isValidNextReleaseVersion("0.15.0", "0.15.1"), false);
});

test("major release baseline passes release-state consistency validation", () => {
  assert.doesNotThrow(() => validateVersionConsistency({
    addonVersion: "1.0.0",
    packageVersion: "1.0.0",
    productionVersion: "0.15.0",
    productionTag: "v0.15.0",
    nextReleaseVersion: "1.0.0",
    deploymentsSincePause: 5,
    deploymentLimit: 10,
    paused: false,
  }));
});
