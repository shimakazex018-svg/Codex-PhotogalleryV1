const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");
const readline = require("readline");
const galleryDb = require("./gallery-db");
const videoCompatibilityManager = require("./video-compatibility-manager");
const perceptualManager = require("./perceptual-manager");
const { phash64, similarityPercent } = require("./perceptual-hash");
const { createAdminAuthorizer } = require("./admin-auth");
const { imageExtensions, videoExtensions, isMediaExtension } = require("./media-types");
const { dailyDue, nextDailyTime } = require("./maintenance-schedule");

const rootDir = __dirname;

function resolveConfiguredPath(value, fallback) {
  if (!value) return fallback;
  return path.isAbsolute(value) ? value : path.resolve(rootDir, value);
}

const photosDir = resolveConfiguredPath(process.env.PHOTOS_DIR, path.join(rootDir, "photos"));
const dataDir = resolveConfiguredPath(process.env.DATA_DIR, path.join(rootDir, "data"));
const thumbnailsDir = resolveConfiguredPath(process.env.THUMBNAILS_DIR, path.join(dataDir, "video-thumbnails"));
const imageThumbnailsDir = path.join(dataDir, "thumbnails");
const imagePreviewDir = resolveConfiguredPath(process.env.IMAGE_PREVIEW_DIR, path.join(dataDir, "image-previews"));
const hlsDir = resolveConfiguredPath(process.env.HLS_DIR, path.join(dataDir, "hls"));
const highlightDir = path.join(dataDir, "highlight-carousel");
const legacyCompatibleVideoCollectionId = "利世/【女神 推荐】火爆高颜值网红美女【利世】承接原味业务私人定制甄选 透纱情趣套 露奶露逼露唇 高清720P版/看球";
const trashDir = resolveConfiguredPath(process.env.TRASH_DIR, path.join(path.dirname(photosDir), "回收站"));
const logsDir = path.join(dataDir, "logs");
const galleryFile = path.join(dataDir, "gallery.json");
const galleryDbFile = path.join(dataDir, "gallery.db");
const highlightFile = path.join(dataDir, "highlight-carousel.json");
const videoMetadataFile = path.join(dataDir, "video-metadata.json");
const videoCompatibilityReportFile = path.join(dataDir, "video-compatibility-report.json");
const port = Number(process.env.PORT || 48101);
const host = process.env.HOST || "0.0.0.0";
const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";
const ffprobePath = process.env.FFPROBE_PATH || (path.basename(ffmpegPath).toLowerCase().startsWith("ffmpeg") ? path.join(path.dirname(ffmpegPath), process.platform === "win32" ? "ffprobe.exe" : "ffprobe") : "ffprobe");
const remoteAdminEnabled = /^(1|true)$/i.test(process.env.REMOTE_ADMIN_ENABLED || "");
const remoteAdminCidrs = process.env.REMOTE_ADMIN_CIDRS || "";
const remoteAdminOrigins = process.env.REMOTE_ADMIN_ORIGINS || `http://127.0.0.1:${port},http://localhost:${port}`;
const adminAuthorizer = createAdminAuthorizer({ enabled: remoteAdminEnabled, cidrs: remoteAdminCidrs, origins: remoteAdminOrigins });
const dailyIndexScanEnabled = /^(1|true)$/i.test(process.env.DAILY_INDEX_SCAN_ENABLED || "");
const dailyIndexScanHour = Math.min(Math.max(Number(process.env.DAILY_INDEX_SCAN_HOUR) || 4, 0), 23);
const dailyIndexScanMinute = Math.min(Math.max(Number(process.env.DAILY_INDEX_SCAN_MINUTE) || 0, 0), 59);
const collectionRecycleTestIntervalMs = process.env.NODE_ENV === "test" ? Math.max(Number(process.env.COLLECTION_RECYCLE_TEST_INTERVAL_MS) || 0, 0) : 0;
const enableImageThumbnailGeneration = process.env.ENABLE_IMAGE_THUMBNAIL_GENERATION === "1" || process.env.ENABLE_IMAGE_THUMBNAIL_GENERATION === "true";
const enableImagePreviewGeneration = process.env.ENABLE_IMAGE_PREVIEW_GENERATION !== "0" && process.env.ENABLE_IMAGE_PREVIEW_GENERATION !== "false";
const searchPerfLoggingEnabled = process.env.SEARCH_PERF_LOG === "1" || process.env.SEARCH_PERF_LOG === "true";
const searchBackendMode = process.env.SEARCH_BACKEND_MODE || "auto";
const imageHashLookupMaxBytes = Math.max(1, Number(process.env.IMAGE_HASH_LOOKUP_MAX_BYTES) || 200 * 1024 * 1024);
const imageHashLookupTempDir = path.join(dataDir, "image-hash-lookup-temp");
const imagePreviewMaxEdge = Math.min(Math.max(Number(process.env.IMAGE_PREVIEW_MAX_EDGE) || 768, 320), 1600);
const imagePreviewQuality = Math.min(Math.max(Number(process.env.IMAGE_PREVIEW_QUALITY) || 78, 40), 95);
const duplicateRecycleLimit = 50000;
const videoPosterSources = new Map();
const imageThumbnailSources = new Map();
const imagePreviewJobs = new Map();
let imagePreviewQueue = Promise.resolve();
let activeCompatibleVideoStream = null;
let imageHashLookupActive = false;
const videoPlaybackEventKeys = new Map();
let videoMetadataCache = null;
let videoMetadataDirty = false;
let videoMetadataProbeStartedAt = 0;
const videoMetadataProbeBudgetMs = 10000;
const videoMetadataProbeTimeoutMs = 5000;
const videoCompatibility = videoCompatibilityManager.createManager({
  databaseFile: galleryDbFile,
  photosDir,
  reportFile: videoCompatibilityReportFile,
  workerFile: path.join(rootDir, "video-compatibility-worker.js"),
  ffprobePath,
  ffmpegPath,
  videoCount: () => galleryDb.getVideoCount(galleryDbFile),
  log: logEvent,
});
const perceptualIndex = perceptualManager.createManager({
  databaseFile: galleryDbFile,
  photosDir,
  ffmpegPath,
  workerFile: path.join(rootDir, "perceptual-index-worker.js"),
  queryWorkerFile: path.join(rootDir, "perceptual-query-worker.js"),
  stats: () => galleryDb.getPerceptualHashStats(galleryDbFile),
});

const staticAssetExtensions = new Set([".css", ".js"]);
const oneWeekSeconds = 7 * 24 * 60 * 60;
const highlightSelectionVersion = 3;
const maxHighlightDimensionReads = 360;
const globalScanStatePath = "__photos_global__";
let scanTask = {
  id: "",
  status: "idle",
  startedAt: "",
  finishedAt: "",
  scannedDirectories: 0,
  processedFiles: 0,
  currentDirectory: "",
  errorCount: 0,
  errorMessage: "",
  result: null,
};
let scanTaskChild = null;
let scanCompletionCallbacks = [];
let collectionRecycleRunning = false;
let hourlyCollectionRecycleTimer = null;
let dailyIndexScanTimer = null;
let duplicateTask = {
  id: "",
  status: "idle",
  startedAt: "",
  finishedAt: "",
  processed: 0,
  errorCount: 0,
  currentFile: "",
  errorMessage: "",
  result: null,
  stats: null,
};
let duplicateTaskChild = null;
let duplicateRecycleRunning = false;
let mediaCleanupTask = {
  id: "",
  status: "idle",
  startedAt: "",
  finishedAt: "",
  errorMessage: "",
  summary: null,
  restored: false,
};
let mediaCleanupChild = null;
const mediaCleanupWorkerPath = path.join(rootDir, "scripts", "media-library-cleanup-worker.ps1");
const mediaCleanupPageSizeMax = 200;
const mediaCleanupOffsetMax = 50000;
const mediaCleanupAllowedRecycleJobId = process.env.MEDIA_CLEANUP_ALLOWED_JOB_ID || "20260714-232613-22183b82";
const accessLogRetentionDays = 365;
const accessLogMaintenanceIntervalMs = 24 * 60 * 60 * 1000;
let accessLogInitialization = Promise.resolve();

function ensureFolders() {
  fs.mkdirSync(photosDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(thumbnailsDir, { recursive: true });
  fs.mkdirSync(imagePreviewDir, { recursive: true });
  fs.mkdirSync(imageThumbnailsDir, { recursive: true });
  fs.mkdirSync(hlsDir, { recursive: true });
  fs.mkdirSync(highlightDir, { recursive: true });
  fs.mkdirSync(imageHashLookupTempDir, { recursive: true });
  fs.mkdirSync(trashDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });
}

function safeDuplicateStats() {
  try {
    return fs.existsSync(galleryDbFile) ? galleryDb.getDuplicateHashStats(galleryDbFile) : null;
  } catch (error) {
    return { error: error.message };
  }
}

function cleanupOldLogs(maxAgeDays = 14) {
  try {
    if (!fs.existsSync(logsDir)) return;
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    for (const entry of fs.readdirSync(logsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".log") || /^access-\d{4}-\d{2}-\d{2}\.log$/.test(entry.name)) continue;
      const logPath = path.join(logsDir, entry.name);
      const stats = fs.statSync(logPath);
      if (stats.mtimeMs < cutoff) fs.rmSync(logPath, { force: true });
    }
  } catch (error) {
    // Logging must never break the gallery server.
  }
}

function logEvent(event, details = {}) {
  try {
    fs.mkdirSync(logsDir, { recursive: true });
    cleanupOldLogs();
    const day = new Date().toISOString().slice(0, 10);
    const line = JSON.stringify({ time: new Date().toISOString(), event, ...details });
    fs.appendFileSync(path.join(logsDir, `${day}.log`), `${line}\n`, "utf8");
  } catch (error) {
    // Ignore logging failures to keep user-facing actions working.
  }
}

function clientAddress(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || request.socket.remoteAddress || "";
}

function appendAccessLog(request, entry) {
  const now = new Date();
  const payload = {
    time: now.toISOString(),
    ip: clientAddress(request),
    host: request.headers.host || "",
    userAgent: request.headers["user-agent"] || "",
    type: String(entry.type || ""),
    title: String(entry.title || ""),
    model: String(entry.model || ""),
    work: String(entry.work || ""),
    hash: String(entry.hash || ""),
    pathParts: Array.isArray(entry.pathParts) ? entry.pathParts.map((part) => String(part || "")) : [],
  };
  return galleryDb.insertAccessLog(galleryDbFile, payload);
}

function appendOperationLog(entry) {
  return galleryDb.insertAccessLog(galleryDbFile, { time: new Date().toISOString(), ip: entry.ip || "", host: "", userAgent: "", type: entry.type,
    title: entry.title || "", model: entry.model || "", work: entry.work || "", hash: entry.hash || "", pathParts: entry.pathParts || [] });
}

async function importLegacyAccessLogs() {
  if (!fs.existsSync(logsDir)) return { imported: 0, malformed: 0 };
  const cutoffMs = Date.now() - accessLogRetentionDays * 24 * 60 * 60 * 1000;
  const files = fs
    .readdirSync(logsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^access-\d{4}-\d{2}-\d{2}\.log$/.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  let imported = 0;
  let malformed = 0;
  for (const entry of files) {
    const filePath = path.join(logsDir, entry.name);
    const reader = readline.createInterface({ input: fs.createReadStream(filePath, { encoding: "utf8" }), crlfDelay: Infinity });
    let batch = [];
    let lineNumber = 0;
    for await (const rawLine of reader) {
      lineNumber += 1;
      const line = rawLine.replace(/^\uFEFF/, "").trim();
      if (!line) continue;
      try {
        const payload = JSON.parse(line);
        const timeMs = Date.parse(payload.time || "");
        if (Number.isNaN(timeMs)) {
          malformed += 1;
          continue;
        }
        if (timeMs < cutoffMs) continue;
        batch.push({
          ...payload,
          sourceKey: crypto.createHash("sha256").update(`${entry.name}\0${lineNumber}\0${line}`).digest("hex"),
        });
      } catch (error) {
        malformed += 1;
      }
      if (batch.length >= 250) {
        imported += galleryDb.importAccessLogs(galleryDbFile, batch).imported;
        batch = [];
      }
    }
    if (batch.length) imported += galleryDb.importAccessLogs(galleryDbFile, batch).imported;
  }
  return { imported, malformed };
}

function cleanupExpiredAccessLogs() {
  const cutoff = new Date(Date.now() - accessLogRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  return galleryDb.deleteAccessLogsBefore(galleryDbFile, cutoff);
}

async function initializeAccessLogStorage() {
  try {
    const migration = await importLegacyAccessLogs();
    if (migration.imported || migration.malformed) logEvent("access-log-migration", migration);
  } catch (error) {
    console.error("Access log migration failed:", error);
    logEvent("access-log-migration-failed", { error: error.message });
  }
  try {
    const cleanup = cleanupExpiredAccessLogs();
    if (cleanup.deleted) logEvent("access-log-cleanup", { ...cleanup, retentionDays: accessLogRetentionDays });
  } catch (error) {
    console.error("Access log cleanup failed:", error);
    logEvent("access-log-cleanup-failed", { error: error.message, retentionDays: accessLogRetentionDays });
  }
}

function scheduleAccessLogMaintenance() {
  accessLogInitialization = initializeAccessLogStorage();
  const timer = setInterval(() => {
    try {
      const cleanup = cleanupExpiredAccessLogs();
      if (cleanup.deleted) logEvent("access-log-cleanup", { ...cleanup, retentionDays: accessLogRetentionDays });
    } catch (error) {
      console.error("Access log cleanup failed:", error);
      logEvent("access-log-cleanup-failed", { error: error.message, retentionDays: accessLogRetentionDays });
    }
  }, accessLogMaintenanceIntervalMs);
  timer.unref();
}

function hasExtension(fileName, extensions) {
  return extensions.has(path.extname(fileName).toLowerCase());
}

function isImage(fileName) {
  return hasExtension(fileName, imageExtensions);
}

function isVideo(fileName) {
  return hasExtension(fileName, videoExtensions);
}

function toUrl(filePath) {
  const relative = path.relative(photosDir, filePath).split(path.sep).map(encodeURIComponent).join("/");
  return `/photos/${relative}`;
}

function toHighlightUrl(filePath) {
  const relative = path.relative(highlightDir, filePath).split(path.sep).map(encodeURIComponent).join("/");
  return `/highlight-carousel/${relative}`;
}

function readJpegDimensions(buffer) {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return null;
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return {
        width: buffer.readUInt16BE(offset + 7),
        height: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += 2 + length;
  }
  return null;
}

function readImageDimensions(filePath) {
  let fd = null;
  try {
    fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(128 * 1024);
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
    const header = buffer.subarray(0, bytesRead);
    if (header.length >= 24 && header.toString("ascii", 1, 4) === "PNG") {
      return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
    }
    if (header.length >= 10 && header[0] === 0xff && header[1] === 0xd8) {
      return readJpegDimensions(header);
    }
    if (header.length >= 10 && header.toString("ascii", 0, 3) === "GIF") {
      return { width: header.readUInt16LE(6), height: header.readUInt16LE(8) };
    }
    if (header.length >= 30 && header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WEBP") {
      const type = header.toString("ascii", 12, 16);
      if (type === "VP8X") return { width: 1 + header.readUIntLE(24, 3), height: 1 + header.readUIntLE(27, 3) };
      if (type === "VP8 " && header.length >= 30) return { width: header.readUInt16LE(26) & 0x3fff, height: header.readUInt16LE(28) & 0x3fff };
      if (type === "VP8L" && header.length >= 25) {
        const bits = header.readUInt32LE(21);
        return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
      }
    }
  } catch (error) {
    return null;
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
  return null;
}

function isInsideDir(parentDir, childPath) {
  const relative = path.relative(parentDir, childPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function titleFromName(name) {
  return name.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function readVisibleDirectories(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))
    .map((entry) => entry.name);
}

function computeDirectorySignature(dir) {
  const hash = crypto.createHash("sha1");
  const summary = {
    path: globalScanStatePath,
    kind: "photos-global",
    mtime: 0,
    fileCount: 0,
    dirCount: 0,
    signature: "",
    lastScannedAt: new Date().toISOString(),
  };

  function visit(currentDir) {
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true }).filter((entry) => !entry.name.startsWith(".")).sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN", { numeric: true }));
    } catch (error) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      let stats = null;
      try {
        stats = fs.statSync(fullPath);
      } catch (error) {
        continue;
      }
      const relative = path.relative(photosDir, fullPath);
      summary.mtime = Math.max(summary.mtime, stats.mtimeMs || 0);
      if (entry.isDirectory()) {
        summary.dirCount += 1;
        hash.update(`d\0${relative}\0${Math.round(stats.mtimeMs || 0)}\n`);
        visit(fullPath);
      } else if (entry.isFile()) {
        summary.fileCount += 1;
        hash.update(`f\0${relative}\0${stats.size}\0${Math.round(stats.mtimeMs || 0)}\n`);
      }
    }
  }

  visit(dir);
  summary.signature = hash.digest("hex");
  return summary;
}

