import test from "node:test";
import assert from "node:assert/strict";
import { resolveVercelDeploymentId } from "../scripts/resolve-vercel-deployment-id.mjs";

test("resolves a Vercel deployment id from the Vercel GitHub status target URL", () => {
  const statuses = [
    {
      context: "Vercel",
      state: "success",
      target_url:
        "https://vercel.com/personal-bcb9/nuvio-anime-release-addon-v2/6z32j2PjAg38vo7x4dPBsQJfydFa",
    },
  ];

  assert.equal(
    resolveVercelDeploymentId(statuses),
    "dpl_6z32j2PjAg38vo7x4dPBsQJfydFa",
  );
});

test("ignores unrelated GitHub statuses and malformed Vercel targets", () => {
  assert.equal(
    resolveVercelDeploymentId([
      { context: "CI", state: "success", target_url: "https://github.com/example" },
      { context: "Vercel", state: "pending", target_url: "not-a-vercel-url" },
    ]),
    null,
  );
});
