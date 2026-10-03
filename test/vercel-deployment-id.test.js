import test from "node:test";
import assert from "node:assert/strict";
import { resolveVercelDeploymentId } from "../scripts/resolve-vercel-deployment-id.mjs";

test("resolves a Vercel deployment id from the Vercel GitHub status target URL", () => {
  const statuses = [
    {
      context: "Vercel",
      state: "success",
      target_url:
        "https://vercel.com/personal-bcb9/nuvio-anime-releases-addon/Cja365dcwSHTN2BsSttr2nE8VrCU",
    },
  ];

  assert.equal(
    resolveVercelDeploymentId(statuses),
    "dpl_Cja365dcwSHTN2BsSttr2nE8VrCU",
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
