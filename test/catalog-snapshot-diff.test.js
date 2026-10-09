import assert from "node:assert/strict";
import test from "node:test";
import { compareCatalogSnapshots, normalizeCatalogTitle } from "../lib/catalog-snapshot-diff.js";

const item = (overrides = {}) => ({
  id: "tt100",
  type: "series",
  name: "Example Anime",
  extra: {
    anilistId: 100,
    malId: 200,
    identityProvider: "imdb",
    identityId: "tt100",
    titleEnglish: "Example Anime",
    titleRomaji: "Example Anime",
    ...overrides.extra,
  },
  releaseInfo: "2026",
  ...overrides,
});

const snapshot = (version, catalogs) => ({
  releaseVersion: version,
  catalogs: Object.fromEntries(
    Object.entries(catalogs).map(([name, metas]) => [name, { metas }]),
  ),
});

test("normalizes fallback titles deterministically", () => {
  assert.equal(normalizeCatalogTitle("  Poké-Oki: Season 2!  "), "poke oki season 2");
  assert.equal(normalizeCatalogTitle("Ｍａｇｉｃａｌ★Explorer"), "magical explorer");
});

test("matches by AniList before MAL or title fallback", () => {
  const before = snapshot("1.51.0", {
    current_season: [item()],
  });
  const after = snapshot("1.52.0", {
    current_season: [item({
      id: "mal:999",
      name: "Completely Different Title",
      extra: {
        anilistId: 100,
        malId: 999,
        identityProvider: null,
        identityId: null,
      },
    })],
  });

  const diff = compareCatalogSnapshots(before, after);
  const change = diff.catalogs.current_season.changes[0];

  assert.equal(change.matchMethod, "anilist");
  assert.equal(change.key, "anilist:100");
  assert.ok(change.changeTypes.includes("identity_changed"));
});

test("classifies provider and identity quality changes", () => {
  const before = snapshot("1.51.0", {
    current_season: [
      item(),
      item({
        id: "mal:201",
        extra: { anilistId: 101, malId: 201, identityProvider: null, identityId: null },
      }),
    ],
  });
  const after = snapshot("1.52.0", {
    current_season: [
      item({ id: "mal:999", extra: { anilistId: 100, malId: 999, identityProvider: null, identityId: null } }),
      item({
        id: "tt101",
        extra: { anilistId: 101, malId: 201, identityProvider: "imdb", identityId: "tt101" },
      }),
    ],
  });

  const changes = diffChanges(compareCatalogSnapshots(before, after));
  assert.ok(changes[0].changeTypes.includes("identity_degraded"));
  assert.ok(changes[0].changeTypes.includes("provider_changed"));
  assert.ok(changes[1].changeTypes.includes("identity_improved"));
  assert.ok(changes[1].changeTypes.includes("provider_changed"));
});

test("ranks provider identities with TMDB first, IMDb second, and TVDB third", () => {
  const before = snapshot("1.88.0", {
    current_season: [
      item({ id: "tvdb:100", extra: { anilistId: 100, malId: 200, identityProvider: "tvdb", identityId: "100" } }),
      item({ id: "tt101", extra: { anilistId: 101, malId: 201, identityProvider: "imdb", identityId: "tt101" } }),
      item({ id: "mal:202", extra: { anilistId: 102, malId: 202, identityProvider: "mal", identityId: "202" } }),
      item({ id: "anilist:103", extra: { anilistId: 103, malId: 203, identityProvider: "anilist", identityId: "103" } }),
    ],
  });
  const after = snapshot("1.89.0", {
    current_season: [
      item({ id: "tmdb:100", extra: { anilistId: 100, malId: 200, identityProvider: "tmdb", identityId: "100" } }),
      item({ id: "tvdb:101", extra: { anilistId: 101, malId: 201, identityProvider: "tvdb", identityId: "101" } }),
      item({ id: "tt102", extra: { anilistId: 102, malId: 202, identityProvider: "imdb", identityId: "tt102" } }),
      item({ id: "mal:103", extra: { anilistId: 103, malId: 203, identityProvider: "mal", identityId: "103" } }),
    ],
  });

  const changes = diffChanges(compareCatalogSnapshots(before, after));
  assert.ok(changes[0].changeTypes.includes("identity_improved"), "TMDB must outrank TVDB");
  assert.ok(changes[1].changeTypes.includes("identity_degraded"), "TVDB must rank below IMDb");
  assert.ok(changes[2].changeTypes.includes("identity_improved"), "IMDb must outrank MAL");
  assert.ok(changes[3].changeTypes.includes("identity_improved"), "MAL must outrank AniList");
});