function computeImmediateDirectoryState(dir) {
  const hash = crypto.createHash("sha1");
  const summary = {
    path: path.relative(photosDir, dir) || ".",
    mtime: 0,
    fileCount: 0,
    dirCount: 0,
    signature: "",
  };
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => !entry.name.startsWith(".")).sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN", { numeric: true }));
  } catch (error) {
    return summary;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    let stats = null;
    try {
      stats = fs.statSync(fullPath);
    } catch (error) {
      continue;
    }
    summary.mtime = Math.max(summary.mtime, stats.mtimeMs || 0);
    if (entry.isDirectory()) {
      summary.dirCount += 1;
      hash.update(`d\0${entry.name}\0${Math.round(stats.mtimeMs || 0)}\n`);
    } else if (entry.isFile()) {
      summary.fileCount += 1;
      hash.update(`f\0${entry.name}\0${stats.size}\0${Math.round(stats.mtimeMs || 0)}\n`);
    }
  }
  summary.signature = hash.digest("hex");
  return summary;
}

function collectDirectoryStates(baseDir) {
  const states = [];
  function visit(dir) {
    states.push(computeImmediateDirectoryState(dir));
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.name.startsWith("."));
    } catch (error) {
      return;
    }
    for (const entry of entries) visit(path.join(dir, entry.name));
  }
  visit(baseDir);
  return states;
}

function registerVideoPoster(filePath) {
  const stats = fs.statSync(filePath);
  const id = crypto
    .createHash("sha1")
    .update(`${filePath}|${stats.size}|${stats.mtimeMs}`)
    .digest("hex");
  videoPosterSources.set(id, filePath);
  return `/video-posters/${id}.jpg`;
}

function videoMetadataKey(filePath, stats = fs.statSync(filePath)) {
  return crypto
    .createHash("sha1")
    .update(`${filePath}|${stats.size}|${stats.mtimeMs}`)
    .digest("hex");
}

function loadVideoMetadataCache() {
  if (videoMetadataCache) return videoMetadataCache;
  try {
    const parsed = JSON.parse(fs.readFileSync(videoMetadataFile, "utf8"));
    videoMetadataCache = parsed && typeof parsed.items === "object" ? parsed.items : {};
  } catch (error) {
    videoMetadataCache = {};
  }
  return videoMetadataCache;
}

function saveVideoMetadataCache() {
  if (!videoMetadataDirty || !videoMetadataCache) return;
  fs.writeFileSync(videoMetadataFile, JSON.stringify({ generatedAt: new Date().toISOString(), items: videoMetadataCache }, null, 2), "utf8");
  videoMetadataDirty = false;
}

function readVideoMetadata(filePath, stats = fs.statSync(filePath)) {
  const key = videoMetadataKey(filePath, stats);
  const cache = loadVideoMetadataCache();
  if (cache[key]) return cache[key];
  if (!videoMetadataProbeStartedAt || Date.now() - videoMetadataProbeStartedAt > videoMetadataProbeBudgetMs) return null;

  const result = spawnSync(
    ffprobePath,
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "format=duration:stream=width,height,codec_name", "-of", "json", filePath],
    { encoding: "utf8", timeout: videoMetadataProbeTimeoutMs, windowsHide: true },
  );

  if (result.status !== 0 || !result.stdout) return null;

  try {
    const parsed = JSON.parse(result.stdout);
    const stream = (parsed.streams || [])[0] || {};
    const duration = Number(parsed.format?.duration || 0);
    const metadata = {
      duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
      width: Number(stream.width || 0),
      height: Number(stream.height || 0),
      codec: stream.codec_name || "",
    };
    cache[key] = metadata;
    videoMetadataDirty = true;
    return metadata;
  } catch (error) {
    return null;
  }
}

function registerImageThumbnail(filePath, width) {
  const stats = fs.statSync(filePath);
  const id = crypto
    .createHash("sha1")
    .update(`${filePath}|${stats.size}|${stats.mtimeMs}|${width}`)
    .digest("hex");
  imageThumbnailSources.set(`${width}/${id}`, filePath);
  return `/image-thumbnails/${width}/${id}.jpg`;
}

function mediaSrcToFilePath(src) {
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

function imagePreviewDescriptor(src) {
  let sourceUrl = src;
  try {
    const pathname = new URL(src, "http://localhost").pathname;
    if (pathname.startsWith("/image-thumbnails/")) {
      sourceUrl = galleryDb.getImageSourceByThumbnail(galleryDbFile, pathname) || "";
    }
  } catch (error) {
    sourceUrl = "";
  }
  const sourcePath = mediaSrcToFilePath(sourceUrl);
  if (!sourcePath || !fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile() || !isImage(sourcePath)) return null;
  const stats = fs.statSync(sourcePath);
  const key = crypto
    .createHash("sha256")
    .update(`${path.normalize(sourcePath)}|${stats.size}|${stats.mtimeMs}|${imagePreviewMaxEdge}|webp|${imagePreviewQuality}`)
    .digest("hex");
  return { sourcePath, key, filePath: path.join(imagePreviewDir, `${key}.webp`) };
}

function imagePreviewApiUrl(src) {
  return `/api/image-preview?url=${encodeURIComponent(src)}`;
}

function generateImagePreview(descriptor) {
  if (fs.existsSync(descriptor.filePath)) return Promise.resolve(descriptor);
  if (!enableImagePreviewGeneration) return Promise.reject(new Error("Image preview generation is disabled"));
  if (imagePreviewJobs.has(descriptor.key)) return imagePreviewJobs.get(descriptor.key);

  const job = (imagePreviewQueue = imagePreviewQueue.catch(() => {}).then(() => new Promise((resolve, reject) => {
    if (fs.existsSync(descriptor.filePath)) {
      resolve(descriptor);
      return;
    }
    fs.mkdirSync(imagePreviewDir, { recursive: true });
    const temporaryPath = `${descriptor.filePath}.${process.pid}.${Date.now()}.tmp.webp`;
    const child = spawn(ffmpegPath, [
      "-y", "-i", descriptor.sourcePath,
      "-vf", `scale='min(${imagePreviewMaxEdge},iw)':'min(${imagePreviewMaxEdge},ih)':force_original_aspect_ratio=decrease`,
      "-frames:v", "1", "-c:v", "libwebp", "-quality", String(imagePreviewQuality), temporaryPath,
    ], { windowsHide: true, stdio: "ignore" });
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (error) {
        fs.rm(temporaryPath, { force: true }, () => {});
        reject(error);
        return;
      }
      fs.rename(temporaryPath, descriptor.filePath, (renameError) => renameError ? reject(renameError) : resolve(descriptor));
    };
    child.once("error", finish);
    child.once("exit", (code) => finish(code === 0 ? null : new Error(`FFmpeg preview exited with code ${code}`)));
  })));
  imagePreviewJobs.set(descriptor.key, job);
  job.finally(() => imagePreviewJobs.delete(descriptor.key)).catch(() => {});
  return job;
}

function resolveImageThumbnailSource(width, id) {
  const cacheKey = `${width}/${id}`;
  const cached = imageThumbnailSources.get(cacheKey);
  if (cached) return cached;

  try {
    const sourceUrl = galleryDb.getImageSourceByThumbnail(galleryDbFile, `/image-thumbnails/${width}/${id}.jpg`);
    const sourcePath = mediaSrcToFilePath(sourceUrl || "");
    if (sourcePath && fs.existsSync(sourcePath)) {
      imageThumbnailSources.set(cacheKey, sourcePath);
      return sourcePath;
    }
  } catch (error) {
    logEvent("thumbnail_source_lookup_failed", { width, id, error: error.message });
  }

  return "";
}

function resolveVideoPosterSource(id) {
  const cached = videoPosterSources.get(id);
  if (cached) return cached;

  try {
    const sourceUrl = galleryDb.getVideoSourceByPoster(galleryDbFile, `/video-posters/${id}.jpg`);
    const sourcePath = mediaSrcToFilePath(sourceUrl || "");
    if (sourcePath && fs.existsSync(sourcePath)) {
      videoPosterSources.set(id, sourcePath);
      return sourcePath;
    }
  } catch (error) {
    logEvent("poster_source_lookup_failed", { id, error: error.message });
  }

  return "";
}

function decorateImage(media, filePath) {
  return {
    ...media,
    thumb: registerImageThumbnail(filePath, 480),
    previewThumb: registerImageThumbnail(filePath, 720),
    carouselThumb: registerImageThumbnail(filePath, 960),
  };
}

function readMedia(dir, matcher, decorate = null) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && matcher(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "zh-Hans-CN", { numeric: true }))
    .map((name) => {
      const filePath = path.join(dir, name);
      const stats = fs.statSync(filePath);
      const media = {
        name,
        title: titleFromName(path.basename(name, path.extname(name))),
        src: toUrl(filePath),
        size: stats.size,
        mtime: stats.mtimeMs,
      };
      return decorate ? decorate(media, filePath) : media;
    });
}

function readImages(dir) {
  return readMedia(dir, isImage, decorateImage);
}

function readVideos(dir) {
  return readMedia(dir, isVideo, (video, filePath) => ({
    ...video,
    poster: registerVideoPoster(filePath),
    ...(readVideoMetadata(filePath) || {}),
  }));
}

function isCoverImage(image) {
  return path.basename(image.name, path.extname(image.name)).toLowerCase().includes("cover");
}

function pickCoverImage(images) {
  return images.find(isCoverImage);
}

function pickCover(images) {
  if (!images.length) return "";
  const cover = pickCoverImage(images);
  return (cover || images[0]).src;
}

function pickCoverThumb(images, field = "thumb") {
  if (!images.length) return "";
  const cover = pickCoverImage(images) || images[0];
  return cover[field] || cover.thumb || cover.src || "";
}

function pickNestedCoverThumb(works) {
  for (const work of works) {
    if (work.coverThumb) return work.coverThumb;
    const nestedCover = pickNestedCoverThumb(work.works || []);
    if (nestedCover) return nestedCover;
  }
  return "";
}

function orderGalleryImages(images) {
  const cover = pickCoverImage(images);
  if (!cover) return images;
  return [cover, ...images.filter((image) => image !== cover)];
}

function pickVideoCover(videos) {
  if (!videos.length) return "";
  return [...videos].sort((a, b) => (b.size || 0) - (a.size || 0))[0].poster || "";
}

function countNestedWorks(works) {
  return works.reduce((total, work) => total + 1 + countNestedWorks(work.works || []), 0);
}

function sumWorkMedia(works, key) {
  return works.reduce((total, work) => total + (work[key] || 0), 0);
}

function latestMtime(items, fallback = 0) {
  return items.reduce((latest, item) => Math.max(latest, item.mtime || 0), fallback);
}

function pickNestedCover(works) {
  for (const work of works) {
    if (work.cover) return work.cover;
    const nestedCover = pickNestedCover(work.works || []);
    if (nestedCover) return nestedCover;
  }
  return "";
}

function scanWork(parentFolders, workFolder, workDir) {
  const dirStats = fs.statSync(workDir);
  const allImages = readImages(workDir);
  const galleryImages = orderGalleryImages(allImages);
  const videos = readVideos(workDir);
  const childWorks = readVisibleDirectories(workDir).map((childFolder) => {
    const childDir = path.join(workDir, childFolder);
    return scanWork([...parentFolders, workFolder], childFolder, childDir);
  });
  const totalImageCount = galleryImages.length + sumWorkMedia(childWorks, "totalImageCount");
  const totalVideoCount = videos.length + sumWorkMedia(childWorks, "totalVideoCount");
  const mtime = latestMtime([...galleryImages, ...videos, ...childWorks], dirStats.mtimeMs);

  return {
    id: [...parentFolders, workFolder].join("/"),
    folder: workFolder,
    title: titleFromName(workFolder),
    cover: pickCover(allImages) || pickVideoCover(videos) || pickNestedCover(childWorks),
    coverThumb: pickCoverThumb(allImages) || pickVideoCover(videos) || pickNestedCoverThumb(childWorks),
    count: galleryImages.length,
    videoCount: videos.length,
    totalImageCount,
    totalVideoCount,
    mtime,
    childCount: childWorks.length,
    nestedCount: countNestedWorks(childWorks),
    images: galleryImages,
    videos,
    works: childWorks,
  };
}

function workToCollection(work, level = 2) {
  const pathParts = work.id.split("/");
  const children = (work.works || []).map((child) => workToCollection(child, level + 1));
  return {
    id: work.id,
    folder: work.folder,
    title: work.title,
    pathParts,
    level,
    images: work.images || [],
    videos: work.videos || [],
    children,
    cover: work.cover || "",
    coverThumb: work.coverThumb || "",
    imageCount: work.count || 0,
    videoCount: work.videoCount || 0,
    totalImageCount: work.totalImageCount || work.count || 0,
    totalVideoCount: work.totalVideoCount || work.videoCount || 0,
    descendantCount: children.reduce((total, child) => total + 1 + (child.descendantCount || 0), 0),
    mtime: work.mtime || 0,
  };
}

function modelToCollection(model) {
  const children = (model.works || []).map((work) => workToCollection(work, 2));
  return {
    id: model.id,
    folder: model.folder,
    title: model.name,
    pathParts: [model.id],
    level: 1,
    images: model.images || [],
    videos: model.videos || [],
    children,
    cover: model.cover || "",
    coverThumb: model.coverThumb || "",
    imageCount: model.imageCount || 0,
    videoCount: model.videoCount || 0,
    totalImageCount: model.totalImageCount || model.imageCount || 0,
    totalVideoCount: model.totalVideoCount || model.videoCount || 0,
    descendantCount: children.reduce((total, child) => total + 1 + (child.descendantCount || 0), 0),
    mtime: model.mtime || 0,
  };
}

function scanGallery() {
  ensureFolders();
  const duplicateStatsBefore = safeDuplicateStats();
  logEvent("gallery_scan_start", {
    reason: "scanGallery",
    duplicateStatsBefore,
  });
  videoMetadataProbeStartedAt = Date.now();
  const scanSignature = computeDirectorySignature(photosDir);

  const models = readVisibleDirectories(photosDir).map((modelFolder) => {
    const modelDir = path.join(photosDir, modelFolder);
    const modelStats = fs.statSync(modelDir);
    const modelImages = orderGalleryImages(readImages(modelDir));
    const modelVideos = readVideos(modelDir);
    const works = readVisibleDirectories(modelDir).map((workFolder) => {
      const workDir = path.join(modelDir, workFolder);
      return scanWork([modelFolder], workFolder, workDir);
    });
    const totalImageCount = modelImages.length + sumWorkMedia(works, "totalImageCount");
    const totalVideoCount = modelVideos.length + sumWorkMedia(works, "totalVideoCount");
    const mtime = latestMtime([...modelImages, ...modelVideos, ...works], modelStats.mtimeMs);

    return {
      id: modelFolder,
      folder: modelFolder,
      name: titleFromName(modelFolder),
      cover: pickCover(modelImages) || pickVideoCover(modelVideos) || (works.find((work) => work.cover) || {}).cover || "",
      coverThumb: pickCoverThumb(modelImages) || pickVideoCover(modelVideos) || pickNestedCoverThumb(works),
      count: works.length,
      imageCount: modelImages.length,
      videoCount: modelVideos.length,
      totalImageCount,
      totalVideoCount,
      mtime,
      nestedCount: countNestedWorks(works),
      images: modelImages,
      videos: modelVideos,
      works,
    };
  });

  const gallery = {
    generatedAt: new Date().toISOString(),
    models,
    collections: models.map(modelToCollection),
  };

  gallery.highlights = [];

  saveVideoMetadataCache();
  try {
    const indexStats = galleryDb.indexGallery(galleryDbFile, gallery);
    const duplicateStatsAfterIndex = safeDuplicateStats();
    logEvent("gallery_index_complete", {
      reason: "scanGallery",
      indexStats,
      galleryJson: "disabled",
      duplicateStatsBefore,
      duplicateStatsAfter: duplicateStatsAfterIndex,
    });
    galleryDb.upsertScanState(galleryDbFile, scanSignature);
    for (const dirState of collectDirectoryStates(photosDir)) {
      galleryDb.upsertScanState(galleryDbFile, {
        path: `dir:${dirState.path}`,
        kind: "directory",
        mtime: dirState.mtime,
        fileCount: dirState.fileCount,
        dirCount: dirState.dirCount,
        signature: dirState.signature,
        lastScannedAt: new Date().toISOString(),
      });
    }
    gallery.index = {
      type: "sqlite",
      file: galleryDbFile,
      signature: scanSignature.signature,
      ...indexStats,
    };
  } catch (error) {
    logEvent("gallery_index_failed", {
      reason: "scanGallery",
      error: error.message,
      duplicateStatsBefore,
      duplicateStatsAfter: safeDuplicateStats(),
    });
    console.error("SQLite gallery index failed:", error);
    gallery.index = {
      type: "sqlite",
      file: galleryDbFile,
      error: error.message,
    };
  }
  return gallery;
}

