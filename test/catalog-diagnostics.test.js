import assert from "node:assert/strict";
import test from "node:test";
import { formatCatalogDiagnostics } from "../api/catalog-source.js";

test("catalog diagnostics expose stable duration and cold-start headers", () => {
  assert.deepEqual(
    formatCatalogDiagnostics(12.7, true, { arm: 4.4, canonical: 9.8 }),
    {
      "X-Nuvio-Catalog-Duration-Ms": "13",
      "X-Nuvio-Cold-Start": "1",
      "X-Nuvio-Catalog-Stages": JSON.stringify({ arm: 4, canonical: 10 }),
    },
  );
  assert.deepEqual(
    formatCatalogDiagnostics(-2, false),
    {
      "X-Nuvio-Catalog-Duration-Ms": "0",
      "X-Nuvio-Cold-Start": "0",
    },
  );
});
