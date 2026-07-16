"use strict";

const searchFts = require("../search-fts");
const cli = require("./search-fts-cli-lib");

const dbFile = cli.requireExplicitDatabase();
const full = process.argv.includes("--full");
const dryRun = process.argv.includes("--dry-run");
const sample = Number(cli.argumentValue("--sample", "0")) || 0;
if ([full, dryRun, sample > 0].filter(Boolean).length !== 1) throw new Error("Choose exactly one: --dry-run, --full, or --sample <count>");

const db = cli.openDatabase(dbFile, false);
try {
  const started = performance.now();
  const result = dryRun ? searchFts.getIndexStatus(db) : searchFts.consistencyCheck(db, { full, sample });
  const integrity = dryRun ? "not_run" : db.prepare("PRAGMA integrity_check").get().integrity_check;
  if (full && result.ok && integrity === "ok") {
    searchFts.updateState(db, "ready", { lastFullCheckAt: new Date().toISOString(), errorSummary: "", needsRebuild: 0 });
  }
  cli.emit("search-fts-consistency", {
    database: cli.databaseIdentity(dbFile, false),
    mode: dryRun ? "dry-run" : full ? "full" : "sample",
    sample: full ? null : sample,
    elapsedMs: Math.round(performance.now() - started),
    integrity,
    result,
  });
  if (!dryRun && (!result.ok || integrity !== "ok")) process.exitCode = 1;
} finally {
  db.close();
}
