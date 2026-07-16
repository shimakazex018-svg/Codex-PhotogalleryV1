"use strict";

const fs = require("fs");
const path = require("path");

const SEARCH_FTS_SCHEMA_VERSION = 1;
const SEARCH_FTS_MIGRATION_VERSION = "search-fts5-v96-1";
const SEARCH_FTS_TABLE = "media_search_fts";
const SEARCH_DOCUMENTS_TABLE = "media_search_documents";
const SEARCH_STATE_TABLE = "search_fts_state";
const SEARCH_STATES = new Set(["not_created", "building", "ready", "stale", "error"]);
const SEARCH_MODES = new Set(["auto", "fts5", "legacy-like"]);
const FORMAL_DATABASE_PATH = path.resolve("D:\\GalleryRuntime\\data\\gallery.db");
const writeStatementCache = new WeakMap();

function writeStatements(db) {
  let statements = writeStatementCache.get(db);
  if (!statements) {
    statements = {
      selectMapping: db.prepare(`SELECT fts_rowid FROM ${SEARCH_DOCUMENTS_TABLE} WHERE media_id = ?`),
      insertMapping: db.prepare(`INSERT INTO ${SEARCH_DOCUMENTS_TABLE}(media_id) VALUES (?)`),
      deleteFts: db.prepare(`DELETE FROM ${SEARCH_FTS_TABLE} WHERE rowid = ?`),
      insertFts: db.prepare(`INSERT INTO ${SEARCH_FTS_TABLE}(rowid, title, relative_src) VALUES (?, ?, ?)`),
      deleteMapping: db.prepare(`DELETE FROM ${SEARCH_DOCUMENTS_TABLE} WHERE media_id = ?`),
    };
    writeStatementCache.set(db, statements);
  }
  return statements;
}

function normalizeUnicode(value) {
  return String(value || "").normalize("NFC").replace(/\s+/gu, " ").trim();
}

function normalizeRelativeSource(value) {
  const source = String(value || "").trim().replace(/\\/g, "/");
  const relative = source.replace(/^(?:[a-z]+:\/\/[^/]+)?\/?(?:photos\/)+/iu, "");
  try {
    return normalizeUnicode(decodeURIComponent(relative));
  } catch {
    return normalizeUnicode(relative);
  }
}

function normalizeSearchQuery(value, maximumLength = 200) {
  return Array.from(normalizeUnicode(value)).slice(0, Math.max(2, Number(maximumLength) || 200)).join("");
}

function quoteMatchText(value) {
  return `"${normalizeSearchQuery(value).replace(/"/g, '""')}"`;
}

function escapeLike(value) {
  return String(value || "").replace(/[\\%_]/g, "\\$&");
}

function normalizeSearchMode(value) {
  const mode = String(value || "auto").trim().toLowerCase();
  return SEARCH_MODES.has(mode) ? mode : "auto";
}

function tableExists(db, tableName) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_schema WHERE type IN ('table', 'view') AND name = ?").get(tableName));
}

function detectFts5Capability(db) {
  const sqliteVersion = db.prepare("SELECT sqlite_version() AS version").get().version;
  const module = db.prepare("SELECT name FROM pragma_module_list WHERE name = 'fts5'").get();
  return { sqliteVersion, fts5: Boolean(module) };
}

function createStateTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SEARCH_STATE_TABLE} (
      singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
      schema_version INTEGER NOT NULL,
      migration_version TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      last_incremental_sync_at TEXT,
      last_full_check_at TEXT,
      media_count INTEGER NOT NULL DEFAULT 0,
      mapping_count INTEGER NOT NULL DEFAULT 0,
      fts_document_count INTEGER NOT NULL DEFAULT 0,
      error_summary TEXT NOT NULL DEFAULT '',
      needs_rebuild INTEGER NOT NULL DEFAULT 0
    )
  `);
}

function createSearchSchema(db) {
  createStateTable(db);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_media_title_nocase ON media(title COLLATE NOCASE);
    CREATE TABLE IF NOT EXISTS ${SEARCH_DOCUMENTS_TABLE} (
      fts_rowid INTEGER PRIMARY KEY,
      media_id TEXT NOT NULL UNIQUE,
      FOREIGN KEY(media_id) REFERENCES media(id) ON DELETE CASCADE
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS ${SEARCH_FTS_TABLE} USING fts5(
      title,
      relative_src,
      tokenize='trigram'
    );
  `);
  db.prepare(`
    INSERT INTO ${SEARCH_STATE_TABLE} (
      singleton, schema_version, migration_version, status, error_summary, needs_rebuild
    ) VALUES (1, ?, ?, 'not_created', '', 0)
    ON CONFLICT(singleton) DO NOTHING
  `).run(SEARCH_FTS_SCHEMA_VERSION, SEARCH_FTS_MIGRATION_VERSION);
}

