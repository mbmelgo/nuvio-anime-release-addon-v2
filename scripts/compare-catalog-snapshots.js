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
  const legacyCatalogNames = {
    upcoming_3_days: "upcoming_5_days",
    previous_3_days: "previous_7_days",
  };
  const legacySnapshot = Number(metadata.schemaVersion || 0) < 4;
  for (const catalog of DEFAULT_CATALOGS) {
    const currentPath = path.join(directory, `${catalog}.json`);
    const legacyPath = path.join(directory, `${legacyCatalogNames[catalog] || ""}.json`);
    const sourcePath = fs.existsSync(currentPath) ? currentPath : legacyPath;
    if (!fs.existsSync(sourcePath)) {
      if (legacySnapshot && catalog.endsWith("_movies")) {
        catalogs[catalog] = { metas: [] };
        continue;
      }
      throw new Error(`Missing snapshot for ${catalog} (also checked its legacy catalog name)`);
    }
    catalogs[catalog] = readJson(sourcePath);
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
    "| Catalog | Before | After | Added | Removed | Matched | Unchanged | Provider rank ↑ | Provider rank ↓ | Provider | Evidence | Canonical | Fallback | Title | Season | Year | Order |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];

  for (const catalog of Object.values(diff.catalogs)) {
    const s = catalog.summary;
    lines.push(
      `| ${catalog.catalog} | ${s.before} | ${s.after} | ${s.added} | ${s.removed} | ${s.matched} | ${s.unchanged} | ${s.providerRankImproved} | ${s.providerRankDegraded} | ${s.providerChanged} | ${s.identityEvidenceChanged} | ${s.canonicalSeriesChanged} | ${s.identityFallbackChanged} | ${s.titleChanged} | ${s.seasonChanged} | ${s.yearChanged} | ${s.orderingChanged} |`,
    );
  }

  const t = diff.totals;
  lines.push(
    `| **Total** | **${t.before}** | **${t.after}** | **${t.added}** | **${t.removed}** | **${t.matched}** | **${t.unchanged}** | **${t.providerRankImproved}** | **${t.providerRankDegraded}** | **${t.providerChanged}** | **${t.identityEvidenceChanged}** | **${t.canonicalSeriesChanged}** | **${t.identityFallbackChanged}** | **${t.titleChanged}** | **${t.seasonChanged}** | **${t.yearChanged}** | **${t.orderingChanged}** |`,
  );

  const changed = Object.values(diff.catalogs)
    .flatMap((catalog) => catalog.changes
      .filter((change) => change.changeTypes.length > 0)
      .map((change) => ({ catalog: catalog.catalog, ...change })));

  if (changed.length) {
    lines.push("", "## Changes", "");
    for (const change of changed) {
      const title = change.after?.name || change.before?.name || change.key;
      const details = [];
      if (change.changeTypes.includes("identity_evidence_changed")) {
        details.push(`evidence: ${formatIdentityEvidence(change.before)} → ${formatIdentityEvidence(change.after)}`);
      }
      if (change.changeTypes.includes("canonical_series_changed")) {
        details.push(`canonical series: ${formatCanonicalSeries(change.before)} → ${formatCanonicalSeries(change.after)}`);
      }
      if (change.changeTypes.includes("identity_fallback_changed")) {
        details.push(`fallback: ${change.before?.identityFallback || "none"} → ${change.after?.identityFallback || "none"}`);
      }
      lines.push(
        `- **${change.catalog} — ${title}** — ${change.changeTypes.join(", ")} (${change.matchMethod || "no match"})${details.length ? ` — ${details.join("; ")}` : ""}`,
      );
    }
  } else {
    lines.push("", "No catalog changes detected.", "");
  }

  return lines.join("\n");
}

function formatIdentityEvidence(meta) {
  const entries = Array.isArray(meta?.identityEvidence) ? meta.identityEvidence : [];
  if (!entries.length) return "none";
  return entries.map((entry) => {
    const qualifiers = [];
    if (entry.season) qualifiers.push(`season ${entry.season}`);
    if (entry.episodeOffset !== undefined) qualifiers.push(`episode offset ${entry.episodeOffset}`);
    if (entry.version) qualifiers.push(`v${entry.version}`);
    if (entry.relation) qualifiers.push("relation");
    return `${entry.source || "unknown"}${qualifiers.length ? ` (${qualifiers.join(", ")})` : ""}`;
  }).join(", ");
}

function formatCanonicalSeries(meta) {
  if (!meta?.identityCanonicalSeries) return "no";
  const title = String(meta.identityCanonicalSeriesTitle || "").trim();
  return title ? `yes (${title})` : "yes";
}