function startOfHour(value = new Date()) {
  const date = new Date(value);
  date.setMinutes(0, 0, 0);
  return date.toISOString();
}

function fileSafeHourKey(hourKey) {
  return hourKey.replace(/[^0-9]/g, "").slice(0, 10);
}

function hashForParts(parts) {
  return `#/${parts.map(encodeURIComponent).join("/")}`;
}

function shuffleItems(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function bestHighlightGroup(candidates) {
  const enriched = [];
  const exactGroups = new Map();
  const shuffled = shuffleItems(candidates);
  for (const candidate of shuffled) {
    if (enriched.length >= maxHighlightDimensionReads) break;
    const sourcePath = photoUrlToPath(candidate.source);
    if (!sourcePath || !fs.existsSync(sourcePath)) continue;
    const dimensions = readImageDimensions(sourcePath);
    if (!dimensions || !dimensions.width || !dimensions.height) continue;
    const item = {
      ...candidate,
      sourcePath,
      width: dimensions.width,
      height: dimensions.height,
      exactKey: `${dimensions.width}x${dimensions.height}`,
      ratioKey: String(Math.round((dimensions.width / dimensions.height) * 100)),
    };
    enriched.push(item);
    if (!exactGroups.has(item.exactKey)) exactGroups.set(item.exactKey, []);
    exactGroups.get(item.exactKey).push(item);
    if (exactGroups.get(item.exactKey).length >= 20) return exactGroups.get(item.exactKey);
  }

  const pickGroup = (keyName) => {
    const groups = new Map();
    for (const item of enriched) {
      const key = item[keyName];
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    return [...groups.values()].sort((a, b) => b.length - a.length)[0] || [];
  };

  const exactGroup = pickGroup("exactKey");
  if (exactGroup.length >= 20) return exactGroup;

  const ratioGroup = pickGroup("ratioKey");
  if (ratioGroup.length >= 20) return ratioGroup;

  return enriched;
}

function readStoredHighlights(hourKey) {
  try {
    const stored = JSON.parse(fs.readFileSync(highlightFile, "utf8"));
    const items = Array.isArray(stored.items) ? stored.items : [];
    if (stored.hourKey === hourKey && stored.version === highlightSelectionVersion) return items;
  } catch (error) {
    return null;
  }
  return null;
}

function clearHighlightFolder() {
  if (!fs.existsSync(highlightDir)) return;
  for (const entry of fs.readdirSync(highlightDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    fs.rmSync(path.join(highlightDir, entry.name), { force: true });
  }
}

function collectHighlightCandidatesFromDb() {
  return galleryDb.getHighlightCandidates(galleryDbFile, 140).map((item) => {
    const pathParts = Array.isArray(item.collectionPathParts) ? item.collectionPathParts : [];
    return {
      source: item.src,
      carouselThumb: item.carouselThumb,
      href: hashForParts(pathParts),
      title: item.collectionTitle || item.title || item.file || "",
      model: pathParts[0] || item.collectionTitle || "",
    };
  });
}

function ensureHighlightCarouselFromDb(forceRefresh = false) {
  const hourKey = startOfHour();
  const storedItems = forceRefresh ? null : readStoredHighlights(hourKey);
  if (storedItems) return storedItems;

  const selected = shuffleItems(bestHighlightGroup(collectHighlightCandidatesFromDb())).slice(0, 20);
  const items = [];

  selected.forEach((candidate) => {
    if (!imagePreviewDescriptor(candidate.source)) return;
    items.push({
      src: imagePreviewApiUrl(candidate.source),
      original: candidate.source,
      href: candidate.href,
      title: candidate.title,
      model: candidate.model,
      width: candidate.width,
      height: candidate.height,
    });
  });

  fs.writeFileSync(highlightFile, JSON.stringify({ generatedAt: new Date().toISOString(), hourKey, version: highlightSelectionVersion, source: "sqlite", items }, null, 2), "utf8");
  return items;
}

function scheduleHourlyGalleryRefresh() {
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setHours(now.getHours() + 1, 0, 0, 0);
  const delay = Math.max(1000, nextHour.getTime() - now.getTime());

  setTimeout(() => {
    try {
      logEvent("hourly_highlight_refresh_start", {});
      const items = ensureHighlightCarouselFromDb(true);
      logEvent("hourly_highlight_refresh_complete", { count: items.length });
      console.log(`Highlight carousel refreshed: ${new Date().toISOString()}`);
    } catch (error) {
      logEvent("hourly_highlight_refresh_failed", { error: error.message });
      console.error("Highlight carousel refresh failed:", error);
    }
    scheduleHourlyGalleryRefresh();
  }, delay);
}

function sendJson(response, value) {
  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

function sendText(response, status, message) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  response.end(message);
}

function sendJsonError(response, status, message) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify({ error: message }));
}

function imageLookupError(code, message, statusCode = 400, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function sendImageLookupError(response, error) {
  if (response.writableEnded || response.destroyed) return;
  const knownCodes = new Set([
    "NO_FILE", "TOO_MANY_FILES", "FILE_TOO_LARGE", "EMPTY_FILE", "UNSUPPORTED_IMAGE_TYPE",
    "INVALID_IMAGE_SIGNATURE", "UNRECOGNIZED_IMAGE_SIGNATURE", "EXTENSION_SIGNATURE_MISMATCH",
    "UNSUPPORTED_ACTUAL_IMAGE_TYPE", "UPLOAD_FAILED", "HASH_CALCULATION_FAILED", "HASH_DATABASE_UNAVAILABLE",
    "HASH_DATABASE_INCOMPLETE", "DATABASE_QUERY_FAILED", "REQUEST_ABORTED", "UPLOAD_BUSY", "INTERNAL_ERROR",
  ]);
  const code = knownCodes.has(error?.code) ? error.code : "INTERNAL_ERROR";
  const messages = {
    NO_FILE: "请选择一张图片。",
    TOO_MANY_FILES: "单次只能上传一张图片。",
    FILE_TOO_LARGE: `图片不能超过 ${Math.ceil(imageHashLookupMaxBytes / 1024 / 1024)} MB。`,
    EMPTY_FILE: "不能上传空文件。",
    UNSUPPORTED_IMAGE_TYPE: "不支持的图片格式。当前支持 JPEG、PNG、WebP、GIF 和 AVIF。",
    INVALID_IMAGE_SIGNATURE: "文件内容与图片格式不一致。",
    UNRECOGNIZED_IMAGE_SIGNATURE: "无法识别图片格式，文件可能损坏或不属于当前支持的图片类型。",
    EXTENSION_SIGNATURE_MISMATCH: "文件扩展名与实际图片格式不一致。",
    UNSUPPORTED_ACTUAL_IMAGE_TYPE: "文件的实际图片格式当前不受支持。",
    UPLOAD_FAILED: "图片上传失败。",
    HASH_CALCULATION_FAILED: "图片哈希计算失败。",
    HASH_DATABASE_UNAVAILABLE: "图片哈希数据库当前不可用。",
    HASH_DATABASE_INCOMPLETE: "图片哈希数据库尚未完整覆盖图库。",
    DATABASE_QUERY_FAILED: "图片哈希数据库查询失败。",
    REQUEST_ABORTED: "图片上传已中断。",
    UPLOAD_BUSY: "已有图片正在查询，请稍后再试。",
    INTERNAL_ERROR: "图片查询发生内部错误。",
  };
  const details = error?.details && typeof error.details === "object" ? error.details : {};
  const publicDetails = {};
  for (const key of ["declaredExtension", "declaredMime", "detectedFormat"]) {
    if (typeof details[key] === "string" && details[key]) publicDetails[key] = details[key];
  }
  response.writeHead(Number(error?.statusCode) || 500, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify({ ok: false, code, message: error?.publicMessage || messages[code], ...publicDetails }));
}

const imageFormatLabels = Object.freeze({
  jpeg: "JPEG", png: "PNG", webp: "WebP", gif: "GIF", avif: "AVIF",
  heic: "HEIC", bmp: "BMP", tiff: "TIFF", "iso-bmff": "ISO BMFF",
});
const supportedUploadImageFormats = new Set(["jpeg", "png", "webp", "gif", "avif"]);
const uploadExtensionFormats = new Map([
  ["jpg", "jpeg"], ["jpeg", "jpeg"], ["png", "png"], ["webp", "webp"], ["gif", "gif"], ["avif", "avif"],
]);
const uploadMimeFormats = new Map([
  ["image/jpeg", "jpeg"], ["image/png", "png"], ["image/webp", "webp"], ["image/gif", "gif"], ["image/avif", "avif"],
]);

function detectIsoBmffFormat(prefix) {
  if (prefix.length < 16 || prefix.toString("ascii", 4, 8) !== "ftyp") return "";
  let boxSize = prefix.readUInt32BE(0);
  let majorBrandOffset = 8;
  let compatibleBrandsOffset = 16;
  if (boxSize === 1) {
    if (prefix.length < 24) return "";
    const extendedSize = prefix.readBigUInt64BE(8);
    if (extendedSize > BigInt(Number.MAX_SAFE_INTEGER)) return "iso-bmff";
    boxSize = Number(extendedSize);
    majorBrandOffset = 16;
    compatibleBrandsOffset = 24;
  }
  if (boxSize !== 0 && boxSize < compatibleBrandsOffset) return "";
  if (prefix.length < majorBrandOffset + 4) return "";
  const availableEnd = Math.min(prefix.length, boxSize || prefix.length);
  const brands = [prefix.toString("ascii", majorBrandOffset, majorBrandOffset + 4)];
  for (let offset = compatibleBrandsOffset; offset + 4 <= availableEnd; offset += 4) {
    brands.push(prefix.toString("ascii", offset, offset + 4));
  }
  if (brands.some((brand) => brand === "avif" || brand === "avis")) return "avif";
  const heicBrands = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"]);
  if (brands.some((brand) => heicBrands.has(brand))) return "heic";
  return "iso-bmff";
}

function detectImageFormat(prefix) {
  if (prefix.length >= 3 && prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff) return "jpeg";
  if (prefix.length >= 8 && prefix.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (prefix.length >= 12 && prefix.toString("ascii", 0, 4) === "RIFF" && prefix.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (prefix.length >= 6 && ["GIF87a", "GIF89a"].includes(prefix.toString("ascii", 0, 6))) return "gif";
  if (prefix.length >= 2 && prefix.toString("ascii", 0, 2) === "BM") return "bmp";
  if (prefix.length >= 4 && (prefix.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) || prefix.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a])))) return "tiff";
  const isoBmffFormat = detectIsoBmffFormat(prefix);
  if (isoBmffFormat) return isoBmffFormat;
  return "";
}

function imageLookupDiagnostic(file, branch, detectedFormat = "") {
  const extension = path.extname(file.fileName || "").slice(1).toLowerCase();
  const mimeType = String(file.mimeType || "").split(";", 1)[0].trim().toLowerCase();
  console.warn("[image-hash-lookup-validation]", JSON.stringify({
    fileName: path.basename(String(file.fileName || "").replace(/\\/g, "/")),
    declaredExtension: extension,
    declaredMime: mimeType,
    prefixHex: file.prefix.subarray(0, 16).toString("hex").match(/.{1,2}/g)?.join(" ").toUpperCase() || "",
    detectedFormat,
    branch,
  }));
}

function validateUploadedImage(file) {
  const declaredExtension = path.extname(file.fileName || "").slice(1).toLowerCase();
  const declaredMime = String(file.mimeType || "").split(";", 1)[0].trim().toLowerCase();
  const extensionFormat = uploadExtensionFormats.get(declaredExtension) || "";
  const mimeFormat = uploadMimeFormats.get(declaredMime) || "";
  const detectedFormat = detectImageFormat(file.prefix);
  const details = { declaredExtension, declaredMime, detectedFormat };
  if (!detectedFormat) {
    imageLookupDiagnostic(file, "UNRECOGNIZED_IMAGE_SIGNATURE");
    throw imageLookupError("UNRECOGNIZED_IMAGE_SIGNATURE", "Unrecognized image signature", 415, details);
  }
  if (!supportedUploadImageFormats.has(detectedFormat)) {
    imageLookupDiagnostic(file, "UNSUPPORTED_ACTUAL_IMAGE_TYPE", detectedFormat);
    const error = imageLookupError("UNSUPPORTED_ACTUAL_IMAGE_TYPE", "Unsupported actual image type", 415, details);
    error.publicMessage = `文件实际内容识别为 ${imageFormatLabels[detectedFormat] || detectedFormat.toUpperCase()}，当前不支持该图片格式。`;
    throw error;
  }

  if (declaredExtension && extensionFormat !== detectedFormat) {
    const declaredLabel = imageFormatLabels[extensionFormat] || declaredExtension.toUpperCase();
    imageLookupDiagnostic(file, "EXTENSION_SIGNATURE_MISMATCH", detectedFormat);
    const error = imageLookupError("EXTENSION_SIGNATURE_MISMATCH", "Extension and signature mismatch", 415, details);
    error.publicMessage = `文件扩展名为 ${declaredLabel}，但实际内容识别为 ${imageFormatLabels[detectedFormat]}。`;
    throw error;
  }
  if (declaredMime && declaredMime !== "application/octet-stream" && mimeFormat !== detectedFormat) {
    imageLookupDiagnostic(file, "MIME_SIGNATURE_MISMATCH_ACCEPTED", detectedFormat);
  }
  file.detectedFormat = detectedFormat;
  file.declaredExtension = declaredExtension;
  file.declaredMime = declaredMime;
}