function stateRow(db) {
  if (!tableExists(db, SEARCH_STATE_TABLE)) return null;
  return db.prepare(`SELECT * FROM ${SEARCH_STATE_TABLE} WHERE singleton = 1`).get() || null;
}

function safeCount(db, tableName) {
  if (!tableExists(db, tableName)) return null;
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count || 0);
}

function getIndexStatus(db, options = {}) {
  const capability = detectFts5Capability(db);
  const row = stateRow(db);
  const includeCounts = options.includeCounts !== false;
  const mediaCount = includeCounts ? (tableExists(db, "media") ? safeCount(db, "media") : null) : (row ? Number(row.media_count) : null);
  const mappingExists = tableExists(db, SEARCH_DOCUMENTS_TABLE);
  const ftsExists = tableExists(db, SEARCH_FTS_TABLE);
  const mappingCount = includeCounts ? safeCount(db, SEARCH_DOCUMENTS_TABLE) : (row ? Number(row.mapping_count) : null);
  const ftsDocumentCount = includeCounts ? safeCount(db, SEARCH_FTS_TABLE) : (row ? Number(row.fts_document_count) : null);
  let status = row && SEARCH_STATES.has(row.status) ? row.status : "not_created";
  let reason = "";
  if (!capability.fts5) {
    status = "error";
    reason = "fts5_unavailable";
  } else if (!mappingExists || !ftsExists) {
    status = "not_created";
    reason = "index_not_created";
  } else if (!row) {
    status = "stale";
    reason = "state_missing";
  } else if (Number(row.schema_version) !== SEARCH_FTS_SCHEMA_VERSION) {
    status = "stale";
    reason = "schema_version_mismatch";
  } else if (includeCounts && status === "ready" && (mediaCount !== mappingCount || mappingCount !== ftsDocumentCount)) {
    status = "stale";
    reason = "count_mismatch";
  }
  return {
    configuredSchemaVersion: SEARCH_FTS_SCHEMA_VERSION,
    sqliteVersion: capability.sqliteVersion,
    fts5Available: capability.fts5,
    status,
    reason,
    schemaVersion: row ? Number(row.schema_version) : null,
    migrationVersion: row ? row.migration_version : "",
    mediaCount,
    mappingCount,
    ftsDocumentCount,
    startedAt: row ? row.started_at || "" : "",
    completedAt: row ? row.completed_at || "" : "",
    lastIncrementalSyncAt: row ? row.last_incremental_sync_at || "" : "",
    lastFullCheckAt: row ? row.last_full_check_at || "" : "",
    errorSummary: row ? row.error_summary || "" : "",
    needsRebuild: row ? Boolean(row.needs_rebuild) : status !== "ready",
  };
}

function updateState(db, status, details = {}) {
  if (!SEARCH_STATES.has(status)) throw new Error(`Invalid FTS state: ${status}`);
  createStateTable(db);
  const previous = stateRow(db);
  const now = new Date().toISOString();
  const mediaCount = details.mediaCount ?? previous?.media_count ?? 0;
  const mappingCount = details.mappingCount ?? previous?.mapping_count ?? 0;
  const ftsDocumentCount = details.ftsDocumentCount ?? previous?.fts_document_count ?? 0;
  db.prepare(`
    INSERT INTO ${SEARCH_STATE_TABLE} (
      singleton, schema_version, migration_version, status, started_at, completed_at,
      last_incremental_sync_at, last_full_check_at, media_count, mapping_count,
      fts_document_count, error_summary, needs_rebuild
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(singleton) DO UPDATE SET
      schema_version=excluded.schema_version,
      migration_version=excluded.migration_version,
      status=excluded.status,
      started_at=excluded.started_at,
      completed_at=excluded.completed_at,
      last_incremental_sync_at=excluded.last_incremental_sync_at,
      last_full_check_at=excluded.last_full_check_at,
      media_count=excluded.media_count,
      mapping_count=excluded.mapping_count,
      fts_document_count=excluded.fts_document_count,
      error_summary=excluded.error_summary,
      needs_rebuild=excluded.needs_rebuild
  `).run(
    SEARCH_FTS_SCHEMA_VERSION,
    SEARCH_FTS_MIGRATION_VERSION,
    status,
    details.startedAt ?? previous?.started_at ?? (status === "building" ? now : null),
    details.completedAt ?? previous?.completed_at ?? (status === "ready" ? now : null),
    details.lastIncrementalSyncAt ?? previous?.last_incremental_sync_at ?? null,
    details.lastFullCheckAt ?? previous?.last_full_check_at ?? null,
    mediaCount,
    mappingCount,
    ftsDocumentCount,
    String(details.errorSummary ?? previous?.error_summary ?? "").slice(0, 500),
    details.needsRebuild ?? (status === "ready" ? 0 : 1)
  );
}

