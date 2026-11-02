import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("AniBloom addon icon is a valid square PNG", async () => {
  const data = await readFile(new URL("../assets/anibloom-icon.png", import.meta.url));
  assert.deepEqual([...data.subarray(0, 8)], [137,80,78,71,13,10,26,10]);
  assert.equal(data.readUInt32BE(16), 192);
  assert.equal(data.readUInt32BE(20), 192);
});

test("black and white logo variants use identical symbol geometry", async () => {
  for (const file of ["anibloom-symbol.svg", "anibloom-logo-black.svg", "anibloom-logo-white.svg"]) {
    const svg = await readFile(new URL("../assets/" + file, import.meta.url), "utf8");
    assert.match(svg, /viewBox="0 0 512 512"/);
    assert.match(svg, /href="anibloom-icon\.png"/);
    assert.doesNotMatch(svg, /href="https?:/i);
  }
});
