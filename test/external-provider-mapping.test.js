import assert from "node:assert/strict";
import test from "node:test";
import { normalizeExternalLinks, resolveAniListExternalMappings } from "../lib/external-provider-mapping.js";

test("AniList external links normalize IMDb, TVDB and TMDB identities", () => {
  const mapping = normalizeExternalLinks({
    id: 123,
    idMal: 456,
    format: "TV",
    externalLinks: [
      { site: "IMDb", url: "https://www.imdb.com/title/tt1234567/" },
      { site: "TheTVDB", url: "https://thetvdb.com/series/7654321" },
      { site: "The Movie Database", url: "https://www.themoviedb.org/tv/987654" },
    ],
  });

  assert.deepEqual(mapping, {
    source: "anilist-external",
    anilistId: 123,
    type: "TV",
    malId: 456,
    imdbIds: ["tt1234567"],
    tvdbId: 7654321,
    tmdbTvId: 987654,
    tmdbMovieIds: [],
    season: null,
    episodeOffset: null,
  });
});

test("external-link resolver preserves only rows with supported provider links", () => {
  const result = resolveAniListExternalMappings([
    { id: 1, format: "TV", externalLinks: [{ site: "IMDb", url: "https://www.imdb.com/title/tt1111111" }] },
    { id: 2, format: "TV", externalLinks: [] },
  ]);
  assert.equal(result.get(1)?.[0]?.imdbIds[0], "tt1111111");
  assert.equal(result.has(2), false);
});