function decodeMultipartFilenameStar(value) {
  const match = String(value || "").match(/^([^']*)'[^']*'(.*)$/);
  if (!match || (match[1] && match[1].toLowerCase() !== "utf-8")) return "";
  try {
    return decodeURIComponent(match[2]);
  } catch (error) {
    return "";
  }
}

function readSingleMultipartImage(request) {
  return new Promise((resolve, reject) => {
    const contentType = String(request.headers["content-type"] || "");
    const boundaryMatch = contentType.match(/(?:^|;)\s*boundary=(?:"([^"]+)"|([^;\s]+))/i);
    if (!/^multipart\/form-data(?:\s*;|\s*$)/i.test(contentType) || !boundaryMatch) {
      reject(imageLookupError("NO_FILE", "multipart/form-data with one image is required"));
      request.resume();
      return;
    }
    const contentLength = Number(request.headers["content-length"] || 0);
    if (contentLength > imageHashLookupMaxBytes + 64 * 1024) {
      reject(imageLookupError("FILE_TOO_LARGE", "Image is too large", 413));
      request.resume();
      return;
    }
    const boundary = boundaryMatch[1] || boundaryMatch[2];
    const opening = Buffer.from(`--${boundary}\r\n`);
    const marker = Buffer.from(`\r\n--${boundary}`);
    const headerEnd = Buffer.from("\r\n\r\n");
    let hash;
    const tempPath = path.join(imageHashLookupTempDir, `${crypto.randomUUID()}.upload`);
    let tempFd = null;
    try {
      hash = crypto.createHash("sha256");
      tempFd = fs.openSync(tempPath, "wx");
    } catch (error) {
      try { if (tempFd !== null) fs.closeSync(tempFd); } catch (closeError) {}
      try { fs.rmSync(tempPath, { force: true }); } catch (removeError) {}
      reject(imageLookupError("UPLOAD_FAILED", error.message, 500));
      request.resume();
      return;
    }
    let pending = Buffer.alloc(0);
    let headersParsed = false;
    let finished = false;
    let fileName = "";
    let mimeType = "";
    let size = 0;
    let prefix = Buffer.alloc(0);

    function fail(error) {
      if (finished) return;
      finished = true;
      try { if (tempFd !== null) fs.closeSync(tempFd); } catch (closeError) {}
      tempFd = null;
      try { fs.rmSync(tempPath, { force: true }); } catch (removeError) {}
      reject(error);
    }

    function consumeFileBytes(bytes) {
      if (!bytes.length || finished) return;
      size += bytes.length;
      if (size > imageHashLookupMaxBytes) {
        fail(imageLookupError("FILE_TOO_LARGE", "Image is too large", 413));
        return;
      }
      if (prefix.length < 512) prefix = Buffer.concat([prefix, bytes.subarray(0, 512 - prefix.length)]);
      try {
        hash.update(bytes);
        fs.writeSync(tempFd, bytes);
      } catch (error) {
        fail(imageLookupError("UPLOAD_FAILED", error.message, 500));
      }
    }

    function drain(final = false) {
      if (finished) return;
      if (!headersParsed) {
        const index = pending.indexOf(headerEnd);
        if (index < 0) {
          if (pending.length > 16 * 1024) fail(imageLookupError("UPLOAD_FAILED", "Multipart headers are too large"));
          return;
        }
        if (!pending.subarray(0, opening.length).equals(opening)) {
          fail(imageLookupError("UPLOAD_FAILED", "Invalid multipart opening boundary"));
          return;
        }
        const headerText = pending.toString("utf8", opening.length, index);
        const dispositionLine = headerText.match(/content-disposition:\s*form-data([^\r\n]*)/i)?.[1] || "";
        const fieldName = dispositionLine.match(/(?:^|;)\s*name=(?:"([^"]*)"|([^;\s]*))/i);
        const uploadedName = dispositionLine.match(/(?:^|;)\s*filename=(?:"([^"]*)"|([^;\s]*))/i);
        const uploadedNameStar = dispositionLine.match(/(?:^|;)\s*filename\*=(?:"([^"]*)"|([^;\s]*))/i);
        const type = headerText.match(/content-type:\s*([^\r\n;]+)/i);
        const parsedFieldName = fieldName?.[1] ?? fieldName?.[2] ?? "";
        const encodedFileName = uploadedNameStar?.[1] ?? uploadedNameStar?.[2] ?? "";
        const parsedFileName = decodeMultipartFilenameStar(encodedFileName) || uploadedName?.[1] || uploadedName?.[2] || "";
        if (parsedFieldName !== "image" || !parsedFileName) {
          fail(imageLookupError("NO_FILE", "The image field is required"));
          return;
        }
        fileName = path.basename(parsedFileName.replace(/\\/g, "/"));
        mimeType = String(type?.[1] || "").trim().toLowerCase();
        pending = pending.subarray(index + headerEnd.length);
        headersParsed = true;
      }

      const markerIndex = pending.indexOf(marker);
      if (markerIndex >= 0) {
        const suffix = pending.subarray(markerIndex + marker.length);
        if (suffix.length < 2 && !final) return;
        consumeFileBytes(pending.subarray(0, markerIndex));
        if (finished) return;
        if (suffix.subarray(0, 2).toString("ascii") !== "--") {
          fail(imageLookupError("TOO_MANY_FILES", "Only one image is allowed"));
          return;
        }
        if (!size) {
          fail(imageLookupError("EMPTY_FILE", "Empty image", 400));
          return;
        }
        try {
          let sha256;
          try {
            sha256 = hash.digest("hex");
          } catch (error) {
            throw imageLookupError("HASH_CALCULATION_FAILED", error.message, 500);
          }
          fs.closeSync(tempFd);
          tempFd = null;
          const file = { fileName, mimeType, size, prefix, sha256, tempPath };
          validateUploadedImage(file);
          finished = true;
          resolve(file);
        } catch (error) {
          fail(error);
        }
        return;
      }
      const keep = marker.length + 4;
      if (pending.length > keep) {
        const consumeLength = pending.length - keep;
        consumeFileBytes(pending.subarray(0, consumeLength));
        pending = pending.subarray(consumeLength);
      }
      if (final && !finished) fail(imageLookupError("UPLOAD_FAILED", "Multipart closing boundary is missing"));
    }

    request.on("data", (chunk) => {
      if (finished) return;
      pending = Buffer.concat([pending, chunk]);
      drain(false);
    });
    request.once("end", () => drain(true));
    request.once("aborted", () => fail(imageLookupError("REQUEST_ABORTED", "Upload aborted", 400)));
    request.once("error", () => fail(imageLookupError("UPLOAD_FAILED", "Upload failed", 400)));
  });
}

async function handleImageHashLookup(request, response) {
  if (request.method !== "POST") {
    sendImageLookupError(response, imageLookupError("UPLOAD_FAILED", "Method not allowed", 405));
    return;
  }
  if (imageHashLookupActive) {
    sendImageLookupError(response, imageLookupError("UPLOAD_BUSY", "Lookup busy", 429));
    request.resume();
    return;
  }
  imageHashLookupActive = true;
  let file = null;
  try {
    file = await readSingleMultipartImage(request);
    let result;
    try {
      result = galleryDb.findImagesBySha256(galleryDbFile, file.sha256);
    } catch (error) {
      throw imageLookupError(fs.existsSync(galleryDbFile) ? "DATABASE_QUERY_FAILED" : "HASH_DATABASE_UNAVAILABLE", error.message, 503);
    }
    let perceptualResult = { candidates: 0, matches: [] };
    let perceptualLookupError = null;
    try {
      const uploadedHash64 = await phash64({ ffmpegPath, inputPath: file.tempPath, timeoutMs: 30000 });
      perceptualResult = await perceptualIndex.query(uploadedHash64, 10);
    } catch (error) {
      perceptualLookupError = {
        code: error?.code === "DECODE_FAILED" || error?.code === "INVALID_DECODE_OUTPUT"
          ? "PERCEPTUAL_HASH_CALCULATION_FAILED"
          : "PERCEPTUAL_HASH_DATABASE_UNAVAILABLE",
        message: "相似图片查询暂时不可用，SHA-256 完全匹配结果仍然有效。",
      };
    }
    const exactIds = new Set(result.matches.map((item) => item.mediaId));
    const similarRows = perceptualResult.matches.filter((item) => !exactIds.has(item.mediaId));
    const mediaById = new Map(galleryDb.getMediaItemsByPerceptualIds(galleryDbFile, similarRows.map((item) => item.mediaId)).map((item) => [item.mediaId, item]));
    const similarMatches = similarRows.map((match) => ({
      ...mediaById.get(match.mediaId),
      matchType: match.hammingDistance <= 6 ? "highly_similar" : "possibly_similar",
      hammingDistance: match.hammingDistance,
      similarity: similarityPercent(match.hammingDistance),
    })).filter((item) => item.mediaId);
    const perceptualStats = galleryDb.getPerceptualHashStats(galleryDbFile);
    sendJson(response, {
      ok: true,
      algorithm: "sha256+phash64-v1",
      exactByteMatch: true,
      uploadedFile: { fileName: file.fileName, size: file.size, detectedFormat: file.detectedFormat },
      coverage: result.coverage,
      matches: result.matches,
      exactMatches: result.matches.map((item) => ({ ...item, matchType: "exact" })),
      similarMatches,
      perceptualIndex: { ...perceptualStats, lookupAvailable: !perceptualLookupError, lookupError: perceptualLookupError },
      perceptualCandidates: perceptualResult.candidates,
    });
  } catch (error) {
    sendImageLookupError(response, error);
  } finally {
    if (file?.tempPath) {
      try { fs.rmSync(file.tempPath, { force: true }); } catch (error) { console.warn("[image-hash-lookup-cleanup]", error.message); }
    }
    imageHashLookupActive = false;
  }
}

function sendImagePreview(requestUrl, response) {
  let descriptor;
  try {
    descriptor = imagePreviewDescriptor(requestUrl.searchParams.get("url") || "");
  } catch (error) {
    descriptor = null;
  }
  if (!descriptor) {
    sendJsonError(response, 400, "A valid image URL inside PHOTOS_DIR is required");
    return;
  }
  generateImagePreview(descriptor)
    .then(() => {
      response.writeHead(302, {
        Location: `/image-previews/${descriptor.key}.webp`,
        "Cache-Control": "no-store",
      });
      response.end();
    })
    .catch((error) => {
      logEvent("image_preview_generation_failed", { source: descriptor.sourcePath, error: error.message });
      sendJsonError(response, 503, "Image preview unavailable");
    });
}

function terminateCompatibleVideoChild(child) {
  if (!child || child.exitCode !== null) return;
  child.compatibilityStopRequested = true;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  } else {
    child.kill("SIGKILL");
  }
  if (activeCompatibleVideoStream?.child === child) activeCompatibleVideoStream = null;
}

function sendCompatibleVideo(request, requestUrl, response) {
  if (request.method !== "GET") {
    sendJsonError(response, 405, "Method not allowed");
    return;
  }

  const mediaId = String(requestUrl.searchParams.get("id") || "").trim();
  const media = galleryDb.getVideoById(galleryDbFile, mediaId);
  if (!media) {
    sendJsonError(response, 404, "Video not found");
    return;
  }
  const compatibilityItem = videoCompatibility.getItem(mediaId);
  const legacyFallback = !compatibilityItem && media.collectionId === legacyCompatibleVideoCollectionId;
  if (compatibilityItem?.compatibility_status !== "fallback_required" && !legacyFallback) {
    sendJsonError(response, 409, "Video is not approved for compatibility streaming");
    return;
  }
  const sourcePath = mediaSrcToFilePath(media.src);
  if (!sourcePath || !fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
    sendJsonError(response, 409, "Approved video source is unavailable");
    return;
  }

  if (activeCompatibleVideoStream) terminateCompatibleVideoChild(activeCompatibleVideoStream.child);

  const child = spawn(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-i", sourcePath,
    "-map", "0:v:0", "-map", "0:a:0?",
    "-vf", "scale=w='min(960,iw)':h='min(960,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
    "-r", "30", "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency",
    "-crf", "28", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "frag_keyframe+empty_moov+default_base_moof",
    "-f", "mp4", "pipe:1",
  ], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });

  activeCompatibleVideoStream = { child, sourcePath };
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    if (stderr.length < 4096) stderr += chunk.toString("utf8").slice(0, 4096 - stderr.length);
  });
  child.once("error", (error) => {
    if (activeCompatibleVideoStream?.child === child) activeCompatibleVideoStream = null;
    logEvent("compatible_video_stream_failed", { source: sourcePath, error: error.message });
    if (!response.headersSent) sendJsonError(response, 503, "Compatibility video stream unavailable");
    else response.destroy(error);
  });
  child.once("exit", (code, signal) => {
    if (activeCompatibleVideoStream?.child === child) activeCompatibleVideoStream = null;
    if (code !== 0 && !child.compatibilityStopRequested) {
      logEvent("compatible_video_stream_failed", { source: sourcePath, code, signal, error: stderr.trim() });
    }
  });

  const stopStream = () => {
    if (activeCompatibleVideoStream?.child !== child || child.killed) return;
    terminateCompatibleVideoChild(child);
  };
  request.once("aborted", stopStream);
  response.once("close", stopStream);
  response.writeHead(200, {
    "Content-Type": "video/mp4",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  child.stdout.pipe(response);
}

function stopCompatibleVideo(request, response) {
  if (request.method !== "POST") {
    sendJsonError(response, 405, "Method not allowed");
    return;
  }
  const stopped = Boolean(activeCompatibleVideoStream);
  if (activeCompatibleVideoStream) terminateCompatibleVideoChild(activeCompatibleVideoStream.child);
  sendJson(response, { ok: true, stopped });
}

function recordVideoPlaybackEvent(request, payload) {
  const mediaId = String(payload.mediaId || "").trim();
  const event = ["error", "stalled", "abort"].includes(payload.event) ? payload.event : "";
  const media = galleryDb.getVideoById(galleryDbFile, mediaId);
  if (!media || !event) {
    const error = new Error("Valid video event and mediaId are required");
    error.statusCode = 400;
    throw error;
  }
  const key = `${mediaId}|${event}|${String(payload.mode || "direct")}`;
  const now = Date.now();
  const last = videoPlaybackEventKeys.get(key) || 0;
  if (now - last < 60000) return { ok: true, deduplicated: true };
  videoPlaybackEventKeys.set(key, now);
  if (videoPlaybackEventKeys.size > 2000) {
    const cutoff = now - 24 * 60 * 60 * 1000;
    for (const [entryKey, time] of videoPlaybackEventKeys) if (time < cutoff || videoPlaybackEventKeys.size > 1500) videoPlaybackEventKeys.delete(entryKey);
  }
  logEvent("video_playback_event", {
    mediaId,
    event,
    mode: payload.mode === "compatibility" ? "compatibility" : "direct",
    attemptedCompatibility: Boolean(payload.attemptedCompatibility),
    mediaErrorCode: Number(payload.mediaErrorCode || 0),
    readyState: Number(payload.readyState || 0),
    networkState: Number(payload.networkState || 0),
    currentTime: Math.max(Number(payload.currentTime || 0), 0),
    userAgent: String(request.headers["user-agent"] || "").slice(0, 300),
  });
  return { ok: true, deduplicated: false };
}

function isSqliteCorruption(error) {
  const message = String((error && error.message) || error || "").toLowerCase();
  return message.includes("database disk image is malformed") || message.includes("file is not a database") || message.includes("sqlite_corrupt") || message.includes("sqlite_notadb");
}

function rebuildGalleryDbFromJson() {
  throw new Error("JSON rebuild is disabled. Use the SQLite scan task to rebuild the index.");
}

function refreshGalleryIndex() {
  const current = computeDirectorySignature(photosDir);
  const previous = fs.existsSync(galleryDbFile) ? galleryDb.getScanState(galleryDbFile, globalScanStatePath) : null;
  if (previous && previous.signature === current.signature) {
    const directoryStates = galleryDb.getScanStatesByKind(galleryDbFile, "directory");
    if (!directoryStates.length) {
      for (const dirState of collectDirectoryStates(photosDir)) {
        galleryDb.upsertScanState(galleryDbFile, {
          path: `dir:${dirState.path}`,
          kind: "directory",
          mtime: dirState.mtime,
          fileCount: dirState.fileCount,
          dirCount: dirState.dirCount,
          signature: dirState.signature,
          lastScannedAt: new Date().toISOString(),
        });
      }
    }
    return {
      changed: false,
      skippedFullScan: true,
      signature: current.signature,
      fileCount: current.fileCount,
      dirCount: current.dirCount,
      index: galleryDb.getStats(galleryDbFile),
    };
  }

  const gallery = scanGallery();
  return {
    changed: true,
    skippedFullScan: false,
    signature: current.signature,
    fileCount: current.fileCount,
    dirCount: current.dirCount,
    generatedAt: gallery.generatedAt,
    modelCount: (gallery.models || []).length,
    collectionCount: (gallery.collections || []).length,
    highlightCount: (gallery.highlights || []).length,
    index: gallery.index || null,
  };
}

function detectChangedDirectories() {
  const previousRows = fs.existsSync(galleryDbFile) ? galleryDb.getScanStatesByKind(galleryDbFile, "directory") : [];
  const previous = new Map(previousRows.map((row) => [row.path, row]));
  const currentStates = collectDirectoryStates(photosDir).map((state) => ({
    path: `dir:${state.path}`,
    relativePath: state.path,
    kind: "directory",
    mtime: state.mtime,
    fileCount: state.fileCount,
    dirCount: state.dirCount,
    signature: state.signature,
  }));
  const current = new Map(currentStates.map((state) => [state.path, state]));
  const changed = [];
  const deleted = [];

  for (const state of currentStates) {
    const old = previous.get(state.path);
    if (!old) {
      changed.push({ ...state, reason: "new" });
    } else if (old.signature !== state.signature || old.file_count !== state.fileCount || old.dir_count !== state.dirCount) {
      changed.push({ ...state, reason: "changed" });
    }
  }

  for (const old of previousRows) {
    if (!current.has(old.path)) deleted.push({ path: old.path, relativePath: old.path.replace(/^dir:/, ""), reason: "deleted" });
  }

  return {
    changedCount: changed.length,
    deletedCount: deleted.length,
    changed: changed.slice(0, 200),
    deleted: deleted.slice(0, 200),
  };
}

function sendDbResponse(response, callback) {
  try {
    sendJson(response, callback());
  } catch (error) {
    if (isSqliteCorruption(error)) {
      try {
        rebuildGalleryDbFromJson();
        sendJson(response, callback());
        return;
      } catch (rebuildError) {
        console.error("SQLite rebuild failed:", rebuildError);
        sendJsonError(response, 500, `SQLite rebuild failed: ${rebuildError.message}`);
        return;
      }
    }
    console.error("SQLite API failed:", error);
    sendJsonError(response, 500, error.message);
  }
}

function handleIndexApi(requestUrl, response, requestReceivedAt = performance.now()) {
  if (requestUrl.pathname === "/api/index/stats") {
    sendDbResponse(response, () => ({
      type: "sqlite",
      file: galleryDbFile,
      ...galleryDb.getStats(galleryDbFile),
    }));
    return true;
  }

  if (requestUrl.pathname === "/api/collections/root") {
    sendDbResponse(response, () => ({
      items: galleryDb.getRootCollections(galleryDbFile, {
        limit: requestUrl.searchParams.get("limit") || "",
        offset: requestUrl.searchParams.get("offset") || "",
        sort: requestUrl.searchParams.get("sort") || "",
      }),
    }));
    return true;
  }

  if (requestUrl.pathname.startsWith("/api/collections/")) {
    const id = decodeURIComponent(requestUrl.pathname.slice("/api/collections/".length));
    try {
      const collection = galleryDb.getCollection(galleryDbFile, id, { sort: requestUrl.searchParams.get("sort") || "" });
      if (!collection) {
        sendJsonError(response, 404, "Collection not found");
      } else {
        sendJson(response, collection);
      }
    } catch (error) {
      if (isSqliteCorruption(error)) {
        try {
          rebuildGalleryDbFromJson();
          const collection = galleryDb.getCollection(galleryDbFile, id, { sort: requestUrl.searchParams.get("sort") || "" });
          if (!collection) {
            sendJsonError(response, 404, "Collection not found");
          } else {
            sendJson(response, collection);
          }
          return true;
        } catch (rebuildError) {
          console.error("SQLite rebuild failed:", rebuildError);
          sendJsonError(response, 500, `SQLite rebuild failed: ${rebuildError.message}`);
          return true;
        }
      }
      console.error("SQLite API failed:", error);
      sendJsonError(response, 500, error.message);
    }
    return true;
  }

  if (requestUrl.pathname === "/api/media") {
    const collectionId = requestUrl.searchParams.get("collectionId") || "";
    if (!collectionId) {
      sendJsonError(response, 400, "collectionId is required");
      return true;
    }
    sendDbResponse(response, () =>
      videoCompatibility.augmentMedia(galleryDb.getMedia(galleryDbFile, collectionId, {
        type: requestUrl.searchParams.get("type") || "",
        limit: requestUrl.searchParams.get("limit") || "",
        offset: requestUrl.searchParams.get("offset") || "",
      }))
    );
    return true;
  }

  if (requestUrl.pathname === "/api/search") {
    const parameterParseStartedAt = performance.now();
    const query = requestUrl.searchParams.get("q") || "";
    const limit = requestUrl.searchParams.get("limit") || "";
    const includePerformance = searchPerfLoggingEnabled && requestUrl.searchParams.get("perf") === "1";
    const parameterParseMs = performance.now() - parameterParseStartedAt;
    try {
      const payload = galleryDb.search(galleryDbFile, query, limit, {
        includePerformance: searchPerfLoggingEnabled,
        searchMode: searchBackendMode,
        sort: requestUrl.searchParams.get("sort") || "relevance",
      });
      const databasePerformance = payload.performance || {};
      if (!includePerformance) delete payload.performance;
      const serializationStartedAt = performance.now();
      const body = JSON.stringify(payload);
      const jsonSerializationMs = performance.now() - serializationStartedAt;
      const apiTotalMs = performance.now() - requestReceivedAt;
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Server-Timing": `search;dur=${apiTotalMs.toFixed(3)}`,
      });
      response.end(body);
      if (searchPerfLoggingEnabled) {
        console.log(JSON.stringify({
          event: "search-performance",
          receivedAt: new Date().toISOString(),
          queryLength: String(query).length,
          parameterParseMs: Math.round(parameterParseMs * 1000) / 1000,
          ...databasePerformance,
          jsonSerializationMs: Math.round(jsonSerializationMs * 1000) / 1000,
          apiTotalMs: Math.round(apiTotalMs * 1000) / 1000,
          collectionCount: payload.collections.length,
          mediaCount: payload.media.length,
          resultCount: payload.collections.length + payload.media.length,
          hasMore: payload.hasMore,
        }));
      }
    } catch (error) {
      console.error("SQLite search failed:", error);
      try { galleryDb.markSearchIndexStale(galleryDbFile, "fts_query_failed"); } catch {}
      sendJsonError(response, 503, "Search backend unavailable");
    }
    return true;
  }

  if (requestUrl.pathname === "/api/search-index/status") {
    sendDbResponse(response, () => galleryDb.getSearchIndexStatus(galleryDbFile, searchBackendMode));
    return true;
  }

  return false;
}

