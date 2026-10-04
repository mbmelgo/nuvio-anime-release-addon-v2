# Live v1.30.0 catalog snapshot — 2026-10-04

Captured from the production addon after correcting for Nuvio catalog pagination.

- Source: https://nuvio-anime-release-addon-v2.vercel.app
- Deployment: dpl_2TBWYtyX9AjAUan3HPj4sHMVJuEo
- Commit: b605a90dafe571e8275962fcaa9e1ed04725ca1d
- Captured: 2026-10-04T12:59:40Z
- Method: fetch each catalog with skip=0,50,100,... until a page returns fewer than 50 entries.
- Total captured entries: 393

## Page coverage

- upcoming_season: skip=0 (50), skip=50 (4) — 54 total
- current_season: skip=0 (50), skip=50 (44) — 94 total
- previous_season: skip=0 (50), skip=50 (50), skip=100 (7) — 107 total
- upcoming_5_days: skip=0 (50), skip=50 (4) — 54 total
- previous_7_days: skip=0 (50), skip=50 (34) — 84 total

## Important correction

The first snapshot only captured page 1 (`skip=0`). The corrected snapshot includes all available pages. **Dragon Ball Super: Beerus** is present in `current_season` page 2 (`skip=50`) with AniList `206814`, MAL `63367`, and current addon output `mal:63367` (`canonical-mal-id-fallback`).

These files are raw public addon JSON for regression comparison only; they contain no credentials or secrets.
