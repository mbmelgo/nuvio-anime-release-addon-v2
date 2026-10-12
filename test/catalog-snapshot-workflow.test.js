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


test("release diff discovers previous snapshot branches from fetched local refs", () => {
  assert.match(
    workflow,
    /git fetch --quiet origin[\s\S]*?refs\/heads\/catalog-snapshots\/v\*:refs\/remotes\/origin\/catalog-snapshots\/v\*/,
  );
  assert.match(workflow, /node scripts\/find-previous-catalog-snapshot\.js "\$RELEASE_VERSION"/);
  assert.doesNotMatch(workflow, /git fetch --quiet origin[^\n]*\|\| true/);
  assert.doesNotMatch(
    workflow,
    /git ls-remote --heads origin refs\/heads\/catalog-snapshots\/v\*/,
  );
});


test("snapshot version selection uses semantic numeric ordering and ignores invalid refs", async () => {
  const { spawnSync } = await import("node:child_process");
  const script = new URL("../scripts/find-previous-catalog-snapshot.js", import.meta.url);
  const result = spawnSync(
    process.execPath,
    [script.pathname, "1.100.0"],
    {
      encoding: "utf8",
      input: [
        "origin/catalog-snapshots/v1.9.0",
        "origin/catalog-snapshots/v1.99.0",
        "origin/catalog-snapshots/v1.99.1",
        "origin/catalog-snapshots/v1.100.0",
        "origin/catalog-snapshots/v1.101.0",
        "origin/catalog-snapshots/vgarbage",
        "origin/catalog-snapshots/v01.99.0",
        "origin/catalog-snapshots/v1.999999999999999999999.0.0",
      ].join("\n"),
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "1.99.1");
});

test("snapshot version selection returns no version when no valid earlier ref exists", async () => {
  const { spawnSync } = await import("node:child_process");
  const script = new URL("../scripts/find-previous-catalog-snapshot.js", import.meta.url);
  const result = spawnSync(
    process.execPath,
    [script.pathname, "1.100.0"],
    {
      encoding: "utf8",
      input: [
        "origin/catalog-snapshots/v1.100.0",
        "origin/catalog-snapshots/v1.101.0",
        "origin/catalog-snapshots/vmalformed",
      ].join("\n"),
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "");
});

test("snapshot version selection rejects an invalid current version", async () => {
  const { spawnSync } = await import("node:child_process");
  const script = new URL("../scripts/find-previous-catalog-snapshot.js", import.meta.url);
  const result = spawnSync(process.execPath, [script.pathname, "v1.100.0"], {
    encoding: "utf8",
    input: "origin/catalog-snapshots/v1.99.0",
  });

  assert.equal(result.status, 2);
});