function scanTaskSnapshot() {
  return {
    id: scanTask.id,
    status: scanTask.status,
    startedAt: scanTask.startedAt,
    finishedAt: scanTask.finishedAt,
    scannedDirectories: scanTask.scannedDirectories,
    processedFiles: scanTask.processedFiles,
    currentDirectory: scanTask.currentDirectory,
    errorCount: scanTask.errorCount,
    errorMessage: scanTask.errorMessage,
    result: scanTask.result,
  };
}

function managerTaskActive(manager) {
  try {
    return ["running", "paused", "stopping"].includes(manager.status().status);
  } catch (error) {
    return false;
  }
}

function maintenanceBusy(exclude = "") {
  return (!exclude.includes("scan") && scanTask.status === "running")
    || (!exclude.includes("duplicates") && duplicateTask.status === "running")
    || (!exclude.includes("duplicate-recycle") && duplicateRecycleRunning)
    || (!exclude.includes("media-cleanup") && Boolean(mediaCleanupChild))
    || (!exclude.includes("perceptual-index") && managerTaskActive(perceptualIndex))
    || (!exclude.includes("video-compatibility") && managerTaskActive(videoCompatibility))
    || (!exclude.includes("collection-recycle") && collectionRecycleRunning);
}

function finishScanCallbacks() {
  const callbacks = scanCompletionCallbacks;
  scanCompletionCallbacks = [];
  for (const callback of callbacks) {
    try { callback(scanTaskSnapshot()); } catch (error) { logEvent("scan-completion-callback-failed", { error: error.message }); }
  }
}

function startScanTask(options = {}) {
  if (scanTask.status === "running") {
    if (typeof options.onComplete === "function") scanCompletionCallbacks.push(options.onComplete);
    return scanTaskSnapshot();
  }
  if (maintenanceBusy("scan")) {
    const error = new Error("Another maintenance task is moving or processing media.");
    error.statusCode = 409;
    throw error;
  }
  if (typeof options.onComplete === "function") scanCompletionCallbacks.push(options.onComplete);

  const id = `${Date.now()}`;
  scanTask = {
    id,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: "",
    scannedDirectories: 0,
    processedFiles: 0,
    currentDirectory: "Checking photo folders",
    errorCount: 0,
    errorMessage: "",
    result: null,
  };

  const child = spawn(process.execPath, [__filename], {
    cwd: rootDir,
    env: { ...process.env, RUN_SCAN_ONCE: "1" },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  scanTaskChild = child;

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
    const lines = stdout.split(/\r?\n/);
    stdout = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const payload = JSON.parse(line);
        if (payload.type === "scan-progress") {
          scanTask.scannedDirectories = payload.dirCount || scanTask.scannedDirectories;
          scanTask.processedFiles = payload.fileCount || scanTask.processedFiles;
          scanTask.currentDirectory = payload.currentDirectory || scanTask.currentDirectory;
        }
        if (payload.type === "scan-result") {
          scanTask.result = payload.result || null;
          scanTask.scannedDirectories = payload.result ? payload.result.dirCount || scanTask.scannedDirectories : scanTask.scannedDirectories;
          scanTask.processedFiles = payload.result ? payload.result.fileCount || scanTask.processedFiles : scanTask.processedFiles;
          scanTask.currentDirectory = payload.result && payload.result.changed ? "Index refreshed" : "No folder changes";
        }
      } catch (error) {
        stderr += `${line}\n`;
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  child.on("error", (error) => {
    scanTask.status = "failed";
    scanTask.finishedAt = new Date().toISOString();
    scanTask.errorCount = 1;
    scanTask.errorMessage = error.message;
    scanTask.currentDirectory = "Scan failed";
    if (scanTaskChild === child) scanTaskChild = null;
    finishScanCallbacks();
  });

  child.on("close", (code) => {
    if (scanTaskChild === child) scanTaskChild = null;
    if (scanTask.id !== id || scanTask.status !== "running") return;
    scanTask.finishedAt = new Date().toISOString();
    if (code === 0) {
      scanTask.status = "completed";
      scanTask.currentDirectory = scanTask.currentDirectory || "Scan completed";
    } else {
      scanTask.status = "failed";
      scanTask.errorCount = 1;
      scanTask.errorMessage = stderr.trim() || `Scan process exited with code ${code}`;
      scanTask.currentDirectory = "Scan failed";
    }
    finishScanCallbacks();
  });

  return scanTaskSnapshot();
}

function duplicateTaskSnapshot() {
  let stats = duplicateTask.stats;
  if (fs.existsSync(galleryDbFile)) {
    try {
      stats = galleryDb.getDuplicateHashStats(galleryDbFile);
    } catch (error) {
      stats = duplicateTask.stats;
    }
  }
  return {
    id: duplicateTask.id,
    status: duplicateTask.status,
    startedAt: duplicateTask.startedAt,
    finishedAt: duplicateTask.finishedAt,
    processed: duplicateTask.processed,
    errorCount: duplicateTask.errorCount,
    currentFile: duplicateTask.currentFile,
    errorMessage: duplicateTask.errorMessage,
    result: duplicateTask.result,
    stats,
  };
}

function startDuplicateTask(requestInfo = {}) {
  if (duplicateTask.status === "running") return duplicateTaskSnapshot();
  if (maintenanceBusy("duplicates")) {
    const error = new Error("Another maintenance task is running.");
    error.statusCode = 409;
    throw error;
  }

  const id = `${Date.now()}`;
  const statsBefore = safeDuplicateStats();
  duplicateTask = {
    id,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: "",
    processed: 0,
    errorCount: 0,
    currentFile: "Preparing duplicate scan",
    errorMessage: "",
    result: null,
    stats: fs.existsSync(galleryDbFile) ? galleryDb.getDuplicateHashStats(galleryDbFile) : null,
  };
  logEvent("duplicate_scan_start", { id, requestInfo, statsBefore });

  const child = spawn(process.execPath, [path.join(rootDir, "duplicates-worker.js")], {
    cwd: rootDir,
    env: { ...process.env },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  duplicateTaskChild = child;

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
    const lines = stdout.split(/\r?\n/);
    stdout = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const payload = JSON.parse(line);
        if (payload.type === "duplicate-progress") {
          duplicateTask.processed = payload.processed || duplicateTask.processed;
          duplicateTask.errorCount = payload.errorCount || duplicateTask.errorCount;
          duplicateTask.currentFile = payload.currentFile || duplicateTask.currentFile;
          duplicateTask.stats = payload.stats || duplicateTask.stats;
        }
        if (payload.type === "duplicate-result") {
          duplicateTask.result = payload.result || null;
          duplicateTask.processed = payload.result ? payload.result.processed || duplicateTask.processed : duplicateTask.processed;
          duplicateTask.errorCount = payload.result ? payload.result.errorCount || duplicateTask.errorCount : duplicateTask.errorCount;
          duplicateTask.currentFile = "Duplicate scan completed";
          duplicateTask.stats = payload.result ? payload.result.stats || duplicateTask.stats : duplicateTask.stats;
        }
      } catch (error) {
        stderr += `${line}\n`;
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  child.on("error", (error) => {
    duplicateTask.status = "failed";
    duplicateTask.finishedAt = new Date().toISOString();
    duplicateTask.errorCount += 1;
    duplicateTask.errorMessage = error.message;
    duplicateTask.currentFile = "Duplicate scan failed";
    logEvent("duplicate_scan_error", { id, error: error.message, statsAfter: safeDuplicateStats() });
  });

  child.on("close", (code) => {
    if (duplicateTaskChild === child) duplicateTaskChild = null;
    if (duplicateTask.id !== id || duplicateTask.status !== "running") return;
    duplicateTask.finishedAt = new Date().toISOString();
    if (code === 0) {
      duplicateTask.status = "completed";
      duplicateTask.currentFile = "Duplicate scan completed";
      try {
        duplicateTask.stats = galleryDb.getDuplicateHashStats(galleryDbFile);
      } catch (error) {
        duplicateTask.errorCount += 1;
        duplicateTask.errorMessage = `Duplicate stats refresh failed: ${error.message}`;
      }
    } else {
      duplicateTask.status = "failed";
      duplicateTask.errorCount += 1;
      duplicateTask.errorMessage = stderr.trim() || `Duplicate scan exited with code ${code}`;
      duplicateTask.currentFile = "Duplicate scan failed";
    }
    logEvent("duplicate_scan_close", {
      id,
      code,
      status: duplicateTask.status,
      processed: duplicateTask.processed,
      errorCount: duplicateTask.errorCount,
      errorMessage: duplicateTask.errorMessage,
      statsBefore,
      statsAfter: safeDuplicateStats(),
    });
  });

  return duplicateTaskSnapshot();
}

function stopDuplicateTask() {
  if (duplicateTask.status !== "running") return duplicateTaskSnapshot();
  const statsBefore = safeDuplicateStats();
  duplicateTask.status = "stopped";
  duplicateTask.finishedAt = new Date().toISOString();
  duplicateTask.currentFile = "Duplicate scan stopped";
  duplicateTask.stats = fs.existsSync(galleryDbFile) ? galleryDb.getDuplicateHashStats(galleryDbFile) : duplicateTask.stats;
  if (duplicateTaskChild) {
    try {
      duplicateTaskChild.kill();
    } catch (error) {
      duplicateTask.errorCount += 1;
      duplicateTask.errorMessage = error.message;
    }
    duplicateTaskChild = null;
  }
  logEvent("duplicate_scan_stop", {
    id: duplicateTask.id,
    processed: duplicateTask.processed,
    errorCount: duplicateTask.errorCount,
    statsBefore,
    statsAfter: safeDuplicateStats(),
  });
  return duplicateTaskSnapshot();
}

function uniqueTrashPath(targetPath) {
  if (!fs.existsSync(targetPath)) return targetPath;

  const parsed = path.parse(targetPath);
  const suffix = new Date().toISOString().replace(/[:.]/g, "-");
  let index = 1;
  let nextPath = path.join(parsed.dir, `${parsed.name}__deleted-${suffix}${parsed.ext}`);
  while (fs.existsSync(nextPath)) {
    index += 1;
    nextPath = path.join(parsed.dir, `${parsed.name}__deleted-${suffix}-${index}${parsed.ext}`);
  }
  return nextPath;
}

function recycleFile(filePath) {
  if (!filePath || !isInsideDir(photosDir, filePath) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return { ok: false, error: "File not found or outside photos directory." };
  }

  const relativePath = path.relative(photosDir, filePath);
  const targetPath = uniqueTrashPath(path.normalize(path.join(trashDir, relativePath)));
  if (!isInsideDir(trashDir, targetPath)) {
    return { ok: false, error: "Trash target is outside trash directory." };
  }

  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.renameSync(filePath, targetPath);
    return { ok: true, trashPath: targetPath };
  } catch (error) {
    if (error.code === "EXDEV") {
      return { ok: false, error: `Trash folder must be on the same drive as photos. Current trash folder: ${trashDir}` };
    }
    return { ok: false, error: error.message };
  }
}

function recycleDuplicateItems(request, response, mode) {
  if (request.method !== "POST") {
    sendJsonError(response, 405, "Method not allowed");
    return;
  }
  readRequestBody(request, (body) => {
    if (maintenanceBusy("duplicate-recycle")) { sendJsonError(response, 409, "Another maintenance task is running."); return; }
    duplicateRecycleRunning = true;
    try {
      const payload = JSON.parse(body || "{}");
      const limit = Math.min(Math.max(Number(payload.limit || duplicateRecycleLimit), 1), duplicateRecycleLimit);
      const ids = mode === "auto" ? [] : Array.isArray(payload.ids) ? payload.ids : [];
      const items = mode === "auto" ? galleryDb.getDuplicateDeletionCandidates(galleryDbFile, limit) : galleryDb.getMediaItemsByIds(galleryDbFile, ids).slice(0, limit);
      const deletedIds = [];
      const failed = [];
      const skipped = [];

      for (const item of items) {
        const filePath = photoUrlToPath(item.src || "");
        if (!filePath) {
          skipped.push({ id: item.id, reason: "invalid path" });
          continue;
        }
        const result = recycleFile(filePath);
        if (result.ok) {
          deletedIds.push(item.id);
        } else {
          failed.push({ id: item.id, file: item.file || item.title || "", error: result.error });
        }
      }

      let cleanup;
      try {
        cleanup = galleryDb.removeMediaRecords(galleryDbFile, deletedIds);
      } catch (error) {
        try {
          galleryDb.markSearchIndexStale(galleryDbFile, "duplicate_recycle_files_moved_database_update_failed");
        } catch {}
        throw error;
      }
      logEvent("duplicate-recycle", {
        mode,
        ip: clientAddress(request),
        limit,
        requested: mode === "auto" ? items.length : ids.length,
        recycled: deletedIds.length,
        failed: failed.length,
        skipped: skipped.length,
        requestedScope: adminAuthorizer.capability(request).scope,
      });
      sendJson(response, {
        ok: true,
        mode,
        requested: mode === "auto" ? items.length : ids.length,
        recycled: deletedIds.length,
        trashDir,
        failed,
        skipped,
        cleanup,
        stats: galleryDb.getDuplicateHashStats(galleryDbFile),
      });
    } catch (error) {
      sendJsonError(response, 500, error.message);
    } finally { duplicateRecycleRunning = false; }
  });
}

function sendUserMarks(request, response, markType, limit) {
  if (request.method === "GET") {
    sendDbResponse(response, () => ({ items: galleryDb.getUserMarks(galleryDbFile, markType, limit) }));
    return;
  }

  if (request.method === "DELETE") {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);
    sendDbResponse(response, () => galleryDb.deleteUserMark(galleryDbFile, requestUrl.searchParams.get("id") || "", markType));
    return;
  }

  if (request.method !== "POST") {
    sendJsonError(response, 405, "Method not allowed");
    return;
  }

  readRequestBody(request, (body) => {
    try {
      const payload = JSON.parse(body || "{}");
      const item = payload.item || payload;
      const id = String(item.id || item.hash || "").trim();
      if (!id) {
        sendJsonError(response, 400, "Mark id is required");
        return;
      }
      sendDbResponse(response, () => ({
        item: galleryDb.upsertUserMark(galleryDbFile, {
          id,
          targetId: item.hash || item.targetId || id,
          targetType: item.type || item.targetType || "collection",
          markType,
          payload: item,
        }),
      }));
    } catch (error) {
      sendJsonError(response, 400, error.message);
    }
  });
}

function isLocalRequest(request) {
  const remoteAddress = request.socket.remoteAddress || "";
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remoteAddress);
}

function requireAdminWrite(request, response, action) {
  try {
    return adminAuthorizer.authorize(request, action);
  } catch (error) {
    sendJsonError(response, error.statusCode || 403, error.message);
    return null;
  }
}

function readRequestBody(request, callback) {
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    body += chunk;
    if (body.length > 8192) request.destroy();
  });
  request.on("end", () => callback(body));
}

