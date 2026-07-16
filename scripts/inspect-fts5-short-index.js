"use strict";

const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { EXPERIMENT_ROOT, argumentValue, round } = require("./fts5-prototype-lib");

const dbFile = path.resolve(argumentValue("--db"));
const relative = path.relative(EXPERIMENT_ROOT, dbFile);
if (!argumentValue("--db") || relative.startsWith("..") || path.isAbsolute(relative)) {
  console.error("Usage: node scripts/inspect-fts5-short-index.js --db <repo/tmp/fts5-prototype/.../gallery.db>");
  process.exit(2);
}

const db = new DatabaseSync(dbFile);
const before = {
  pageCount: db.prepare("PRAGMA page_count").get().page_count,
  freePages: db.prepare("PRAGMA freelist_count").get().freelist_count,
};
const startedAt = performance.now();
db.exec("CREATE INDEX IF NOT EXISTS idx_media_title_nocase ON media(title COLLATE NOCASE)");
const buildMs = performance.now() - startedAt;
db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
const after = {
  pageCount: db.prepare("PRAGMA page_count").get().page_count,
  freePages: db.prepare("PRAGMA freelist_count").get().freelist_count,
};
const indexBytes = db.prepare("SELECT COALESCE(SUM(pgsize), 0) AS bytes FROM dbstat WHERE name = 'idx_media_title_nocase'").get().bytes;
const plan = db.prepare("EXPLAIN QUERY PLAN SELECT id FROM media WHERE title >= ? COLLATE NOCASE AND title < ? COLLATE NOCASE ORDER BY title COLLATE NOCASE LIMIT 61").all("A1", "A1\uffff");
db.close();
console.log(JSON.stringify({ dbFile, buildMs: round(buildMs), indexBytes, before, after, plan }, null, 2));
