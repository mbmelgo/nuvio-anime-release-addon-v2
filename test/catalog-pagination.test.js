import assert from "node:assert/strict";
import test from "node:test";
import { collectValidatedCatalogPage } from "../lib/catalog-pagination.js";

test("validated catalog pagination fills a Nuvio page from later AniList pages", async () => {
  const calls = [];
  const pages = [
    [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
    [{ id: "e" }, { id: "f" }, { id: "g" }, { id: "h" }],
    [{ id: "i" }, { id: "j" }, { id: "k" }, { id: "l" }],
  ];
  const result = await collectValidatedCatalogPage({
    skip: 0,
    pageSize: 4,
    maxPages: 3,
    fetchPage: async (page) => {
      calls.push(page);
      return pages[page - 1] || [];
    },
    canonicalizePage: async (rows) => rows.filter((row) => !["b", "f", "j"].includes(row.id)),
  });

  assert.deepEqual(result.map((meta) => meta.id), ["a", "c", "d", "e"]);
  assert.deepEqual(calls, [1, 2]);
});

test("validated catalog pagination applies Nuvio skip after validation", async () => {
  const result = await collectValidatedCatalogPage({
    skip: 4,
    pageSize: 4,
    maxPages: 3,
    fetchPage: async (page) => [["a", "b", "c", "d"], ["e", "f", "g", "h"], ["i", "j", "k", "l"]][page - 1]?.map((id) => ({ id })) || [],
    canonicalizePage: async (rows) => rows.filter((row) => !["b", "f", "j"].includes(row.id)),
  });

  assert.deepEqual(result.map((meta) => meta.id), ["g", "h", "i", "k"]);
});

test("validated catalog pagination stops at the configured page bound", async () => {
  const calls = [];
  const result = await collectValidatedCatalogPage({
    skip: 0,
    pageSize: 10,
    maxPages: 2,
    fetchPage: async (page) => {
      calls.push(page);
      return Array.from({ length: 10 }, (_, index) => ({ id: `${page}-${index}` }));
    },
    canonicalizePage: async () => [],
  });

  assert.deepEqual(result, []);
  assert.deepEqual(calls, [1, 2]);
});

test("validated catalog pagination deduplicates canonical identities before applying the Nuvio page boundary", async () => {
  const calls = [];
  const pages = [
    [{ id: "tvdb:100" }, { id: "tvdb:100" }, { id: "tvdb:200" }, { id: "tvdb:250" }],
    [{ id: "tvdb:300" }, { id: "tvdb:200" }, { id: "tvdb:400" }, { id: "tvdb:450" }],
  ];
  const result = await collectValidatedCatalogPage({
    skip: 0,
    pageSize: 4,
    maxPages: 2,
    fetchPage: async (page) => {
      calls.push(page);
      return pages[page - 1] || [];
    },
    canonicalizePage: async (rows) => rows,
  });

  assert.deepEqual(result.map((meta) => meta.id), ["tvdb:100", "tvdb:200", "tvdb:250", "tvdb:300"]);
  assert.deepEqual(calls, [1, 2]);
});

// Regression: page 2 must not be started before page 1 has been validated.
// This prevents speculative upstream AniList traffic when page 1 is already sufficient.
test("validated catalog pagination does not speculatively fetch another AniList page", async () => {
  const events = [];
  const result = await collectValidatedCatalogPage({
    skip: 0,
    pageSize: 2,
    maxPages: 2,
    fetchPage: async (page) => {
      events.push(`fetch:${page}`);
      return [{ id: `${page}-a` }, { id: `${page}-b` }];
    },
    canonicalizePage: async (rows) => {
      events.push(`validate:${rows[0].id.split("-")[0]}`);
      return rows;
    },
  });

  assert.deepEqual(result.map((meta) => meta.id), ["1-a", "1-b"]);
  assert.deepEqual(events, ["fetch:1", "validate:1"]);
});

// Regression: later AniList pages remain available when validation rejects candidates,
// but the next request must begin only after the current page has been reconciled.
test("validated catalog pagination fetches the next AniList page only after validation shows that more items are required", async () => {
  const events = [];
  const result = await collectValidatedCatalogPage({
    skip: 0,
    pageSize: 2,
    maxPages: 2,
    fetchPage: async (page) => {
      events.push(`fetch:${page}`);
      return page === 1
        ? [{ id: "1-a" }, { id: "1-rejected" }]
        : [{ id: "2-a" }, { id: "2-b" }];
    },
    canonicalizePage: async (rows) => {
      events.push(`validate:${rows[0].id.split("-")[0]}`);
      return rows.filter((row) => row.id !== "1-rejected");
    },
  });

  assert.deepEqual(result.map((meta) => meta.id), ["1-a", "2-a"]);
  assert.deepEqual(events, ["fetch:1", "validate:1", "fetch:2", "validate:2"]);
});

test("rolling catalog search filters airing rows before identity resolution", async () => {
  const { filterAiringRowsBySearch } = await import("../api/catalog-source.js");
  const rows = [
    { media: { id: 202079, title: { english: "Uncle's Obsession with Cute Things", romaji: "Uncle's Obsession with Cute Things", native: "異世界おじさん" } } },
    { media: { id: 214703, title: { english: "Ghost Meets Gal", romaji: "Ghost Meets Gal", native: "Ghost Meets Gal" } } },
  ];

  assert.deepEqual(
    filterAiringRowsBySearch(rows, "Uncle's Obsession with Cute Things").map((item) => item.media.id),
    [202079],
  );
});
