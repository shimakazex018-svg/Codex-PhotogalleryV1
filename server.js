const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");
const galleryDb = require("./gallery-db");

const rootDir = __dirname;

function resolveConfiguredPath(value, fallback) {
  if (!value) return fallback;
  return path.isAbsolute(value) ? value : path.resolve(rootDir, value);
}

const photosDir = resolveConfiguredPath(process.env.PHOTOS_DIR, path.join(rootDir, "photos"));
const dataDir = resolveConfiguredPath(process.env.DATA_DIR, path.join(rootDir, "data"));
const thumbnailsDir = resolveConfiguredPath(process.env.THUMBNAILS_DIR, path.join(dataDir, "video-thumbnails"));
const imageThumbnailsDir = path.join(dataDir, "thumbnails");
const hlsDir = resolveConfiguredPath(process.env.HLS_DIR, path.join(dataDir, "hls"));
const highlightDir = path.join(dataDir, "highlight-carousel");
const trashDir = resolveConfiguredPath(process.env.TRASH_DIR, path.join(path.dirname(photosDir), "回收站"));
const logsDir = path.join(dataDir, "logs");
const galleryFile = path.join(dataDir, "gallery.json");
const galleryDbFile = path.join(dataDir, "gallery.db");
const highlightFile = path.join(dataDir, "highlight-carousel.json");
const videoMetadataFile = path.join(dataDir, "video-metadata.json");
const port = Number(process.env.PORT || 48101);
const host = process.env.HOST || "0.0.0.0";
const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";
const ffprobePath = process.env.FFPROBE_PATH || (path.basename(ffmpegPath).toLowerCase().startsWith("ffmpeg") ? path.join(path.dirname(ffmpegPath), process.platform === "win32" ? "ffprobe.exe" : "ffprobe") : "ffprobe");
const allowRemoteDelete = process.env.ALLOW_REMOTE_DELETE === "1" || process.env.ALLOW_REMOTE_DELETE === "true";
const enableImageThumbnailGeneration = process.env.ENABLE_IMAGE_THUMBNAIL_GENERATION === "1" || process.env.ENABLE_IMAGE_THUMBNAIL_GENERATION === "true";
const duplicateRecycleLimit = 50000;
const videoPosterSources = new Map();
const imageThumbnailSources = new Map();
let videoMetadataCache = null;
let videoMetadataDirty = false;
let videoMetadataProbeStartedAt = 0;
const videoMetadataProbeBudgetMs = 10000;
const videoMetadataProbeTimeoutMs = 5000;

const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);
const videoExtensions = new Set([".mp4", ".webm", ".mov", ".m4v", ".ogv"]);
const staticAssetExtensions = new Set([".css", ".js"]);
const oneWeekSeconds = 7 * 24 * 60 * 60;
const highlightSelectionVersion = 2;
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

