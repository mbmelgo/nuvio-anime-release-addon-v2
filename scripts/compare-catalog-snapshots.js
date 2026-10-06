#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { compareCatalogSnapshots, DEFAULT_CATALOGS } from "../lib/catalog-snapshot-diff.js";

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Usage: node scripts/compare-catalog-snapshots.js <before-dir> <after-dir> [output-dir]");
  process.exit(2);
}

const [beforeDir, afterDir, outputDir = "."] = args;

const before = loadSnapshot(beforeDir);
const after = loadSnapshot(afterDir);
const diff = compareCatalogSnapshots(before, after);

fs.mkdirSync(outputDir, { recursive: true });
const jsonPath = path.join(outputDir, "release-diff.json");
const markdownPath = path.join(outputDir, "release-diff.md");

fs.writeFileSync(jsonPath, JSON.stringify(diff, null, 2) + "\n");
fs.writeFileSync(markdownPath, renderMarkdown(diff) + "\n");

console.log(`Compared ${before.releaseVersion} -> ${after.releaseVersion}`);
console.log(`JSON: ${jsonPath}`);
console.log(`Markdown: ${markdownPath}`);

function loadSnapshot(directory) {
  const metadata = readJson(path.join(directory, "capture-metadata.json"));
  const releaseVersion = String(metadata.releaseVersion || "").trim();
  if (!/^\d+\.\d+\.\d+$/.test(releaseVersion)) {
    throw new Error(`Invalid or missing releaseVersion in ${directory}/capture-metadata.json`);
  }

  const catalogs = {};
  for (const catalog of DEFAULT_CATALOGS) {
    catalogs[catalog] = readJson(path.join(directory, `${catalog}.json`));
  }

  return {
    releaseVersion,
    capturedAt: metadata.capturedAt || null,
    catalogs,
  };
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read JSON snapshot file ${filePath}: ${error.message}`);
  }
}

function renderMarkdown(diff) {
  const lines = [
    `# Catalog release diff: v${diff.beforeReleaseVersion} → v${diff.afterReleaseVersion}`,
    "",
    "| Catalog | Before | After | Added | Removed | Matched | Unchanged | Improved | Degraded | Provider | Title | Season | Year | Order |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];

  for (const catalog of Object.values(diff.catalogs)) {
    const s = catalog.summary;
    lines.push(
      `| ${catalog.catalog} | ${s.before} | ${s.after} | ${s.added} | ${s.removed} | ${s.matched} | ${s.unchanged} | ${s.identityImproved} | ${s.identityDegraded} | ${s.providerChanged} | ${s.titleChanged} | ${s.seasonChanged} | ${s.yearChanged} | ${s.orderingChanged} |`,
    );
  }

  const t = diff.totals;
  lines.push(
    `| **Total** | **${t.before}** | **${t.after}** | **${t.added}** | **${t.removed}** | **${t.matched}** | **${t.unchanged}** | **${t.identityImproved}** | **${t.identityDegraded}** | **${t.providerChanged}** | **${t.titleChanged}** | **${t.seasonChanged}** | **${t.yearChanged}** | **${t.orderingChanged}** |`,
  );

  const changed = Object.values(diff.catalogs)
    .flatMap((catalog) => catalog.changes
      .filter((change) => change.changeTypes.length > 0)
      .map((change) => ({ catalog: catalog.catalog, ...change })));

  if (changed.length) {
    lines.push("", "## Changes", "");
    for (const change of changed) {
      const title = change.after?.name || change.before?.name || change.key;
      lines.push(
        `- **${change.catalog} — ${title}** — ${change.changeTypes.join(", ")} (${change.matchMethod || "no match"})`,
      );
    }
  } else {
    lines.push("", "No catalog changes detected.", "");
  }

  return lines.join("\n");
}
