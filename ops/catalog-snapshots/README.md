# Production Catalog Snapshots

Production catalog snapshots are captured after controlled releases. Each snapshot records the production manifest, every paginated catalog response, the corresponding request metadata, and aggregate catalog data for deterministic release comparison.

Production snapshots cover all eight catalogs: five episodic/rolling `series` catalogs and three seasonal `movie` catalogs. Legacy `/catalog/anime/*` routes remain compatibility endpoints for the series catalogs.
