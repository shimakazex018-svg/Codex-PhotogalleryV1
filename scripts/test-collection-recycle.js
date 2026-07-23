const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const galleryDb = require("../gallery-db");
const { runCollectionRecycleMaintenance } = require("../collection-recycle-maintenance");

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
assert.doesNotMatch(appSource, /force-retry/);
assert.doesNotMatch(appSource, /强制释放并回收/);
assert.doesNotMatch(serverSource, /startupRecycleBatch/);
assert.match(serverSource, /scheduled\.setHours\(4, 0, 0, 0\)/);
assert.match(serverSource, /response\.once\("close", onResponseDone\)/);

const root = fs.mkdtempSync(path.join(os.tmpdir(), "Codex-PhotogalleryV1-CollectionMaintenance-"));
const photos = path.join(root, "photos");
const trash = path.join(root, "trash");
const data = path.join(root, "data");
const dbFile = path.join(data, "gallery.db");
const now = new Date("2026-07-23T04:00:00.000Z");

function file(relative) {
  const target = path.join(photos, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, "test");
}

function addCollection(id) {
  const db = new DatabaseSync(dbFile);
  try {
    db.prepare(`INSERT INTO collections (id, title, path_parts, level, mtime, image_count, video_count, cover) VALUES (?, ?, ?, ?, 0, 1, 0, '')`).run(id, path.basename(id), JSON.stringify(id.split("/")), id.split("/").length);
  } finally { db.close(); }
}

function createQueue(id, status, eligibleAt, finishedAt = "") {
  const item = galleryDb.createCollectionRecycle(dbFile, { id: `${id}-id`, collectionId: id, relativePath: id.split("/").join(path.sep), title: path.basename(id),
    markedAt: "2026-07-22T00:00:00.000Z", eligibleAt, scheduledAt: "2026-07-23T04:00:00.000Z", sourcePathSnapshot: path.join(photos, ...id.split("/")) });
  if (status !== "waiting") galleryDb.updateCollectionRecycle(dbFile, item.id, { status, finishedAt: finishedAt || null, error: status === "recycle_failed" ? "EPERM simulated lock" : null, lastError: status === "recycle_failed" ? "EPERM simulated lock" : null });
  return item;
}

function testLegacyMigration() {
  const legacy = path.join(root, "legacy", "gallery.db");
  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  const db = new DatabaseSync(legacy);
  db.exec(`CREATE TABLE collection_recycle_queue (id TEXT PRIMARY KEY, collection_id TEXT NOT NULL, relative_path TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL, marked_at TEXT NOT NULL, eligible_at TEXT NOT NULL, scheduled_at TEXT NOT NULL, started_at TEXT, finished_at TEXT, source_path_snapshot TEXT NOT NULL, recycle_path TEXT, error TEXT, requested_ip TEXT, requested_scope TEXT, index_refresh_error TEXT, updated_at TEXT NOT NULL); CREATE UNIQUE INDEX idx_collection_recycle_active ON collection_recycle_queue(collection_id) WHERE status IN ('pending','recycling');`);
  db.close();
  galleryDb.getCollectionRecyclePage(legacy, 1, 10);
  const migrated = new DatabaseSync(legacy, { readOnly: true });
  assert.match(migrated.prepare("SELECT sql FROM sqlite_master WHERE name='idx_collection_recycle_active'").get().sql, /ready-for-maintenance/);
  assert.ok(migrated.prepare("SELECT name FROM sqlite_master WHERE name='idx_collection_recycle_maintenance_due'").get());
  migrated.close();
}

try {
  testLegacyMigration();
  file("梦心玥/爱蜜社/正常/a.jpg");
  file("梦心玥/爱蜜社/未到期/a.jpg");
  file("梦心玥/爱蜜社/下次窗口/a.jpg");
  file("梦心玥/爱蜜社/文件占用/a.jpg");
  galleryDb.getCollectionRecyclePage(dbFile, 1, 1);
  addCollection("梦心玥/爱蜜社/正常");
  addCollection("梦心玥/爱蜜社/未到期");
  addCollection("梦心玥/爱蜜社/下次窗口");
  addCollection("梦心玥/爱蜜社/文件占用");
  createQueue("梦心玥/爱蜜社/正常", "waiting", "2026-07-23T03:00:00.000Z");
  createQueue("梦心玥/爱蜜社/未到期", "waiting", "2026-07-23T04:30:00.000Z");
  createQueue("梦心玥/爱蜜社/下次窗口", "recycle_failed", "2026-07-22T03:00:00.000Z", "2026-07-22T04:01:00.000Z");
  createQueue("梦心玥/爱蜜社/文件占用", "waiting", "2026-07-23T03:00:00.000Z");

  const events = [];
  const result = runCollectionRecycleMaintenance({ dbFile, photosDir: photos, trashDir: trash, now, log: (type, detail) => events.push({ type, detail }) });
  assert.equal(result.prepared.ready, 2);
  assert.equal(result.prepared.retry, 1);
  assert.equal(result.moved, 3);
  assert.equal(fs.existsSync(path.join(photos, "梦心玥", "爱蜜社", "正常")), false);
  assert.equal(fs.existsSync(path.join(trash, "梦心玥", "爱蜜社", "正常")), true);
  assert.equal(galleryDb.getLatestCollectionRecycle(dbFile, "梦心玥/爱蜜社/未到期").status, "waiting");
  assert.equal(galleryDb.getLatestCollectionRecycle(dbFile, "梦心玥/爱蜜社/下次窗口").status, "recycled");
  assert.ok(events.some((event) => event.type === "recycle_success"));

  // A held image plus an injected Windows EPERM leaves the item for the next daily window.
  file("梦心玥/爱蜜社/模拟锁/a.jpg");
  addCollection("梦心玥/爱蜜社/模拟锁");
  createQueue("梦心玥/爱蜜社/模拟锁", "waiting", "2026-07-23T03:00:00.000Z");
  const held = fs.openSync(path.join(photos, "梦心玥", "爱蜜社", "模拟锁", "a.jpg"), "r");
  const locked = runCollectionRecycleMaintenance({ dbFile, photosDir: photos, trashDir: trash, now, renameSync: () => { const error = new Error("EPERM simulated lock"); error.code = "EPERM"; throw error; } });
  assert.equal(locked.failed, 1);
  assert.equal(galleryDb.getLatestCollectionRecycle(dbFile, "梦心玥/爱蜜社/模拟锁").status, "recycle_failed");
  fs.closeSync(held);
  const retried = runCollectionRecycleMaintenance({ dbFile, photosDir: photos, trashDir: trash, now: new Date("2026-07-24T04:00:00.000Z") });
  assert.equal(retried.moved, 2);
  assert.equal(galleryDb.getLatestCollectionRecycle(dbFile, "梦心玥/爱蜜社/模拟锁").status, "recycled");
  // The item that was not due in the first window remains queued and recovers in the next run.
  assert.equal(galleryDb.getLatestCollectionRecycle(dbFile, "梦心玥/爱蜜社/未到期").status, "recycled");
  console.log("COLLECTION_MAINTENANCE_TEST=PASS");
} finally {
  try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 30, retryDelay: 200 }); } catch (error) { console.error(`TEMP_CLEANUP_ERROR=${error.code || error.message}`); }
  console.log(`TEMP_ROOT_EXISTS=${fs.existsSync(root)}`);
}
