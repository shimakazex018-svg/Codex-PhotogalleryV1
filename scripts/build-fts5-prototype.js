"use strict";

const fs = require("fs");
const path = require("path");
const { DatabaseSync, backup } = require("node:sqlite");
const {
  argumentValue,
  assertSafeExperimentPaths,
  databaseFiles,
  fileBytes,
  normalizeRelativeSource,
  normalizeDecodedRelativeSource,
  round,
} = require("./fts5-prototype-lib");

const sourceArgument = argumentValue("--source");
const dbArgument = argumentValue("--db");
const variant = argumentValue("--variant", "standalone");
const batchSize = Math.min(Math.max(Number(argumentValue("--batch-size", "2000")) || 2000, 100), 10000);
const replace = process.argv.includes("--replace");
const outputArgument = argumentValue("--output");
const allowedVariants = new Set(["external", "standalone", "compact", "decoded", "mapped"]);

if (!allowedVariants.has(variant)) {
  console.error("Usage: node scripts/build-fts5-prototype.js --source <formal-gallery.db> --db <tmp/fts5-prototype/.../gallery.db> --variant <external|standalone|compact|decoded|mapped> [--batch-size 2000] [--replace]");
  process.exit(2);
}

function emit(event, details = {}) {
  process.stdout.write(`${JSON.stringify({ event, at: new Date().toISOString(), ...details })}\n`);
}

function removeExperimentDatabase(target) {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const file = `${target}${suffix}`;
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  }
}

function inspectSource(db, includeFieldStats = true) {
  const requiredMediaColumns = ["id", "collection_id", "type", "title", "file_name", "src", "thumb", "detail_thumb", "carousel_thumb", "poster"];
  const mediaInfo = db.prepare("PRAGMA table_info('media')").all();
  const collectionInfo = db.prepare("PRAGMA table_info('collections')").all();
  const mediaColumns = new Set(mediaInfo.map((row) => row.name));
  const missing = requiredMediaColumns.filter((column) => !mediaColumns.has(column));
  if (missing.length) throw new Error(`Source media schema is missing required columns: ${missing.join(", ")}`);
  const counts = db.prepare("SELECT (SELECT COUNT(*) FROM media) AS media, (SELECT COUNT(*) FROM collections) AS collections").get();
  const fieldStats = includeFieldStats ? db.prepare(`
    SELECT
      SUM(CASE WHEN title IS NULL OR TRIM(title) = '' THEN 1 ELSE 0 END) AS empty_title,
      SUM(CASE WHEN file_name IS NULL OR TRIM(file_name) = '' THEN 1 ELSE 0 END) AS empty_file_name,
      SUM(CASE WHEN src IS NULL OR TRIM(src) = '' THEN 1 ELSE 0 END) AS empty_src,
      COUNT(DISTINCT NULLIF(TRIM(title), '')) AS distinct_title,
      COUNT(DISTINCT NULLIF(TRIM(file_name), '')) AS distinct_file_name,
      SUM(CASE WHEN COALESCE(title, '') = COALESCE(file_name, '') AND COALESCE(title, '') <> '' THEN 1 ELSE 0 END) AS title_equals_file_name,
      SUM(CASE WHEN src LIKE '/photos/%' THEN 1 ELSE 0 END) AS slash_photos_prefix,
      SUM(CASE WHEN src LIKE 'photos/%' THEN 1 ELSE 0 END) AS photos_prefix,
      SUM(CASE WHEN INSTR(COALESCE(src, ''), '\\') > 0 THEN 1 ELSE 0 END) AS backslash_src,
      SUM(CASE WHEN INSTR(COALESCE(title, '') || COALESCE(file_name, '') || COALESCE(src, ''), CHAR(65533)) > 0 THEN 1 ELSE 0 END) AS replacement_character_rows
    FROM media
  `).get() : null;
  return {
    mediaInfo,
    collectionInfo,
    counts,
    fieldStats,
    mediaIdSamples: db.prepare("SELECT id, rowid FROM media LIMIT 5").all(),
    srcSamples: includeFieldStats ? db.prepare("SELECT src FROM media WHERE src IS NOT NULL AND src <> '' LIMIT 10").all().map((row) => row.src) : [],
  };
}

function databaseSize(db) {
  const pageCount = db.prepare("PRAGMA page_count").get().page_count;
  const pageSize = db.prepare("PRAGMA page_size").get().page_size;
  return { pageCount, pageSize, allocatedBytes: pageCount * pageSize };
}

