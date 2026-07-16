"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { DatabaseSync } = require("node:sqlite");
const galleryDb = require("../gallery-db");
const searchFts = require("../search-fts");

const root = path.resolve(__dirname, "..", "tmp", "fts5-integration-test");
const dbFile = path.join(root, "gallery.db");
const mediaRoot = path.join(root, "media");
fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(root, { recursive: true });
fs.mkdirSync(mediaRoot, { recursive: true });

function gallery(title = "晨晨写真001", src = "/photos/模特/%E4%B8%AD%E6%96%87%E8%B7%AF%E5%BE%84/sample-001.jpg") {
  return {
    collections: [{
      id: "模特甲",
      title: "模特甲作品",
      folder: "模特甲",
      pathParts: ["模特甲"],
      images: [{ title, file: "", src, thumb: "/thumb/sample.webp" }],
      videos: [],
      children: [],
    }],
  };
}

galleryDb.indexGallery(dbFile, gallery());
const migration = spawnSync(process.execPath, [path.join(__dirname, "migrate-search-fts5.js"), "--db", dbFile, "--apply", "--batch-size", "100"], { encoding: "utf8" });
assert.strictEqual(migration.status, 0, migration.stderr || migration.stdout);

const stateSchemaDb = new DatabaseSync(dbFile);
assert.deepStrictEqual(
  stateSchemaDb.prepare(`PRAGMA table_info(${searchFts.SEARCH_STATE_TABLE})`).all().map((column) => column.name),
  ["singleton", "schema_version", "status", "started_at", "completed_at", "last_sync_at", "last_verify_at", "last_error"],
);
stateSchemaDb.close();

let status = galleryDb.getSearchIndexStatus(dbFile, "auto");
assert.strictEqual(status.status, "ready");
assert.strictEqual(status.mediaCount, 1);
assert.strictEqual(status.mappingCount, 1);
assert.strictEqual(status.ftsDocumentCount, 1);

let result = galleryDb.search(dbFile, "晨晨", 60, { searchMode: "auto" });
assert.strictEqual(result.searchMode, "fts5");
assert.strictEqual(result.media.length, 1);
result = galleryDb.search(dbFile, "晨晨写", 60, { searchMode: "auto" });
assert.strictEqual(result.media.length, 1);
result = galleryDb.search(dbFile, "中文路径", 60, { searchMode: "auto" });
assert.strictEqual(result.media.length, 1);

for (const query of ['a"*', "a'b", "a:b", "a-b", "a%b", "a_b", "a\\b", "a/b", "（全角）", "e\u0301x", "%E4%B8%AD"]) {
  assert.doesNotThrow(() => galleryDb.search(dbFile, query, 60, { searchMode: "auto" }));
}

const db = new DatabaseSync(dbFile);
const media = db.prepare("SELECT id FROM media LIMIT 1").get();
const originalRowid = db.prepare(`SELECT fts_rowid FROM ${searchFts.SEARCH_DOCUMENTS_TABLE} WHERE media_id=?`).get(media.id).fts_rowid;
db.exec("BEGIN");
db.prepare("UPDATE media SET title=?, src=? WHERE id=?").run("新标题三字", "/photos/新目录/新路径图片.jpg", media.id);
searchFts.upsertMediaDocument(db, { id: media.id, title: "新标题三字", src: "/photos/新目录/新路径图片.jpg" });
searchFts.markIncrementalSync(db);
db.exec("COMMIT");
const updatedRowid = db.prepare(`SELECT fts_rowid FROM ${searchFts.SEARCH_DOCUMENTS_TABLE} WHERE media_id=?`).get(media.id).fts_rowid;
assert.strictEqual(updatedRowid, originalRowid);
assert.strictEqual(galleryDb.search(dbFile, "晨晨写", 60, { searchMode: "auto" }).media.length, 0);
assert.strictEqual(galleryDb.search(dbFile, "新标题", 60, { searchMode: "auto" }).media.length, 1);

