import test from "node:test";

const CASES = [
  [202390, 39168], [205289, 63221], [189121, 61324], [215695, 64746],
  [199353, 60597], [214260, 61619], [217624, 65095], [210687, 63830],
  [199409, 62248], [214974, 62218], [216625, 64965], [207217, 65079],
];

test("temporary MAL provider mapping investigation", async () => {
  for (const [anilistId, malId] of CASES) {
    const mapperMal = await fetch(`https://idmapper.vercel.app/api/mapper?mal_id=${malId}`)
      .then((r) => r.json())
      .catch((e) => ({ error: String(e) }));
    console.log(JSON.stringify({ anilistId, malId, mapperMal }));
  }
});
