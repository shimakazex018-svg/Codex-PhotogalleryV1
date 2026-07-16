"use strict";

const fs = require("fs");
const path = require("path");
const { backup } = require("node:sqlite");
const searchFts = require("../search-fts");
const cli = require("./search-fts-cli-lib");

const dbFile = cli.requireExplicitDatabase();
const batchSize = Math.min(Math.max(Number(cli.argumentValue("--batch-size", "2000")) || 2000, 100), 10000);
const operations = ["--dry-run", "--apply", "--verify", "--optimize", "--backup"].filter((flag) => process.argv.includes(flag));
if (operations.length !== 1) throw new Error("Choose exactly one operation: --dry-run, --backup, --apply, --verify, or --optimize");

function inspect(readOnly = true) {
  const db = cli.openDatabase(dbFile, readOnly);
  try {
    const capability = searchFts.detectFts5Capability(db);
    const schema = cli.schemaInspection(db);
    const index = searchFts.getIndexStatus(db);
    return { identity: cli.databaseIdentity(dbFile), capability, schema, index, disk: cli.diskBudget(dbFile) };
  } finally {
    db.close();
  }
}

function dryRun() {
  const result = inspect(true);
  const blockers = [];
  if (!result.capability.fts5) blockers.push("fts5_unavailable");
  if (result.schema.missingColumns.length) blockers.push("incompatible_media_schema");
  if (!result.disk.sufficient) blockers.push("insufficient_disk_space");
  return cli.emit("search-fts-dry-run", { ...result, batchSize, blockers, ok: blockers.length === 0 });
}

async function createBackup() {
  const destinationValue = cli.argumentValue("--output");
  if (!destinationValue) throw new Error("--backup requires --output <new-backup.db>");
  const destination = path.resolve(destinationValue);
  if (fs.existsSync(destination)) throw new Error(`Refusing to overwrite backup: ${destination}`);
  if (searchFts.isSuspectedFormalDatabase(destination)) throw new Error(`Refusing suspected formal destination: ${destination}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const before = cli.databaseIdentity(dbFile);
  const source = cli.openDatabase(dbFile, true);
  try {
    await backup(source, destination);
  } finally {
    source.close();
  }
  const copy = cli.openDatabase(destination, true);
  let integrity;
  let counts;
  try {
    integrity = copy.prepare("PRAGMA integrity_check").get().integrity_check;
    counts = copy.prepare("SELECT (SELECT COUNT(*) FROM media) AS media, (SELECT COUNT(*) FROM collections) AS collections").get();
  } finally {
    copy.close();
  }
  const after = cli.databaseIdentity(destination);
  if (integrity !== "ok") throw new Error(`Backup integrity_check failed: ${integrity}`);
  return cli.emit("search-fts-backup-complete", { source: before, backup: after, integrity, counts, method: "node:sqlite backup()" });
}

function applyMigration() {
  const preflight = dryRun();
  if (!preflight.ok) throw new Error(`Migration blocked: ${preflight.blockers.join(",")}`);
  const db = cli.openDatabase(dbFile, false);
  const started = performance.now();
  let processed = 0;
  let nextProgress = 25000;
  try {
    db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA temp_store=FILE");
    searchFts.createSearchSchema(db);
    searchFts.updateState(db, "building", { startedAt: new Date().toISOString(), completedAt: null, lastError: "" });
    let lastRowid = 0;
    const select = db.prepare("SELECT rowid, id, title, src FROM media WHERE rowid > ? ORDER BY rowid LIMIT ?");
    while (true) {
      const rows = select.all(lastRowid, batchSize);
      if (!rows.length) break;
      db.exec("BEGIN IMMEDIATE");
      try {
        for (const row of rows) searchFts.upsertMediaDocument(db, row);
        db.exec("COMMIT");
      } catch (error) {
        try { db.exec("ROLLBACK"); } catch {}
        throw error;
      }
      processed += rows.length;
      lastRowid = Number(rows[rows.length - 1].rowid);
      if (processed >= nextProgress) {
        cli.emit("search-fts-build-progress", { processed, elapsedMs: Math.round(performance.now() - started) });
        nextProgress += 25000;
      }
    }
    const verification = searchFts.consistencyCheck(db, { full: true });
    if (!verification.ok) throw new Error(`Full consistency check failed: ${JSON.stringify(verification)}`);
    searchFts.optimizeFts(db);
    searchFts.updateState(db, "ready", {
      completedAt: new Date().toISOString(),
      lastSyncAt: new Date().toISOString(),
      lastVerifyAt: new Date().toISOString(),
      lastError: "",
    });
    const finalStatus = searchFts.getIndexStatus(db);
    db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
    return cli.emit("search-fts-apply-complete", {
      processed,
      batchSize,
      elapsedMs: Math.round(performance.now() - started),
      verification,
      finalStatus,
      identity: cli.databaseIdentity(dbFile, false),
    });
  } catch (error) {
    try { searchFts.updateState(db, "error", { lastError: error.message }); } catch {}
    throw error;
  } finally {
    db.close();
  }
}

function verify(full = true) {
  const db = cli.openDatabase(dbFile, false);
  const started = performance.now();
  try {
    const result = searchFts.consistencyCheck(db, { full });
    const integrity = db.prepare("PRAGMA integrity_check").get().integrity_check;
    if (result.ok && integrity === "ok") {
      searchFts.updateState(db, "ready", { lastVerifyAt: new Date().toISOString(), lastError: "" });
    } else {
      searchFts.updateState(db, "stale", { lastVerifyAt: new Date().toISOString(), lastError: "consistency_check_failed" });
    }
    return cli.emit("search-fts-verify", { ok: result.ok && integrity === "ok", elapsedMs: Math.round(performance.now() - started), integrity, result });
  } finally {
    db.close();
  }
}

function optimize() {
  const db = cli.openDatabase(dbFile, false);
  try {
    const before = cli.databaseIdentity(dbFile, false);
    searchFts.optimizeFts(db);
    db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
    return cli.emit("search-fts-optimize", { before, after: cli.databaseIdentity(dbFile, false) });
  } finally { db.close(); }
}

async function main() {
  const operation = operations[0];
  if (operation === "--dry-run") return dryRun();
  if (operation === "--apply") return applyMigration();
  if (operation === "--verify") return verify(true);
  if (operation === "--optimize") return optimize();
  if (operation === "--backup") return createBackup();
}

main().catch((error) => {
  console.error(JSON.stringify({ event: "search-fts-command-failed", error: String(error.message || error) }));
  process.exitCode = 1;
});