db.exec(`CREATE TEMP TRIGGER fail_search_mapping BEFORE INSERT ON ${searchFts.SEARCH_DOCUMENTS_TABLE} BEGIN SELECT RAISE(ABORT, 'simulated search sync failure'); END`);
db.exec("BEGIN");
let failed = false;
try {
  db.prepare("INSERT INTO media(id,collection_id,type,title,src,mtime,sort_order) VALUES('failure-id','模特甲','image','故障标题','/photos/failure.jpg',0,9)").run();
  searchFts.upsertMediaDocument(db, { id: "failure-id", title: "故障标题", src: "/photos/failure.jpg" });
  db.exec("COMMIT");
} catch {
  failed = true;
  db.exec("ROLLBACK");
}
assert.strictEqual(failed, true);
assert.strictEqual(db.prepare("SELECT COUNT(*) AS count FROM media WHERE id='failure-id'").get().count, 0);
db.close();

const originalFile = path.join(mediaRoot, "original.jpg");
const movedFile = path.join(mediaRoot, "moved.jpg");
fs.writeFileSync(originalFile, "isolated search integration fixture", "utf8");
fs.renameSync(originalFile, movedFile);
const movedDb = new DatabaseSync(dbFile);
movedDb.exec("BEGIN");
let movedDatabaseFailed = false;
try {
  movedDb.prepare("UPDATE media SET src='/photos/isolated/moved.jpg' WHERE id=?").run(media.id);
  movedDb.exec(`DROP TABLE ${searchFts.SEARCH_FTS_TABLE}`);
  searchFts.upsertMediaDocument(movedDb, { id: media.id, title: "新标题三字", src: "/photos/isolated/moved.jpg" });
  movedDb.exec("COMMIT");
} catch {
  movedDatabaseFailed = true;
  movedDb.exec("ROLLBACK");
}
movedDb.close();
assert.strictEqual(movedDatabaseFailed, true);
assert.strictEqual(fs.existsSync(movedFile), true);
galleryDb.markSearchIndexStale(dbFile, "file_moved_database_transaction_failed");
galleryDb.indexGallery(dbFile, gallery("移动恢复三字", "/photos/isolated/moved.jpg"));
assert.strictEqual(galleryDb.search(dbFile, "移动恢复", 60, { searchMode: "auto" }).media.length, 1);

galleryDb.markSearchIndexStale(dbFile, "simulated_filesystem_database_uncertainty");
const forcedUnavailable = galleryDb.search(dbFile, "移动", 60, { searchMode: "fts5" });
assert.strictEqual(forcedUnavailable.searchMode, "unavailable");
assert.strictEqual(forcedUnavailable.media.length, 0);
result = galleryDb.search(dbFile, "新标题", 60, { searchMode: "auto" });
assert.strictEqual(result.searchMode, "safe-degraded");
assert.strictEqual(result.media.length, 0);
result = galleryDb.search(dbFile, "移动恢", 60, { searchMode: "legacy-like" });
assert.strictEqual(result.searchMode, "legacy-like");
assert.strictEqual(result.media.length, 1);

galleryDb.indexGallery(dbFile, gallery("恢复后三字", "/photos/恢复目录/恢复路径图片.jpg"));
status = galleryDb.getSearchIndexStatus(dbFile, "auto");
assert.strictEqual(status.status, "ready");
assert.strictEqual(galleryDb.search(dbFile, "恢复后", 60, { searchMode: "auto" }).media.length, 1);

const finalDb = new DatabaseSync(dbFile);
const consistency = searchFts.consistencyCheck(finalDb, { full: true });
finalDb.close();
assert.strictEqual(consistency.ok, true, JSON.stringify(consistency));

const deletedId = galleryDb.getMedia(dbFile, "模特甲", { limit: 1 }).items[0].id;
assert.strictEqual(galleryDb.removeMediaRecords(dbFile, [deletedId]).removed, 1);
status = galleryDb.getSearchIndexStatus(dbFile, "auto");
assert.strictEqual(status.mediaCount, 0);
assert.strictEqual(status.mappingCount, 0);
assert.strictEqual(status.ftsDocumentCount, 0);

console.log(JSON.stringify({
  ok: true,
  dbFile,
  migrationEvents: migration.stdout.trim().split(/\r?\n/).length,
  filesystemScenarios: {
    fileMovedDatabaseFailed: movedDatabaseFailed,
    recoveredByRescan: true,
  },
  finalStatus: status,
}, null, 2));
