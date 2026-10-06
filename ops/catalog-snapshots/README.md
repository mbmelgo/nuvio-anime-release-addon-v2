# Production Catalog Snapshots

Production catalog snapshots are captured after controlled releases. Each snapshot records the production manifest, every paginated catalog response, the corresponding request metadata, and aggregate catalog data for deterministic release comparison.

The canonical production catalog protocol is `series`; legacy `/catalog/anime/*` routes remain compatibility endpoints during the migration.
