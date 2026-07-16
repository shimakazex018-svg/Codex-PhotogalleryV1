"use strict";

const assert = require("assert");
const { DatabaseSync } = require("node:sqlite");
const searchFts = require("../search-fts");
const cli = require("./search-fts-cli-lib");

const dbFile = cli.requireExplicitDatabase();
const db = new DatabaseSync(dbFile);
const id = "__codex_fts5_v96_incremental_fixture__";
const collection = db.prepare("SELECT id FROM collections ORDER BY rowid LIMIT 1").get();
if (!collection) throw new Error("No collection available for isolated incremental test");
const timings = {};

function transaction(name, action) {
  const started = performance.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = action();
    db.exec("COMMIT");
    timings[name] = Math.round((performance.now() - started) * 1000) / 1000;
    return result;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  }
}

try {
  transaction("cleanupBeforeMs", () => {
    searchFts.deleteMediaDocument(db, id);
    db.prepare("DELETE FROM media WHERE id=?").run(id);
  });

  transaction("insertMs", () => {
    db.prepare("INSERT INTO media(id,collection_id,type,title,file_name,src,mtime,sort_order) VALUES(?,?, 'image', ?, '', ?, 0, 999999)")
      .run(id, collection.id, "B1增量新增测试", "/photos/__codex_v96__/新增路径测试.jpg");
    searchFts.upsertMediaDocument(db, { id, title: "B1增量新增测试", src: "/photos/__codex_v96__/新增路径测试.jpg" });
    searchFts.markIncrementalSync(db, { mediaDelta: 1, mappingDelta: 1, ftsDelta: 1 });
  });
  const originalRowid = db.prepare(`SELECT fts_rowid FROM ${searchFts.SEARCH_DOCUMENTS_TABLE} WHERE media_id=?`).get(id).fts_rowid;
  assert.strictEqual(searchFts.queryFtsMedia(db, "增量新增", 10).rows.length, 1);

  transaction("updateMs", () => {
    db.prepare("UPDATE media SET title=?, src=? WHERE id=?").run("B1增量修改测试", "/photos/__codex_v96__/移动后路径测试.jpg", id);
    searchFts.upsertMediaDocument(db, { id, title: "B1增量修改测试", src: "/photos/__codex_v96__/移动后路径测试.jpg" });
    searchFts.markIncrementalSync(db);
  });
  const updatedRowid = db.prepare(`SELECT fts_rowid FROM ${searchFts.SEARCH_DOCUMENTS_TABLE} WHERE media_id=?`).get(id).fts_rowid;
  assert.strictEqual(updatedRowid, originalRowid);
  assert.strictEqual(searchFts.queryFtsMedia(db, "增量新增", 10).rows.length, 0);
  assert.strictEqual(searchFts.queryFtsMedia(db, "增量修改", 10).rows.length, 1);

  db.exec(`CREATE TEMP TRIGGER fail_full_copy_mapping BEFORE INSERT ON ${searchFts.SEARCH_DOCUMENTS_TABLE}
    WHEN NEW.media_id='__codex_fts5_v96_failure_fixture__'
    BEGIN SELECT RAISE(ABORT, 'simulated full-copy FTS sync failure'); END`);
  let failureRolledBack = false;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO media(id,collection_id,type,title,src,mtime,sort_order) VALUES('__codex_fts5_v96_failure_fixture__',?,'image','事务失败测试','/photos/failure.jpg',0,999998)").run(collection.id);
    searchFts.upsertMediaDocument(db, { id: "__codex_fts5_v96_failure_fixture__", title: "事务失败测试", src: "/photos/failure.jpg" });
    db.exec("COMMIT");
  } catch {
    failureRolledBack = true;
    db.exec("ROLLBACK");
  }
  assert.strictEqual(failureRolledBack, true);
  assert.strictEqual(db.prepare("SELECT COUNT(*) AS count FROM media WHERE id='__codex_fts5_v96_failure_fixture__'").get().count, 0);

  transaction("deleteMs", () => {
    searchFts.deleteMediaDocument(db, id);
    db.prepare("DELETE FROM media WHERE id=?").run(id);
    searchFts.markIncrementalSync(db, { mediaDelta: -1, mappingDelta: -1, ftsDelta: -1 });
  });
  assert.strictEqual(searchFts.queryFtsMedia(db, "增量修改", 10).rows.length, 0);
  const consistency = searchFts.consistencyCheck(db, { sample: 1000 });
  assert.strictEqual(consistency.ok, true, JSON.stringify(consistency));
  console.log(JSON.stringify({ ok: true, database: cli.databaseIdentity(dbFile, false), timings, stableRowid: originalRowid === updatedRowid, failureRolledBack, sampleConsistency: consistency }, null, 2));
} finally {
  try {
    db.exec("BEGIN IMMEDIATE");
    searchFts.deleteMediaDocument(db, id);
    db.prepare("DELETE FROM media WHERE id IN (?,?)").run(id, "__codex_fts5_v96_failure_fixture__");
    db.exec("COMMIT");
  } catch {
    try { db.exec("ROLLBACK"); } catch {}
  }
  db.close();
}
