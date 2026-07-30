"use strict";

// Read-only operator diagnostic. It intentionally never opens a database for writing.
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "") : "";
}

const sha256 = option("--sha256").trim().toLowerCase();
const databaseFile = option("--db");
const photosDir = option("--photos-dir");
if (!/^[a-f0-9]{64}$/.test(sha256) || !databaseFile) {
  throw new Error("Usage: node scripts/diagnose-duplicate-sha256.js --db <gallery.db> --sha256 <64-hex> [--photos-dir <photos-root>]");
}

function sourcePath(src) {
  if (!photosDir || !src) return "";
  const pathname = decodeURIComponent(new URL(src, "http://localhost").pathname);
  if (!pathname.startsWith("/photos/")) return "";
  const absolute = path.normalize(path.join(photosDir, pathname.slice("/photos/".length)));
  const relative = path.relative(photosDir, absolute);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? absolute : "";
}

const db = new DatabaseSync(databaseFile, { readOnly: true });
try {
  const rows = db.prepare(`SELECT
      h.media_id AS mediaId, h.collection_id AS collectionId, h.file_size AS hashedFileSize,
      h.mtime AS hashedMtime, h.updated_at AS hashUpdatedAt, h.sha256,
      m.src, m.size AS mediaFileSize, m.mtime AS mediaMtime, m.type,
      c.path_parts AS collectionPathParts,
      EXISTS(SELECT 1 FROM user_marks u WHERE u.mark_type='duplicate-delete' AND (u.target_id=h.media_id OR u.id='duplicate-delete:' || h.media_id)) AS deleteMarked
    FROM media_hashes h
    LEFT JOIN media m ON m.id=h.media_id
    LEFT JOIN collections c ON c.id=m.collection_id
    WHERE h.sha256=?
    ORDER BY c.path_parts, m.src`).all(sha256).map((row) => {
    const absolutePath = sourcePath(row.src || "");
    return {
      ...row,
      absolutePath: absolutePath || null,
      fileExists: absolutePath ? fs.existsSync(absolutePath) : null,
      ignored: false,
      ignoredStatus: "not-supported-by-current-schema",
      scanBatch: row.hashUpdatedAt || null,
    };
  });
  console.log(JSON.stringify({ sha256, recordCount: rows.length, records: rows }, null, 2));
} finally {
  db.close();
}
