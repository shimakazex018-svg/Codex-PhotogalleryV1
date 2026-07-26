const fs = require("fs");
const path = require("path");
const { runCollectionRecycleMaintenance } = require("../collection-recycle-maintenance");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

const dbFile = argument("--db");
const photosDir = argument("--photos");
const trashDir = argument("--trash");
const logFile = argument("--log");
const dryRun = process.argv.includes("--dry-run");
if (!dbFile || !photosDir || !trashDir || !logFile) throw new Error("Usage: --db <gallery.db> --photos <PHOTOS_DIR> --trash <TRASH_DIR> --log <maintenance log> [--dry-run]");

function log(type, details = {}) {
  const entry = { time: new Date().toISOString(), type, ...details };
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

if (dryRun) {
  const { DatabaseSync } = require("node:sqlite");
  const { collectionTarget } = require("../collection-recycle-maintenance");
  const db = new DatabaseSync(dbFile, { readOnly: true });
  try {
    db.exec("PRAGMA query_only=ON");
    const items = db.prepare("SELECT id, collection_id, relative_path, title, status, eligible_at FROM collection_recycle_queue WHERE status='ready-for-maintenance' ORDER BY eligible_at, id LIMIT 200").all();
    const planned = items.map((item) => {
      const sourcePath = path.resolve(photosDir, item.relative_path);
      let targetPath = ""; let targetError = "";
      try { targetPath = collectionTarget(trashDir, item.relative_path, item.id).path; } catch (error) { targetError = error.message; }
      return { id: item.id, collectionId: item.collection_id, title: item.title, sourcePath, sourceExists: fs.existsSync(sourcePath), targetPath, targetError };
    });
    const result = { dryRun: true, readyForMaintenance: planned.length, planned };
    log("recycle_dry_run", result);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally { db.close(); }
} else {
  log("recycle_start");
  const result = runCollectionRecycleMaintenance({ dbFile, photosDir, trashDir, log });
  log("recycle_finished", result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
