"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const galleryDb = require("../gallery-db");
const { createManager } = require("../perceptual-manager");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "photogallery-media-optimization-"));
const dbFile = path.join(root, "gallery.db");

try {
  // Schema creation and all assertions use a disposable database only.
  galleryDb.indexGallery(dbFile, { models: [], collections: [] });
  const summary = galleryDb.getMediaOptimizationSummary(dbFile);
  assert.equal(summary.imageCount, 0);
  assert.equal(summary.videoCount, 0);
  assert.equal(summary.hashedImages, 0);

  // A process restart must not present an orphaned pHash worker as active/running.
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(dbFile);
  db.exec("PRAGMA busy_timeout=5000");
  db.prepare("INSERT INTO perceptual_hash_state (id,algorithm,algorithm_version,status,processed,succeeded,failed,skipped,baseline_bytes,updated_at,recent_error) VALUES (1,'phash64',1,'running',0,0,0,0,0,0,'') ON CONFLICT(id) DO UPDATE SET status='running'").run();
  db.close();
  const manager = createManager({ stats: () => galleryDb.getPerceptualHashStats(dbFile) });
  assert.equal(manager.status().status, "interrupted");
  assert.equal(manager.status().active, false);
  console.log("MEDIA_OPTIMIZATION_TEST=PASS");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
  console.log(`TEMP_ROOT_EXISTS=${fs.existsSync(root)}`);
}
