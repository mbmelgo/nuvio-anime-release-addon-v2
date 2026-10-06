import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = fs.readFileSync(
  new URL("../.github/workflows/catalog-snapshot.yml", import.meta.url),
  "utf8",
);

test("catalog snapshots capture the canonical series protocol across every page", () => {
  assert.match(workflow, /catalog\/series\/\$catalog\.json\?skip=\$skip/);
  assert.doesNotMatch(workflow, /catalog\/anime\/\$catalog\.json\?skip=\$skip/);
  assert.match(workflow, /"protocolType": "series"/);
  assert.match(workflow, /"legacyProtocolType": "anime"/);
  assert.match(workflow, /requestCapture.*per-page GET request metadata and raw JSON response/);
  assert.match(workflow, /page-\$\(printf '%04d' "\$page"\)\.request\.json/);
  assert.match(workflow, /"method": "GET"/);
  assert.match(workflow, /"query": \{"skip": skip\}/);
  assert.match(workflow, /"body": None/);
  assert.match(workflow, /cp -R \/tmp\/catalog-snapshot\/pages\/\./);
  assert.match(workflow, /glob\("page-\[0-9\]\[0-9\]\[0-9\]\[0-9\]\.json"\)/);
  assert.match(workflow, /request metadata count does not match response page count/);
});