function createExternal(db) {
  db.exec("DROP TABLE IF EXISTS media_search_fts_external");
  db.exec(`
    CREATE VIRTUAL TABLE media_search_fts_external USING fts5(
      title,
      file_name,
      src,
      content='media',
      content_rowid='rowid',
      tokenize='trigram'
    )
  `);
  const startedAt = performance.now();
  db.prepare("INSERT INTO media_search_fts_external(media_search_fts_external) VALUES ('rebuild')").run();
  return { buildMs: performance.now() - startedAt, processed: db.prepare("SELECT COUNT(*) AS count FROM media").get().count, failed: 0 };
}

function createStandalone(db, total, dbFile, compact = false, decoded = false, mapped = false) {
  const name = mapped ? "media_search_fts_mapped" : decoded ? "media_search_fts_decoded" : compact ? "media_search_fts_compact" : "media_search_fts";
  db.exec(`DROP TABLE IF EXISTS ${name}`);
  if (mapped) db.exec("DROP TABLE IF EXISTS media_search_documents");
  if (mapped) db.exec(`
    CREATE TABLE media_search_documents (
      fts_rowid INTEGER PRIMARY KEY,
      media_id TEXT NOT NULL UNIQUE,
      FOREIGN KEY(media_id) REFERENCES media(id) ON DELETE CASCADE
    )
  `);
  db.exec(`
    CREATE VIRTUAL TABLE ${name} USING fts5(
      ${mapped ? "" : "media_id UNINDEXED,"}
      title,
      ${compact ? "" : "file_name,"}
      relative_src,
      tokenize='trigram'
    )
  `);
  const selectBatch = db.prepare(`
    SELECT rowid, id, title, file_name, src
    FROM media
    WHERE rowid > ?
    ORDER BY rowid
    LIMIT ?
  `);
  const insertDocument = mapped ? db.prepare("INSERT INTO media_search_documents(media_id) VALUES (?)") : null;
  const insert = mapped
    ? db.prepare(`INSERT INTO ${name}(rowid, title, relative_src) VALUES (?, ?, ?)`)
    : compact
    ? db.prepare(`INSERT INTO ${name}(media_id, title, relative_src) VALUES (?, ?, ?)`)
    : db.prepare(`INSERT INTO ${name}(media_id, title, file_name, relative_src) VALUES (?, ?, ?, ?)`);
  let lastRowid = 0;
  let processed = 0;
  let failed = 0;
  let emptyFieldRows = 0;
  let peakRssBytes = process.memoryUsage().rss;
  let peakWalBytes = fileBytes(`${dbFile}-wal`);
  let peakShmBytes = fileBytes(`${dbFile}-shm`);
  let peakJournalBytes = fileBytes(`${dbFile}-journal`);
  const errors = [];
  const startedAt = performance.now();
  const cpuStarted = process.cpuUsage();
  let nextProgress = 25000;

  while (true) {
    const rows = selectBatch.all(lastRowid, batchSize);
    if (!rows.length) break;
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const row of rows) {
        try {
          const title = String(row.title || "");
          const fileName = String(row.file_name || "");
          const relativeSrc = decoded ? normalizeDecodedRelativeSource(row.src) : normalizeRelativeSource(row.src);
          if (!title || !relativeSrc || (!compact && !fileName)) emptyFieldRows += 1;
          if (mapped) {
            const document = insertDocument.run(row.id);
            insert.run(document.lastInsertRowid, title, relativeSrc);
          } else if (compact) insert.run(row.id, title, relativeSrc);
          else insert.run(row.id, title, fileName, relativeSrc);
          processed += 1;
        } catch (error) {
          failed += 1;
          if (errors.length < 10) errors.push({ id: row.id, error: String(error.message || error) });
        }
      }
      db.exec("COMMIT");
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch {}
      throw error;
    }
    lastRowid = rows[rows.length - 1].rowid;
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
    peakWalBytes = Math.max(peakWalBytes, fileBytes(`${dbFile}-wal`));
    peakShmBytes = Math.max(peakShmBytes, fileBytes(`${dbFile}-shm`));
    peakJournalBytes = Math.max(peakJournalBytes, fileBytes(`${dbFile}-journal`));
    if (processed + failed >= nextProgress || processed + failed >= total) {
      const cpu = process.cpuUsage(cpuStarted);
      emit("fts-build-progress", {
        variant,
        processed,
        failed,
        total,
        percent: round(((processed + failed) / total) * 100, 1),
        elapsedMs: round(performance.now() - startedAt),
        rssBytes: process.memoryUsage().rss,
        cpuUserMs: round(cpu.user / 1000),
        cpuSystemMs: round(cpu.system / 1000),
      });
      nextProgress += 25000;
    }
  }
  const cpu = process.cpuUsage(cpuStarted);
  return {
    buildMs: performance.now() - startedAt,
    processed,
    failed,
    emptyFieldRows,
    peakRssBytes,
    peakWalBytes,
    peakShmBytes,
    peakJournalBytes,
    cpuUserMs: cpu.user / 1000,
    cpuSystemMs: cpu.system / 1000,
    errors,
  };
}

