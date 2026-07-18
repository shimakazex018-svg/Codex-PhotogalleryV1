"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { SORT_OPTIONS, normalizeSortMode, sortCollections } = require("../gallery-sort");
const galleryDb = require("../gallery-db");

const fixtures = [
  { id: "p/test-a", title: "测试A", imageCount: 0, videoCount: 2, mtime: 300 },
  { id: "p/album-10", title: "图册10", imageCount: 5, videoCount: 0, mtime: 200 },
  { id: "p/apple-upper", title: "Apple", imageCount: 5, videoCount: 1, mtime: 100 },
  { id: "p/album-2", title: "图册2", imageCount: 2, videoCount: 0, mtime: 200 },
  { id: "p/apple-lower", title: "apple", imageCount: 5, videoCount: 1, mtime: 100 },
  { id: "p/test-b", title: "测试B", imageCount: 0, videoCount: 2, mtime: null },
  { id: "p/special", title: "#特别", imageCount: null, videoCount: null, mtime: Number.NaN },
  { id: "p/blank", title: "", imageCount: null, videoCount: null, mtime: null },
];

assert.deepStrictEqual(SORT_OPTIONS.map((item) => item.mode), [
  "name_asc", "name_desc", "image_count_asc", "image_count_desc",
  "video_count_asc", "video_count_desc", "updated_asc", "updated_desc",
]);
assert.strictEqual(normalizeSortMode("name"), "name_asc");
assert.strictEqual(normalizeSortMode("imageCount"), "image_count_desc");
assert.strictEqual(normalizeSortMode("videoCount"), "video_count_desc");
assert.strictEqual(normalizeSortMode("recent"), "updated_desc");
assert.strictEqual(normalizeSortMode("unexpected"), "name_asc");

for (const { mode } of SORT_OPTIONS) {
  const first = sortCollections(fixtures, mode).map((item) => item.id);
  const second = sortCollections(fixtures, mode).map((item) => item.id);
  assert.deepStrictEqual(first, second, `${mode} must be stable`);
}

const nameAsc = sortCollections(fixtures, "name_asc");
assert.ok(nameAsc.findIndex((item) => item.title === "图册2") < nameAsc.findIndex((item) => item.title === "图册10"), "natural numeric order failed");
assert.strictEqual(nameAsc.at(-1).title, "", "blank names must be last");
assert.strictEqual(sortCollections(fixtures, "name_desc").at(-1).title, "", "blank names must remain last in descending order");

for (const mode of ["image_count_asc", "image_count_desc", "video_count_asc", "video_count_desc", "updated_asc", "updated_desc"]) {
  const values = sortCollections(fixtures, mode);
  const missingStart = values.findIndex((item) => {
    const value = mode.startsWith("image") ? item.imageCount : mode.startsWith("video") ? item.videoCount : item.mtime;
    return value === null || value === undefined || value === "" || !Number.isFinite(Number(value));
  });
  assert.ok(missingStart >= 0, `${mode} fixture must include missing values`);
  assert.ok(values.slice(missingStart).every((item) => {
    const value = mode.startsWith("image") ? item.imageCount : mode.startsWith("video") ? item.videoCount : item.mtime;
    return value === null || value === undefined || value === "" || !Number.isFinite(Number(value));
  }), `${mode} must put missing values last`);
}

const fullSorted = sortCollections(fixtures, "image_count_desc");
const pageOne = fullSorted.slice(0, 3);
const pageTwo = fullSorted.slice(3, 6);
assert.deepStrictEqual([...pageOne, ...pageTwo], fullSorted.slice(0, 6), "pagination must slice the already sorted full result");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-sort-"));
const databaseFile = path.join(tempRoot, "gallery.db");
try {
  galleryDb.getStats(databaseFile);
  const db = new DatabaseSync(databaseFile);
  const insert = db.prepare(
    `INSERT INTO collections (id, parent_id, title, folder, path_parts, level, image_count, video_count, total_image_count, total_video_count, descendant_count, mtime, sort_order)
     VALUES (?, NULL, ?, ?, ?, 1, ?, ?, ?, ?, 0, ?, ?)`
  );
  fixtures.forEach((item, index) => insert.run(
    item.id,
    item.title,
    item.title,
    JSON.stringify([item.title]),
    Number.isFinite(item.imageCount) ? item.imageCount : 0,
    Number.isFinite(item.videoCount) ? item.videoCount : 0,
    Number.isFinite(item.imageCount) ? item.imageCount : 0,
    Number.isFinite(item.videoCount) ? item.videoCount : 0,
    Number.isFinite(item.mtime) ? item.mtime : 0,
    index,
  ));
  db.close();
  for (const { mode } of SORT_OPTIONS) {
    const all = galleryDb.getRootCollections(databaseFile, { limit: 500, sort: mode });
    const firstPage = galleryDb.getRootCollections(databaseFile, { limit: 3, offset: 0, sort: mode });
    const secondPage = galleryDb.getRootCollections(databaseFile, { limit: 3, offset: 3, sort: mode });
    assert.deepStrictEqual([...firstPage, ...secondPage].map((item) => item.id), all.slice(0, 6).map((item) => item.id), `${mode} database pagination must happen after sorting`);
  }
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, modes: SORT_OPTIONS.length, fixtures: fixtures.length }));
