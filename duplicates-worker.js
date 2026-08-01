const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const galleryDb = require("./gallery-db");

const rootDir = __dirname;

function resolveConfiguredPath(value, fallback) {
  if (!value) return fallback;
  return path.isAbsolute(value) ? value : path.resolve(rootDir, value);
}

const photosDir = resolveConfiguredPath(process.env.PHOTOS_DIR, path.join(rootDir, "photos"));
const dataDir = resolveConfiguredPath(process.env.DATA_DIR, path.join(rootDir, "data"));
const galleryDbFile = path.join(dataDir, "gallery.db");

function isInsideDir(parentDir, childPath) {
  const relative = path.relative(parentDir, childPath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function mediaSrcToPath(src) {
  try {
    const sourceUrl = new URL(src, "http://localhost");
    const decodedPath = decodeURIComponent(sourceUrl.pathname);
    if (!decodedPath.startsWith("/photos/")) return "";
    const filePath = path.normalize(path.join(photosDir, decodedPath.replace(/^\/photos\/?/, "")));
    return isInsideDir(photosDir, filePath) ? filePath : "";
  } catch (error) {
    return "";
  }
}

function sha256File(filePath, heartbeat) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    const timer = setInterval(() => heartbeat?.(), 3000);
    const finish = (callback, value) => {
      clearInterval(timer);
      callback(value);
    };
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", (error) => finish(reject, error));
    stream.on("end", () => finish(resolve, hash.digest("hex")));
  });
}

let stopRequested = false;
let lastProgressAt = 0;
let lastProgressProcessed = 0;
const testDelayMs = process.env.NODE_ENV === "test" ? Math.min(Math.max(Number(process.env.DUPLICATE_TEST_FILE_DELAY_MS || 0), 0), 1000) : 0;

function send(type, payload = {}) {
  if (typeof process.send === "function") process.send({ type, payload });
  else process.stdout.write(`${JSON.stringify({ type, ...payload })}\n`);
}

function emitProgress(progress, force = false) {
  const now = Date.now();
  if (!force && progress.processedFiles - lastProgressProcessed < 100 && now - lastProgressAt < 500) return;
  lastProgressAt = now;
  lastProgressProcessed = progress.processedFiles;
  send("duplicate-scan-progress", progress);
}

function delayForTest() {
  return testDelayMs ? new Promise((resolve) => setTimeout(resolve, testDelayMs)) : Promise.resolve();
}

process.on("message", (message) => {
  if (message?.type === "duplicate-scan-stop") stopRequested = true;
});

function markHashFailure(item, reason) {
  galleryDb.upsertMediaHash(galleryDbFile, {
    mediaId: item.id,
    collectionId: item.collectionId,
    fileSize: item.size || 0,
    mtime: item.mtime || 0,
    sha256: "",
    width: item.width || null,
    height: item.height || null,
    metadata: {
      file: item.file || "",
      title: item.title || "",
      collectionTitle: item.collectionTitle || "",
      hashError: reason || "unknown error",
    },
  });
}

async function run() {
  const batchSize = Math.min(Math.max(Number(process.env.DUPLICATE_BATCH_SIZE || 100), 1), 1000);
  // A user-triggered duplicate scan is a fresh SHA-256 inventory. Re-hashing
  // all current images prevents an earlier failure record from excluding an
  // unchanged file from later duplicate grouping.
  const scanStartedAt = process.env.DUPLICATE_SCAN_STARTED_AT || "";
  const initialStats = galleryDb.getDuplicateHashStats(galleryDbFile);
  const progress = {
    phase: "enumerating",
    totalFiles: Number(initialStats.imageCount || 0),
    processedFiles: 0,
    successFiles: 0,
    failedFiles: 0,
    committedFiles: 0,
    processedBytes: 0,
    currentPath: "",
    currentDirectory: "",
    recentErrors: [],
  };
  send("duplicate-scan-phase", progress);
  progress.phase = "hashing";
  send("duplicate-scan-phase", progress);

  for (;;) {
    if (stopRequested) break;
    const batch = galleryDb.getImagesNeedingHash(galleryDbFile, batchSize, { scanStartedAt });
    if (!batch.length) break;

    for (const item of batch) {
      if (stopRequested) break;
      const filePath = mediaSrcToPath(item.src || "");
      progress.currentPath = filePath || item.file || item.title || item.src || "";
      progress.currentDirectory = filePath ? path.dirname(filePath) : "";
      try {
        if (!filePath || !fs.existsSync(filePath)) {
          progress.failedFiles += 1;
          markHashFailure(item, "file not found");
          progress.committedFiles += 1;
          progress.processedFiles += 1;
          progress.recentErrors.push({ time: new Date().toISOString(), path: progress.currentPath, code: "ENOENT", message: "扫描过程中该文件不存在" });
          continue;
        }
        try { progress.processedBytes += fs.statSync(filePath).size || 0; } catch {}
        const sha256 = await sha256File(filePath, () => emitProgress(progress, true));
        galleryDb.upsertMediaHash(galleryDbFile, {
          mediaId: item.id,
          collectionId: item.collectionId,
          fileSize: item.size || 0,
          mtime: item.mtime || 0,
          sha256,
          width: item.width || null,
          height: item.height || null,
          metadata: {
            file: item.file || "",
            title: item.title || "",
            collectionTitle: item.collectionTitle || "",
          },
        });
        progress.processedFiles += 1;
        progress.successFiles += 1;
        progress.committedFiles += 1;
      } catch (error) {
        progress.failedFiles += 1;
        progress.recentErrors.push({ time: new Date().toISOString(), path: progress.currentPath, code: error.code || "HASH_FAILED", message: error.message || String(error) });
        try {
          markHashFailure(item, error.message);
          progress.processedFiles += 1;
          progress.committedFiles += 1;
        } catch (markError) {
          progress.recentErrors.push({ time: new Date().toISOString(), path: progress.currentPath, code: markError.code || "COMMIT_FAILED", message: markError.message || String(markError) });
        }
      }
      progress.recentErrors = progress.recentErrors.slice(-20);
      emitProgress(progress);
      await delayForTest();
    }
  }

  if (stopRequested) {
    send("duplicate-scan-cancelled", { ...progress, phase: "stopping" });
    if (process.connected) process.disconnect();
    return;
  }
  progress.phase = "grouping";
  send("duplicate-scan-phase", progress);
  const stats = galleryDb.getDuplicateHashStats(galleryDbFile);
  send("duplicate-scan-result", { ...progress, phase: "completed", stats });
  if (process.connected) process.disconnect();
}

run().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