function mediaDocument(row) {
  return {
    mediaId: String(row?.id || ""),
    title: normalizeUnicode(row?.title),
    relativeSrc: normalizeRelativeSource(row?.src),
  };
}

function upsertMediaDocument(db, row) {
  const document = mediaDocument(row);
  if (!document.mediaId) throw new Error("FTS media document requires media.id");
  const statements = writeStatements(db);
  let mapping = statements.selectMapping.get(document.mediaId);
  if (!mapping) {
    const inserted = statements.insertMapping.run(document.mediaId);
    mapping = { fts_rowid: Number(inserted.lastInsertRowid) };
  } else {
    statements.deleteFts.run(mapping.fts_rowid);
  }
  statements.insertFts.run(
    mapping.fts_rowid,
    document.title,
    document.relativeSrc
  );
  return Number(mapping.fts_rowid);
}

function deleteMediaDocument(db, mediaId) {
  const id = String(mediaId || "");
  const statements = writeStatements(db);
  const mapping = statements.selectMapping.get(id);
  if (!mapping) return false;
  statements.deleteFts.run(mapping.fts_rowid);
  statements.deleteMapping.run(id);
  return true;
}

function clearDocuments(db) {
  db.prepare(`DELETE FROM ${SEARCH_FTS_TABLE}`).run();
  db.prepare(`DELETE FROM ${SEARCH_DOCUMENTS_TABLE}`).run();
}

function markIncrementalSync(db, options = {}) {
  if (!tableExists(db, SEARCH_STATE_TABLE)) return;
  const previous = stateRow(db);
  const counts = options.exactCounts ? {
    mediaCount: safeCount(db, "media"),
    mappingCount: safeCount(db, SEARCH_DOCUMENTS_TABLE),
    ftsDocumentCount: safeCount(db, SEARCH_FTS_TABLE),
  } : {
    mediaCount: Math.max(0, Number(previous?.media_count || 0) + Number(options.mediaDelta || 0)),
    mappingCount: Math.max(0, Number(previous?.mapping_count || 0) + Number(options.mappingDelta || 0)),
    ftsDocumentCount: Math.max(0, Number(previous?.fts_document_count || 0) + Number(options.ftsDelta || 0)),
  };
  updateState(db, "ready", { ...counts, lastIncrementalSyncAt: new Date().toISOString(), errorSummary: "", needsRebuild: 0 });
}

function markStale(db, errorSummary) {
  if (!tableExists(db, SEARCH_STATE_TABLE)) return;
  updateState(db, "stale", { errorSummary, needsRebuild: 1 });
}

function resolveSearchBehavior(configuredMode, indexStatus) {
  const configured = normalizeSearchMode(configuredMode);
  if (configured === "legacy-like") return { configured, actual: "legacy-like", degraded: false, degradedReason: "" };
  if (configured === "fts5") {
    return indexStatus.status === "ready"
      ? { configured, actual: "fts5", degraded: false, degradedReason: "" }
      : { configured, actual: "unavailable", degraded: true, degradedReason: indexStatus.reason || indexStatus.status };
  }
  return indexStatus.status === "ready"
    ? { configured, actual: "fts5", degraded: false, degradedReason: "" }
    : { configured, actual: "safe-degraded", degraded: true, degradedReason: indexStatus.reason || indexStatus.status };
}

const MEDIA_CARD_COLUMNS = `m.id, m.collection_id, m.type, m.title, m.file_name, m.src,
  m.thumb, m.detail_thumb, m.carousel_thumb, m.poster`;