function mediaCleanupPaths(id) {
  const safeId = /^[0-9]{8}-[0-9]{6}-[a-f0-9]{8}$/.test(String(id || "")) ? String(id) : "";
  if (!safeId) return null;
  const prefix = path.join(logsDir, `media-cleanup-${safeId}`);
  return {
    prefix,
    summary: `${prefix}-summary.json`,
    records: `${prefix}-records.ndjson`,
    progress: `${prefix}-progress.json`,
    cancel: `${prefix}-cancel.request`,
    nonMedia: `${prefix}-non-media.csv`,
    recycleRoot: path.join(trashDir, "media-cleanup", safeId),
    recycleFiles: path.join(trashDir, "media-cleanup", safeId, "files"),
    manifest: path.join(trashDir, "media-cleanup", safeId, "manifest.ndjson"),
    recycleSummary: path.join(trashDir, "media-cleanup", safeId, "summary.json"),
    recycleLog: path.join(trashDir, "media-cleanup", safeId, "recycle.log"),
  };
}

function readCleanupJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    return null;
  }
}

function restoreLatestMediaCleanupTask() {
  if (!fs.existsSync(logsDir) || mediaCleanupChild) return null;
  const candidates = fs
    .readdirSync(logsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^media-cleanup-[0-9]{8}-[0-9]{6}-[a-f0-9]{8}-summary\.json$/.test(entry.name))
    .map((entry) => {
      const fullPath = path.join(logsDir, entry.name);
      return { fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const candidate of candidates) {
    const summary = readCleanupJson(candidate.fullPath);
    const id = String(summary?.jobId || "");
    const paths = mediaCleanupPaths(id);
    if (!paths || !["completed", "recycle-completed", "recycle-partial", "restore-completed", "restore-partial", "stopped"].includes(summary?.status) || !fs.existsSync(paths.records)) continue;
    mediaCleanupTask = {
      id,
      status: summary.status,
      startedAt: String(summary.startedAt || ""),
      finishedAt: String(summary.finishedAt || ""),
      errorMessage: String(summary.errorMessage || ""),
      summary,
      restored: true,
    };
    return mediaCleanupTask;
  }
  return null;
}

function mediaCleanupSnapshot() {
  const paths = mediaCleanupPaths(mediaCleanupTask.id);
  const progress = paths ? readCleanupJson(paths.progress) : null;
  const summary = paths ? readCleanupJson(paths.summary) : null;
  if (summary && !["scanning", "stopping", "recycling", "restoring"].includes(mediaCleanupTask.status)) {
    mediaCleanupTask.summary = summary;
  }
  const eligiblePaths = mediaCleanupPaths(mediaCleanupAllowedRecycleJobId);
  const eligibleScanSummary = eligiblePaths ? readCleanupJson(eligiblePaths.summary) : null;
  const eligibleRecycleSummary = eligiblePaths ? readCleanupJson(eligiblePaths.recycleSummary) : null;
  let availableBytes = 0;
  try {
    const stats = fs.statfsSync(trashDir, { bigint: true });
    availableBytes = Number(stats.bavail * stats.bsize);
  } catch (error) {}
  const candidateBytes = Number(eligibleScanSummary?.nonMediaBytes || 0);
  const requiredBytes = Math.ceil(Math.max(candidateBytes + (2 * 1024 ** 3), candidateBytes * 1.1));
  const eligibleComplete = Boolean(eligibleScanSummary
    && eligibleScanSummary.jobId === mediaCleanupAllowedRecycleJobId
    && ["completed", "recycle-completed", "recycle-partial", "restore-completed", "restore-partial"].includes(eligibleScanSummary.status)
    && !eligibleScanSummary.incomplete
    && Number(eligibleScanSummary.errorCount || 0) === 0
    && fs.existsSync(eligiblePaths.records));
  const manifestExists = Boolean(eligiblePaths && fs.existsSync(eligiblePaths.manifest));
  return {
    id: mediaCleanupTask.id,
    status: mediaCleanupTask.status,
    rootPath: photosDir,
    startedAt: mediaCleanupTask.startedAt,
    finishedAt: mediaCleanupTask.finishedAt,
    errorMessage: mediaCleanupTask.errorMessage,
    progress,
    summary: mediaCleanupTask.summary || summary,
    canDelete: false,
    canRecycle: eligibleComplete && availableBytes >= requiredBytes && !mediaCleanupChild,
    canRestore: manifestExists && Number(eligibleRecycleSummary?.restorableFileCount || 0) > 0 && !mediaCleanupChild,
    recoveredFromDisk: Boolean(mediaCleanupTask.restored),
    localDeleteOnly: false,
    adminAuthorizationRequired: true,
    trashPath: trashDir,
    sameVolume: path.parse(photosDir).root.toLowerCase() === path.parse(trashDir).root.toLowerCase(),
    allowedRecycleJobId: mediaCleanupAllowedRecycleJobId,
    eligibleRecycleJob: eligibleComplete ? {
      id: mediaCleanupAllowedRecycleJobId,
      candidateCount: Number(eligibleScanSummary.nonMediaCount || 0),
      candidateBytes,
      availableBytes,
      requiredBytes,
      spaceSufficient: availableBytes >= requiredBytes,
      manifestPath: eligiblePaths.manifest,
      recyclePath: eligiblePaths.recycleRoot,
      operationSummary: eligibleRecycleSummary,
    } : null,
  };
}

function cleanupJobId() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  return `${stamp}-${crypto.randomBytes(4).toString("hex")}`;
}

function spawnMediaCleanup(mode, id) {
  const paths = mediaCleanupPaths(id);
  const args = [
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", mediaCleanupWorkerPath,
    "-Mode", mode, "-RootPath", photosDir, "-LogsPath", logsDir, "-JobId", id,
  ];
  if (mode === "Scan") args.push("-CancelPath", paths.cancel);
  if (mode === "Recycle") args.push("-CandidatePath", paths.records, "-TrashPath", trashDir);
  if (mode === "Restore") args.push("-TrashPath", trashDir);
  const child = spawn("powershell.exe", args, {
    cwd: rootDir,
    windowsHide: true,
    stdio: ["ignore", "ignore", "pipe"],
  });
  mediaCleanupChild = child;
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-16000); });
  child.on("error", (error) => {
    mediaCleanupTask.status = "failed";
    mediaCleanupTask.errorMessage = error.message;
    mediaCleanupTask.finishedAt = new Date().toISOString();
  });
  child.on("close", (code) => {
    if (mediaCleanupChild === child) mediaCleanupChild = null;
    if (mediaCleanupTask.id !== id) return;
    const summary = readCleanupJson(paths.summary);
    mediaCleanupTask.summary = summary;
    mediaCleanupTask.finishedAt = new Date().toISOString();
    if (code === 0 && summary && ["completed", "stopped", "recycle-completed", "recycle-partial", "restore-completed", "restore-partial"].includes(summary.status)) {
      mediaCleanupTask.status = summary.status;
      mediaCleanupTask.errorMessage = "";
    } else {
      mediaCleanupTask.status = "failed";
      mediaCleanupTask.errorMessage = (summary && summary.errorMessage) || stderr.trim() || `Media cleanup worker exited with code ${code}`;
    }
  });
  return child;
}

function startMediaCleanupScan() {
  if (mediaCleanupChild || ["scanning", "stopping", "recycling", "restoring"].includes(mediaCleanupTask.status)) {
    const error = new Error("A media cleanup task is already running.");
    error.statusCode = 409;
    throw error;
  }
  if (maintenanceBusy("media-cleanup")) {
    const error = new Error("Another maintenance task is running.");
    error.statusCode = 409;
    throw error;
  }
  if (!fs.existsSync(mediaCleanupWorkerPath)) throw new Error("Media cleanup worker is missing.");
  const id = cleanupJobId();
  mediaCleanupTask = { id, status: "scanning", startedAt: new Date().toISOString(), finishedAt: "", errorMessage: "", summary: null, restored: false };
  spawnMediaCleanup("Scan", id);
  return mediaCleanupSnapshot();
}

function stopMediaCleanupScan() {
  if (mediaCleanupTask.status !== "scanning" || !mediaCleanupChild) {
    const error = new Error("No media cleanup scan is running.");
    error.statusCode = 409;
    throw error;
  }
  const paths = mediaCleanupPaths(mediaCleanupTask.id);
  fs.writeFileSync(paths.cancel, new Date().toISOString(), "utf8");
  mediaCleanupTask.status = "stopping";
  return mediaCleanupSnapshot();
}

function startMediaCleanupOperation(request, payload, mode) {
  const id = String(payload.jobId || "");
  const confirmation = String(payload.confirmation || "").trim();
  const confirmations = mode === "Restore" ? ["RESTORE", "恢复"] : ["MOVE", "移入回收站"];
  if (!confirmations.includes(confirmation)) {
    const error = new Error(`Type ${confirmations[0]} or ${confirmations[1]} to confirm.`);
    error.statusCode = 400;
    throw error;
  }
  if (mediaCleanupChild) {
    const error = new Error("A media cleanup task is already running.");
    error.statusCode = 409;
    throw error;
  }
  if (maintenanceBusy("media-cleanup")) {
    const error = new Error("Another maintenance task is running.");
    error.statusCode = 409;
    throw error;
  }
  if (id !== mediaCleanupAllowedRecycleJobId) {
    const error = new Error("This deployment only allows the approved cleanup report.");
    error.statusCode = 409;
    throw error;
  }
  const paths = mediaCleanupPaths(id);
  const scanSummary = paths ? readCleanupJson(paths.summary) : null;
  if (!paths || !scanSummary || scanSummary.jobId !== id || !["completed", "recycle-completed", "recycle-partial", "restore-completed", "restore-partial"].includes(scanSummary.status) || scanSummary.incomplete || Number(scanSummary.errorCount || 0) !== 0 || !fs.existsSync(paths.records)) {
    const error = new Error("The approved completed candidate report is missing or invalid.");
    error.statusCode = 409;
    throw error;
  }
  if (mode === "Restore" && !fs.existsSync(paths.manifest)) {
    const error = new Error("Recycle manifest is missing.");
    error.statusCode = 409;
    throw error;
  }
  mediaCleanupTask = { id, status: mode === "Restore" ? "restoring" : "recycling", startedAt: new Date().toISOString(), finishedAt: "", errorMessage: "", summary: scanSummary, restored: false };
  spawnMediaCleanup(mode, id);
  return mediaCleanupSnapshot();
}

function cleanupRecordCompare(sort, direction) {
  const factor = direction === "desc" ? -1 : 1;
  return (a, b) => {
    if (sort === "size") {
      const difference = Number(a.sizeBytes || 0) - Number(b.sizeBytes || 0);
      if (difference) return difference * factor;
    }
    return String(a.relativePath || "").localeCompare(String(b.relativePath || ""), "zh-CN", { sensitivity: "base" }) * factor;
  };
}

async function queryMediaCleanupResults(requestUrl) {
  const id = requestUrl.searchParams.get("jobId") || mediaCleanupTask.id;
  const paths = mediaCleanupPaths(id);
  const kind = String(requestUrl.searchParams.get("kind") || "non-media").toLowerCase();
  const recordsFile = paths && paths.records;
  if (!paths || !recordsFile || !fs.existsSync(recordsFile)) {
    const error = new Error("Cleanup results were not found.");
    error.statusCode = 404;
    throw error;
  }
  const page = Math.max(Number.parseInt(requestUrl.searchParams.get("page") || "1", 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(requestUrl.searchParams.get("pageSize") || "50", 10) || 50, 1), mediaCleanupPageSizeMax);
  const offset = (page - 1) * pageSize;
  if (offset > mediaCleanupOffsetMax) {
    const error = new Error(`Result offset exceeds the ${mediaCleanupOffsetMax} record safety limit. Narrow the search or filter.`);
    error.statusCode = 400;
    throw error;
  }
  const category = String(requestUrl.searchParams.get("category") || "").toLowerCase();
  const search = String(requestUrl.searchParams.get("search") || "").trim().toLowerCase().slice(0, 200);
  const sort = requestUrl.searchParams.get("sort") === "size" ? "size" : "path";
  const direction = requestUrl.searchParams.get("direction") === "desc" ? "desc" : "asc";
  const compare = cleanupRecordCompare(sort, direction);
  const keep = offset + pageSize;
  const selected = [];
  let total = 0;
  const input = fs.createReadStream(recordsFile, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let record;
    try { record = JSON.parse(line.replace(/^\uFEFF/, "")); } catch (error) { continue; }
    if (kind && String(record.kind || "").toLowerCase() !== kind) continue;
    if (category && String(record.category || "").toLowerCase() !== category) continue;
    const haystack = `${record.fileName || ""}\n${record.relativePath || ""}`.toLowerCase();
    if (search && !haystack.includes(search)) continue;
    total += 1;
    selected.push(record);
    if (selected.length >= Math.max(keep * 2, 400)) {
      selected.sort(compare);
      selected.length = Math.min(selected.length, keep);
    }
  }
  selected.sort(compare);
  const items = selected.slice(offset, offset + pageSize).map(({ fullPath, ...record }) => record);
  return { jobId: id, page, pageSize, total, items, safetyOffsetLimit: mediaCleanupOffsetMax };
}

function localDateKey(value = new Date()) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function hasReparsePointBetween(root, target) {
  let current = path.resolve(root);
  if (fs.lstatSync(current).isSymbolicLink()) return true;
  const relative = path.relative(current, path.resolve(target));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return relative !== "";
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    const stats = fs.lstatSync(current);
    if (stats.isSymbolicLink()) return true;
  }
  return false;
}

function collectionRecycleEligibility(collectionId) {
  const collection = galleryDb.getCollection(galleryDbFile, String(collectionId || ""));
  if (!collection) return { eligible: false, reason: "collection-not-found" };
  const parts = Array.isArray(collection.pathParts) ? collection.pathParts : [];
  if (!parts.length || parts.some((part) => !part || part === "." || part === ".." || /[\\/]/.test(part))) return { eligible: false, reason: "invalid-collection-path" };
  const sourcePath = path.resolve(photosDir, ...parts);
  if (!isInsideDir(photosDir, sourcePath) || sourcePath === path.resolve(photosDir)) return { eligible: false, reason: "outside-media-root" };
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isDirectory()) return { eligible: false, reason: "directory-missing" };
  if (hasReparsePointBetween(photosDir, sourcePath)) return { eligible: false, reason: "reparse-point" };
  const entries = fs.readdirSync(sourcePath, { withFileTypes: true });
  if (entries.some((entry) => entry.isDirectory() || entry.isSymbolicLink())) return { eligible: false, reason: "contains-subdirectory" };
  const files = entries.filter((entry) => entry.isFile());
  if (!files.length) return { eligible: false, reason: "empty-directory" };
  if (files.some((entry) => !isMediaExtension(path.extname(entry.name)))) return { eligible: false, reason: "contains-non-media" };
  const queue = galleryDb.getActiveCollectionRecycle(galleryDbFile, collection.id);
  const latest = queue || galleryDb.getLatestCollectionRecycle(galleryDbFile, collection.id);
  const blocked = queue || (latest && ["failed", "skipped-ineligible"].includes(latest.status));
  return { eligible: !blocked, reason: queue ? "already-queued" : blocked ? "failed-awaiting-review" : "", collectionId: collection.id, title: collection.title,
    relativePath: parts.join(path.sep), pathParts: parts, sourcePath, queue };
}

