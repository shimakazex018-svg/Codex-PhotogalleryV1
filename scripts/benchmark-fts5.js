"use strict";

const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");
const {
  MEDIA_CARD_COLUMNS,
  argumentValue,
  escapeLike,
  normalizeRelativeSource,
  normalizeDecodedRelativeSource,
  quoteMatchText,
  round,
} = require("./fts5-prototype-lib");

const dbArgument = argumentValue("--db");
const variant = argumentValue("--variant", "standalone");
const outputArgument = argumentValue("--output");
const skipReference = process.argv.includes("--skip-reference");
const skipConsistency = process.argv.includes("--skip-consistency");
if (!dbArgument || !new Set(["external", "standalone", "compact", "decoded", "mapped"]).has(variant)) {
  console.error("Usage: node scripts/benchmark-fts5.js --db <experiment-gallery.db> --variant <external|standalone|compact|decoded|mapped>");
  process.exit(2);
}

const dbFile = path.resolve(dbArgument);
const tableName = variant === "external" ? "media_search_fts_external" : variant === "mapped" ? "media_search_fts_mapped" : variant === "decoded" ? "media_search_fts_decoded" : variant === "compact" ? "media_search_fts_compact" : "media_search_fts";
const fullTitle = "[XIUREN秀人网] 2020.04.16 NO.2161 安然Maleah [87P 168MB]";
const baselineCases = [
  ["complete collection", fullTitle],
  ["collection prefix", "[XIUREN秀人网] 2020.04"],
  ["collection middle", "Maleah"],
  ["two Chinese", "安然"],
  ["three Chinese", "秀人网"],
  ["English", "Maleah"],
  ["number", "2161"],
  ["sparse filename", "theaic.top 0001"],
  ["path fragment", "No.4720"],
  ["high frequency", "theaic.top"],
  ["numeric filename", "0001"],
  ["no result", "__codex_no_result_20260716__"],
  ["extension", "jpg"],
];
const correctnessCases = [
  ...baselineCases,
  ["filename middle", "aic.top 000"],
  ["fixed root prefix", "photos"],
  ["Chinese 3+", "秀人网"],
  ["English 3+", "Maleah"],
  ["number 3+", "216"],
  ["space", "top 0001"],
  ["underscore", "_"],
  ["hyphen", "-"],
  ["parentheses", "("],
  ["brackets", "["],
  ["single quote", "'"],
  ["double quote", "\""],
  ["percent", "%"],
  ["backslash", "\\"],
  ["forward slash", "/"],
  ["full width", "ＡＢＣ"],
];

function codePointLength(value) {
  return Array.from(String(value || "")).length;
}

function open() {
  return new DatabaseSync(dbFile, { readOnly: true });
}

function timed(action) {
  const startedAt = performance.now();
  const value = action();
  return { value, ms: performance.now() - startedAt };
}

function findMediaOnlyChineseBigram(db) {
  const collectionBigrams = new Set();
  for (const row of db.prepare("SELECT title FROM collections").all()) {
    const characters = Array.from(String(row.title || ""));
    for (let index = 0; index < characters.length - 1; index += 1) {
      const candidate = `${characters[index]}${characters[index + 1]}`;
      if (/^\p{Script=Han}{2}$/u.test(candidate)) collectionBigrams.add(candidate);
    }
  }
  const checked = new Set();
  const statement = db.prepare("SELECT rowid, title, file_name, src FROM media WHERE rowid > ? ORDER BY rowid LIMIT 2000");
  let rowid = 0;
  while (true) {
    const rows = statement.all(rowid);
    if (!rows.length) return null;
    for (const row of rows) {
      rowid = row.rowid;
      const text = `${row.title || ""} ${row.file_name || ""} ${row.src || ""}`;
      const characters = Array.from(text);
      for (let index = 0; index < characters.length - 1; index += 1) {
        const candidate = `${characters[index]}${characters[index + 1]}`;
        if (!/^\p{Script=Han}{2}$/u.test(candidate)) continue;
        if (collectionBigrams.has(candidate) || checked.has(candidate)) continue;
        checked.add(candidate);
        const pattern = `%${escapeLike(candidate)}%`;
        const match = db.prepare("SELECT id FROM media WHERE title LIKE ? ESCAPE '\\' OR file_name LIKE ? ESCAPE '\\' OR src LIKE ? ESCAPE '\\' LIMIT 1").get(pattern, pattern, pattern);
        if (match) return { query: candidate, mediaId: match.id };
      }
    }
  }
}