function queryTwoCharacterMedia(db, query, limit) {
  const upper = `${query}\uffff`;
  const rows = [];
  const seen = new Set();
  const append = (items) => {
    for (const item of items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      rows.push(item);
      if (rows.length >= limit) break;
    }
  };
  append(db.prepare(`SELECT ${MEDIA_CARD_COLUMNS} FROM media m WHERE m.title = ? COLLATE NOCASE LIMIT ?`).all(query, limit));
  if (rows.length < limit) {
    append(db.prepare(`SELECT ${MEDIA_CARD_COLUMNS} FROM media m
      WHERE m.title >= ? COLLATE NOCASE AND m.title < ? COLLATE NOCASE
      ORDER BY m.title COLLATE NOCASE LIMIT ?`).all(query, upper, limit - rows.length));
  }
  return rows;
}

function queryFtsMedia(db, query, limit) {
  const match = quoteMatchText(query);
  const hits = db.prepare(`SELECT rowid FROM ${SEARCH_FTS_TABLE} WHERE ${SEARCH_FTS_TABLE} MATCH ? LIMIT ?`).all(match, limit);
  if (!hits.length) return { rows: [], hitCount: 0 };
  const rowids = hits.map((row) => Number(row.rowid));
  const placeholders = rowids.map(() => "?").join(",");
  const hydrated = db.prepare(`SELECT ${MEDIA_CARD_COLUMNS}, d.fts_rowid AS search_fts_rowid
    FROM ${SEARCH_DOCUMENTS_TABLE} d JOIN media m ON m.id=d.media_id
    WHERE d.fts_rowid IN (${placeholders})`).all(...rowids);
  const byRowid = new Map(hydrated.map((row) => [Number(row.search_fts_rowid), row]));
  return { rows: rowids.map((rowid) => byRowid.get(rowid)).filter(Boolean), hitCount: hits.length };
}

function getSearchQueryPlans(db, query = "test") {
  const q = normalizeSearchQuery(query) || "test";
  const match = quoteMatchText(q.length >= 3 ? q : `${q}x`);
  return {
    twoCharacterExact: db.prepare(`EXPLAIN QUERY PLAN SELECT ${MEDIA_CARD_COLUMNS} FROM media m WHERE m.title = ? COLLATE NOCASE LIMIT ?`).all(q.slice(0, 2), 61),
    twoCharacterPrefix: db.prepare(`EXPLAIN QUERY PLAN SELECT ${MEDIA_CARD_COLUMNS} FROM media m
      WHERE m.title >= ? COLLATE NOCASE AND m.title < ? COLLATE NOCASE
      ORDER BY m.title COLLATE NOCASE LIMIT ?`).all(q.slice(0, 2), `${q.slice(0, 2)}\uffff`, 61),
    ftsMatch: tableExists(db, SEARCH_FTS_TABLE)
      ? db.prepare(`EXPLAIN QUERY PLAN SELECT rowid FROM ${SEARCH_FTS_TABLE} WHERE ${SEARCH_FTS_TABLE} MATCH ? LIMIT ?`).all(match, 61)
      : [],
    ftsHydrate: tableExists(db, SEARCH_DOCUMENTS_TABLE)
      ? db.prepare(`EXPLAIN QUERY PLAN SELECT ${MEDIA_CARD_COLUMNS}
        FROM ${SEARCH_DOCUMENTS_TABLE} d JOIN media m ON m.id=d.media_id
        WHERE d.fts_rowid IN (?,?,?)`).all(1, 2, 3)
      : [],
  };
}

function runFtsIntegrityCheck(db) {
  db.prepare(`INSERT INTO ${SEARCH_FTS_TABLE}(${SEARCH_FTS_TABLE}) VALUES ('integrity-check')`).run();
  return true;
}

function optimizeFts(db) {
  db.prepare(`INSERT INTO ${SEARCH_FTS_TABLE}(${SEARCH_FTS_TABLE}) VALUES ('optimize')`).run();
  db.exec("PRAGMA optimize");
}

