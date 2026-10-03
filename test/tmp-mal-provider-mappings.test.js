import test from "node:test";

const IDS = [202390,205289,189121,212653,215695,211181,155723,199353,214260,217624,210687,199409,214974,216625,207217];

test("temporary AniBridge mapping investigation", async () => {
  const response = await fetch("https://github.com/anibridge/anibridge-mappings/releases/download/v3/mappings.min.json");
  if (!response.ok) throw new Error(`AniBridge mappings HTTP ${response.status}`);
  const mappings = await response.json();

  for (const id of IDS) {
    const entry = mappings[`anilist:${id}`] || null;
    console.log(JSON.stringify({ id, entry }));
  }
});
