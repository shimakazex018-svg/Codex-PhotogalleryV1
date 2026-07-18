"use strict";

const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { phash64, PHASH_ALGORITHM, PHASH_ALGORITHM_VERSION } = require("./perceptual-hash");
const { WARNING_BYTES: warningBytes, HARD_LIMIT_BYTES: hardLimitBytes, diskLimitStatus } = require("./perceptual-limits");

function arg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const databaseFile = path.resolve(arg("database"));
const photosDir = path.resolve(arg("photos"));
const ffmpegPath = arg("ffmpeg", process.env.FFMPEG_PATH || "ffmpeg");
const maxItems = Math.max(0, Number(arg("limit", "0")) || 0);
let command = "run";
let stopping = false;
process.on("message", (message) => {
  if (message?.command === "pause") command = "pause";
  if (message?.command === "resume") command = "run";
  if (message?.command === "stop") stopping = true;
});

function diskBytes() {
  return [databaseFile, `${databaseFile}-wal`, `${databaseFile}-shm`].reduce((sum, file) => {
    try { return sum + fs.statSync(file).size; } catch (error) { return sum; }
  }, 0);
}

function filePathFromSrc(src) {
  try {
    const pathname = new URL(src, "http://localhost").pathname;
    if (!pathname.startsWith("/photos/")) return "";
    const candidate = path.resolve(photosDir, decodeURIComponent(pathname.slice(8)));
    const relative = path.relative(photosDir, candidate);
    return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? candidate : "";
  } catch (error) { return ""; }
}

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function safeError(error) { return String(error?.message || error || "pHash calculation failed").replace(/[\r\n]+/g, " ").slice(0, 200); }

async function main() {
  const db = new DatabaseSync(databaseFile);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000");
  const initialBytes = diskBytes();
  const previous = db.prepare("SELECT baseline_bytes FROM perceptual_hash_state WHERE id=1").get();
  const baselineBytes = Number(previous?.baseline_bytes || initialBytes);
  const counters = { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
  const startedAt = Date.now();
  const state = db.prepare(`INSERT INTO perceptual_hash_state
    (id,algorithm,algorithm_version,status,processed,succeeded,failed,skipped,baseline_bytes,updated_at,recent_error)
    VALUES (1,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
    algorithm=excluded.algorithm,algorithm_version=excluded.algorithm_version,status=excluded.status,
    processed=excluded.processed,succeeded=excluded.succeeded,failed=excluded.failed,skipped=excluded.skipped,
    baseline_bytes=excluded.baseline_bytes,updated_at=excluded.updated_at,recent_error=excluded.recent_error`);
  const upsertReady = db.prepare(`INSERT INTO media_perceptual_hashes(media_id,hash64,source_size,source_mtime,computed_at,status,error_code)
    VALUES(?,?,?,?,?,1,NULL) ON CONFLICT(media_id) DO UPDATE SET hash64=excluded.hash64,source_size=excluded.source_size,
    source_mtime=excluded.source_mtime,computed_at=excluded.computed_at,status=1,error_code=NULL`);
  const upsertError = db.prepare(`INSERT INTO media_perceptual_hashes(media_id,hash64,source_size,source_mtime,computed_at,status,error_code)
    VALUES(?,NULL,?,?,?,2,?) ON CONFLICT(media_id) DO UPDATE SET hash64=NULL,source_size=excluded.source_size,
    source_mtime=excluded.source_mtime,computed_at=excluded.computed_at,status=2,error_code=excluded.error_code`);
  const rows = db.prepare(`SELECT m.id,m.src,COALESCE(m.size,0) AS size,COALESCE(m.mtime,0) AS mtime
    FROM media m LEFT JOIN media_perceptual_hashes p ON p.media_id=m.id
    WHERE m.type='image' AND (p.media_id IS NULL OR p.source_size!=COALESCE(m.size,0) OR p.source_mtime!=COALESCE(m.mtime,0) OR p.status!=1)
    ORDER BY m.id`).iterate();
  const pendingAtStart = Number(db.prepare(`SELECT COUNT(*) AS count FROM media m LEFT JOIN media_perceptual_hashes p ON p.media_id=m.id
    WHERE m.type='image' AND (p.media_id IS NULL OR p.source_size!=COALESCE(m.size,0) OR p.source_mtime!=COALESCE(m.mtime,0) OR p.status!=1)`).get().count || 0);
  let recentError = "";
  const publish = (status, current = "") => {
    state.run(PHASH_ALGORITHM, PHASH_ALGORITHM_VERSION, status, counters.processed, counters.succeeded, counters.failed, counters.skipped, baselineBytes, Date.now(), recentError);
    const bytesAdded = Math.max(0, diskBytes() - baselineBytes);
    const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.001);
    const imagesPerSecond = counters.processed / elapsedSeconds;
    const remaining = Math.max(0, pendingAtStart - counters.processed);
    process.send?.({ type: "status", status: { status, ...counters, current, bytesAdded, limitBytes: hardLimitBytes,
      imagesPerSecond, estimatedRemainingSeconds: imagesPerSecond ? remaining / imagesPerSecond : null, pendingAtStart, recentError } });
    return bytesAdded;
  };
  publish("running");
  for (const row of rows) {
    if (stopping || (maxItems && counters.processed >= maxItems)) break;
    while (command === "pause" && !stopping) { publish("paused"); await wait(250); }
    const beforeBytes = Math.max(0, diskBytes() - baselineBytes);
    const limitStatus = diskLimitStatus(beforeBytes);
    if (limitStatus === "hard_stop") { recentError = "相似图片索引已达到512 MiB硬盘增量限制，任务已停止。"; stopping = true; break; }
    if (limitStatus === "pause") { recentError = "相似图片索引已接近512 MiB硬盘增量限制，任务已自动暂停。"; command = "pause"; continue; }
    const filePath = filePathFromSrc(row.src);
    const relative = filePath ? path.relative(photosDir, filePath).replace(/\\/g, "/") : "";
    try {
      if (!filePath || !fs.existsSync(filePath)) throw new Error("FILE_NOT_FOUND");
      const before = fs.statSync(filePath);
      const hash64 = await phash64({ ffmpegPath, inputPath: filePath, timeoutMs: 30000 });
      const after = fs.statSync(filePath);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error("FILE_CHANGED");
      upsertReady.run(row.id, hash64, row.size, row.mtime, Date.now());
      counters.succeeded += 1;
    } catch (error) {
      recentError = safeError(error);
      upsertError.run(row.id, row.size, row.mtime, Date.now(), 1);
      counters.failed += 1;
    }
    counters.processed += 1;
    if (counters.processed % 10 === 0) publish("running", relative);
    if (counters.processed % 25 === 0) await wait(50);
  }
  const finalStatus = stopping ? "stopped" : command === "pause" ? "paused" : "completed";
  publish(finalStatus);
  db.close();
  if (process.connected) process.disconnect();
}

main().catch((error) => {
  process.send?.({ type: "failed", error: safeError(error) });
  if (process.connected) process.disconnect();
  process.exitCode = 1;
});
