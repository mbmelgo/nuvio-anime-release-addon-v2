import assert from "node:assert/strict";
import test from "node:test";
import { formatCatalogDiagnostics } from "../api/catalog-source.js";

test("catalog diagnostics expose stable duration and cold-start headers", () => {
  assert.deepEqual(
    formatCatalogDiagnostics(12.7, true),
    {
      "X-Nuvio-Catalog-Duration-Ms": "13",
      "X-Nuvio-Cold-Start": "1",
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
