"use strict";

const fs = require("fs");
const path = require("path");
const searchFts = require("../search-fts");

const REPOSITORY_ROOT = path.resolve(__dirname, "..");
const EXPERIMENT_ROOT = path.join(REPOSITORY_ROOT, "tmp", "fts5-prototype");
const FORMAL_DATABASE = path.resolve("D:\\GalleryRuntime\\data\\gallery.db");
const MEDIA_CARD_COLUMNS = [
  "id",
  "collection_id",
  "type",
  "title",
  "file_name",
  "src",
  "thumb",
  "detail_thumb",
  "carousel_thumb",
  "poster",
];

function argumentValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] !== undefined ? process.argv[index + 1] : fallback;
}

function canonicalPath(value) {
  return path.resolve(String(value || "")).replace(/[\\/]+$/, "").toLocaleLowerCase("en-US");
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertSafeExperimentPaths(sourceValue, targetValue) {
  if (!sourceValue || !targetValue) throw new Error("Both --source and --db must be explicit absolute or resolvable paths");
  const source = path.resolve(sourceValue);
  const target = path.resolve(targetValue);
  if (canonicalPath(source) === canonicalPath(target)) throw new Error("Refusing to use the same database as source and experiment target");
  if (canonicalPath(target) === canonicalPath(FORMAL_DATABASE)) throw new Error("Refusing to write the formal Runtime database");
  if (!isWithin(EXPERIMENT_ROOT, target)) {
    throw new Error(`Experiment target must stay under ${EXPERIMENT_ROOT}`);
  }
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error(`Source database does not exist: ${source}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  return { source, target };
}

function quoteMatchText(value) {
  return searchFts.quoteMatchText(value);
}

function escapeLike(value) {
  return searchFts.escapeLike(value);
}

function normalizeRelativeSource(value) {
  const source = String(value || "").trim().replace(/\\/g, "/");
  return source.replace(/^(?:[a-z]+:\/\/[^/]+)?\/?(?:photos\/)+/iu, "");
}

function normalizeDecodedRelativeSource(value) {
  return searchFts.normalizeRelativeSource(value);
}

function round(value, digits = 3) {
  const scale = 10 ** digits;
  return Math.round(Number(value || 0) * scale) / scale;
}

function fileBytes(file) {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

function databaseFiles(dbFile) {
  return [dbFile, `${dbFile}-wal`, `${dbFile}-shm`, `${dbFile}-journal`].map((file) => ({
    file,
    bytes: fileBytes(file),
  }));
}

module.exports = {
  EXPERIMENT_ROOT,
  FORMAL_DATABASE,
  MEDIA_CARD_COLUMNS,
  argumentValue,
  assertSafeExperimentPaths,
  databaseFiles,
  escapeLike,
  fileBytes,
  normalizeRelativeSource,
  normalizeDecodedRelativeSource,
  quoteMatchText,
  round,
};
