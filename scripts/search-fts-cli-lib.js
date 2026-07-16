"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const searchFts = require("../search-fts");

function argumentValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] !== undefined ? process.argv[index + 1] : fallback;
}

function requireExplicitDatabase() {
  const value = argumentValue("--db");
  if (!value) throw new Error("--db <database-copy-path> is required");
  const dbFile = path.resolve(value);
  if (!fs.existsSync(dbFile) || !fs.statSync(dbFile).isFile()) throw new Error(`Database does not exist: ${dbFile}`);
  if (searchFts.isSuspectedFormalDatabase(dbFile)) throw new Error(`Refusing suspected formal database: ${dbFile}`);
  return dbFile;
}

function openDatabase(dbFile, readOnly = false) {
  const db = new DatabaseSync(dbFile, { readOnly });
  if (readOnly) db.exec("PRAGMA query_only=ON");
  return db;
}

function sha256File(file) {
  const hash = crypto.createHash("sha256");
  const descriptor = fs.openSync(file, "r");
  const buffer = Buffer.allocUnsafe(8 * 1024 * 1024);
  try {
    while (true) {
      const bytes = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (!bytes) break;
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest("hex");
}

function databaseIdentity(dbFile, includeHash = true) {
  return { ...searchFts.databaseIdentity(dbFile), sha256: includeHash ? sha256File(dbFile) : "" };
}

function diskBudget(dbFile) {
  const stat = fs.statSync(dbFile);
  const disk = fs.statfsSync(path.dirname(dbFile), { bigint: true });
  const availableBytes = Number(disk.bavail * disk.bsize);
  const backupBytes = stat.size;
  const ftsBytes = Math.ceil(Math.max(284315648, stat.size * 0.25));
  const walAndTemporaryBytes = Math.ceil(stat.size * 0.5);
  const maintenanceBytes = Math.ceil(stat.size * 0.25);
  const safetyMarginBytes = Math.max(1024 ** 3, Math.ceil(stat.size * 0.25));
  const requiredBytes = backupBytes + ftsBytes + walAndTemporaryBytes + maintenanceBytes + safetyMarginBytes;
  return { availableBytes, requiredBytes, backupBytes, ftsBytes, walAndTemporaryBytes, maintenanceBytes, safetyMarginBytes, sufficient: availableBytes >= requiredBytes };
}

function schemaInspection(db) {
  const mediaColumns = db.prepare("PRAGMA table_info('media')").all().map((row) => row.name);
  const required = ["id", "title", "src"];
  const missingColumns = required.filter((name) => !mediaColumns.includes(name));
  const journalMode = db.prepare("PRAGMA journal_mode").get().journal_mode;
  const userVersion = db.prepare("PRAGMA user_version").get().user_version;
  return { mediaColumns, missingColumns, journalMode, userVersion };
}

function emit(event, details = {}) {
  const payload = { event, at: new Date().toISOString(), ...details };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  return payload;
}

module.exports = {
  argumentValue,
  databaseIdentity,
  diskBudget,
  emit,
  openDatabase,
  requireExplicitDatabase,
  schemaInspection,
  sha256File,
};
