"use strict";

const searchFts = require("../search-fts");
const cli = require("./search-fts-cli-lib");

const dbFile = cli.requireExplicitDatabase({ allowFormal: process.argv.includes("--allow-formal-db") });
const quick = process.argv.includes("--quick");
const full = process.argv.includes("--full");
if ([quick, full].filter(Boolean).length !== 1) throw new Error("Choose exactly one: --quick or --full");

const db = cli.openDatabase(dbFile, false);
try {
  const started = performance.now();
  const result = searchFts.consistencyCheck(db, { full });
  const integrityPragma = full ? "integrity_check" : "quick_check";
  const integrity = db.prepare(`PRAGMA ${integrityPragma}`).get()[integrityPragma];
  if (result.ok && integrity === "ok") {
    searchFts.updateState(db, "ready", { lastVerifyAt: new Date().toISOString(), lastError: "" });
  } else {
    searchFts.updateState(db, "stale", { lastVerifyAt: new Date().toISOString(), lastError: "consistency_check_failed" });
  }
  cli.emit("search-fts-consistency", {
    database: cli.databaseIdentity(dbFile, false),
    mode: full ? "full" : "quick",
    elapsedMs: Math.round(performance.now() - started),
    integrity,
    result,
  });
  if (!result.ok || integrity !== "ok") process.exitCode = 1;
} finally {
  db.close();
}
