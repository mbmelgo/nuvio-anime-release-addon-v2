# Anime Releases for Nuvio

[![Nuvio](https://img.shields.io/badge/Nuvio-addon-ff6f61.svg)](https://nuvio.tv)
[![MAL](https://img.shields.io/badge/MyAnimeList-identity-2e51a2.svg)](https://myanimelist.net)
[![Vercel](https://img.shields.io/badge/deployed_on-Vercel-black.svg?logo=vercel)](https://vercel.com)
[![Version](https://img.shields.io/badge/version-1.65.0-blue.svg)](https://github.com/mbmelgo/nuvio-anime-release-addon-v2/releases)

> A lightweight, season-aware anime release catalog for Nuvio and Stremio-compatible clients.

**Anime Releases for Nuvio** discovers anime releases from **AniList**, resolves each catalog item to a validated provider identity through ARM and independent cross-provider mapping services, and delegates detailed metadata to the metadata addon configured in the client.

## ✨ Features

### 📺 Seasonal catalogs

The addon dynamically exposes:

- **Upcoming Season**
- **Current Season**
- **Previous Season**

The season windows are calculated from the current date rather than hard-coded to a particular year.

### ⏱️ Rolling release catalogs

Two rolling catalogs complement the seasonal views:

- **Upcoming — 5 days** — unique anime with an upcoming airing within the next five days.
- **Previous — 7 days** — unique anime with an airing within the previous seven days.

Rolling catalogs use AniList airing schedules, deduplicate by anime, and paginate the resulting unique catalog for Nuvio.

### 🔑 Cross-provider catalog identity

Catalog items normally use one validated provider identity:

```text
IMDb: tt<id>
TVDB: tvdb:<id>
TMDB: tmdb:<id>
```

TMDB is the active primary resolver: strong title/year matches are upgraded to IMDb when TMDB exposes an IMDb identity, or retained as TMDB when neither TMDB nor the independent IMDb title search yields a validated IMDb identity. ARM supplies the primary cross-provider mapping in a batched request. Later independent sources supplement unresolved rows through Fribb, AniList external links, AniBridge, AniMap, IDMapper, Anime Mapper, AnimeAPI TSV data, IMDb title search, secondary mappings, relation-aware provider resolution, and the MAL identity bridge. Provider validation checks title, year, format, source identity, and explicit related-entry collisions before an identity is accepted. v1.52.0 also verifies TMDB-only matches through the independent IMDb title search before retaining a TMDB fallback.

If no validated provider identity is available, the canonical AniList MAL ID is used as the final fallback (`mal:<id>`); if neither a provider identity nor a MAL ID exists, the catalog emits an AniList identity fallback rather than dropping the row.

The catalog keeps the AniList source id in the item's extra metadata so downstream systems can correlate the entry when needed.

### 📄 Nuvio pagination

- AniList seasonal pages use **50 items**, matching the Nuvio catalog page size.
- Rolling catalogs paginate **after** schedule records are filtered and deduplicated.
- Nuvio search parameters are supported by the catalog endpoints.

### 🔎 Release snapshot comparison

Production catalog snapshots can be compared deterministically by stable AniList/MAL identity, with a conservative normalized-title fallback when neither source ID is available.

The comparator reports:

- added and removed entries
- unchanged entries
- identity improvements and degradations
- provider changes and identity changes
- title, year, and explicitly exposed season changes
- ordering changes among matched entries

Run it locally against two snapshot directories with:

```text
npm run compare:snapshots -- <before-snapshot-dir> <after-snapshot-dir> <output-dir>
```

The command writes:

- `release-diff.json` — machine-readable comparison
- `release-diff.md` — human-readable summary

The `Compare catalog snapshots` GitHub Actions workflow automatically performs the same comparison when a new `catalog-snapshots/vX.Y.Z` branch is updated and uploads both files as an artifact. No production deployment or credentials are required. Production releases also trigger a full snapshot of all five catalogs and all paginated results.

### 🎞️ Supported anime formats

Seasonal catalog discovery includes:

- TV
- TV Short
- ONA
- OVA
- Special
- Movie

Adult entries are excluded.

## 🖼️ What it looks like

The repository includes representative Nuvio-style screenshots for the addon views.

### Seasonal catalogs

![Representative Nuvio seasonal catalog](docs/images/readme-nuvio-home.png)

### Season listing

![Representative Nuvio season catalog](docs/images/readme-nuvio-season.png)

### Rolling catalogs

#### Upcoming — 5 days

![Upcoming — 5 days sample](docs/images/nuvio-upcoming-5-days.png)

#### Previous — 7 days

![Previous — 7 days sample](docs/images/nuvio-previous-7-days.png)

The rolling views are intentionally shown separately so the upcoming and previous release sets are clear.

### Metadata detail flow

![Representative Nuvio anime detail flow](docs/images/readme-nuvio-detail.png)

The production flow is:

```text
AniList release discovery
        ↓
validated provider ID
        ↓
Nuvio catalog
        ↓
configured metadata addon
```

## 🧩 Architecture

```text
┌──────────────────────┐
│       AniList        │
│ release / airing data│
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Anime Releases       │
│      for Nuvio       │
│ Provider identities  │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│        Nuvio         │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Configured metadata  │
│       addon          │
└──────────────────────┘
```

This addon is intentionally **catalog-focused**. It does not duplicate detailed metadata, provider mapping, or playback resolution.

## 📦 Installation

### Production manifest

```text
https://nuvio-anime-release-addon-v2.vercel.app/manifest.json
```

Add the manifest URL to a supported Nuvio/Stremio client.

### Production landing page

```text
https://nuvio-anime-release-addon-v2.vercel.app/
```

The landing page provides the manifest, current catalog endpoints, release information, and representative screenshots.

## 📋 Production catalogs

| Catalog | Endpoint |
| --- | --- |
| Upcoming Season | `/catalog/series/upcoming_season.json` |
| Current Season | `/catalog/series/current_season.json` |
| Previous Season | `/catalog/series/previous_season.json` |
| Upcoming — 5 days | `/catalog/series/upcoming_5_days.json` |
| Previous — 7 days | `/catalog/series/previous_7_days.json` |

Catalog names and season labels are generated dynamically.

## 🚀 Current release

**Production:** `v1.65.0`  
**Development:** `v1.65.0` — rolling schedule payload optimization — release candidate with ARM mapping diagnostics — release candidate with rolling schedule-fetch diagnostics — release candidate with opt-in per-stage rolling catalog diagnostics — release candidate with opt-in per-stage catalog diagnostics — release candidate with optimized canonical-series resolution, parallelized terminal identity fallbacks, and opt-in catalog diagnostics

Post-release production catalog snapshots are captured automatically after each controlled release and retained on versioned `catalog-snapshots/*` branches.

Production release state is finalized by the controlled release pipeline after deployment validation.
**Major baseline:** `v1.0.0`

The 1.56.0 release anchors seasonal/installment catalog entries to their canonical franchise series identity for scraper-facing provider IDs while preserving the specific seasonal display metadata.\n\nThe 1.42.0 release switches active identity resolution to TMDB-backed matching, upgrades strong TMDB matches to IMDb when available, and retains TMDB identities when IMDb is unavailable. BingeCat API integration was later removed because its public endpoint is not usable by the addon and its private endpoint requires authenticated session access.

The 1.43.0 release lets TMDB upgrade earlier non-IMDb provider mappings, such as TVDB-only mappings, to stronger IMDb identities when TMDB finds a strong match.

The 1.44.0 release keeps that TMDB upgrade path active when BingeCat is unavailable, including production degraded-mode resolution.

The 1.45.0 release removes TMDB's pre-search year filter so exact title matches can still resolve when AniList and TMDB record different start years.

The 1.46.0 release resolves TMDB mappings with bounded concurrency to reduce catalog latency while respecting the provider's request-rate constraints.


The 1.23.0 development baseline hardens BingeCat identity selection so unverified provider mappings cannot inherit identities from explicit franchise-related anime.

The 1.24.0 development baseline protects unverified provider identities that belong to explicit AniList-related anime before final BingeCat verification, using targeted, cached bulk relation checks before terminal fallback.

The 1.10.0 corrective release extends degraded BingeCat resolution through the independent Anime Mapper dataset before terminal MAL fallback, improving provider-ID coverage when BingeCat search is unavailable.

The 1.11.0 corrective release adds a cached AniBridge v3 bulk cross-provider mapping fallback, improving IMDb/TVDB/TMDB coverage without issuing per-title external mapping requests when BingeCat is unavailable. The resolver now consults this shared bulk dataset before per-title mapping fallbacks, reducing upstream request fan-out while retaining the final authoritative BingeCat verification.

The 1.1.0 release carries the BingeCat identity-verification, cache-safety, related-title, numbered-installment, evidence-aggregation, and year-validation fixes validated on main.

The 1.2.0 corrective release refreshes cached negative BingeCat results during the authoritative verification pass so transient misses cannot mask a supported identity.

The 1.3.0 corrective release reduces redundant BingeCat searches for already-resolved identities, lowering upstream request pressure while retaining the authoritative verification pass.

The 1.4.0 corrective release adds transient BingeCat upstream retries so temporary 429/5xx/network failures do not become false identity-resolution misses.

The 1.4.0 corrective release retries transient BingeCat upstream failures before falling back, preserving supported identities during temporary upstream errors.

The 1.5.0 corrective release preserves every AniList catalog row through terminal identity fallback, requires direct BingeCat evidence for advertised provider identities, and hardens live catalog resolution against unresolved identities.
This release is the controlled production promotion of the tested identity-preservation and BingeCat-verification fixes.
Release target: `v1.5.0`.


The 1.0.0 release establishes the major baseline for the production-ready identity-resolution architecture, including provenance-aware validation, generalized weak-provider rejection, and the complete fallback chain.

This release is the controlled production baseline for continued P0 identity-resolution work.

The v2 project was initialized from an unreleased `v0.0.0` baseline. Version `1.0.0` is the first deliberate major release.

Production releases are published as Git tags and GitHub Releases.

A manual **dry run** validates CI, release metadata, the target version/SHA, and production behavior without deploying to Vercel, creating a tag or GitHub Release, or mutating release state.

**Releases:** https://github.com/mbmelgo/nuvio-anime-release-addon-v2/releases

Versioning:

- **PATCH** — meaningful development changes.
- **MINOR** — production deployments.
- **MAJOR** — deliberate project or architectural baseline changes, including the v1.0.0 production baseline.

## 🔧 Development

This is a small serverless JavaScript addon designed for Vercel.

### Requirements

- Node.js **20+**
- npm

### Run tests

```bash
npm test
```

### Project structure

```text
api/
  catalog-source.js
  home-selector.js
  resolver-manifest.js
  version.js

lib/
  catalog-anilist.js
  catalog-config.js
  catalog-meta.js
  catalog-pagination.js

scripts/
  release-target.mjs
  release-integrity.mjs
  validate-production.mjs

test/
  automated regression and release tests

ops/
  release-state.json

docs/images/
  representative Nuvio showcase images
```

## 🚦 Release pipeline

Production releases follow:

```text
Feature / change
  ↓
PR CI
  ↓
Merge to main
  ↓
Main CI + patch versioning
  ↓
Explicit release authorization
  ↓
Release/version integrity validation
  ↓
Controlled Vercel deployment
  ↓
Production validation: manifest + all 5 catalogs + metadata boundary
  ↓
Annotated Git tag + GitHub Release
  ↓
Release-state update
```

Release metadata is validated across `api/version.js`, `package.json`, `README.md`, and `ops/release-state.json`. Production validation checks all five supported catalogs for valid, unique Nuvio series identities and catalog-specific rolling metadata.

## 📄 Scope

This addon is responsible for:

- seasonal anime release discovery
- rolling upcoming/recent airing discovery
- validated provider identities with ARM-backed and secondary cross-provider mapping
- Nuvio-compatible catalog pagination
- catalog search
- dynamic seasonal organization

It is **not** a replacement for a detailed anime metadata/provider addon.

## 📜 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for the full license text.