import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeCatalogPageWithBingeCat } from "../api/catalog-source.js";

test("seasonal catalog emits the validated BingeCat identity when ARM mapping is available", async () => {
  const metas = await canonicalizeCatalogPageWithBingeCat([
    {
      id: 158871,
      title: {
        english: "Pokémon Horizons: The Series",
        romaji: "Pocket Monsters (2023)",
        native: "ポケットモンスター",
      },
      format: "TV",
      coverImage: { large: "https://example.invalid/pokemon.jpg" },
      status: "RELEASING",
      startDate: { year: 2023, month: 4, day: 14 },
      genres: ["Action"],
    },
  ], {
    resolveMappings: async () => new Map([
      [158871, [{
        source: "arm",
        anilistId: 158871,
        type: "TV",
        imdbIds: ["tt26692417"],
        tvdbId: 76703,
        tmdbTvId: 220150,
        tmdbMovieIds: [],
        season: { tvdb: 20, tmdb: 1 },
        episodeOffset: null,
      }]],
    ]),
  });

  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "tt26692417");
  assert.equal(metas[0].extra.bingecatProvider, "imdb");
  assert.equal(metas[0].extra.bingecatId, "tt26692417");
  assert.equal(metas[0].extra.anilistId, 158871);
});

test("seasonal catalog retains the legacy identity when mapping is unavailable", async () => {
  const metas = await canonicalizeCatalogPageWithBingeCat([
    {
      id: 269,
      idMal: 269,
      title: { romaji: "Bleach" },
      format: "TV",
    },
  ], {
    resolveMappings: async () => new Map(),
  });

  assert.equal(metas[0].id, "mal:269");
  assert.equal(metas[0].extra.anilistId, 269);
});