function consistencyCheck(db, options = {}) {
  const full = options.full === true;
  const sample = Math.max(0, Number(options.sample) || 0);
  const status = getIndexStatus(db);
  if (!tableExists(db, SEARCH_DOCUMENTS_TABLE) || !tableExists(db, SEARCH_FTS_TABLE)) return { ...status, ok: false };
  const result = {
    ...status,
    missingMappings: Number(db.prepare(`SELECT COUNT(*) AS count FROM media m LEFT JOIN ${SEARCH_DOCUMENTS_TABLE} d ON d.media_id=m.id WHERE d.media_id IS NULL`).get().count),
    orphanMappings: Number(db.prepare(`SELECT COUNT(*) AS count FROM ${SEARCH_DOCUMENTS_TABLE} d LEFT JOIN media m ON m.id=d.media_id WHERE m.id IS NULL`).get().count),
    missingFtsDocuments: Number(db.prepare(`SELECT COUNT(*) AS count FROM ${SEARCH_DOCUMENTS_TABLE} d LEFT JOIN ${SEARCH_FTS_TABLE} f ON f.rowid=d.fts_rowid WHERE f.rowid IS NULL`).get().count),
    orphanFtsDocuments: Number(db.prepare(`SELECT COUNT(*) AS count FROM ${SEARCH_FTS_TABLE} f LEFT JOIN ${SEARCH_DOCUMENTS_TABLE} d ON d.fts_rowid=f.rowid WHERE d.fts_rowid IS NULL`).get().count),
    duplicateMediaIds: Number(db.prepare(`SELECT COUNT(*) AS count FROM (SELECT media_id FROM ${SEARCH_DOCUMENTS_TABLE} GROUP BY media_id HAVING COUNT(*) > 1)`).get().count),
    duplicateFtsRowids: Number(db.prepare(`SELECT COUNT(*) AS count FROM (SELECT fts_rowid FROM ${SEARCH_DOCUMENTS_TABLE} GROUP BY fts_rowid HAVING COUNT(*) > 1)`).get().count),
    compared: 0,
    titleMismatches: 0,
    relativeSourceMismatches: 0,
  };
  if (full || sample > 0) {
    const suffix = full ? "" : " LIMIT ?";
    const rows = db.prepare(`SELECT m.id, m.title, m.src, f.title AS fts_title, f.relative_src AS fts_relative_src
      FROM media m JOIN ${SEARCH_DOCUMENTS_TABLE} d ON d.media_id=m.id
      JOIN ${SEARCH_FTS_TABLE} f ON f.rowid=d.fts_rowid ORDER BY m.rowid${suffix}`).all(...(full ? [] : [sample]));
    for (const row of rows) {
      result.compared += 1;
      if (normalizeUnicode(row.title) !== row.fts_title) result.titleMismatches += 1;
      if (normalizeRelativeSource(row.src) !== row.fts_relative_src) result.relativeSourceMismatches += 1;
    }
  }
  runFtsIntegrityCheck(db);
  result.ok = result.missingMappings === 0 && result.orphanMappings === 0 && result.missingFtsDocuments === 0
    && result.orphanFtsDocuments === 0 && result.duplicateMediaIds === 0 && result.duplicateFtsRowids === 0
    && result.titleMismatches === 0 && result.relativeSourceMismatches === 0;
  return result;
}

function isSuspectedFormalDatabase(dbFile) {
  const resolved = path.resolve(String(dbFile || ""));
  return resolved.toLocaleLowerCase("en-US") === FORMAL_DATABASE_PATH.toLocaleLowerCase("en-US")
    || resolved.toLocaleLowerCase("en-US").includes("\\galleryruntime\\");
}

function databaseIdentity(dbFile) {
  const resolved = path.resolve(dbFile);
  const stat = fs.statSync(resolved);
  return { path: resolved, bytes: stat.size, modifiedAt: stat.mtime.toISOString() };
}

module.exports = {
  FORMAL_DATABASE_PATH,
  SEARCH_DOCUMENTS_TABLE,
  SEARCH_FTS_MIGRATION_VERSION,
  SEARCH_FTS_SCHEMA_VERSION,
  SEARCH_FTS_TABLE,
  SEARCH_STATE_TABLE,
  clearDocuments,
  consistencyCheck,
  createSearchSchema,
  databaseIdentity,
  deleteMediaDocument,
  detectFts5Capability,
  escapeLike,
  getIndexStatus,
  getSearchQueryPlans,
  isSuspectedFormalDatabase,
  markIncrementalSync,
  markStale,
  mediaDocument,
  normalizeRelativeSource,
  normalizeSearchMode,
  normalizeSearchQuery,
  normalizeUnicode,
  optimizeFts,
  queryFtsMedia,
  queryTwoCharacterMedia,
  quoteMatchText,
  resolveSearchBehavior,
  runFtsIntegrityCheck,
  tableExists,
  updateState,
  upsertMediaDocument,
};