test("detects title, year, and explicit season changes without inventing season data", () => {
  const before = snapshot("1.51.0", {
    current_season: [item({
      releaseInfo: "2026",
      extra: { anilistId: 100, season: "FALL" },
    })],
  });
  const after = snapshot("1.52.0", {
    current_season: [item({
      name: "Example Anime: New Title",
      releaseInfo: "2027",
      extra: { anilistId: 100, season: "WINTER" },
    })],
  });

  const change = compareCatalogSnapshots(before, after).catalogs.current_season.changes[0];
  assert.ok(change.changeTypes.includes("title_changed"));
  assert.ok(change.changeTypes.includes("year_changed"));
  assert.ok(change.changeTypes.includes("season_changed"));
});

test("detects additions and removals while ignoring catalog array position", () => {
  const before = snapshot("1.51.0", {
    current_season: [item(), item({ extra: { anilistId: 101, malId: 201 }, id: "tt101", name: "Second" })],
  });
  const after = snapshot("1.52.0", {
    current_season: [
      item({ extra: { anilistId: 102, malId: 202 }, id: "tt102", name: "New" }),
      item(),
      item({ extra: { anilistId: 101, malId: 201 }, id: "tt101", name: "Second" }),
    ],
  });

  const catalog = compareCatalogSnapshots(before, after).catalogs.current_season;
  assert.equal(catalog.summary.added, 1);
  assert.equal(catalog.summary.removed, 0);
  assert.equal(catalog.summary.matched, 2);
  assert.equal(catalog.summary.orderingChanged, 0);
});

test("detects real ordering changes among matched entries", () => {
  const before = snapshot("1.51.0", {
    current_season: [
      item(),
      item({ id: "tt101", name: "Second", extra: { anilistId: 101, malId: 201 } }),
      item({ id: "tt102", name: "Third", extra: { anilistId: 102, malId: 202 } }),
    ],
  });
  const after = snapshot("1.52.0", {
    current_season: [
      item({ id: "tt102", name: "Third", extra: { anilistId: 102, malId: 202 } }),
      item(),
      item({ id: "tt101", name: "Second", extra: { anilistId: 101, malId: 201 } }),
    ],
  });

  const catalog = compareCatalogSnapshots(before, after).catalogs.current_season;
  assert.ok(catalog.summary.orderingChanged > 0);
  assert.ok(catalog.changes.some((change) => change.changeTypes.includes("ordering_changed")));
});

test("uses unique normalized title only when stable IDs cannot match", () => {
  const before = snapshot("1.51.0", {
    current_season: [{
      id: "mal:0",
      type: "series",
      name: "  Unique Title! ",
      extra: {},
      releaseInfo: "2026",
    }],
  });
  const after = snapshot("1.52.0", {
    current_season: [{
      id: "tvdb:123",
      type: "series",
      name: "unique-title",
      extra: {},
      releaseInfo: "2026",
    }],
  });

  const change = compareCatalogSnapshots(before, after).catalogs.current_season.changes[0];
  assert.equal(change.matchMethod, "title");
});

test("does not title-match ambiguous duplicates", () => {
  const base = { id: "mal:0", type: "series", name: "Same Title", extra: {}, releaseInfo: "2026" };
  const before = snapshot("1.51.0", { current_season: [base] });
  const after = snapshot("1.52.0", {
    current_season: [
      { ...base, id: "tvdb:1" },
      { ...base, id: "tvdb:2" },
    ],
  });

  const catalog = compareCatalogSnapshots(before, after).catalogs.current_season;
  assert.equal(catalog.summary.matched, 0);
  assert.equal(catalog.summary.added, 2);
  assert.equal(catalog.summary.removed, 1);
});

function diffChanges(diff) {
  return diff.catalogs.current_season.changes.filter((change) => change.before && change.after);
}

test("CLI generates JSON and Markdown from snapshot directories", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { spawnSync } = await import("node:child_process");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-diff-test-"));
  const beforeDir = path.join(root, "before");
  const afterDir = path.join(root, "after");
  const outputDir = path.join(root, "output");

  try {
    for (const [directory, version] of [[beforeDir, "1.51.0"], [afterDir, "1.52.0"]]) {
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(
        path.join(directory, "capture-metadata.json"),
        JSON.stringify({ releaseVersion: version }),
      );
      for (const catalog of [
        "current_season",
        "previous_season",
        "upcoming_season",
        "upcoming_5_days",
        "previous_7_days",
      ]) {
        fs.writeFileSync(path.join(directory, `${catalog}.json`), JSON.stringify({ metas: [] }));
      }
    }

    const result = spawnSync(
      process.execPath,
      ["scripts/compare-catalog-snapshots.js", beforeDir, afterDir, outputDir],
      { encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const diff = JSON.parse(fs.readFileSync(path.join(outputDir, "release-diff.json"), "utf8"));
    assert.equal(diff.beforeReleaseVersion, "1.51.0");
    assert.equal(diff.afterReleaseVersion, "1.52.0");
    assert.match(
      fs.readFileSync(path.join(outputDir, "release-diff.md"), "utf8"),
      /Catalog release diff: v1\.51\.0 → v1\.52\.0/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