async function main() {
  const { source, target } = assertSafeExperimentPaths(sourceArgument, dbArgument);
  if (fs.existsSync(target) && !replace) throw new Error(`Target already exists; pass --replace to replace only this experiment copy: ${target}`);
  if (replace) removeExperimentDatabase(target);
  const sourceStat = fs.statSync(source);
  const fileSystem = fs.statfsSync(path.dirname(target));
  const availableBytes = Number(fileSystem.bavail) * Number(fileSystem.bsize);
  const minimumAvailableBytes = sourceStat.size * 2;
  if (availableBytes < minimumAvailableBytes) {
    throw new Error(`Insufficient free space for a copied database plus FTS index: available=${availableBytes}, required=${minimumAvailableBytes}`);
  }
  emit("source-confirmed", {
    source,
    target,
    variant,
    sourceBytes: sourceStat.size,
    sourceCreatedAt: sourceStat.birthtime.toISOString(),
    sourceModifiedAt: sourceStat.mtime.toISOString(),
    availableBytes,
  });

  const sourceDb = new DatabaseSync(source, { readOnly: true });
  sourceDb.exec("PRAGMA temp_store=MEMORY; PRAGMA query_only=ON");
  const sourceInspection = inspectSource(sourceDb, false);
  const copyStartedAt = performance.now();
  await backup(sourceDb, target);
  const copyMs = performance.now() - copyStartedAt;
  sourceDb.close();
  emit("copy-complete", { target, copyMs: round(copyMs), targetBytes: fileBytes(target) });

  const db = new DatabaseSync(target);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA temp_store=FILE");
  db.exec("CREATE INDEX IF NOT EXISTS idx_collections_title_nocase ON collections(title COLLATE NOCASE)");
  if (variant === "mapped") db.exec("CREATE INDEX IF NOT EXISTS idx_media_title_nocase ON media(title COLLATE NOCASE)");
  const copyInspection = inspectSource(db, true);
  const before = databaseSize(db);
  const filesBefore = databaseFiles(target);
  const total = sourceInspection.counts.media;
  const buildResult = variant === "external" ? createExternal(db) : createStandalone(db, total, target, new Set(["compact", "decoded", "mapped"]).has(variant), new Set(["decoded", "mapped"]).has(variant), variant === "mapped");
  const tableName = variant === "external" ? "media_search_fts_external" : variant === "mapped" ? "media_search_fts_mapped" : variant === "decoded" ? "media_search_fts_decoded" : variant === "compact" ? "media_search_fts_compact" : "media_search_fts";
  const maintenanceStartedAt = performance.now();
  db.prepare(`INSERT INTO ${tableName}(${tableName}) VALUES ('integrity-check')`).run();
  db.prepare(`INSERT INTO ${tableName}(${tableName}) VALUES ('optimize')`).run();
  const maintenanceMs = performance.now() - maintenanceStartedAt;
  db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
  const after = databaseSize(db);
  const integrity = db.prepare("PRAGMA integrity_check").get().integrity_check;
  db.close();

  const result = {
    event: "fts-build-complete",
    at: new Date().toISOString(),
    source,
    target,
    variant,
    tableName,
    copyMethod: "node:sqlite backup() from a read-only query_only source connection",
    sourceBytes: sourceStat.size,
    copiedBytesBeforeFts: filesBefore.reduce((sum, item) => sum + item.bytes, 0),
    filesBefore,
    filesAfter: databaseFiles(target),
    before,
    after,
    indexAllocatedDeltaBytes: after.allocatedBytes - before.allocatedBytes,
    copyMs: round(copyMs),
    buildMs: round(buildResult.buildMs),
    maintenanceMs: round(maintenanceMs),
    batchSize: variant === "external" ? null : batchSize,
    total,
    ...Object.fromEntries(Object.entries(buildResult).map(([key, value]) => [key, typeof value === "number" ? round(value) : value])),
    sourceInspection: { ...sourceInspection, fieldStats: copyInspection.fieldStats, srcSamples: copyInspection.srcSamples },
    sqliteIntegrityCheck: integrity,
  };
  if (outputArgument) {
    const output = path.resolve(outputArgument);
    if (!output.startsWith(path.dirname(target))) throw new Error("--output must stay in the experiment database directory");
    fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify(result, null, 2));
  if (buildResult.failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ event: "fts-build-failed", error: String(error.stack || error) }, null, 2));
  process.exitCode = 1;
});
