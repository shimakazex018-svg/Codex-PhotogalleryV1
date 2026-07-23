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
if (!dbFile || !photosDir || !trashDir || !logFile) throw new Error("Usage: --db <gallery.db> --photos <PHOTOS_DIR> --trash <TRASH_DIR> --log <maintenance log>");

function log(type, details = {}) {
  const entry = { time: new Date().toISOString(), type, ...details };
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

log("recycle_start");
const result = runCollectionRecycleMaintenance({ dbFile, photosDir, trashDir, log });
log("recycle_finished", result);
process.stdout.write(`${JSON.stringify(result)}\n`);