function recycleSchedule(markedAt) {
  const eligible = new Date(markedAt.getTime() + 60 * 60 * 1000);
  const scheduled = new Date(eligible);
  if (scheduled.getMinutes() || scheduled.getSeconds() || scheduled.getMilliseconds()) scheduled.setHours(scheduled.getHours() + 1, 0, 0, 0);
  else scheduled.setMinutes(0, 0, 0);
  return { eligibleAt: eligible.toISOString(), scheduledAt: scheduled.toISOString() };
}

function markCollectionRecycle(request, collectionId, auth) {
  const eligibility = collectionRecycleEligibility(collectionId);
  if (!eligibility.eligible) { const error = new Error(`Collection is not eligible: ${eligibility.reason}`); error.statusCode = 409; throw error; }
  const marked = new Date();
  const schedule = recycleSchedule(marked);
  const item = galleryDb.createCollectionRecycle(galleryDbFile, { id: crypto.randomUUID(), collectionId: eligibility.collectionId,
    relativePath: eligibility.relativePath, title: eligibility.title, markedAt: marked.toISOString(), ...schedule,
    sourcePathSnapshot: eligibility.sourcePath, requestedIp: auth.sourceAddress, requestedScope: auth.scope });
  appendOperationLog({ ip: auth.sourceAddress, type: "collection-recycle-mark", title: "图集回收标记", work: eligibility.title, pathParts: eligibility.pathParts });
  return { ok: true, item };
}

function cancelCollectionRecycle(request, collectionId, auth) {
  const active = galleryDb.getActiveCollectionRecycle(galleryDbFile, collectionId);
  if (!active || active.status !== "pending") { const error = new Error("Pending recycle mark was not found."); error.statusCode = 409; throw error; }
  const result = galleryDb.cancelCollectionRecycle(galleryDbFile, collectionId);
  appendOperationLog({ ip: auth.sourceAddress, type: "collection-recycle-cancel", title: "取消图集回收", work: active.title, pathParts: active.relativePath.split(path.sep) });
  return { ok: true, ...result };
}

function collectionRecycleTarget(relativePath, id) {
  const base = path.resolve(trashDir, relativePath);
  if (!isInsideDir(trashDir, base)) throw new Error("Recycle target is outside TRASH_DIR.");
  if (!fs.existsSync(base)) return { path: base, conflict: false };
  const suffix = String(id).replace(/-/g, "").slice(0, 8);
  let candidate = `${base}.__recycle_${suffix}`;
  let attempt = 1;
  while (fs.existsSync(candidate)) { attempt += 1; candidate = `${base}.__recycle_${suffix}-${attempt}`; }
  return { path: candidate, conflict: true };
}

function processCollectionRecycleBatch(now = new Date()) {
  if (collectionRecycleRunning || maintenanceBusy("collection-recycle")) return { status: "skipped-busy", processed: 0, moved: 0 };
  collectionRecycleRunning = true;
  let moved = 0; const movedIds = [];
  const due = galleryDb.getDueCollectionRecycles(galleryDbFile, now.toISOString(), 100);
  try {
    for (const item of due) {
      galleryDb.updateCollectionRecycle(galleryDbFile, item.id, { status: "recycling", startedAt: new Date().toISOString() });
      appendOperationLog({ type: "collection-recycle-start", title: "开始图集回收", work: item.title, pathParts: item.relativePath.split(path.sep) });
      try {
        const check = collectionRecycleEligibility(item.collectionId);
        if (!check.eligible && check.reason !== "already-queued") throw Object.assign(new Error(check.reason), { ineligible: true });
        const sourcePath = check.sourcePath;
        const target = collectionRecycleTarget(item.relativePath, item.id);
        if (path.parse(sourcePath).root.toLowerCase() !== path.parse(target.path).root.toLowerCase()) throw new Error("Collection recycle requires PHOTOS_DIR and TRASH_DIR on the same volume.");
        if (isInsideDir(sourcePath, target.path) || isInsideDir(target.path, sourcePath)) throw new Error("Source and recycle target must not be nested.");
        fs.mkdirSync(path.dirname(target.path), { recursive: true });
        fs.renameSync(sourcePath, target.path);
        moved += 1;
        movedIds.push(item.id);
        galleryDb.updateCollectionRecycle(galleryDbFile, item.id, { status: target.conflict ? "conflict-renamed" : "recycled", finishedAt: new Date().toISOString(), recyclePath: path.relative(trashDir, target.path) });
        appendOperationLog({ type: "collection-recycle-success", title: "图集回收成功", work: item.title, pathParts: item.relativePath.split(path.sep) });
      } catch (error) {
        const status = error.ineligible ? "skipped-ineligible" : "failed";
        galleryDb.updateCollectionRecycle(galleryDbFile, item.id, { status, finishedAt: new Date().toISOString(), error: error.message });
        appendOperationLog({ type: `collection-recycle-${status}`, title: status === "failed" ? "图集回收失败" : "图集资格变化，已跳过", work: item.title, pathParts: item.relativePath.split(path.sep) });
      }
    }
  } finally { collectionRecycleRunning = false; }
  return { status: "completed", processed: due.length, moved, movedIds };
}

function startIndexAfterRecycle(reason, scheduledDate = "") {
  const batch = processCollectionRecycleBatch();
  if (maintenanceBusy("scan")) return { status: "skipped-busy", batch };
  const startedAt = new Date().toISOString();
  if (scheduledDate) galleryDb.upsertMaintenanceState(galleryDbFile, { taskKey: "daily-index-scan", scheduledDate, startedAt, status: "running", result: batch });
  startScanTask({ onComplete: (result) => {
    if (result.status !== "completed") for (const id of batch.movedIds || []) galleryDb.updateCollectionRecycle(galleryDbFile, id, { indexRefreshError: result.errorMessage || result.status });
    if (scheduledDate) galleryDb.upsertMaintenanceState(galleryDbFile, { taskKey: "daily-index-scan", scheduledDate, startedAt, finishedAt: new Date().toISOString(), status: result.status, result, error: result.errorMessage });
    logEvent("scheduled-index-scan-finished", { reason, status: result.status, scheduledDate });
  }});
  return { status: "running", batch };
}

function scheduleHourlyCollectionRecycle() {
  clearTimeout(hourlyCollectionRecycleTimer);
  const now = new Date(); const next = new Date(now); next.setHours(now.getHours() + 1, 0, 0, 0);
  const delay = collectionRecycleTestIntervalMs || Math.max(next.getTime() - now.getTime(), 1000);
  hourlyCollectionRecycleTimer = setTimeout(() => { const batch = processCollectionRecycleBatch(); const current = new Date(); const dailyWindow = dailyIndexScanEnabled && current.getHours() === dailyIndexScanHour && current.getMinutes() === dailyIndexScanMinute;
    if (batch.moved && !dailyWindow && !maintenanceBusy("scan")) startScanTask({ onComplete: (result) => { if (result.status !== "completed") for (const id of batch.movedIds || []) galleryDb.updateCollectionRecycle(galleryDbFile, id, { indexRefreshError: result.errorMessage || result.status }); } }); scheduleHourlyCollectionRecycle(); }, delay);
}

function runDailyIndexScanIfDue() {
  if (!dailyIndexScanEnabled) return;
  const now = new Date(); const date = localDateKey(now);
  const state = galleryDb.getMaintenanceState(galleryDbFile, "daily-index-scan", date);
  if (!dailyDue(now, dailyIndexScanHour, dailyIndexScanMinute, state)) return;
  try {
    const result = startIndexAfterRecycle("daily-index-scan", date);
    if (result.status === "skipped-busy") {
      galleryDb.upsertMaintenanceState(galleryDbFile, { taskKey: "daily-index-scan", scheduledDate: date, status: "skipped-busy", result });
      dailyIndexScanTimer = setTimeout(runDailyIndexScanIfDue, 10 * 60 * 1000);
    }
  } catch (error) {
    galleryDb.upsertMaintenanceState(galleryDbFile, { taskKey: "daily-index-scan", scheduledDate: date, finishedAt: new Date().toISOString(), status: "failed", error: error.message });
  }
}

function scheduleDailyIndexScan() {
  clearTimeout(dailyIndexScanTimer);
  if (!dailyIndexScanEnabled) return;
  runDailyIndexScanIfDue();
  const now = new Date(); const next = nextDailyTime(now, dailyIndexScanHour, dailyIndexScanMinute);
  dailyIndexScanTimer = setTimeout(() => { runDailyIndexScanIfDue(); scheduleDailyIndexScan(); }, Math.max(next.getTime() - now.getTime(), 1000));
}

function photoUrlToPath(src) {
  const sourceUrl = new URL(src, "http://localhost");
  const decodedPath = decodeURIComponent(sourceUrl.pathname);
  if (!decodedPath.startsWith("/photos/")) return "";
  const filePath = path.normalize(path.join(photosDir, decodedPath.replace(/^\/photos\/?/, "")));
  return isInsideDir(photosDir, filePath) ? filePath : "";
}

function openPhotoPath(request, response) {
  if (request.method !== "POST") {
    sendText(response, 405, "Method not allowed");
    return;
  }

  if (!isLocalRequest(request)) {
    sendText(response, 403, "Opening local paths is only available from this server PC.");
    return;
  }

  readRequestBody(request, (body) => {
    let payload = {};
    try {
      payload = JSON.parse(body || "{}");
    } catch (error) {
      sendText(response, 400, "Invalid JSON");
      return;
    }

    const filePath = photoUrlToPath(payload.src || "");
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      sendText(response, 404, "Photo not found");
      return;
    }

    if (process.platform !== "win32") {
      sendJson(response, { ok: false, path: filePath, message: "Opening Explorer is only supported on Windows." });
      return;
    }

    try {
      const child = spawn("explorer.exe", ["/select,", filePath], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      sendJson(response, { ok: true, path: filePath });
    } catch (error) {
      sendText(response, 500, "Failed to open Explorer");
    }
  });
}

function cacheControlFor(extension, assetVersion = "") {
  if (imageExtensions.has(extension) || videoExtensions.has(extension)) {
    return `public, max-age=${oneWeekSeconds}`;
  }

  if (staticAssetExtensions.has(extension)) {
    if (assetVersion === "vNext-dev") return "no-store";
    return "public, max-age=3600";
  }

  return "no-store";
}

function generateVideoPoster(sourcePath, posterPath) {
  if (fs.existsSync(posterPath)) return true;
  fs.mkdirSync(path.dirname(posterPath), { recursive: true });

  for (const second of ["5", "1", "0"]) {
    const result = spawnSync(
      ffmpegPath,
      ["-y", "-ss", second, "-i", sourcePath, "-frames:v", "1", "-vf", "scale=960:-2", "-q:v", "4", posterPath],
      { encoding: "utf8", timeout: 120000, windowsHide: true },
    );

    if (result.status === 0 && fs.existsSync(posterPath)) return true;
  }

  return false;
}

function generateImageThumbnail(sourcePath, thumbPath, width) {
  if (fs.existsSync(thumbPath)) return true;
  if (!enableImageThumbnailGeneration) return false;
  fs.mkdirSync(path.dirname(thumbPath), { recursive: true });

  const result = spawnSync(
    ffmpegPath,
    ["-y", "-i", sourcePath, "-vf", `scale=${width}:-2`, "-frames:v", "1", "-q:v", "5", thumbPath],
    { encoding: "utf8", timeout: 120000, windowsHide: true },
  );

  return result.status === 0 && fs.existsSync(thumbPath);
}

