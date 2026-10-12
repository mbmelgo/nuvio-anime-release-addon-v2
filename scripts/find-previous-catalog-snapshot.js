#!/usr/bin/env node

import fs from "node:fs";

const current = parseVersion(process.argv[2] || "");
if (!current) {
  console.error("Usage: node scripts/find-previous-catalog-snapshot.js <current-version>");
  process.exit(2);
}

const refs = fs.readFileSync(0, "utf8").split(/\r?\n/);
const candidates = [];

for (const rawRef of refs) {
  const ref = rawRef.trim();
  if (!ref) continue;

  const match = /^(?:origin\/catalog-snapshots\/|refs\/remotes\/origin\/catalog-snapshots\/)?v(\d+)\.(\d+)\.(\d+)$/.exec(ref);
  if (!match) continue;

  const version = match.slice(1).map(Number);
  if (!version.every(Number.isSafeInteger)) continue;
  if (compareVersions(version, current) < 0) candidates.push(version);
}

if (candidates.length) {
  candidates.sort(compareVersions);
  console.log(candidates.at(-1).join("."));
}

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) return null;
  const version = match.slice(1).map(Number);
  return version.every(Number.isSafeInteger) ? version : null;
}

function compareVersions(a, b) {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}
