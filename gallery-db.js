const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");
const searchFts = require("./search-fts");
const gallerySort = require("./gallery-sort");

function json(value) {
  return JSON.stringify(value || null);
}

function mediaId(collectionId, item) {
  return crypto.createHash("sha1").update(`${collectionId}\0${item.src || item.poster || item.title || ""}`).digest("hex");
}

function openDatabase(dbFile) {
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new DatabaseSync(dbFile);
  const perceptualSchemaExisted = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='media_perceptual_hashes'").get());
  const perceptualBaselineBytes = [dbFile, `${dbFile}-wal`, `${dbFile}-shm`].reduce((sum, file) => {
    try { return sum + fs.statSync(file).size; } catch (error) { return sum; }
  }, 0);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      title TEXT NOT NULL,
      folder TEXT,
      path_parts TEXT NOT NULL,
      level INTEGER NOT NULL,
      cover TEXT,
      cover_thumb TEXT,
      image_count INTEGER NOT NULL DEFAULT 0,
      video_count INTEGER NOT NULL DEFAULT 0,
      total_image_count INTEGER NOT NULL DEFAULT 0,
      total_video_count INTEGER NOT NULL DEFAULT 0,
      descendant_count INTEGER NOT NULL DEFAULT 0,
      mtime REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_collections_parent ON collections(parent_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_collections_title ON collections(title);
    CREATE INDEX IF NOT EXISTS idx_collections_title_nocase ON collections(title COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_collections_mtime ON collections(mtime);

    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      collection_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT,
      file_name TEXT,
      src TEXT,
      thumb TEXT,
      detail_thumb TEXT,
      carousel_thumb TEXT,
      poster TEXT,
      duration REAL,
      width INTEGER,
      height INTEGER,
      size INTEGER,
      codec TEXT,
      mtime REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      metadata TEXT,
      FOREIGN KEY(collection_id) REFERENCES collections(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_media_collection ON media(collection_id, type, sort_order);
    CREATE INDEX IF NOT EXISTS idx_media_title ON media(title);
    CREATE INDEX IF NOT EXISTS idx_media_mtime ON media(mtime);
    CREATE INDEX IF NOT EXISTS idx_media_thumb ON media(thumb);
    CREATE INDEX IF NOT EXISTS idx_media_detail_thumb ON media(detail_thumb);
    CREATE INDEX IF NOT EXISTS idx_media_carousel_thumb ON media(carousel_thumb);

    CREATE TABLE IF NOT EXISTS covers (
      collection_id TEXT PRIMARY KEY,
      cover TEXT,
      cover_thumb TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(collection_id) REFERENCES collections(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS scan_state (
      path TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      mtime REAL NOT NULL DEFAULT 0,
      file_count INTEGER NOT NULL DEFAULT 0,
      dir_count INTEGER NOT NULL DEFAULT 0,
      signature TEXT NOT NULL,
      last_scanned_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_marks (
      id TEXT PRIMARY KEY,
      target_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      mark_type TEXT NOT NULL,
      payload TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS access_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      time TEXT NOT NULL,
      ip TEXT,
      host TEXT,
      user_agent TEXT,
      type TEXT,
      title TEXT,
      model TEXT,
      work TEXT,
      hash TEXT,
      path_parts TEXT NOT NULL DEFAULT '[]',
      source_key TEXT UNIQUE
    );

    CREATE INDEX IF NOT EXISTS idx_access_logs_time_id ON access_logs(time DESC, id DESC);

    CREATE TABLE IF NOT EXISTS maintenance_state (
      task_key TEXT NOT NULL,
      scheduled_date TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      status TEXT NOT NULL,
      result TEXT,
      error TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(task_key, scheduled_date)
    );

    CREATE TABLE IF NOT EXISTS collection_recycle_queue (
      id TEXT PRIMARY KEY,
      collection_id TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      marked_at TEXT NOT NULL,
      eligible_at TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      source_path_snapshot TEXT NOT NULL,
      recycle_path TEXT,
      error TEXT,
      requested_ip TEXT,
      requested_scope TEXT,
      index_refresh_error TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_recycle_active
      ON collection_recycle_queue(collection_id) WHERE status IN ('pending', 'recycling');
    CREATE INDEX IF NOT EXISTS idx_collection_recycle_due ON collection_recycle_queue(status, scheduled_at);

    CREATE TABLE IF NOT EXISTS media_hashes (
      media_id TEXT PRIMARY KEY,
      collection_id TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      mtime REAL NOT NULL DEFAULT 0,
      sha256 TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      device TEXT,
      location TEXT,
      metadata TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(media_id) REFERENCES media(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_media_hashes_sha256 ON media_hashes(sha256);
    CREATE INDEX IF NOT EXISTS idx_media_hashes_collection ON media_hashes(collection_id);

    CREATE TABLE IF NOT EXISTS media_perceptual_hashes (
      media_id TEXT PRIMARY KEY,
      hash64 BLOB,
      source_size INTEGER NOT NULL,
      source_mtime REAL NOT NULL,
      computed_at INTEGER NOT NULL,
      status INTEGER NOT NULL DEFAULT 1,
      error_code INTEGER,
      CHECK ((status = 1 AND length(hash64) = 8 AND error_code IS NULL) OR
             (status = 2 AND hash64 IS NULL AND error_code IS NOT NULL)),
      FOREIGN KEY(media_id) REFERENCES media(id) ON DELETE CASCADE
    ) WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS perceptual_hash_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      algorithm TEXT NOT NULL,
      algorithm_version INTEGER NOT NULL,
      status TEXT NOT NULL,
      processed INTEGER NOT NULL DEFAULT 0,
      succeeded INTEGER NOT NULL DEFAULT 0,
      failed INTEGER NOT NULL DEFAULT 0,
      skipped INTEGER NOT NULL DEFAULT 0,
      baseline_bytes INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      recent_error TEXT
    );
  `);
  if (!perceptualSchemaExisted) {
    db.prepare(`INSERT OR IGNORE INTO perceptual_hash_state
      (id,algorithm,algorithm_version,status,baseline_bytes,updated_at,recent_error)
      VALUES (1,'phash64',1,'not_started',?,?,NULL)`).run(perceptualBaselineBytes, Date.now());
  }
  return db;
}

function collectionSignature(collection) {
  return crypto
    .createHash("sha1")
    .update(
      JSON.stringify({
        id: collection.id,
        mtime: collection.mtime || 0,
        images: (collection.images || []).map((item) => item.src),
        videos: (collection.videos || []).map((item) => item.src),
        children: (collection.children || []).map((item) => item.id),
      })
    )
    .digest("hex");
}

function insertCollection(db, collection, parentId, sortOrder, insertedAt, syncSearchIndex = false) {
  db.prepare(`
    INSERT INTO collections (
      id, parent_id, title, folder, path_parts, level, cover, cover_thumb,
      image_count, video_count, total_image_count, total_video_count,
      descendant_count, mtime, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    collection.id,
    parentId,
    collection.title || collection.folder || collection.id,
    collection.folder || "",
    json(collection.pathParts || []),
    collection.level || 0,
    collection.cover || "",
    collection.coverThumb || "",
    collection.imageCount || 0,
    collection.videoCount || 0,
    collection.totalImageCount || collection.imageCount || 0,
    collection.totalVideoCount || collection.videoCount || 0,
    collection.descendantCount || 0,
    collection.mtime || 0,
    sortOrder
  );

  db.prepare("INSERT INTO covers (collection_id, cover, cover_thumb, updated_at) VALUES (?, ?, ?, ?)").run(
    collection.id,
    collection.cover || "",
    collection.coverThumb || "",
    insertedAt
  );

  db.prepare(`
    INSERT INTO scan_state (path, kind, mtime, file_count, dir_count, signature, last_scanned_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    collection.id,
    "collection",
    collection.mtime || 0,
    (collection.images || []).length + (collection.videos || []).length,
    (collection.children || []).length,
    collectionSignature(collection),
    insertedAt
  );

  const insertMedia = db.prepare(`
    INSERT INTO media (
      id, collection_id, type, title, file_name, src, thumb, detail_thumb,
      carousel_thumb, poster, duration, width, height, size, codec, mtime,
      sort_order, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  (collection.images || []).forEach((item, index) => {
    const id = mediaId(collection.id, item);
    const title = item.title || item.file || "";
    const src = item.src || "";
    insertMedia.run(
      id,
      collection.id,
      "image",
      title,
      item.file || "",
      src,
      item.thumb || "",
      item.detailThumb || item.previewThumb || "",
      item.carouselThumb || "",
      "",
      null,
      item.width || null,
      item.height || null,
      item.size || null,
      "",
      item.mtime || 0,
      index,
      json(item)
    );
    if (syncSearchIndex) searchFts.upsertMediaDocument(db, { id, title, src });
  });

  (collection.videos || []).forEach((item, index) => {
    const id = mediaId(collection.id, item);
    const title = item.title || item.file || "";
    const src = item.src || "";
    insertMedia.run(
      id,
      collection.id,
      "video",
      title,
      item.file || "",
      src,
      item.thumb || "",
      "",
      "",
      item.poster || "",
      item.duration || null,
      item.width || null,
      item.height || null,
      item.size || null,
      item.codec || "",
      item.mtime || 0,
      index,
      json(item)
    );
    if (syncSearchIndex) searchFts.upsertMediaDocument(db, { id, title, src });
  });

  (collection.children || []).forEach((child, index) => insertCollection(db, child, collection.id, index, insertedAt, syncSearchIndex));
}

function indexGallery(dbFile, gallery) {
  const db = openDatabase(dbFile);
  const insertedAt = new Date().toISOString();
  const collections = gallery.collections || [];
  const searchIndexStatus = searchFts.getIndexStatus(db);
  const syncSearchIndex = searchIndexStatus.fts5Available
    && searchIndexStatus.mappingCount !== null
    && searchIndexStatus.ftsDocumentCount !== null;
  try {
    db.exec("BEGIN");
    db.exec(`
      DROP TABLE IF EXISTS temp_preserved_media_hashes;
      CREATE TEMP TABLE temp_preserved_media_hashes AS
      SELECT h.*, m.src AS preserved_src, m.type AS preserved_type
      FROM media_hashes h
      JOIN media m ON m.id = h.media_id
      WHERE m.src != '';
    `);
    db.exec("DELETE FROM media; DELETE FROM covers; DELETE FROM scan_state; DELETE FROM collections;");
    if (syncSearchIndex) searchFts.clearDocuments(db);
    collections.forEach((collection, index) => insertCollection(db, collection, null, index, insertedAt, syncSearchIndex));
    db.exec(`
      INSERT OR REPLACE INTO media_hashes (
        media_id, collection_id, file_size, mtime, sha256, width, height,
        device, location, metadata, updated_at
      )
      SELECT
        m.id, m.collection_id, p.file_size, p.mtime, p.sha256, p.width, p.height,
        p.device, p.location, p.metadata, p.updated_at
      FROM temp_preserved_media_hashes p
      JOIN media m ON m.src = p.preserved_src AND m.type = p.preserved_type;
    `);
    db.exec("DELETE FROM media_hashes WHERE media_id NOT IN (SELECT id FROM media);");
    db.exec("DROP TABLE IF EXISTS temp_preserved_media_hashes;");
    if (syncSearchIndex) searchFts.markIncrementalSync(db, { exactCounts: true });
    db.exec("COMMIT");
    const stats = getStatsFromDb(db);
    return { ...stats, indexedAt: insertedAt };
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch (rollbackError) {
      // Keep the original indexing error; rollback can fail if BEGIN did not complete.
    }
    throw error;
  } finally {
    db.close();
  }
}

function parseJsonField(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
}

function rowToCollection(row) {
  if (!row) return null;
  return {
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    folder: row.folder,
    pathParts: parseJsonField(row.path_parts, []),
    level: row.level,
    cover: row.cover,
    coverThumb: row.cover_thumb,
    imageCount: row.image_count,
    videoCount: row.video_count,
    totalImageCount: row.total_image_count,
    totalVideoCount: row.total_video_count,
    descendantCount: row.descendant_count,
    mtime: row.mtime,
    childCount: row.child_count || 0,
  };
}

function rowToMedia(row) {
  if (!row) return null;
  const metadata = parseJsonField(row.metadata, null);
  if (row.type === "image" && metadata && typeof metadata === "object") {
    metadata.src = row.src || metadata.src || "";
    metadata.thumb = row.thumb || metadata.thumb || metadata.src || "";
    metadata.detailThumb = row.detail_thumb || row.thumb || metadata.detailThumb || metadata.previewThumb || metadata.src || "";
    metadata.previewThumb = row.detail_thumb || row.thumb || metadata.thumb || metadata.src || "";
    metadata.carouselThumb = row.carousel_thumb || metadata.carouselThumb || metadata.thumb || metadata.src || "";
  }
  return {
    id: row.id,
    collectionId: row.collection_id,
    type: row.type,
    title: row.title,
    file: row.file_name,
    src: row.src,
    thumb: row.thumb,
    detailThumb: row.detail_thumb,
    carouselThumb: row.carousel_thumb,
    poster: row.poster,
    duration: row.duration,
    width: row.width,
    height: row.height,
    size: row.size,
    codec: row.codec,
    mtime: row.mtime,
    metadata,
  };
}

function getStatsFromDb(db) {
  const collectionCount = db.prepare("SELECT COUNT(*) AS count FROM collections").get().count;
  const mediaCount = db.prepare("SELECT COUNT(*) AS count FROM media").get().count;
  const imageCount = db.prepare("SELECT COUNT(*) AS count FROM media WHERE type = 'image'").get().count;
  const videoCount = db.prepare("SELECT COUNT(*) AS count FROM media WHERE type = 'video'").get().count;
  const scanStateCount = db.prepare("SELECT COUNT(*) AS count FROM scan_state").get().count;
  return { collectionCount, mediaCount, imageCount, videoCount, scanStateCount };
}

function withDatabase(dbFile, callback) {
  const db = openDatabase(dbFile);
  try {
    return callback(db);
  } finally {
    db.close();
  }
}

function withReadOnlyDatabase(dbFile, callback) {
  const db = new DatabaseSync(dbFile, { readOnly: true });
  try {
    db.exec("PRAGMA query_only=ON; PRAGMA busy_timeout=5000");
    return callback(db);
  } finally {
    db.close();
  }
}

function getStats(dbFile) {
  return withDatabase(dbFile, (db) => getStatsFromDb(db));
}

function getScanState(dbFile, scanPath) {
  return withDatabase(dbFile, (db) => db.prepare("SELECT * FROM scan_state WHERE path = ?").get(scanPath) || null);
}

function getScanStatesByKind(dbFile, kind) {
  return withDatabase(dbFile, (db) => db.prepare("SELECT * FROM scan_state WHERE kind = ?").all(kind));
}

function upsertScanState(dbFile, state) {
  return withDatabase(dbFile, (db) => {
    db.prepare(
      `INSERT INTO scan_state (path, kind, mtime, file_count, dir_count, signature, last_scanned_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET
         kind = excluded.kind,
         mtime = excluded.mtime,
         file_count = excluded.file_count,
         dir_count = excluded.dir_count,
         signature = excluded.signature,
         last_scanned_at = excluded.last_scanned_at`
    ).run(state.path, state.kind, state.mtime || 0, state.fileCount || 0, state.dirCount || 0, state.signature || "", state.lastScannedAt || new Date().toISOString());
    return getStatsFromDb(db);
  });
}

function getRootCollections(dbFile, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 500, 1), 500);
  const offset = Math.max(Number(options.offset) || 0, 0);
  const sort = gallerySort.normalizeSortMode(options.sort);
  return withDatabase(dbFile, (db) => {
    const items = db
      .prepare(
        `SELECT c.*, (SELECT COUNT(*) FROM collections child WHERE child.parent_id = c.id) AS child_count
         FROM collections c
         WHERE c.parent_id IS NULL
         ORDER BY c.sort_order`
      )
      .all()
      .map(rowToCollection);
    return gallerySort.sortCollections(items, sort).slice(offset, offset + limit);
  });
}

function getCollection(dbFile, id, options = {}) {
  const sort = gallerySort.normalizeSortMode(options.sort);
  return withDatabase(dbFile, (db) => {
    const collection = rowToCollection(
      db
        .prepare(
          `SELECT c.*, (SELECT COUNT(*) FROM collections child WHERE child.parent_id = c.id) AS child_count
           FROM collections c
           WHERE c.id = ?`
        )
        .get(id)
    );
    if (!collection) return null;
    const children = gallerySort.sortCollections(db
      .prepare(
        `SELECT c.*, (SELECT COUNT(*) FROM collections child WHERE child.parent_id = c.id) AS child_count
         FROM collections c
         WHERE c.parent_id = ?
         ORDER BY c.sort_order`
      )
      .all(id)
      .map(rowToCollection), sort);
    return { ...collection, children };
  });
}

function getMedia(dbFile, collectionId, options = {}) {
  const type = options.type === "image" || options.type === "video" ? options.type : "";
  const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 500);
  const offset = Math.max(Number(options.offset) || 0, 0);
  return withDatabase(dbFile, (db) => {
    const where = type ? "collection_id = ? AND type = ?" : "collection_id = ?";
    const params = type ? [collectionId, type, limit, offset] : [collectionId, limit, offset];
    const items = db
      .prepare(`SELECT * FROM media WHERE ${where} ORDER BY type, sort_order LIMIT ? OFFSET ?`)
      .all(...params)
      .map(rowToMedia);
    const countParams = type ? [collectionId, type] : [collectionId];
    const total = db.prepare(`SELECT COUNT(*) AS count FROM media WHERE ${where}`).get(...countParams).count;
    return { collectionId, type: type || "all", total, limit, offset, items };
  });
}

function getImageSourceByThumbnail(dbFile, thumbUrl) {
  const url = String(thumbUrl || "").trim();
  if (!url) return null;
  return withDatabase(dbFile, (db) => {
    const row = db
      .prepare(
        `SELECT src FROM media
         WHERE type = 'image'
           AND (thumb = ? OR detail_thumb = ? OR carousel_thumb = ?)
         LIMIT 1`
      )
      .get(url, url, url);
    return row ? row.src : null;
  });
}

function getVideoSourceByPoster(dbFile, posterUrl) {
  const url = String(posterUrl || "").trim();
  if (!url) return null;
  return withDatabase(dbFile, (db) => {
    const row = db
      .prepare(
        `SELECT src FROM media
         WHERE type = 'video' AND poster = ?
         LIMIT 1`
      )
      .get(url);
    return row ? row.src : null;
  });
}

function getVideoById(dbFile, mediaId) {
  const id = String(mediaId || "").trim();
  if (!id) return null;
  return withDatabase(dbFile, (db) => rowToMedia(db.prepare("SELECT * FROM media WHERE id = ? AND type = 'video' LIMIT 1").get(id)));
}

function getVideoCount(dbFile) {
  return withDatabase(dbFile, (db) => Number(db.prepare("SELECT COUNT(*) AS count FROM media WHERE type = 'video'").get().count || 0));
}

const searchCollectionColumns = `
  c.id, c.parent_id, c.title, c.folder, c.path_parts, c.level,
  c.cover, c.cover_thumb, c.image_count, c.video_count,
  c.total_image_count, c.total_video_count, c.descendant_count, c.mtime,
  (SELECT COUNT(*) FROM collections child WHERE child.parent_id = c.id) AS child_count
`;

const searchMediaColumns = `
  id, collection_id, type, title, file_name, src,
  thumb, detail_thumb, carousel_thumb, poster
`;

const searchSql = Object.freeze({
  collectionExact: `
    SELECT ${searchCollectionColumns}
    FROM collections c
    WHERE c.title = ? COLLATE NOCASE
    LIMIT ?
  `,
  collectionPrefix: `
    SELECT ${searchCollectionColumns}
    FROM collections c
    WHERE c.title >= ? COLLATE NOCASE
      AND c.title < ? COLLATE NOCASE
    ORDER BY c.title COLLATE NOCASE
    LIMIT ?
  `,
  collectionContains: `
    SELECT ${searchCollectionColumns}
    FROM collections c
    WHERE c.title LIKE ? ESCAPE '\\' COLLATE NOCASE
       OR c.id LIKE ? ESCAPE '\\' COLLATE NOCASE
    LIMIT ?
  `,
  mediaContains: `
    SELECT ${searchMediaColumns}
    FROM media
    WHERE title LIKE ? ESCAPE '\\' COLLATE NOCASE
       OR file_name LIKE ? ESCAPE '\\' COLLATE NOCASE
       OR src LIKE ? ESCAPE '\\' COLLATE NOCASE
    LIMIT ?
  `,
});

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, "\\$&");
}

function appendUniqueRows(target, seen, rows, maximum) {
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    target.push(row);
    if (target.length >= maximum) break;
  }
}

function roundedMilliseconds(value) {
  return Math.round(value * 1000) / 1000;
}

function search(dbFile, query, limitValue = 50, options = {}) {
  const totalStartedAt = performance.now();
  const q = searchFts.normalizeSearchQuery(query);
  const queryCodePointLength = Array.from(q).length;
  const limit = Math.min(Math.max(Number(limitValue) || 50, 1), 60);
  const requestedSort = options.sort === "relevance" || !options.sort ? "relevance" : gallerySort.normalizeSortMode(options.sort);
  if (queryCodePointLength < 2) return { query: q, collections: [], media: [], hasMore: false, minimumQueryLength: 2 };

  const escaped = escapeLike(q);
  const prefixUpperBound = `${q}\uffff`;
  const contains = `%${escaped}%`;
  const fetchLimit = requestedSort === "relevance" ? limit + 1 : 10000;
  const openStartedAt = performance.now();
  const db = openDatabase(dbFile);
  const databaseOpenMs = performance.now() - openStartedAt;
  let collectionSqlMs = 0;
  let mediaSqlMs = 0;
  let sortMs = 0;
  let transformMs = 0;
  let ftsInitialHitCount = 0;

  try {
    const indexStatus = searchFts.getIndexStatus(db, { includeCounts: false });
    const behavior = searchFts.resolveSearchBehavior(options.searchMode, indexStatus);
    const collectionRows = [];
    const collectionIds = new Set();
    let prefixMatchCount = 0;

    let sqlStartedAt = performance.now();
    const exactRows = db.prepare(searchSql.collectionExact).all(q, fetchLimit);
    collectionSqlMs += performance.now() - sqlStartedAt;
    appendUniqueRows(collectionRows, collectionIds, exactRows, fetchLimit);

    if (collectionRows.length < fetchLimit) {
      sqlStartedAt = performance.now();
      const prefixRows = db.prepare(searchSql.collectionPrefix).all(q, prefixUpperBound, fetchLimit - collectionRows.length);
      collectionSqlMs += performance.now() - sqlStartedAt;
      prefixMatchCount = prefixRows.length;
      appendUniqueRows(collectionRows, collectionIds, prefixRows, fetchLimit);
    }

    if (collectionRows.length < fetchLimit) {
      sqlStartedAt = performance.now();
      const containsRows = db.prepare(searchSql.collectionContains).all(contains, contains, fetchLimit - collectionRows.length);
      collectionSqlMs += performance.now() - sqlStartedAt;
      appendUniqueRows(collectionRows, collectionIds, containsRows, fetchLimit);
    }

    const collectionSortStartedAt = performance.now();
    const sortedCollections = requestedSort === "relevance"
      ? collectionRows.map(rowToCollection)
      : gallerySort.sortCollections(collectionRows.map(rowToCollection), requestedSort);
    sortMs += performance.now() - collectionSortStartedAt;
    const collectionHasMore = sortedCollections.length > limit;
    const limitedCollections = sortedCollections.slice(0, limit);
    const exactCollectionMatch = exactRows.length > 0;
    const preferredCollectionMatch = exactCollectionMatch || prefixMatchCount > 0;
    const mediaLimit = preferredCollectionMatch ? 0 : Math.max(limit - limitedCollections.length, 0);
    let mediaRows = [];

    const twoCharacterMediaAllowed = queryCodePointLength === 2 && behavior.actual !== "unavailable";
    if (mediaLimit > 0 && (twoCharacterMediaAllowed || behavior.actual === "fts5" || behavior.actual === "legacy-like")) {
      sqlStartedAt = performance.now();
      if (queryCodePointLength === 2) {
        mediaRows = searchFts.queryTwoCharacterMedia(db, q, mediaLimit + 1);
      } else if (behavior.actual === "fts5") {
        const ftsResult = searchFts.queryFtsMedia(db, q, mediaLimit + 1);
        mediaRows = ftsResult.rows;
        ftsInitialHitCount = ftsResult.hitCount;
      } else if (behavior.actual === "legacy-like") {
        mediaRows = db.prepare(searchSql.mediaContains).all(contains, contains, contains, mediaLimit + 1);
      }
      mediaSqlMs += performance.now() - sqlStartedAt;

      if (behavior.actual === "legacy-like") {
        const normalizedQuery = q.toLocaleLowerCase("en-US");
        const sortStartedAt = performance.now();
        mediaRows = mediaRows
          .map((row, index) => ({
            row,
            index,
            rank: `${row.title || ""} ${row.file_name || ""}`.toLocaleLowerCase("en-US").includes(normalizedQuery) ? 0 : 1,
          }))
          .sort((a, b) => a.rank - b.rank || a.index - b.index)
          .map(({ row }) => row);
        sortMs += performance.now() - sortStartedAt;
      }
    }

    const mediaHasMore = mediaRows.length > mediaLimit;
    const transformStartedAt = performance.now();
    const collections = limitedCollections;
    const mediaCandidates = mediaRows.map(rowToMedia);
    const media = (requestedSort === "relevance" ? mediaCandidates : gallerySort.sortCollections(mediaCandidates, requestedSort)).slice(0, mediaLimit);
    transformMs += performance.now() - transformStartedAt;
    const payload = {
      query: q,
      sort: requestedSort,
      collections,
      media,
      hasMore: collectionHasMore || mediaHasMore,
      limit,
      exactCollectionMatch,
      preferredCollectionMatch,
      searchMode: behavior.actual,
      configuredSearchMode: behavior.configured,
      indexStatus: indexStatus.status,
      queryLength: queryCodePointLength,
      degraded: behavior.degraded,
      degradedReason: behavior.degradedReason,
    };

    if (options.includePerformance) {
      payload.performance = {
        databaseOpenMs: roundedMilliseconds(databaseOpenMs),
        collectionSqlMs: roundedMilliseconds(collectionSqlMs),
        mediaSqlMs: roundedMilliseconds(mediaSqlMs),
        countSqlMs: 0,
        sortMs: roundedMilliseconds(sortMs),
        transformMs: roundedMilliseconds(transformMs),
        databaseTotalMs: roundedMilliseconds(performance.now() - totalStartedAt),
        twoCharacterTitleMode: queryCodePointLength === 2,
        legacyMode: behavior.actual === "legacy-like",
        safeDegraded: behavior.actual === "safe-degraded" || behavior.actual === "unavailable",
        ftsInitialHitCount,
      };
    }
    return payload;
  } finally {
    db.close();
  }
}

function getSearchDiagnostics(dbFile, query = "test") {
  const q = String(query || "test").trim() || "test";
  const escaped = escapeLike(q);
  return withDatabase(dbFile, (db) => ({
    indexes: {
      collections: db.prepare("PRAGMA index_list('collections')").all(),
      media: db.prepare("PRAGMA index_list('media')").all(),
    },
    plans: {
      collectionExact: db.prepare(`EXPLAIN QUERY PLAN ${searchSql.collectionExact}`).all(q, 61),
      collectionPrefix: db.prepare(`EXPLAIN QUERY PLAN ${searchSql.collectionPrefix}`).all(q, `${q}\uffff`, 61),
      collectionContains: db.prepare(`EXPLAIN QUERY PLAN ${searchSql.collectionContains}`).all(`%${escaped}%`, `%${escaped}%`, 61),
      mediaContains: db.prepare(`EXPLAIN QUERY PLAN ${searchSql.mediaContains}`).all(`%${escaped}%`, `%${escaped}%`, `%${escaped}%`, 61),
      ...searchFts.getSearchQueryPlans(db, q),
    },
  }));
}

function optimizeDatabase(dbFile) {
  return withDatabase(dbFile, (db) => {
    db.exec("PRAGMA optimize;");
    return { optimized: true };
  });
}

function getHighlightCandidates(dbFile, limitValue = 120) {
  const limit = Math.min(Math.max(Number(limitValue) || 120, 20), 300);
  return withDatabase(dbFile, (db) => {
    const maxRow = db.prepare("SELECT MAX(rowid) AS maxRowid FROM media WHERE type = 'image'").get().maxRowid || 0;
    if (!maxRow) return [];

    const statement = db.prepare(`
      SELECT
        m.*,
        c.title AS collection_title,
        c.path_parts AS collection_path_parts
      FROM media m
      JOIN collections c ON c.id = m.collection_id
      WHERE m.type = 'image' AND m.rowid >= ?
      ORDER BY m.rowid
      LIMIT 1
    `);

    const byId = new Map();
    const maxAttempts = Math.max(limit * 5, 120);
    for (let attempt = 0; attempt < maxAttempts && byId.size < limit; attempt += 1) {
      const startRow = Math.floor(Math.random() * maxRow) + 1;
      const row = statement.get(startRow);
      if (row && !byId.has(row.id)) byId.set(row.id, row);
    }

    if (byId.size < limit) {
      const fallback = db.prepare(`
        SELECT
          m.*,
          c.title AS collection_title,
          c.path_parts AS collection_path_parts
        FROM media m
        JOIN collections c ON c.id = m.collection_id
        WHERE m.type = 'image'
        ORDER BY m.rowid
        LIMIT ?
      `);
      for (const row of fallback.all(limit - byId.size)) {
        if (!byId.has(row.id)) byId.set(row.id, row);
      }
    }

    return [...byId.values()].map((row) => ({
      ...rowToMedia(row),
      collectionTitle: row.collection_title || "",
      collectionPathParts: parseJsonField(row.collection_path_parts, []),
    }));
  });
}

function rowToUserMark(row) {
  if (!row) return null;
  const payload = parseJsonField(row.payload, {});
  return {
    ...payload,
    id: row.id,
    targetId: row.target_id,
    targetType: row.target_type,
    markType: row.mark_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToAccessLog(row) {
  if (!row) return null;
  return {
    id: row.id,
    time: row.time,
    ip: row.ip || "",
    host: row.host || "",
    userAgent: row.user_agent || "",
    type: row.type || "",
    title: row.title || "",
    model: row.model || "",
    work: row.work || "",
    hash: row.hash || "",
    pathParts: parseJsonField(row.path_parts, []),
  };
}

function normalizedAccessLog(entry = {}) {
  const time = new Date(entry.time || Date.now()).toISOString();
  return {
    time,
    ip: String(entry.ip || ""),
    host: String(entry.host || ""),
    userAgent: String(entry.userAgent || ""),
    type: String(entry.type || ""),
    title: String(entry.title || ""),
    model: String(entry.model || ""),
    work: String(entry.work || ""),
    hash: String(entry.hash || ""),
    pathParts: Array.isArray(entry.pathParts) ? entry.pathParts.map((part) => String(part || "")) : [],
  };
}

function insertAccessLog(dbFile, entry) {
  const item = normalizedAccessLog(entry);
  return withDatabase(dbFile, (db) => {
    const result = db.prepare(
      `INSERT INTO access_logs (
         time, ip, host, user_agent, type, title, model, work, hash, path_parts, source_key
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
    ).run(item.time, item.ip, item.host, item.userAgent, item.type, item.title, item.model, item.work, item.hash, json(item.pathParts));
    return rowToAccessLog(db.prepare("SELECT * FROM access_logs WHERE id = ?").get(result.lastInsertRowid));
  });
}

function importAccessLogs(dbFile, entries = []) {
  const items = [];
  for (const entry of entries || []) {
    if (!entry || !entry.sourceKey) continue;
    try {
      items.push({ ...normalizedAccessLog(entry), sourceKey: String(entry.sourceKey) });
    } catch (error) {
      // Skip invalid historical timestamps without dropping the rest of the batch.
    }
  }
  if (!items.length) return { imported: 0 };
  return withDatabase(dbFile, (db) => {
    const insert = db.prepare(
      `INSERT OR IGNORE INTO access_logs (
         time, ip, host, user_agent, type, title, model, work, hash, path_parts, source_key
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    let imported = 0;
    db.exec("BEGIN");
    try {
      for (const item of items) {
        const result = insert.run(item.time, item.ip, item.host, item.userAgent, item.type, item.title, item.model, item.work, item.hash, json(item.pathParts), item.sourceKey);
        imported += result.changes || 0;
      }
      db.exec("COMMIT");
      return { imported };
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch (rollbackError) {
        // Preserve the original error.
      }
      throw error;
    }
  });
}

function getAccessLogsPage(dbFile, pageValue = 1, pageSizeValue = 50) {
  const requestedPage = Math.max(Number.parseInt(pageValue, 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(pageSizeValue, 10) || 50, 1), 100);
  return withDatabase(dbFile, (db) => {
    const total = Number(db.prepare("SELECT COUNT(*) AS count FROM access_logs").get().count || 0);
    const totalPages = total ? Math.ceil(total / pageSize) : 0;
    const page = totalPages ? Math.min(requestedPage, totalPages) : 1;
    const offset = (page - 1) * pageSize;
    const items = db
      .prepare("SELECT * FROM access_logs ORDER BY time DESC, id DESC LIMIT ? OFFSET ?")
      .all(pageSize, offset)
      .map(rowToAccessLog)
      .filter(Boolean);
    return { items, page, pageSize, total, totalPages };
  });
}

function deleteAccessLogsBefore(dbFile, cutoffIso) {
  const cutoff = new Date(cutoffIso).toISOString();
  return withDatabase(dbFile, (db) => {
    db.exec("BEGIN");
    try {
      const result = db.prepare("DELETE FROM access_logs WHERE time < ?").run(cutoff);
      db.exec("COMMIT");
      return { deleted: result.changes || 0, cutoff };
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch (rollbackError) {
        // Preserve the original error.
      }
      throw error;
    }
  });
}

function getMaintenanceState(dbFile, taskKey, scheduledDate) {
  return withDatabase(dbFile, (db) => db.prepare("SELECT * FROM maintenance_state WHERE task_key = ? AND scheduled_date = ?").get(taskKey, scheduledDate) || null);
}

function upsertMaintenanceState(dbFile, item) {
  const now = new Date().toISOString();
  return withDatabase(dbFile, (db) => {
    db.prepare(`INSERT INTO maintenance_state (task_key, scheduled_date, started_at, finished_at, status, result, error, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(task_key, scheduled_date) DO UPDATE SET started_at=excluded.started_at, finished_at=excluded.finished_at,
      status=excluded.status, result=excluded.result, error=excluded.error, updated_at=excluded.updated_at`)
      .run(item.taskKey, item.scheduledDate, item.startedAt || null, item.finishedAt || null, item.status, json(item.result), item.error || null, now);
    return getMaintenanceStateFromDb(db, item.taskKey, item.scheduledDate);
  });
}

function getMaintenanceStateFromDb(db, taskKey, scheduledDate) {
  return db.prepare("SELECT * FROM maintenance_state WHERE task_key = ? AND scheduled_date = ?").get(taskKey, scheduledDate) || null;
}

function rowToRecycle(row) {
  if (!row) return null;
  return { id: row.id, collectionId: row.collection_id, relativePath: row.relative_path, title: row.title, status: row.status,
    markedAt: row.marked_at, eligibleAt: row.eligible_at, scheduledAt: row.scheduled_at, startedAt: row.started_at || "",
    finishedAt: row.finished_at || "", recyclePath: row.recycle_path || "", error: row.error || "",
    requestedIp: row.requested_ip || "", requestedScope: row.requested_scope || "", indexRefreshError: row.index_refresh_error || "" };
}

function createCollectionRecycle(dbFile, item) {
  return withDatabase(dbFile, (db) => {
    db.prepare(`INSERT INTO collection_recycle_queue (id, collection_id, relative_path, title, status, marked_at, eligible_at, scheduled_at,
      source_path_snapshot, requested_ip, requested_scope, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`)
      .run(item.id, item.collectionId, item.relativePath, item.title, item.markedAt, item.eligibleAt, item.scheduledAt, item.sourcePathSnapshot,
        item.requestedIp || "", item.requestedScope || "", item.markedAt);
    return rowToRecycle(db.prepare("SELECT * FROM collection_recycle_queue WHERE id = ?").get(item.id));
  });
}

function getActiveCollectionRecycle(dbFile, collectionId) {
  return withDatabase(dbFile, (db) => rowToRecycle(db.prepare("SELECT * FROM collection_recycle_queue WHERE collection_id = ? AND status IN ('pending','recycling') ORDER BY marked_at DESC LIMIT 1").get(collectionId)));
}

function getLatestCollectionRecycle(dbFile, collectionId) {
  return withDatabase(dbFile, (db) => rowToRecycle(db.prepare("SELECT * FROM collection_recycle_queue WHERE collection_id = ? ORDER BY marked_at DESC LIMIT 1").get(collectionId)));
}

function cancelCollectionRecycle(dbFile, collectionId, now = new Date().toISOString()) {
  return withDatabase(dbFile, (db) => {
    const result = db.prepare("UPDATE collection_recycle_queue SET status='cancelled', finished_at=?, updated_at=? WHERE collection_id=? AND status='pending'").run(now, now, collectionId);
    return { cancelled: result.changes || 0 };
  });
}

function getDueCollectionRecycles(dbFile, now, limit = 100) {
  return withDatabase(dbFile, (db) => db.prepare("SELECT * FROM collection_recycle_queue WHERE status='pending' AND scheduled_at <= ? ORDER BY scheduled_at, id LIMIT ?").all(now, Math.min(Math.max(Number(limit)||100,1),200)).map(rowToRecycle));
}

function updateCollectionRecycle(dbFile, id, changes) {
  const allowed = { status:"status", startedAt:"started_at", finishedAt:"finished_at", recyclePath:"recycle_path", error:"error", indexRefreshError:"index_refresh_error" };
  const entries = Object.entries(changes).filter(([key]) => allowed[key]);
  return withDatabase(dbFile, (db) => {
    if (entries.length) db.prepare(`UPDATE collection_recycle_queue SET ${entries.map(([key]) => `${allowed[key]}=?`).join(", ")}, updated_at=? WHERE id=?`).run(...entries.map(([,value]) => value || null), new Date().toISOString(), id);
    return rowToRecycle(db.prepare("SELECT * FROM collection_recycle_queue WHERE id=?").get(id));
  });
}

function getCollectionRecyclePage(dbFile, pageValue=1, pageSizeValue=50) {
  const page=Math.max(Number(pageValue)||1,1), pageSize=Math.min(Math.max(Number(pageSizeValue)||50,1),100);
  return withDatabase(dbFile, (db) => { const total=Number(db.prepare("SELECT COUNT(*) count FROM collection_recycle_queue").get().count||0); const totalPages=total?Math.ceil(total/pageSize):0; const safePage=totalPages?Math.min(page,totalPages):1;
    const items=db.prepare("SELECT * FROM collection_recycle_queue ORDER BY marked_at DESC LIMIT ? OFFSET ?").all(pageSize,(safePage-1)*pageSize).map(rowToRecycle); return {items,page:safePage,pageSize,total,totalPages}; });
}

function getUserMarks(dbFile, markType, limitValue = 50) {
  const type = String(markType || "").trim();
  const limit = Math.min(Math.max(Number(limitValue) || 50, 1), 200);
  if (!type) return [];
  return withDatabase(dbFile, (db) =>
    db
      .prepare(
        `SELECT * FROM user_marks
         WHERE mark_type = ?
         ORDER BY updated_at DESC
         LIMIT ?`
      )
      .all(type, limit)
      .map(rowToUserMark)
      .filter(Boolean)
  );
}

function upsertUserMark(dbFile, mark) {
  const now = new Date().toISOString();
  const id = String(mark.id || "").trim();
  const targetId = String(mark.targetId || mark.hash || id).trim();
  const targetType = String(mark.targetType || mark.type || "collection").trim();
  const markType = String(mark.markType || "").trim();
  if (!id || !targetId || !markType) throw new Error("Invalid user mark");
  return withDatabase(dbFile, (db) => {
    const previous = db.prepare("SELECT created_at FROM user_marks WHERE id = ?").get(id);
    db.prepare(
      `INSERT INTO user_marks (id, target_id, target_type, mark_type, payload, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         target_id = excluded.target_id,
         target_type = excluded.target_type,
         mark_type = excluded.mark_type,
         payload = excluded.payload,
         updated_at = excluded.updated_at`
    ).run(id, targetId, targetType, markType, json(mark.payload || {}), previous ? previous.created_at : now, now);
    return rowToUserMark(db.prepare("SELECT * FROM user_marks WHERE id = ?").get(id));
  });
}

function deleteUserMark(dbFile, id, markType = "") {
  const markId = String(id || "").trim();
  if (!markId) return { deleted: 0 };
  return withDatabase(dbFile, (db) => {
    const result = markType
      ? db.prepare("DELETE FROM user_marks WHERE id = ? AND mark_type = ?").run(markId, markType)
      : db.prepare("DELETE FROM user_marks WHERE id = ?").run(markId);
    return { deleted: result.changes || 0 };
  });
}

function getDuplicateHashStats(dbFile) {
  return withDatabase(dbFile, (db) => {
    const imageCount = db.prepare("SELECT COUNT(*) AS count FROM media WHERE type = 'image'").get().count;
    const hashedCount = db.prepare("SELECT COUNT(*) AS count FROM media_hashes").get().count;
    const duplicateGroupCount = db
      .prepare(
        `SELECT COUNT(*) AS count FROM (
          SELECT sha256 FROM media_hashes
          WHERE sha256 != ''
          GROUP BY sha256
          HAVING COUNT(*) > 1
        )`
      )
      .get().count;
    const duplicateItemCount = db
      .prepare(
        `SELECT COALESCE(SUM(item_count), 0) AS count FROM (
          SELECT COUNT(*) AS item_count FROM media_hashes
          WHERE sha256 != ''
          GROUP BY sha256
          HAVING COUNT(*) > 1
        )`
      )
      .get().count;
    return { imageCount, hashedCount, pendingCount: Math.max(0, imageCount - hashedCount), duplicateGroupCount, duplicateItemCount };
  });
}

function findImagesBySha256(dbFile, sha256) {
  const normalizedHash = String(sha256 || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalizedHash)) throw new Error("Invalid SHA-256 value");
  return withReadOnlyDatabase(dbFile, (db) => {
    const coverage = db.prepare(
      `SELECT
         (SELECT COUNT(*) FROM media WHERE type = 'image') AS total_images,
         (SELECT COUNT(*) FROM media_hashes WHERE sha256 != '') AS hashed_images`
    ).get();
    const rows = db.prepare(
      `SELECT m.id, m.collection_id, m.title, m.file_name, c.title AS collection_title, c.path_parts
       FROM media_hashes h INDEXED BY idx_media_hashes_sha256
       JOIN media m ON m.id = h.media_id
       JOIN collections c ON c.id = m.collection_id
       WHERE h.sha256 = ? AND m.type = 'image'
       ORDER BY m.collection_id, m.sort_order, m.id`
    ).all(normalizedHash);
    const totalImages = Number(coverage.total_images || 0);
    const hashedImages = Number(coverage.hashed_images || 0);
    return {
      coverage: {
        hashedImages,
        totalImages,
        ratio: totalImages ? hashedImages / totalImages : 0,
        complete: totalImages > 0 && hashedImages >= totalImages,
      },
      matches: rows.map((row) => {
        const pathParts = parseJsonField(row.path_parts, []).map((part) => String(part || "")).filter(Boolean);
        const fileName = row.file_name || row.title || "";
        return {
          mediaId: row.id,
          fileName,
          collectionName: row.collection_title || pathParts.at(-1) || "",
          collectionPath: pathParts.join("/"),
          mediaPath: [...pathParts, fileName].filter(Boolean).join("/"),
          route: `#/${pathParts.map(encodeURIComponent).join("/")}`,
        };
      }),
    };
  });
}

function getPerceptualHashStats(dbFile) {
  return withReadOnlyDatabase(dbFile, (db) => {
    const row = db.prepare(`SELECT
      (SELECT COUNT(*) FROM media WHERE type = 'image') AS total_images,
      (SELECT COUNT(*) FROM media_perceptual_hashes WHERE status = 1 AND length(hash64) = 8) AS indexed_images,
      (SELECT COUNT(*) FROM media_perceptual_hashes WHERE status = 2) AS failed_images`).get();
    const state = db.prepare("SELECT * FROM perceptual_hash_state WHERE id = 1").get() || {};
    const totalImages = Number(row.total_images || 0);
    const indexedImages = Number(row.indexed_images || 0);
    const currentBytes = [dbFile, `${dbFile}-wal`, `${dbFile}-shm`].reduce((sum, file) => {
      try { return sum + fs.statSync(file).size; } catch (error) { return sum; }
    }, 0);
    const baselineBytes = Number(state.baseline_bytes || 0);
    return {
      algorithm: "phash64",
      algorithmVersion: 1,
      totalImages,
      indexedImages,
      failedImages: Number(row.failed_images || 0),
      pendingImages: Math.max(0, totalImages - indexedImages),
      coverage: totalImages ? indexedImages / totalImages : 0,
      complete: totalImages > 0 && indexedImages >= totalImages,
      taskStatus: state.status || "not_started",
      processed: Number(state.processed || 0),
      succeeded: Number(state.succeeded || 0),
      failed: Number(state.failed || 0),
      skipped: Number(state.skipped || 0),
      baselineBytes,
      bytesAdded: baselineBytes ? Math.max(0, currentBytes - baselineBytes) : 0,
      updatedAt: Number(state.updated_at || 0),
      recentError: state.recent_error || "",
    };
  });
}

function getMediaItemsByPerceptualIds(dbFile, ids = []) {
  const mediaIds = [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))].slice(0, 50);
  if (!mediaIds.length) return [];
  return withReadOnlyDatabase(dbFile, (db) => {
    const select = db.prepare(`SELECT m.id, m.title, m.file_name, m.src, c.title AS collection_title, c.path_parts
      FROM media m JOIN collections c ON c.id = m.collection_id WHERE m.id = ? AND m.type = 'image'`);
    return mediaIds.map((id) => select.get(id)).filter(Boolean).map((row) => {
      const pathParts = parseJsonField(row.path_parts, []).map((part) => String(part || "")).filter(Boolean);
      const fileName = row.file_name || row.title || "";
      return {
        mediaId: row.id,
        fileName,
        collectionName: row.collection_title || pathParts.at(-1) || "",
        collectionPath: pathParts.join("/"),
        mediaPath: [...pathParts, fileName].filter(Boolean).join("/"),
        route: `#/${pathParts.map(encodeURIComponent).join("/")}`,
        thumbnail: row.src || "",
      };
    });
  });
}

function getImagesNeedingHash(dbFile, limitValue = 100) {
  const limit = Math.min(Math.max(Number(limitValue) || 100, 1), 1000);
  return withDatabase(dbFile, (db) =>
    db
      .prepare(
        `SELECT m.*, c.title AS collection_title
         FROM media m
         JOIN collections c ON c.id = m.collection_id
         LEFT JOIN media_hashes h ON h.media_id = m.id
         WHERE m.type = 'image'
           AND (h.media_id IS NULL OR h.file_size != COALESCE(m.size, 0) OR h.mtime != COALESCE(m.mtime, 0))
         ORDER BY m.collection_id, m.sort_order
         LIMIT ?`
      )
      .all(limit)
      .map((row) => ({ ...rowToMedia(row), collectionTitle: row.collection_title || "" }))
  );
}

function upsertMediaHash(dbFile, item) {
  const now = new Date().toISOString();
  return withDatabase(dbFile, (db) => {
    db.prepare(
      `INSERT INTO media_hashes (
        media_id, collection_id, file_size, mtime, sha256, width, height,
        device, location, metadata, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(media_id) DO UPDATE SET
        collection_id = excluded.collection_id,
        file_size = excluded.file_size,
        mtime = excluded.mtime,
        sha256 = excluded.sha256,
        width = excluded.width,
        height = excluded.height,
        device = excluded.device,
        location = excluded.location,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at`
    ).run(
      item.mediaId,
      item.collectionId,
      item.fileSize || 0,
      item.mtime || 0,
      item.sha256 || "",
      item.width || null,
      item.height || null,
      item.device || "",
      item.location || "",
      json(item.metadata || {}),
      now
    );
    return { ok: true };
  });
}

function rowToDuplicateItem(row) {
  const media = rowToMedia(row);
  const metadata = parseJsonField(row.hash_metadata, {});
  return {
    ...media,
    collectionTitle: row.collection_title || "",
    collectionPathParts: parseJsonField(row.collection_path_parts, []),
    sha256: row.sha256 || "",
    fileSize: row.hash_file_size || row.size || 0,
    hashUpdatedAt: row.hash_updated_at || "",
    device: row.device || metadata.device || "",
    location: row.location || metadata.location || "",
  };
}

function getExactDuplicateGroups(dbFile, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
  const offset = Math.max(Number(options.offset) || 0, 0);
  return withDatabase(dbFile, (db) => {
    const total = db
      .prepare(
        `SELECT COUNT(*) AS count FROM (
          SELECT sha256 FROM media_hashes
          WHERE sha256 != ''
          GROUP BY sha256
          HAVING COUNT(*) > 1
        )`
      )
      .get().count;

    const groups = db
      .prepare(
        `SELECT sha256, COUNT(*) AS item_count, SUM(file_size) AS total_size, MIN(updated_at) AS first_indexed_at
         FROM media_hashes
         WHERE sha256 != ''
         GROUP BY sha256
         HAVING COUNT(*) > 1
         ORDER BY item_count DESC, total_size DESC
         LIMIT ? OFFSET ?`
      )
      .all(limit, offset);

    const itemsByHash = db.prepare(
      `SELECT m.*, c.title AS collection_title, c.path_parts AS collection_path_parts,
              h.sha256, h.file_size AS hash_file_size, h.device, h.location,
              h.metadata AS hash_metadata, h.updated_at AS hash_updated_at
       FROM media_hashes h
       JOIN media m ON m.id = h.media_id
       JOIN collections c ON c.id = m.collection_id
       WHERE h.sha256 = ?
       ORDER BY h.file_size DESC, m.collection_id, m.sort_order`
    );

    return {
      total,
      limit,
      offset,
      groups: groups.map((group) => ({
        sha256: group.sha256,
        itemCount: group.item_count,
        totalSize: group.total_size || 0,
        firstIndexedAt: group.first_indexed_at || "",
        items: itemsByHash.all(group.sha256).map(rowToDuplicateItem),
      })),
    };
  });
}

function getMediaItemsByIds(dbFile, ids = []) {
  const mediaIds = [...new Set((ids || []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!mediaIds.length) return [];
  return withDatabase(dbFile, (db) => {
    const placeholders = mediaIds.map(() => "?").join(",");
    return db
      .prepare(
        `SELECT m.*, c.title AS collection_title, c.path_parts AS collection_path_parts,
                h.sha256, h.file_size AS hash_file_size, h.device, h.location,
                h.metadata AS hash_metadata, h.updated_at AS hash_updated_at
         FROM media m
         JOIN collections c ON c.id = m.collection_id
         LEFT JOIN media_hashes h ON h.media_id = m.id
         WHERE m.id IN (${placeholders})`
      )
      .all(...mediaIds)
      .map(rowToDuplicateItem);
  });
}

function getDuplicateDeletionCandidates(dbFile, limitValue = 50000) {
  const limit = Math.min(Math.max(Number(limitValue) || 50000, 1), 50000);
  return withDatabase(dbFile, (db) => {
    const hashes = db
      .prepare(
        `SELECT sha256
         FROM media_hashes
         WHERE sha256 != ''
         GROUP BY sha256
         HAVING COUNT(*) > 1
         ORDER BY COUNT(*) DESC, SUM(file_size) DESC`
      )
      .all()
      .map((row) => row.sha256);

    const itemsByHash = db.prepare(
      `SELECT m.*, c.title AS collection_title, c.path_parts AS collection_path_parts,
              h.sha256, h.file_size AS hash_file_size, h.device, h.location,
              h.metadata AS hash_metadata, h.updated_at AS hash_updated_at
       FROM media_hashes h
       JOIN media m ON m.id = h.media_id
       JOIN collections c ON c.id = m.collection_id
       WHERE h.sha256 = ?
       ORDER BY h.file_size DESC, m.collection_id, m.sort_order`
    );

    const candidates = [];
    for (const hash of hashes) {
      const groupItems = itemsByHash.all(hash).map(rowToDuplicateItem);
      candidates.push(...groupItems.slice(1));
      if (candidates.length >= limit) break;
    }
    return candidates.slice(0, limit);
  });
}

function removeMediaRecords(dbFile, ids = []) {
  const mediaIds = [...new Set((ids || []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!mediaIds.length) return { removed: 0 };
  return withDatabase(dbFile, (db) => {
    const syncSearchIndex = searchFts.getIndexStatus(db).status === "ready";
    db.exec("BEGIN");
    try {
      const deleteHash = db.prepare("DELETE FROM media_hashes WHERE media_id = ?");
      const deletePerceptualHash = db.prepare("DELETE FROM media_perceptual_hashes WHERE media_id = ?");
      const deleteMarks = db.prepare("DELETE FROM user_marks WHERE mark_type = 'duplicate-delete' AND (target_id = ? OR id = ?)");
      const deleteMedia = db.prepare("DELETE FROM media WHERE id = ?");
      let removed = 0;
      for (const id of mediaIds) {
        if (syncSearchIndex) searchFts.deleteMediaDocument(db, id);
        deleteHash.run(id);
        deletePerceptualHash.run(id);
        deleteMarks.run(id, `duplicate-delete:${id}`);
        const result = deleteMedia.run(id);
        removed += result.changes || 0;
      }
      if (syncSearchIndex) searchFts.markIncrementalSync(db, {
        mediaDelta: -removed,
        mappingDelta: -removed,
        ftsDelta: -removed,
      });
      db.exec("COMMIT");
      return { removed };
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch (rollbackError) {
        // Preserve the original error.
      }
      throw error;
    }
  });
}

function getSearchIndexStatus(dbFile, configuredMode = "auto") {
  return withDatabase(dbFile, (db) => {
    const index = searchFts.getIndexStatus(db);
    const behavior = searchFts.resolveSearchBehavior(configuredMode, index);
    return { configuredSearchMode: behavior.configured, actualSearchMode: behavior.actual, countsSource: "live", ...index };
  });
}

function markSearchIndexStale(dbFile, reason) {
  return withDatabase(dbFile, (db) => {
    searchFts.markStale(db, String(reason || "external_media_operation_uncertain"));
    return getSearchIndexStatusFromConnection(db);
  });
}

function getSearchIndexStatusFromConnection(db) {
  return searchFts.getIndexStatus(db);
}

module.exports = {
  indexGallery,
  getStats,
  getScanState,
  getScanStatesByKind,
  upsertScanState,
  getRootCollections,
  getCollection,
  getMedia,
  getImageSourceByThumbnail,
  getVideoSourceByPoster,
  getVideoById,
  getVideoCount,
  search,
  getSearchDiagnostics,
  optimizeDatabase,
  getHighlightCandidates,
  getUserMarks,
  upsertUserMark,
  deleteUserMark,
  insertAccessLog,
  importAccessLogs,
  getAccessLogsPage,
  deleteAccessLogsBefore,
  getMaintenanceState,
  upsertMaintenanceState,
  createCollectionRecycle,
  getActiveCollectionRecycle,
  getLatestCollectionRecycle,
  cancelCollectionRecycle,
  getDueCollectionRecycles,
  updateCollectionRecycle,
  getCollectionRecyclePage,
  getDuplicateHashStats,
  findImagesBySha256,
  getPerceptualHashStats,
  getMediaItemsByPerceptualIds,
  getImagesNeedingHash,
  upsertMediaHash,
  getExactDuplicateGroups,
  getMediaItemsByIds,
  getDuplicateDeletionCandidates,
  removeMediaRecords,
  getSearchIndexStatus,
  markSearchIndexStale,
};