function ftsIds(db, query, limit = 61) {
  if (codePointLength(query) < 3) return [];
  if (variant === "external") {
    return db.prepare(`SELECT rowid FROM ${tableName} WHERE ${tableName} MATCH ? LIMIT ?`).all(quoteMatchText(query), limit).map((row) => row.rowid);
  }
  const columns = variant === "standalone" ? ["title", "file_name", "relative_src"] : ["title", "relative_src"];
  const ids = [];
  const seen = new Set();
  const statement = db.prepare(`SELECT ${variant === "mapped" ? "rowid" : "media_id"} FROM ${tableName} WHERE ${tableName} MATCH ? LIMIT ?`);
  for (const column of columns) {
    if (ids.length >= limit) break;
    const expression = `${column} : ${quoteMatchText(query)}`;
    for (const row of statement.all(expression, limit - ids.length)) {
      const id = variant === "mapped" ? row.rowid : row.media_id;
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

function backfill(db, ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  const rows = variant === "mapped"
    ? db.prepare(`SELECT d.fts_rowid, ${MEDIA_CARD_COLUMNS.map((column) => `m.${column}`).join(", ")} FROM media_search_documents d JOIN media m ON m.id = d.media_id WHERE d.fts_rowid IN (${placeholders})`).all(...ids)
    : db.prepare(`SELECT rowid, ${MEDIA_CARD_COLUMNS.join(", ")} FROM media WHERE ${variant === "external" ? "rowid" : "id"} IN (${placeholders})`).all(...ids);
  const map = new Map(rows.map((row) => [variant === "mapped" ? row.fts_rowid : variant === "external" ? row.rowid : row.id, row]));
  return ids.map((id) => map.get(id)).filter(Boolean);
}

function likeRows(db, query, limit = 61) {
  const pattern = `%${escapeLike(query)}%`;
  return db.prepare(`
    SELECT ${MEDIA_CARD_COLUMNS.join(", ")}
    FROM media
    WHERE title LIKE ? ESCAPE '\\' COLLATE NOCASE
       OR file_name LIKE ? ESCAPE '\\' COLLATE NOCASE
       OR src LIKE ? ESCAPE '\\' COLLATE NOCASE
    LIMIT ?
  `).all(pattern, pattern, pattern, limit);
}

function collectionRows(db, query, limit = 61) {
  const pattern = `%${escapeLike(query)}%`;
  return db.prepare("SELECT id, title FROM collections WHERE title LIKE ? ESCAPE '\\' COLLATE NOCASE OR id LIKE ? ESCAPE '\\' COLLATE NOCASE LIMIT ?").all(pattern, pattern, limit);
}

function collectionSearch(db, query, limit = 61) {
  const rows = [];
  const seen = new Set();
  const append = (items) => {
    for (const row of items) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
      if (rows.length >= limit) break;
    }
  };
  const exact = db.prepare("SELECT id, title FROM collections WHERE title = ? COLLATE NOCASE LIMIT ?").all(query, limit);
  append(exact);
  const prefix = rows.length < limit
    ? db.prepare("SELECT id, title FROM collections WHERE title >= ? COLLATE NOCASE AND title < ? COLLATE NOCASE ORDER BY title COLLATE NOCASE LIMIT ?").all(query, `${query}\uffff`, limit - rows.length)
    : [];
  append(prefix);
  if (rows.length < limit) append(collectionRows(db, query, limit - rows.length));
  return { rows, preferred: exact.length > 0 || prefix.length > 0 };
}

function mediaTitlePrefix(db, query, limit = 61) {
  return db.prepare("SELECT id FROM media WHERE title >= ? COLLATE NOCASE AND title < ? COLLATE NOCASE ORDER BY title COLLATE NOCASE LIMIT ?").all(query, `${query}\uffff`, limit);
}

function runPrototype(db, query) {
  const collection = timed(() => collectionSearch(db, query));
  const remaining = collection.value.preferred ? 0 : Math.max(61 - collection.value.rows.length, 0);
  const fts = timed(() => remaining ? ftsIds(db, query, remaining) : []);
  const lookup = timed(() => backfill(db, fts.value));
  const transform = timed(() => ({
    collections: collection.value.rows.slice(0, 60),
    media: lookup.value.slice(0, Math.max(60 - Math.min(collection.value.rows.length, 60), 0)),
    hasMore: collection.value.rows.length + lookup.value.length > 60,
  }));
  return {
    collectionMs: collection.ms,
    ftsMs: fts.ms,
    lookupMs: lookup.ms,
    transformMs: transform.ms,
    totalMs: collection.ms + fts.ms + lookup.ms + transform.ms,
    resultCount: transform.value.collections.length + transform.value.media.length,
    mediaCount: transform.value.media.length,
    hitLimit: transform.value.hasMore || transform.value.collections.length + transform.value.media.length === 60,
  };
}

function summarize(runs) {
  const sorted = [...runs].sort((a, b) => a.totalMs - b.totalMs);
  const middle = sorted[Math.floor(sorted.length / 2)];
  return {
    median: Object.fromEntries(Object.keys(middle).filter((key) => typeof middle[key] === "number").map((key) => [key, round(middle[key])])),
    slowestTotalMs: round(Math.max(...runs.map((run) => run.totalMs))),
  };
}

function consistency(db) {
  const mediaCount = db.prepare("SELECT COUNT(*) AS count FROM media").get().count;
  if (variant === "external") {
    return {
      mediaCount,
      directFtsCount: db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count,
      warning: "External-content COUNT reads the content table and is not independent index proof",
      integrityCheck: "Performed by the writable build script; not repeated on this read-only benchmark connection",
    };
  }
  if (variant === "mapped") {
    const ftsCount = db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count;
    const documentCount = db.prepare("SELECT COUNT(*) AS count FROM media_search_documents").get().count;
    const missingDocument = db.prepare("SELECT COUNT(*) AS count FROM media m LEFT JOIN media_search_documents d ON d.media_id=m.id WHERE d.media_id IS NULL").get().count;
    const orphanDocument = db.prepare("SELECT COUNT(*) AS count FROM media_search_documents d LEFT JOIN media m ON m.id=d.media_id WHERE m.id IS NULL").get().count;
    const missingFts = db.prepare(`SELECT COUNT(*) AS count FROM media_search_documents d LEFT JOIN ${tableName} f ON f.rowid=d.fts_rowid WHERE f.rowid IS NULL`).get().count;
    const orphanFts = db.prepare(`SELECT COUNT(*) AS count FROM ${tableName} f LEFT JOIN media_search_documents d ON d.fts_rowid=f.rowid WHERE d.fts_rowid IS NULL`).get().count;
    let fieldMismatch = 0;
    const selectRows = db.prepare(`SELECT f.rowid, f.title, f.relative_src, m.title AS media_title, m.src FROM ${tableName} f JOIN media_search_documents d ON d.fts_rowid=f.rowid JOIN media m ON m.id=d.media_id WHERE f.rowid > ? ORDER BY f.rowid LIMIT 2000`);
    let rowid = 0;
    while (true) {
      const rows = selectRows.all(rowid);
      if (!rows.length) break;
      rowid = rows[rows.length - 1].rowid;
      for (const row of rows) if (row.title !== String(row.media_title || "") || row.relative_src !== normalizeDecodedRelativeSource(row.src)) fieldMismatch += 1;
    }
    return { mediaCount, documentCount, ftsCount, missingDocument, orphanDocument, missingFts, orphanFts, fieldMismatch };
  }
  const ftsCount = db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count;
  const hasFileName = variant === "standalone";
  db.exec(`
    CREATE TEMP TABLE fts_audit (
      media_id TEXT PRIMARY KEY,
      title TEXT,
      ${hasFileName ? "file_name TEXT," : ""}
      relative_src TEXT
    ) WITHOUT ROWID;
    INSERT OR IGNORE INTO fts_audit(media_id, title, ${hasFileName ? "file_name," : ""} relative_src)
    SELECT media_id, title, ${hasFileName ? "file_name," : ""} relative_src FROM ${tableName};
  `);
  const auditCount = db.prepare("SELECT COUNT(*) AS count FROM fts_audit").get().count;
  const missing = db.prepare("SELECT COUNT(*) AS count FROM media m LEFT JOIN fts_audit f ON f.media_id = m.id WHERE f.media_id IS NULL").get().count;
  const orphan = db.prepare("SELECT COUNT(*) AS count FROM fts_audit f LEFT JOIN media m ON m.id = f.media_id WHERE m.id IS NULL").get().count;
  const mismatch = variant === "decoded" ? (() => {
    let count = 0;
    const selectMedia = db.prepare("SELECT rowid, id, title, src FROM media WHERE rowid > ? ORDER BY rowid LIMIT 2000");
    const selectAudit = db.prepare("SELECT media_id, title, relative_src FROM fts_audit WHERE media_id IN (SELECT value FROM json_each(?))");
    let rowid = 0;
    while (true) {
      const rows = selectMedia.all(rowid);
      if (!rows.length) break;
      rowid = rows[rows.length - 1].rowid;
      const expected = new Map(rows.map((row) => [row.id, row]));
      const actual = selectAudit.all(JSON.stringify(rows.map((row) => row.id)));
      for (const row of actual) {
        const source = expected.get(row.media_id);
        if (!source || row.title !== String(source.title || "") || row.relative_src !== normalizeDecodedRelativeSource(source.src)) count += 1;
      }
    }
    return count;
  })() : db.prepare(`
    SELECT COUNT(*) AS count
    FROM fts_audit f
    JOIN media m ON m.id = f.media_id
    WHERE f.title <> COALESCE(m.title, '')
       ${hasFileName ? "OR f.file_name <> COALESCE(m.file_name, '')" : ""}
       OR REPLACE(f.relative_src, '\\', '/') <> REPLACE(CASE
            WHEN m.src LIKE '/photos/%' THEN SUBSTR(m.src, 9)
            WHEN m.src LIKE 'photos/%' THEN SUBSTR(m.src, 8)
            ELSE LTRIM(m.src, '/')
          END, '\\', '/')
  `).get().count;
  return { mediaCount, ftsCount, auditCount, duplicateMediaIds: ftsCount - auditCount, missing, orphan, fieldMismatch: mismatch };
}

const db = open();
try {
  const tableExists = db.prepare("SELECT 1 AS found FROM sqlite_schema WHERE type='table' AND name=?").get(tableName);
  if (!tableExists) throw new Error(`FTS table not found: ${tableName}`);
  const mediaOnlyBigram = findMediaOnlyChineseBigram(db);
  const shortCases = ["安", "安然", "安然模", "a", "ab", "abc", "1", "12", "123", "A1", "A12"];
  if (mediaOnlyBigram) shortCases.push(mediaOnlyBigram.query);

  const benchmarks = baselineCases.map(([type, query]) => {
    const coldDb = open();
    const cold = runPrototype(coldDb, query);
    coldDb.close();
    const hot = Array.from({ length: 5 }, () => runPrototype(db, query));
    const like = skipReference ? null : timed(() => likeRows(db, query));
    return { type, query, cold: Object.fromEntries(Object.entries(cold).map(([key, value]) => [key, typeof value === "number" ? round(value) : value])), hot: summarize(hot), likeMs: like ? round(like.ms) : null, likeCount: like ? like.value.length : null };
  });

  const correctness = skipReference ? [] : correctnessCases.map(([type, query]) => {
    const like = likeRows(db, query).map((row) => row.id);
    const ftsKeys = ftsIds(db, query);
    const fts = backfill(db, ftsKeys).map((row) => row.id);
    const likeSet = new Set(like);
    const ftsSet = new Set(fts);
    return {
      type,
      query,
      codePoints: codePointLength(query),
      likeCount: like.length,
      ftsCount: fts.length,
      missingFromFts: like.filter((id) => !ftsSet.has(id)).slice(0, 10),
      extraInFts: fts.filter((id) => !likeSet.has(id)).slice(0, 10),
      sameOrder: like.length === fts.length && like.every((id, index) => id === fts[index]),
    };
  });

  const matchPlan = variant === "external"
    ? db.prepare(`EXPLAIN QUERY PLAN SELECT rowid FROM ${tableName} WHERE ${tableName} MATCH ? LIMIT 61`).all(quoteMatchText("Maleah"))
    : variant === "mapped"
      ? db.prepare(`EXPLAIN QUERY PLAN SELECT rowid FROM ${tableName} WHERE ${tableName} MATCH ? LIMIT 61`).all(`title : ${quoteMatchText("Maleah")}`)
      : db.prepare(`EXPLAIN QUERY PLAN SELECT media_id FROM ${tableName} WHERE ${tableName} MATCH ? LIMIT 61`).all(quoteMatchText("Maleah"));
  const lookupPlan = variant === "external"
    ? db.prepare(`EXPLAIN QUERY PLAN SELECT ${MEDIA_CARD_COLUMNS.join(", ")} FROM media WHERE rowid IN (?,?,?)`).all(1, 2, 3)
    : variant === "mapped"
      ? db.prepare(`EXPLAIN QUERY PLAN SELECT ${MEDIA_CARD_COLUMNS.map((column) => `m.${column}`).join(", ")} FROM media_search_documents d JOIN media m ON m.id=d.media_id WHERE d.fts_rowid IN (?,?,?)`).all(1, 2, 3)
      : db.prepare(`EXPLAIN QUERY PLAN SELECT ${MEDIA_CARD_COLUMNS.join(", ")} FROM media WHERE id IN (?,?,?)`).all("a", "b", "c");
  const pattern = "%Maleah%";
  const likePlan = db.prepare(`EXPLAIN QUERY PLAN SELECT id FROM media WHERE title LIKE ? OR file_name LIKE ? OR src LIKE ? LIMIT 61`).all(pattern, pattern, pattern);
  const shortResults = shortCases.map((query) => ({
    query,
    codePoints: codePointLength(query),
    collectionCount: collectionRows(db, query).length,
    mediaTitlePrefixCount: mediaTitlePrefix(db, query).length,
    mediaLikeCount: skipReference ? null : likeRows(db, query).length,
    mediaFtsCount: ftsIds(db, query).length,
  }));

  const report = {
    generatedAt: new Date().toISOString(),
    dbFile,
    variant,
    tableName,
    coldDefinition: "first query on a fresh read-only SQLite connection; operating-system file cache was not forcibly cleared",
    mediaOnlyChineseBigram: mediaOnlyBigram,
    plans: {
      like: likePlan,
      fts: matchPlan,
      lookup: lookupPlan,
      shortTitlePrefix: db.prepare("EXPLAIN QUERY PLAN SELECT id FROM media WHERE title >= ? COLLATE NOCASE AND title < ? COLLATE NOCASE ORDER BY title COLLATE NOCASE LIMIT 61").all("扫码", "扫码\uffff"),
      collectionExact: db.prepare("EXPLAIN QUERY PLAN SELECT id FROM collections WHERE title = ? COLLATE NOCASE LIMIT 61").all(fullTitle),
      collectionPrefix: db.prepare("EXPLAIN QUERY PLAN SELECT id FROM collections WHERE title >= ? COLLATE NOCASE AND title < ? COLLATE NOCASE ORDER BY title COLLATE NOCASE LIMIT 61").all("[XIUREN秀人网] 2020.04", "[XIUREN秀人网] 2020.04\uffff"),
    },
    consistency: skipConsistency ? null : consistency(db),
    shortResults,
    correctness,
    benchmarks,
  };
  if (outputArgument) {
    const output = path.resolve(outputArgument);
    if (path.dirname(output) !== path.dirname(dbFile)) throw new Error("--output must stay beside the experiment database");
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  db.close();
}