function ensureFolders() {
  fs.mkdirSync(photosDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(thumbnailsDir, { recursive: true });
  fs.mkdirSync(imageThumbnailsDir, { recursive: true });
  fs.mkdirSync(hlsDir, { recursive: true });
  fs.mkdirSync(highlightDir, { recursive: true });
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
      if (!entry.isFile() || !entry.name.endsWith(".log")) continue;
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

function accessLogPath(day = new Date().toISOString().slice(0, 10)) {
  return path.join(logsDir, `access-${day}.log`);
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
  fs.mkdirSync(logsDir, { recursive: true });
  cleanupOldLogs();
  fs.appendFileSync(accessLogPath(now.toISOString().slice(0, 10)), `${JSON.stringify(payload)}\n`, "utf8");
  return payload;
}

function readAccessLogs(limitValue = 100) {
  const limit = Math.min(Math.max(Number(limitValue) || 100, 1), 500);
  if (!fs.existsSync(logsDir)) return [];
  const files = fs
    .readdirSync(logsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^access-\d{4}-\d{2}-\d{2}\.log$/.test(entry.name))
    .map((entry) => path.join(logsDir, entry.name))
    .sort((a, b) => b.localeCompare(a));
  const items = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).reverse();
    for (const line of lines) {
      try {
        items.push(JSON.parse(line.replace(/^\uFEFF/, "")));
      } catch (error) {
        // Ignore malformed historical log lines.
      }
      if (items.length >= limit) return items;
    }
  }
  return items;
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
    const filesExist = items.every((item) => {
      const itemPath = path.normalize(path.join(highlightDir, path.basename(item.src || "")));
      return isInsideDir(highlightDir, itemPath) && fs.existsSync(itemPath);
    });
    if (stored.hourKey === hourKey && stored.version === highlightSelectionVersion && filesExist) return items;
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

  clearHighlightFolder();
  const selected = shuffleItems(bestHighlightGroup(collectHighlightCandidatesFromDb())).slice(0, 20);
  const items = [];

  const filePrefix = fileSafeHourKey(hourKey);
  selected.forEach((candidate, index) => {
    const sourcePath = candidate.sourcePath || photoUrlToPath(candidate.source);
    if (!sourcePath || !fs.existsSync(sourcePath)) return;

    const thumbId = path.basename(candidate.carouselThumb || "", ".jpg");
    const thumbPath = thumbId ? path.join(imageThumbnailsDir, "960", `${thumbId}.jpg`) : "";
    const copyPath =
      thumbPath && isInsideDir(imageThumbnailsDir, thumbPath) && generateImageThumbnail(sourcePath, thumbPath, 960)
        ? thumbPath
        : sourcePath;

    const extension = path.extname(copyPath).toLowerCase() || ".jpg";
    const fileName = `${filePrefix}-${String(index + 1).padStart(2, "0")}${extension}`;
    const targetPath = path.join(highlightDir, fileName);
    fs.copyFileSync(copyPath, targetPath);
    items.push({
      src: toHighlightUrl(targetPath),
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

function handleIndexApi(requestUrl, response) {
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
      items: galleryDb.getRootCollections(galleryDbFile),
    }));
    return true;
  }

  if (requestUrl.pathname.startsWith("/api/collections/")) {
    const id = decodeURIComponent(requestUrl.pathname.slice("/api/collections/".length));
    try {
      const collection = galleryDb.getCollection(galleryDbFile, id);
      if (!collection) {
        sendJsonError(response, 404, "Collection not found");
      } else {
        sendJson(response, collection);
      }
    } catch (error) {
      if (isSqliteCorruption(error)) {
        try {
          rebuildGalleryDbFromJson();
          const collection = galleryDb.getCollection(galleryDbFile, id);
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
      galleryDb.getMedia(galleryDbFile, collectionId, {
        type: requestUrl.searchParams.get("type") || "",
        limit: requestUrl.searchParams.get("limit") || "",
        offset: requestUrl.searchParams.get("offset") || "",
      })
    );
    return true;
  }

  if (requestUrl.pathname === "/api/search") {
    sendDbResponse(response, () => galleryDb.search(galleryDbFile, requestUrl.searchParams.get("q") || "", requestUrl.searchParams.get("limit") || ""));
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

function startScanTask() {
  if (scanTask.status === "running") return scanTaskSnapshot();

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
  });

  child.on("close", (code) => {
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
  const remoteAllowed = allowRemoteDelete || isLocalRequest(request);
  if (!remoteAllowed) {
    sendJsonError(response, 403, "Deleting files is only available from this server PC.");
    return;
  }

  readRequestBody(request, (body) => {
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

      const cleanup = galleryDb.removeMediaRecords(galleryDbFile, deletedIds);
      logEvent("duplicate-recycle", {
        mode,
        ip: clientAddress(request),
        limit,
        requested: mode === "auto" ? items.length : ids.length,
        recycled: deletedIds.length,
        failed: failed.length,
        skipped: skipped.length,
        allowRemoteDelete,
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
    }
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

function readRequestBody(request, callback) {
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    body += chunk;
    if (body.length > 8192) request.destroy();
  });
  request.on("end", () => callback(body));
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

function cacheControlFor(extension) {
  if (imageExtensions.has(extension) || videoExtensions.has(extension)) {
    return `public, max-age=${oneWeekSeconds}`;
  }

  if (staticAssetExtensions.has(extension)) {
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
    const baseHeaders = {
      "Content-Type": contentType,
      "Cache-Control": cacheControlFor(extension),
      "Accept-Ranges": "bytes",
    };

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
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  if (requestUrl.pathname === "/api/config") {
    sendJson(response, {
      dataSource: "sqlite",
      useSqliteApi: true,
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
      sendJson(response, { items: readAccessLogs(requestUrl.searchParams.get("limit") || 100) });
      return;
    }
    if (request.method === "POST") {
      readRequestBody(request, (body) => {
        try {
          const payload = JSON.parse(body || "{}");
          sendJson(response, { ok: true, item: appendAccessLog(request, payload) });
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
    sendUserMarks(request, response, "duplicate-delete", 500);
    return;
  }

  if (requestUrl.pathname === "/api/scan") {
    if (request.method !== "POST") {
      sendJsonError(response, 405, "Method not allowed");
      return;
    }
    sendJson(response, startScanTask());
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
    sendJson(response, startDuplicateTask({
      remoteAddress: request.socket.remoteAddress || "",
      host: request.headers.host || "",
      referer: request.headers.referer || "",
      userAgent: request.headers["user-agent"] || "",
    }));
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
    recycleDuplicateItems(request, response, "selected");
    return;
  }

  if (requestUrl.pathname === "/api/duplicates/recycle-auto") {
    recycleDuplicateItems(request, response, "auto");
    return;
  }

  if (requestUrl.pathname === "/api/refresh-index") {
    sendDbResponse(response, refreshGalleryIndex);
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

  if (handleIndexApi(requestUrl, response)) {
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
  scheduleHourlyGalleryRefresh();

  http.createServer(handleRequest).listen(port, host, () => {
    console.log(`Photo gallery site started: http://localhost:${port}`);
    console.log(`Listening host: ${host}`);
    console.log(`Media folder: ${photosDir}`);
    console.log(`FFprobe path: ${ffprobePath}`);
    console.log(`SQLite index: ${galleryDbFile}`);
  });
}
