import test from "node:test";
import assert from "node:assert/strict";
import { createPreviewServer } from "../scripts/dev-server.js";

test("preview server serves version, homepage, manifest and assets", async (t) => {
  const server = createPreviewServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  const versionResponse = await fetch(`${base}/version`);
  assert.equal(versionResponse.status, 200);
  assert.deepEqual(await versionResponse.json(), { version: "2.0.0" });

  const homeResponse = await fetch(base);
  assert.equal(homeResponse.status, 200);
  assert.match(await homeResponse.text(), /AniBloom — Anime Discovery for Nuvio/);

  const manifestResponse = await fetch(`${base}/manifest.json`);
  assert.equal(manifestResponse.status, 200);
  assert.equal((await manifestResponse.json()).version, "2.0.0");

  const assetResponse = await fetch(`${base}/assets/anibloom.css`);
  assert.equal(assetResponse.status, 200);
  assert.match(assetResponse.headers.get("content-type"), /text\/css/);
});

test("preview server does not expose files outside the assets directory", async (t) => {
  const server = createPreviewServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/assets/%2e%2e%2fapi%2fversion.js`);
  assert.equal(response.status, 404);
});
