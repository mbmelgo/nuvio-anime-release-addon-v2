import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const workflow = fs.readFileSync(
  new URL("../.github/workflows/catalog-snapshot.yml", import.meta.url),
  "utf8",
);

test("catalog snapshots capture all movie and series protocol catalogs across every page", () => {
  assert.ok(workflow.includes('node scripts/find-previous-catalog-snapshot.js "$RELEASE_VERSION"'));
  assert.ok(!workflow.includes("git fetch --quiet origin '+refs/heads/catalog-snapshots/v*:refs/remotes/origin/catalog-snapshots/v*' || true"));
  assert.ok(workflow.includes('"protocolType": "mixed"'));
  assert.ok(workflow.includes('"protocolTypes": ["series", "movie"]'));
  assert.ok(workflow.includes('"legacyProtocolType": "anime"'));
  assert.ok(workflow.includes("movie:current_season_movies"));
  assert.ok(workflow.includes('/catalog/$catalog_type/$catalog.json?skip=$skip'));
  assert.ok(workflow.includes("per-page GET request metadata and raw JSON response"));
  assert.ok(workflow.includes("request metadata count does not match response page count"));
  assert.ok(workflow.includes("cp -R /tmp/catalog-snapshot/pages/."));
});

test("release diff discovers previous snapshot branches from fetched local refs", () => {
  assert.ok(workflow.includes("git fetch --quiet origin '+refs/heads/catalog-snapshots/v*:refs/remotes/origin/catalog-snapshots/v*'"));
  assert.ok(workflow.includes('node scripts/find-previous-catalog-snapshot.js "$RELEASE_VERSION"'));
  assert.doesNotMatch(workflow, /\|\| true/);
  assert.ok(workflow.includes('git archive "origin/catalog-snapshots/v$before_version"'));
  assert.ok(workflow.includes("scripts/compare-catalog-snapshots.js"));
  assert.ok(workflow.includes("uses: actions/upload-artifact@v4"));
  assert.ok(workflow.includes("name: catalog-diff-v${{ steps.diff.outputs.before_version }}-to-v${{ steps.release.outputs.version }}"));
});

test("snapshot version selection uses semantic numeric ordering and ignores invalid refs", () => {
  const script = new URL("../scripts/find-previous-catalog-snapshot.js", import.meta.url);
  const result = spawnSync(process.execPath, [script.pathname, "1.100.0"], {
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
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "1.99.1");
});

test("snapshot version selection returns no version when no valid earlier ref exists", () => {
  const script = new URL("../scripts/find-previous-catalog-snapshot.js", import.meta.url);
  const result = spawnSync(process.execPath, [script.pathname, "1.100.0"], {
    encoding: "utf8",
    input: [
      "origin/catalog-snapshots/v1.100.0",
      "origin/catalog-snapshots/v1.101.0",
      "origin/catalog-snapshots/vmalformed",
    ].join("\n"),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "");
});

test("snapshot version selection rejects an invalid current version", () => {
  const script = new URL("../scripts/find-previous-catalog-snapshot.js", import.meta.url);
  const result = spawnSync(process.execPath, [script.pathname, "v1.100.0"], {
    encoding: "utf8",
    input: "origin/catalog-snapshots/v1.99.0",
  });
  assert.equal(result.status, 2);
});


test("snapshot comparison treats newly introduced movie catalogs as empty in legacy snapshots", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nuvio-movie-snapshot-"));
  const before = path.join(root, "before");
  const after = path.join(root, "after");
  const output = path.join(root, "output");
  fs.mkdirSync(before);
  fs.mkdirSync(after);
  const seriesCatalogs = ["current_season", "previous_season", "upcoming_season", "upcoming_3_days", "previous_3_days"];
  const allCatalogs = [...seriesCatalogs.slice(0, 3), "upcoming_season_movies", "current_season_movies", "previous_season_movies", ...seriesCatalogs.slice(3)];
  fs.writeFileSync(path.join(before, "capture-metadata.json"), JSON.stringify({ schemaVersion: 3, releaseVersion: "1.120.0", catalogs: seriesCatalogs }));
  fs.writeFileSync(path.join(after, "capture-metadata.json"), JSON.stringify({ schemaVersion: 4, releaseVersion: "1.121.0", catalogs: allCatalogs }));
  for (const id of seriesCatalogs) {
    fs.writeFileSync(path.join(before, `${id}.json`), JSON.stringify({ metas: [] }));
  }
  for (const id of allCatalogs) {
    const metas = id === "current_season_movies"
      ? [{ id: "tt31970593", type: "movie", name: "Witch on the Holy Night", extra: { anilistId: 143103 } }]
      : [];
    fs.writeFileSync(path.join(after, `${id}.json`), JSON.stringify({ metas }));
  }
  const script = new URL("../scripts/compare-catalog-snapshots.js", import.meta.url);
  const result = spawnSync(process.execPath, [script.pathname, before, after, output], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const diff = JSON.parse(fs.readFileSync(path.join(output, "release-diff.json"), "utf8"));
  assert.equal(diff.catalogs.current_season_movies.summary.added, 1);
  assert.equal(diff.catalogs.upcoming_season_movies.summary.before, 0);
  assert.equal(diff.catalogs.upcoming_season_movies.summary.after, 0);
});