function sendFile(request, response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const assetVersion = new URL(request.url, `http://${request.headers.host || "localhost"}`).searchParams.get("v") || "";
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".avif": "image/avif",
    ".svg": "image/svg+xml",
    ".m3u8": "application/vnd.apple.mpegurl",
    ".ts": "video/mp2t",
    ".m4s": "video/iso.segment",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".m4v": "video/x-m4v",
    ".ogv": "video/ogg",
  };

  fs.stat(filePath, (error, stats) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    if (!stats.isFile()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const contentType = contentTypes[extension] || "application/octet-stream";
    const etag = `"${stats.size.toString(16)}-${Math.trunc(stats.mtimeMs).toString(16)}"`;
    const baseHeaders = {
      "Content-Type": contentType,
      "Cache-Control": isInsideDir(imagePreviewDir, filePath) ? "public, max-age=31536000, immutable" : cacheControlFor(extension, assetVersion),
      "Accept-Ranges": "bytes",
      ETag: etag,
      "Last-Modified": stats.mtime.toUTCString(),
    };

    if (request.headers["if-none-match"] === etag || (request.headers["if-modified-since"] && new Date(request.headers["if-modified-since"]).getTime() >= Math.trunc(stats.mtimeMs / 1000) * 1000)) {
      response.writeHead(304, baseHeaders);
      response.end();
      return;
    }

    const range = request.headers.range;
    if (range) {
      const match = range.match(/^bytes=(\d*)-(\d*)$/);
      if (!match) {
        response.writeHead(416, { ...baseHeaders, "Content-Range": `bytes */${stats.size}` });
        response.end();
        return;
      }

      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : stats.size - 1;

      if (start >= stats.size || end >= stats.size || start > end) {
        response.writeHead(416, { ...baseHeaders, "Content-Range": `bytes */${stats.size}` });
        response.end();
        return;
      }

      response.writeHead(206, {
        ...baseHeaders,
        "Content-Length": end - start + 1,
        "Content-Range": `bytes ${start}-${end}/${stats.size}`,
      });

      if (request.method === "HEAD") {
        response.end();
        return;
      }

      fs.createReadStream(filePath, { start, end }).pipe(response);
      return;
    }

    response.writeHead(200, {
      ...baseHeaders,
      "Content-Type": contentTypes[extension] || "application/octet-stream",
      "Content-Length": stats.size,
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    fs.createReadStream(filePath).pipe(response);
  });
}

function handleRequest(request, response) {
  const requestReceivedAt = performance.now();
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  if (requestUrl.pathname === "/api/image-hash-lookup") {
    if (request.method === "POST" && !requireAdminWrite(request, response, "image-hash-lookup")) return;
    handleImageHashLookup(request, response);
    return;
  }

  if (requestUrl.pathname === "/api/config") {
    sendJson(response, {
      dataSource: "sqlite",
      useSqliteApi: true,
    });
    return;
  }

  if (requestUrl.pathname === "/api/admin/capabilities") {
    const capability = adminAuthorizer.capability(request);
    sendJson(response, { authorized: capability.authorized, scope: capability.scope, sourceAddress: capability.sourceAddress,
      canScan: capability.authorized, canRecycle: capability.authorized, canRestore: capability.authorized,
      canRunDuplicateScan: capability.authorized, canRunImageLookup: capability.authorized,
      canRunSimilarityIndex: capability.authorized, canRunVideoCompatibilityCheck: capability.authorized,
      canMarkCollectionRecycle: capability.authorized, canOpenServerExplorer: capability.scope === "local" });
    return;
  }

  if (requestUrl.pathname === "/api/image-preview") {
    sendImagePreview(requestUrl, response);
    return;
  }

  if (requestUrl.pathname === "/api/video-compatible") {
    if (request.method === "GET" && !requireAdminWrite(request, response, "video-compatible-stream")) return;
    sendCompatibleVideo(request, requestUrl, response);
    return;
  }

  if (requestUrl.pathname === "/api/video-compatible/stop") {
    if (request.method === "POST" && !requireAdminWrite(request, response, "video-compatible-stop")) return;
    stopCompatibleVideo(request, response);
    return;
  }

  if (requestUrl.pathname === "/api/video-compatibility/status") {
    if (request.method !== "GET") {
      sendJsonError(response, 405, "Method not allowed");
      return;
    }
    sendJson(response, videoCompatibility.status());
    return;
  }

  if (requestUrl.pathname === "/api/video-compatibility/results") {
    if (request.method !== "GET") {
      sendJsonError(response, 405, "Method not allowed");
      return;
    }
    sendJson(response, videoCompatibility.query({
      page: requestUrl.searchParams.get("page"),
      pageSize: requestUrl.searchParams.get("pageSize"),
      status: requestUrl.searchParams.get("status"),
      search: requestUrl.searchParams.get("search"),
    }));
    return;
  }

  if (requestUrl.pathname.startsWith("/api/video-compatibility/scan/")) {
    if (request.method !== "POST") {
      sendJsonError(response, 405, "Method not allowed");
      return;
    }
    const action = requestUrl.pathname.slice("/api/video-compatibility/scan/".length);
    if (!requireAdminWrite(request, response, `video-compatibility-${action}`)) return;
    if (["start", "resume"].includes(action) && maintenanceBusy("video-compatibility")) {
      sendJsonError(response, 409, "Another maintenance task is running");
      return;
    }
    if (action === "start") {
      readRequestBody(request, (body) => {
        try {
          const payload = JSON.parse(body || "{}");
          sendJson(response, videoCompatibility.start({ mode: payload.mode, sample: payload.sample !== false }));
        } catch (error) {
          sendJsonError(response, error.statusCode || 400, error.message);
        }
      });
      return;
    }
    try {
      if (action === "pause") sendJson(response, videoCompatibility.pause());
      else if (action === "resume") sendJson(response, videoCompatibility.resume());
      else if (action === "stop") sendJson(response, videoCompatibility.stop());
      else sendJsonError(response, 404, "Unknown scan action");
    } catch (error) {
      sendJsonError(response, error.statusCode || 500, error.message);
    }
    return;
  }

  if (requestUrl.pathname === "/api/perceptual-index/status") {
    if (request.method !== "GET") { sendJsonError(response, 405, "Method not allowed"); return; }
    try { sendJson(response, { ok: true, ...perceptualIndex.status() }); }
    catch (error) { sendJsonError(response, 503, "Perceptual index database unavailable"); }
    return;
  }

  if (requestUrl.pathname.startsWith("/api/perceptual-index/")) {
    if (request.method !== "POST") { sendJsonError(response, 405, "Method not allowed"); return; }
    const action = requestUrl.pathname.slice("/api/perceptual-index/".length);
    if (!requireAdminWrite(request, response, `perceptual-index-${action}`)) return;
    if (["start", "resume"].includes(action) && maintenanceBusy("perceptual-index")) {
      sendJsonError(response, 409, "Another maintenance task is running");
      return;
    }
    readRequestBody(request, (body) => {
      try {
        const payload = JSON.parse(body || "{}");
        if (action === "start") sendJson(response, { ok: true, ...perceptualIndex.start({ limit: payload.limit }) });
        else if (action === "pause") sendJson(response, { ok: true, ...perceptualIndex.pause() });
        else if (action === "resume") sendJson(response, { ok: true, ...perceptualIndex.resume() });
        else if (action === "stop") sendJson(response, { ok: true, ...perceptualIndex.stop() });
        else sendJsonError(response, 404, "Unknown perceptual index action");
      } catch (error) { sendJsonError(response, error.statusCode || 400, error.message); }
    });
    return;
  }

  if (requestUrl.pathname === "/api/video-playback-events") {
    if (request.method !== "POST") {
      sendJsonError(response, 405, "Method not allowed");
      return;
    }
    readRequestBody(request, (body) => {
      try {
        sendJson(response, recordVideoPlaybackEvent(request, JSON.parse(body || "{}")));
      } catch (error) {
        sendJsonError(response, error.statusCode || 400, error.message);
      }
    });
    return;
  }

  if (requestUrl.pathname === "/api/highlights") {
    try {
      const hourKey = startOfHour();
      const items = readStoredHighlights(hourKey) || ensureHighlightCarouselFromDb(false);
      sendJson(response, { items });
    } catch (error) {
      console.error("Highlight API failed:", error);
      sendJsonError(response, 500, error.message);
    }
    return;
  }

  if (requestUrl.pathname === "/api/recent") {
    sendUserMarks(request, response, "recent", 20);
    return;
  }

  if (requestUrl.pathname === "/api/favorites") {
    sendUserMarks(request, response, "favorite", 100);
    return;
  }

  if (requestUrl.pathname === "/api/access-log") {
    if (request.method === "GET") {
      accessLogInitialization.then(() => {
        const page = requestUrl.searchParams.get("page") || 1;
        const pageSize = requestUrl.searchParams.get("pageSize") || requestUrl.searchParams.get("limit") || 50;
        sendJson(response, galleryDb.getAccessLogsPage(galleryDbFile, page, pageSize));
      }).catch((error) => sendJsonError(response, 500, error.message));
      return;
    }
    if (request.method === "POST") {
      readRequestBody(request, (body) => {
        try {
          const payload = JSON.parse(body || "{}");
          accessLogInitialization
            .then(() => sendJson(response, { ok: true, item: appendAccessLog(request, payload) }))
            .catch((error) => sendJsonError(response, 500, error.message));
        } catch (error) {
          sendJsonError(response, 400, error.message);
        }
      });
      return;
    }
    sendJsonError(response, 405, "Method not allowed");
    return;
  }

  if (requestUrl.pathname === "/api/duplicate-delete-marks") {
    if (request.method !== "GET" && !requireAdminWrite(request, response, "duplicate-mark")) return;
    sendUserMarks(request, response, "duplicate-delete", 500);
    return;
  }

  if (requestUrl.pathname === "/api/media-cleanup/status") {
    if (request.method !== "GET") {
      sendJsonError(response, 405, "Method not allowed");
      return;
    }
    sendJson(response, mediaCleanupSnapshot());
    return;
  }

  if (requestUrl.pathname === "/api/media-cleanup/scan/start" || requestUrl.pathname === "/api/media-cleanup/scan/stop") {
    if (request.method !== "POST") {
      sendJsonError(response, 405, "Method not allowed");
      return;
    }
    if (!requireAdminWrite(request, response, requestUrl.pathname.endsWith("/start") ? "media-cleanup-scan" : "media-cleanup-stop")) return;
    try {
      sendJson(response, requestUrl.pathname.endsWith("/start") ? startMediaCleanupScan() : stopMediaCleanupScan());
    } catch (error) {
      sendJsonError(response, error.statusCode || 500, error.message);
    }
    return;
  }

  if (requestUrl.pathname === "/api/media-cleanup/results") {
    if (request.method !== "GET") {
      sendJsonError(response, 405, "Method not allowed");
      return;
    }
    queryMediaCleanupResults(requestUrl)
      .then((result) => sendJson(response, result))
      .catch((error) => sendJsonError(response, error.statusCode || 500, error.message));
    return;
  }

  if (requestUrl.pathname === "/api/media-cleanup/delete") {
    sendJsonError(response, 410, "Permanent media cleanup deletion has been removed. Use /api/media-cleanup/recycle.");
    return;
  }

  if (requestUrl.pathname === "/api/media-cleanup/recycle" || requestUrl.pathname === "/api/media-cleanup/restore") {
    if (request.method !== "POST") {
      sendJsonError(response, 405, "Method not allowed");
      return;
    }
    if (!requireAdminWrite(request, response, requestUrl.pathname.endsWith("/restore") ? "media-cleanup-restore" : "media-cleanup-recycle")) return;
    readRequestBody(request, (body) => {
      try {
        const mode = requestUrl.pathname.endsWith("/restore") ? "Restore" : "Recycle";
        sendJson(response, startMediaCleanupOperation(request, JSON.parse(body || "{}"), mode));
      } catch (error) {
        sendJsonError(response, error.statusCode || 500, error.message);
      }
    });
    return;
  }

  if (requestUrl.pathname === "/api/scan") {
    if (request.method !== "POST") {
      sendJsonError(response, 405, "Method not allowed");
      return;
    }
    if (!requireAdminWrite(request, response, "gallery-scan")) return;
    try { sendJson(response, startScanTask()); } catch (error) { sendJsonError(response, error.statusCode || 500, error.message); }
    return;
  }

  if (requestUrl.pathname === "/api/scan/status") {
    sendJson(response, scanTaskSnapshot());
    return;
  }

  if (requestUrl.pathname === "/api/duplicates/scan") {
    if (request.method !== "POST") {
      sendJsonError(response, 405, "Method not allowed");
      return;
    }
    const auth = requireAdminWrite(request, response, "duplicate-scan");
    if (!auth) return;
    try { sendJson(response, startDuplicateTask({
      remoteAddress: request.socket.remoteAddress || "",
      host: request.headers.host || "",
      referer: request.headers.referer || "",
      userAgent: request.headers["user-agent"] || "",
      requestedScope: auth.scope,
    })); } catch (error) { sendJsonError(response, error.statusCode || 500, error.message); }
    return;
  }

  if (requestUrl.pathname === "/api/duplicates/status") {
    sendJson(response, duplicateTaskSnapshot());
    return;
  }

  if (requestUrl.pathname === "/api/duplicates/stop") {
    if (request.method !== "POST") {
      sendJsonError(response, 405, "Method not allowed");
      return;
    }
    if (!requireAdminWrite(request, response, "duplicate-stop")) return;
    sendJson(response, stopDuplicateTask());
    return;
  }

  if (requestUrl.pathname === "/api/duplicates") {
    sendDbResponse(response, () =>
      galleryDb.getExactDuplicateGroups(galleryDbFile, {
        limit: requestUrl.searchParams.get("limit") || "",
        offset: requestUrl.searchParams.get("offset") || "",
      })
    );
    return;
  }

  if (requestUrl.pathname === "/api/duplicates/recycle") {
    if (!requireAdminWrite(request, response, "duplicate-recycle")) return;
    recycleDuplicateItems(request, response, "selected");
    return;
  }

  if (requestUrl.pathname === "/api/duplicates/recycle-auto") {
    if (!requireAdminWrite(request, response, "duplicate-recycle-auto")) return;
    recycleDuplicateItems(request, response, "auto");
    return;
  }

  if (requestUrl.pathname === "/api/refresh-index") {
    if (request.method !== "POST") { sendJsonError(response, 405, "Method not allowed"); return; }
    if (!requireAdminWrite(request, response, "gallery-index-refresh")) return;
    try { sendJson(response, startScanTask()); } catch (error) { sendJsonError(response, error.statusCode || 500, error.message); }
    return;
  }

  if (requestUrl.pathname === "/api/collection-recycle/status") {
    const collectionId = requestUrl.searchParams.get("collectionId") || "";
    try {
      const check = collectionRecycleEligibility(collectionId);
      const active = galleryDb.getActiveCollectionRecycle(galleryDbFile, collectionId);
      sendJson(response, { collectionId, eligible: check.eligible, reason: check.reason, item: active,
        canMark: adminAuthorizer.capability(request).authorized && check.eligible });
    } catch (error) { sendJsonError(response, error.statusCode || 500, error.message); }
    return;
  }

  if (requestUrl.pathname === "/api/collection-recycle/queue") {
    sendDbResponse(response, () => galleryDb.getCollectionRecyclePage(galleryDbFile, requestUrl.searchParams.get("page"), requestUrl.searchParams.get("pageSize")));
    return;
  }

  if (requestUrl.pathname === "/api/collection-recycle/mark" || requestUrl.pathname === "/api/collection-recycle/cancel") {
    if (request.method !== "POST") { sendJsonError(response, 405, "Method not allowed"); return; }
    const auth = requireAdminWrite(request, response, requestUrl.pathname.endsWith("/mark") ? "collection-recycle-mark" : "collection-recycle-cancel");
    if (!auth) return;
    readRequestBody(request, (body) => { try { const payload=JSON.parse(body||"{}"); const collectionId=String(payload.collectionId||"");
      sendJson(response, requestUrl.pathname.endsWith("/mark") ? markCollectionRecycle(request, collectionId, auth) : cancelCollectionRecycle(request, collectionId, auth));
    } catch (error) { sendJsonError(response, error.statusCode || 500, error.message); } });
    return;
  }

  if (requestUrl.pathname === "/api/index/changes") {
    sendDbResponse(response, () => {
      const current = computeDirectorySignature(photosDir);
      const previous = fs.existsSync(galleryDbFile) ? galleryDb.getScanState(galleryDbFile, globalScanStatePath) : null;
      return {
        changed: !previous || previous.signature !== current.signature,
        current,
        previous,
      };
    });
    return;
  }

  if (requestUrl.pathname === "/api/index/changed-directories") {
    sendDbResponse(response, detectChangedDirectories);
    return;
  }

  if (handleIndexApi(requestUrl, response, requestReceivedAt)) {
    return;
  }

  if (requestUrl.pathname === "/api/gallery" || requestUrl.pathname === "/api/refresh") {
    sendJsonError(response, 410, "Legacy gallery JSON API is disabled. Use SQLite collection APIs.");
    return;
  }

  if (requestUrl.pathname === "/api/open-photo-path") {
    openPhotoPath(request, response);
    return;
  }

  const decodedPath = decodeURIComponent(requestUrl.pathname);

  if (decodedPath === "/photos" || decodedPath.startsWith("/photos/")) {
    const mediaPath = path.normalize(path.join(photosDir, decodedPath.replace(/^\/photos\/?/, "")));

    if (!isInsideDir(photosDir, mediaPath)) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }

    sendFile(request, response, mediaPath);
    return;
  }

  if (decodedPath === "/highlight-carousel" || decodedPath.startsWith("/highlight-carousel/")) {
    const mediaPath = path.normalize(path.join(highlightDir, decodedPath.replace(/^\/highlight-carousel\/?/, "")));

    if (!isInsideDir(highlightDir, mediaPath)) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }

    sendFile(request, response, mediaPath);
    return;
  }

  if (decodedPath.startsWith("/video-posters/")) {
    const posterId = path.basename(decodedPath, ".jpg");
    const sourcePath = resolveVideoPosterSource(posterId);
    const posterPath = path.join(thumbnailsDir, `${posterId}.jpg`);

    if (!sourcePath || !isInsideDir(thumbnailsDir, posterPath)) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    if (!generateVideoPoster(sourcePath, posterPath)) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Poster unavailable");
      return;
    }

    sendFile(request, response, posterPath);
    return;
  }

  if (decodedPath.startsWith("/image-thumbnails/")) {
    const match = decodedPath.match(/^\/image-thumbnails\/(480|720|960)\/([a-f0-9]+)\.jpg$/);
    if (!match) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const width = Number(match[1]);
    const id = match[2];
    const sourcePath = resolveImageThumbnailSource(width, id);
    const thumbPath = path.join(imageThumbnailsDir, String(width), `${id}.jpg`);

    if (!sourcePath || !isInsideDir(imageThumbnailsDir, thumbPath)) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    if (generateImageThumbnail(sourcePath, thumbPath, width)) {
      sendFile(request, response, thumbPath);
      return;
    }

    sendFile(request, response, sourcePath);
    return;
  }

  if (decodedPath.startsWith("/image-previews/")) {
    const match = decodedPath.match(/^\/image-previews\/([a-f0-9]{64})\.webp$/);
    if (!match) {
      sendText(response, 404, "Not found");
      return;
    }
    const previewPath = path.join(imagePreviewDir, `${match[1]}.webp`);
    if (!isInsideDir(imagePreviewDir, previewPath)) {
      sendText(response, 403, "Forbidden");
      return;
    }
    sendFile(request, response, previewPath);
    return;
  }

  if (decodedPath === "/hls" || decodedPath.startsWith("/hls/")) {
    const hlsPath = path.normalize(path.join(hlsDir, decodedPath.replace(/^\/hls\/?/, "")));

    if (!isInsideDir(hlsDir, hlsPath)) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }

    sendFile(request, response, hlsPath);
    return;
  }

  const requestedPath = decodedPath === "/" ? "/index.html" : decodedPath;
  const filePath = path.normalize(path.join(rootDir, requestedPath));

  if (!isInsideDir(rootDir, filePath)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  sendFile(request, response, filePath);
}

function runScanOnce() {
  try {
    ensureFolders();
    const progress = computeDirectorySignature(photosDir);
    console.log(JSON.stringify({
      type: "scan-progress",
      dirCount: progress.dirCount,
      fileCount: progress.fileCount,
      currentDirectory: "Refreshing SQLite index",
    }));
    const result = refreshGalleryIndex();
    console.log(JSON.stringify({ type: "scan-result", result }));
    process.exit(0);
  } catch (error) {
    console.error(error.stack || error.message || String(error));
    process.exit(1);
  }
}

if (process.env.RUN_SCAN_ONCE === "1") {
  runScanOnce();
} else {
  ensureFolders();
  restoreLatestMediaCleanupTask();
  scheduleAccessLogMaintenance();
  scheduleHourlyGalleryRefresh();
  const startupRecycleBatch = processCollectionRecycleBatch();
  if (startupRecycleBatch.moved && !maintenanceBusy("scan")) startScanTask({ onComplete: (result) => { if (result.status !== "completed") for (const id of startupRecycleBatch.movedIds || []) galleryDb.updateCollectionRecycle(galleryDbFile, id, { indexRefreshError: result.errorMessage || result.status }); } });
  scheduleHourlyCollectionRecycle();
  scheduleDailyIndexScan();

  const httpServer = http.createServer(handleRequest).listen(port, host, () => {
    console.log(`Photo gallery site started: http://localhost:${port}`);
    console.log(`Listening host: ${host}`);
    console.log(`Media folder: ${photosDir}`);
    console.log(`FFprobe path: ${ffprobePath}`);
    console.log(`SQLite index: ${galleryDbFile}`);
  });
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    videoCompatibility.shutdown();
    perceptualIndex.shutdown();
    if (activeCompatibleVideoStream) terminateCompatibleVideoChild(activeCompatibleVideoStream.child);
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  process.once("exit", () => {
    videoCompatibility.shutdown();
    perceptualIndex.shutdown();
    if (activeCompatibleVideoStream) terminateCompatibleVideoChild(activeCompatibleVideoStream.child);
  });
}
