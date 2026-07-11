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

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function writeProgress(payload) {
  process.stdout.write(`${JSON.stringify({ type: "duplicate-progress", ...payload })}\n`);
}

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
  let processed = 0;
  let errorCount = 0;
  let lastFile = "";

  for (;;) {
    const batch = galleryDb.getImagesNeedingHash(galleryDbFile, batchSize);
    if (!batch.length) break;

    for (const item of batch) {
      lastFile = item.file || item.title || item.src || "";
      try {
        const filePath = mediaSrcToPath(item.src || "");
        if (!filePath || !fs.existsSync(filePath)) {
          errorCount += 1;
          markHashFailure(item, "file not found");
          processed += 1;
          continue;
        }
        const sha256 = await sha256File(filePath);
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
        processed += 1;
      } catch (error) {
        errorCount += 1;
        try {
          markHashFailure(item, error.message);
          processed += 1;
        } catch (markError) {
          errorCount += 1;
        }
      }

      if (processed % 25 === 0) {
        writeProgress({ processed, errorCount, currentFile: lastFile, stats: galleryDb.getDuplicateHashStats(galleryDbFile) });
      }
    }
  }

  process.stdout.write(
    `${JSON.stringify({
      type: "duplicate-result",
      result: {
        processed,
        errorCount,
        currentFile: lastFile,
        stats: galleryDb.getDuplicateHashStats(galleryDbFile),
      },
    })}\n`
  );
}

run().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
