"use strict";

const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { EXPERIMENT_ROOT, argumentValue, escapeLike, fileBytes, normalizeRelativeSource, quoteMatchText, round } = require("./fts5-prototype-lib");

const sourceArgument = argumentValue("--source");
const dbArgument = argumentValue("--db");
const sampleSize = Math.min(Math.max(Number(argumentValue("--sample-size", "50000")) || 50000, 1000), 100000);
const query = argumentValue("--query", "扫码");
if (!sourceArgument || !dbArgument) {
  console.error("Usage: node scripts/prototype-media-bigram.js --source <experiment-gallery.db> --db <tmp/fts5-prototype/bigram/bigram.db> [--sample-size 50000] [--query 扫码]");
  process.exit(2);
}

const source = path.resolve(sourceArgument);
const target = path.resolve(dbArgument);
if (!target.startsWith(EXPERIMENT_ROOT) || source.toLocaleLowerCase("en-US") === target.toLocaleLowerCase("en-US")) throw new Error("Unsafe bigram experiment path");
fs.mkdirSync(path.dirname(target), { recursive: true });
for (const suffix of ["", "-wal", "-shm", "-journal"]) if (fs.existsSync(`${target}${suffix}`)) fs.rmSync(`${target}${suffix}`, { force: true });

function hanBigrams(value) {
  const characters = Array.from(String(value || ""));
  const tokens = [];
  for (let index = 0; index < characters.length - 1; index += 1) {
    const token = `${characters[index]}${characters[index + 1]}`;
    if (/^\p{Script=Han}{2}$/u.test(token)) tokens.push(token);
  }
  return [...new Set(tokens)].join(" ");
}

const sourceDb = new DatabaseSync(source, { readOnly: true });
const targetDb = new DatabaseSync(target);
targetDb.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; CREATE VIRTUAL TABLE media_bigram_fts USING fts5(media_id UNINDEXED, tokens, tokenize='unicode61')");
const rows = sourceDb.prepare("SELECT id, title, file_name, src FROM media ORDER BY rowid LIMIT ?").all(sampleSize);
const pattern = `%${escapeLike(query)}%`;
const targetRows = sourceDb.prepare("SELECT id, title, file_name, src FROM media WHERE title LIKE ? ESCAPE '\\' OR file_name LIKE ? ESCAPE '\\' OR src LIKE ? ESCAPE '\\' LIMIT 100").all(pattern, pattern, pattern);
const seen = new Set(rows.map((row) => row.id));
for (const row of targetRows) if (!seen.has(row.id)) rows.push(row);
const insert = targetDb.prepare("INSERT INTO media_bigram_fts(media_id, tokens) VALUES (?, ?)");
const startedAt = performance.now();
let peakRssBytes = process.memoryUsage().rss;
targetDb.exec("BEGIN IMMEDIATE");
try {
  for (const row of rows) {
    const searchable = `${row.title || ""} ${row.file_name || ""} ${normalizeRelativeSource(row.src)}`;
    insert.run(row.id, hanBigrams(searchable));
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
  }
  targetDb.exec("COMMIT");
} catch (error) {
  targetDb.exec("ROLLBACK");
  throw error;
}
targetDb.prepare("INSERT INTO media_bigram_fts(media_bigram_fts) VALUES ('integrity-check')").run();
targetDb.prepare("INSERT INTO media_bigram_fts(media_bigram_fts) VALUES ('optimize')").run();
targetDb.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
const matchStartedAt = performance.now();
const matched = targetDb.prepare("SELECT media_id FROM media_bigram_fts WHERE media_bigram_fts MATCH ? LIMIT 101").all(quoteMatchText(query)).map((row) => row.media_id);
const matchMs = performance.now() - matchStartedAt;
const reference = rows.filter((row) => `${row.title || ""} ${row.file_name || ""} ${row.src || ""}`.includes(query)).map((row) => row.id);
const referenceSet = new Set(reference);
const matchedSet = new Set(matched);
const buildMs = performance.now() - startedAt;
const bytes = fileBytes(target);
console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  source,
  target,
  query,
  requestedSampleSize: sampleSize,
  actualRows: rows.length,
  targetRowsAdded: rows.length - sampleSize,
  buildMs: round(buildMs),
  peakRssBytes,
  databaseBytes: bytes,
  estimatedFullDatabaseBytes: Math.round(bytes * (474470 / rows.length)),
  matchMs: round(matchMs),
  referenceCount: reference.length,
  matchCount: matched.length,
  missing: reference.filter((id) => !matchedSet.has(id)),
  extra: matched.filter((id) => !referenceSet.has(id)),
}, null, 2));
sourceDb.close();
targetDb.close();
