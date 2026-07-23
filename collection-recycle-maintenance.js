const fs = require("fs");
const path = require("path");
const { isMediaExtension } = require("./media-types");
const galleryDb = require("./gallery-db");

function isInsideDir(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function hasReparsePointBetween(root, target) {
  let current = path.resolve(root);
  if (fs.lstatSync(current).isSymbolicLink()) return true;
  const relative = path.relative(current, path.resolve(target));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return relative !== "";
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) return true;
  }
  return false;
}

function collectionTarget(trashDir, relativePath, id) {
  const base = path.resolve(trashDir, relativePath);
  if (!isInsideDir(trashDir, base)) throw new Error("Recycle target is outside TRASH_DIR.");
  if (!fs.existsSync(base)) return { path: base, conflict: false };
  const suffix = String(id).replace(/-/g, "").slice(0, 8);
  let candidate = `${base}.__recycle_${suffix}`;
  let attempt = 1;
  while (fs.existsSync(candidate)) { attempt += 1; candidate = `${base}.__recycle_${suffix}-${attempt}`; }
  return { path: candidate, conflict: true };
}

function validateSource(item, photosDir) {
  const collection = galleryDb.getCollection(item.dbFile, item.collectionId);
  const parts = Array.isArray(collection?.pathParts) ? collection.pathParts : [];
  if (!collection || !parts.length || parts.some((part) => !part || part === "." || part === ".." || /[\\/]/.test(part))) throw Object.assign(new Error("invalid-collection-path"), { ineligible: true });
  const sourcePath = path.resolve(photosDir, ...parts);
  if (!isInsideDir(photosDir, sourcePath) || !fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isDirectory()) throw Object.assign(new Error("directory-missing"), { ineligible: true });
  if (hasReparsePointBetween(photosDir, sourcePath)) throw Object.assign(new Error("reparse-point"), { ineligible: true });
  const entries = fs.readdirSync(sourcePath, { withFileTypes: true });
  if (entries.some((entry) => entry.isDirectory() || entry.isSymbolicLink())) throw Object.assign(new Error("contains-subdirectory"), { ineligible: true });
  const files = entries.filter((entry) => entry.isFile());
  if (!files.length) throw Object.assign(new Error("empty-directory"), { ineligible: true });
  if (files.some((entry) => !isMediaExtension(path.extname(entry.name)))) throw Object.assign(new Error("contains-non-media"), { ineligible: true });
  return { sourcePath, fileCount: files.length };
}

function processReadyItem(item, options) {
  const now = options.now || new Date();
  const retryCount = Number(item.retryCount || 0) + 1;
  galleryDb.updateCollectionRecycle(options.dbFile, item.id, { status: "recycling", startedAt: now.toISOString(), finishedAt: null, nextRetryTime: null, retryCount });
  let sourcePath = item.sourcePathSnapshot || "";
  let targetPath = "";
  try {
    const source = validateSource({ ...item, dbFile: options.dbFile }, options.photosDir);
    sourcePath = source.sourcePath;
    const target = collectionTarget(options.trashDir, item.relativePath, item.id);
    targetPath = target.path;
    if (path.parse(sourcePath).root.toLowerCase() !== path.parse(targetPath).root.toLowerCase()) throw new Error("Collection recycle requires PHOTOS_DIR and TRASH_DIR on the same volume.");
    if (isInsideDir(sourcePath, targetPath) || isInsideDir(targetPath, sourcePath)) throw new Error("Source and recycle target must not be nested.");
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    (options.renameSync || fs.renameSync)(sourcePath, targetPath);
    const status = target.conflict ? "conflict-renamed" : "recycled";
    galleryDb.updateCollectionRecycle(options.dbFile, item.id, { status, finishedAt: new Date().toISOString(), recyclePath: path.relative(options.trashDir, targetPath), error: null, lastError: null, nextRetryTime: null });
    options.log?.("recycle_success", { id: item.id, collectionId: item.collectionId, sourcePath, targetPath, fileCount: source.fileCount, retryCount, conflictRenamed: target.conflict });
    return { moved: true, id: item.id, status, fileCount: source.fileCount };
  } catch (error) {
    const status = error.ineligible ? "skipped-ineligible" : "recycle_failed";
    galleryDb.updateCollectionRecycle(options.dbFile, item.id, { status, finishedAt: new Date().toISOString(), error: error.message, lastError: error.message, retryCount, nextRetryTime: null });
    options.log?.("recycle_failed", { id: item.id, collectionId: item.collectionId, sourcePath, targetPath, errorType: error.code || (error.ineligible ? "INELIGIBLE" : "UNKNOWN"), error: error.message, retryCount });
    return { moved: false, id: item.id, status, error: error.message };
  }
}

function runCollectionRecycleMaintenance(options) {
  const now = options.now || new Date();
  const prepared = galleryDb.prepareCollectionRecycleMaintenance(options.dbFile, now.toISOString());
  const items = galleryDb.getReadyCollectionRecycles(options.dbFile, 200);
  const results = items.map((item) => processReadyItem(item, { ...options, now }));
  return { prepared, processed: results.length, moved: results.filter((result) => result.moved).length, failed: results.filter((result) => !result.moved).length, results };
}

module.exports = { runCollectionRecycleMaintenance, validateSource, collectionTarget };
