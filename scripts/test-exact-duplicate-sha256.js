"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { DatabaseSync } = require("node:sqlite");
const galleryDb = require("../gallery-db");

const rootDir = path.resolve(__dirname, "..");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-exact-duplicates-"));
const photosDir = path.join(root, "photos");
const dataDir = path.join(root, "data");
const trashDir = path.join(root, "trash");
const dbFile = path.join(dataDir, "gallery.db");
const bytes = Buffer.from("isolated exact duplicate: 中文 & []", "utf8");
const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");

function addMedia(db, id, collectionId, fileName, src, sortOrder) {
  db.prepare(`INSERT INTO media (id, collection_id, type, title, file_name, src, size, mtime, sort_order, metadata)
    VALUES (?, ?, 'image', ?, ?, ?, ?, 1, ?, '{}')`).run(id, collectionId, fileName, fileName, src, bytes.length, sortOrder);
}

function runWorker(scanStartedAt) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(rootDir, "duplicates-worker.js")], {
      cwd: rootDir,
      env: { ...process.env, PHOTOS_DIR: photosDir, DATA_DIR: dataDir, DUPLICATE_SCAN_STARTED_AT: scanStartedAt, DUPLICATE_BATCH_SIZE: "1" },
      stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    });
    let output = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(output) : reject(new Error(stderr || `worker exited ${code}`)));
  });
}

(async () => {
  try {
    const relativeA = path.join("内部文件", "ART-002", "安然 & []", "001.jpg");
    const relativeB = path.join("内部文件", "ART-008", "陆萱萱 & []", "001.JPG");
    for (const relative of [relativeA, relativeB]) {
      const file = path.join(photosDir, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, bytes);
    }
    galleryDb.indexGallery(dbFile, { collections: [] });
    const db = new DatabaseSync(dbFile);
    const insertCollection = db.prepare(`INSERT INTO collections (id, parent_id, title, folder, path_parts, level, image_count, video_count, total_image_count, total_video_count, descendant_count, mtime, sort_order)
      VALUES (?, NULL, ?, ?, ?, 1, 1, 0, 1, 0, 0, 1, ?)`);
    insertCollection.run("内部文件/ART-002/安然 & []", "安然 & []", "安然 & []", JSON.stringify(["内部文件", "ART-002", "安然 & []"]), 0);
    insertCollection.run("内部文件/ART-008/陆萱萱 & []", "陆萱萱 & []", "陆萱萱 & []", JSON.stringify(["内部文件", "ART-008", "陆萱萱 & []"]), 1);
    addMedia(db, "media-a", "内部文件/ART-002/安然 & []", "001.jpg", `/photos/${relativeA.replaceAll("\\", "/")}`, 0);
    addMedia(db, "media-b", "内部文件/ART-008/陆萱萱 & []", "001.JPG", `/photos/${relativeB.replaceAll("\\", "/")}`, 0);
    // Reproduce the formerly sticky failure state: an unchanged image with an empty SHA.
    db.prepare("INSERT INTO media_hashes (media_id, collection_id, file_size, mtime, sha256, updated_at) VALUES (?, ?, ?, 1, '', ?)")
      .run("media-a", "内部文件/ART-002/安然 & []", bytes.length, "2000-01-01T00:00:00.000Z");
    db.close();

    await runWorker(new Date().toISOString());
    const stats = galleryDb.getDuplicateHashStats(dbFile);
    const groups = galleryDb.getExactDuplicateGroups(dbFile, { limit: 10 });
    assert.equal(stats.hashRecordCount, 2);
    assert.equal(stats.hashedCount, 2);
    assert.equal(stats.uniqueHashCount, 1);
    assert.equal(stats.duplicateGroupCount, 1);
    assert.equal(stats.duplicateItemCount, 2);
    assert.equal(groups.groups[0].sha256, sha256);
    assert.deepEqual(groups.groups[0].items.map((item) => item.collectionId).sort(), ["内部文件/ART-002/安然 & []", "内部文件/ART-008/陆萱萱 & []"]);

    const candidates = galleryDb.getDuplicateDeletionCandidates(dbFile);
    assert.equal(candidates.length, 1);
    const removed = candidates[0];
    const source = path.join(photosDir, decodeURIComponent(new URL(removed.src, "http://localhost").pathname).slice("/photos/".length));
    const target = path.join(trashDir, path.relative(photosDir, source));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(source, target);
    galleryDb.removeMediaRecords(dbFile, [removed.id]);
    assert.ok(fs.existsSync(target));
    assert.ok(!fs.existsSync(source));
    assert.equal(galleryDb.getExactDuplicateGroups(dbFile).total, 0);

    // A file that appears again must be hashable on the next scan, regardless of old task history.
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.copyFileSync(target, source);
    const replay = new DatabaseSync(dbFile);
    addMedia(replay, "media-b-reappeared", "内部文件/ART-008/陆萱萱 & []", "001.JPG", removed.src, 1);
    replay.close();
    await runWorker(new Date().toISOString());
    assert.equal(galleryDb.getExactDuplicateGroups(dbFile).total, 1);
    console.log(JSON.stringify({ ok: true, sha256, crossCollectionGroup: true, recycledSafely: true, rescanRecognizedReappearedFile: true }));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
