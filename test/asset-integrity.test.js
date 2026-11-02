import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("AniBloom addon icon uses the supplied square app icon", async () => {
  const data = await readFile(new URL("../assets/anibloom-icon.png", import.meta.url));
  assert.deepEqual([...data.subarray(0, 8)], [137,80,78,71,13,10,26,10]);
  assert.equal(data.readUInt32BE(16), 512);
  assert.equal(data.readUInt32BE(20), 512);
  assert.equal(data[25], 6, "PNG must retain its RGBA channel");
  assert.ok(!data.includes(Buffer.from("tRNS")), "app icon uses its own opaque black corners");
  assert.ok(data.length > 10_000, "icon should contain the supplied full-resolution artwork");
});

test("approved Nuvio and sakura hero artwork is a valid JPEG", async () => {
  const data = await readFile(new URL("../assets/anibloom-hero-artwork.jpg", import.meta.url));
  assert.deepEqual([...data.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  assert.deepEqual([...data.subarray(-2)], [0xff, 0xd9]);
  assert.ok(data.length > 20_000, "hero artwork should not be an empty or placeholder file");
});

test("black and white logo variants use the approved high-resolution symbol", async () => {
  for (const file of ["anibloom-symbol.svg", "anibloom-logo-black.svg", "anibloom-logo-white.svg"]) {
    const svg = await readFile(new URL("../assets/" + file, import.meta.url), "utf8");
    assert.match(svg, /viewBox="0 0 512 512"/);
    assert.match(svg, /href="anibloom-icon\.png"/);
    assert.doesNotMatch(svg, /href="https?:/i);
  }
});
