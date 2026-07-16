"use strict";

const fs = require("fs");
const path = require("path");
const { DatabaseSync, backup } = require("node:sqlite");
const cli = require("./search-fts-cli-lib");
const searchFts = require("../search-fts");

const sourceValue = cli.argumentValue("--source");
const outputValue = cli.argumentValue("--output");
if (!sourceValue || !outputValue) throw new Error("Usage: --source <read-only-source.db> --output <new-copy-under-tmp/fts5-integration-v96>");
const sourceFile = path.resolve(sourceValue);
const outputFile = path.resolve(outputValue);
const allowedRoot = path.resolve(__dirname, "..", "tmp", "fts5-integration-v96");
const relativeOutput = path.relative(allowedRoot, outputFile);
if (!fs.existsSync(sourceFile) || !fs.statSync(sourceFile).isFile()) throw new Error(`Source database does not exist: ${sourceFile}`);
if (relativeOutput.startsWith("..") || path.isAbsolute(relativeOutput)) throw new Error(`Output must stay under ${allowedRoot}`);
if (fs.existsSync(outputFile)) throw new Error(`Refusing to overwrite existing output: ${outputFile}`);
if (searchFts.isSuspectedFormalDatabase(outputFile)) throw new Error(`Refusing suspected formal output path: ${outputFile}`);

async function main() {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  const sourceBefore = cli.databaseIdentity(sourceFile, false);
  const source = new DatabaseSync(sourceFile, { readOnly: true });
  source.exec("PRAGMA query_only=ON");
  const sourceCounts = source.prepare("SELECT (SELECT COUNT(*) FROM media) AS media, (SELECT COUNT(*) FROM collections) AS collections").get();
  const started = performance.now();
  try {
    await backup(source, outputFile);
  } finally {
    source.close();
  }
  const copy = new DatabaseSync(outputFile, { readOnly: true });
  copy.exec("PRAGMA query_only=ON");
  let integrity;
  let copyCounts;
  try {
    integrity = copy.prepare("PRAGMA integrity_check").get().integrity_check;
    copyCounts = copy.prepare("SELECT (SELECT COUNT(*) FROM media) AS media, (SELECT COUNT(*) FROM collections) AS collections").get();
  } finally {
    copy.close();
  }
  const sourceAfter = cli.databaseIdentity(sourceFile, false);
  const copyIdentity = cli.databaseIdentity(outputFile);
  const unchanged = sourceBefore.bytes === sourceAfter.bytes && sourceBefore.modifiedAt === sourceAfter.modifiedAt;
  if (integrity !== "ok" || sourceCounts.media !== copyCounts.media || sourceCounts.collections !== copyCounts.collections || !unchanged) {
    throw new Error("Consistent backup validation failed");
  }
  cli.emit("search-database-backup-complete", {
    sourceMode: "readOnly+query_only",
    sourceBefore,
    sourceAfter,
    sourceUnchanged: unchanged,
    sourceCounts,
    copy: copyIdentity,
    copyCounts,
    integrity,
    elapsedMs: Math.round(performance.now() - started),
  });
}

main().catch((error) => {
  console.error(JSON.stringify({ event: "search-database-backup-failed", error: String(error.message || error) }));
  process.exitCode = 1;
});
