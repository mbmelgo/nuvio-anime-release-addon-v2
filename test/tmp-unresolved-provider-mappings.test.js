import test from "node:test";

const IDS = [202390, 205289, 189121, 212653, 215695, 211181, 155723, 199353, 214260, 217624, 210687, 199409, 214974, 216625, 207217];

const query = `
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    id
    idMal
    format
    title { romaji english native }
    startDate { year }
    externalLinks { site url }
  }
}
`;

test("temporary unresolved provider investigation", async () => {
  for (const id of IDS) {
    const anilist = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables: { id } }),
    }).then((r) => r.json());

    const media = anilist?.data?.Media || null;
    const mapper = await fetch(`https://idmapper.vercel.app/api/mapper?anilist_id=${id}`).then((r) => r.json()).catch((e) => ({ error: String(e) }));
    console.log(JSON.stringify({ id, media, mapper }));
  }
});
