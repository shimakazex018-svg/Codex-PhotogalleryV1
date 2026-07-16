"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { DatabaseSync } = require("node:sqlite");
const { EXPERIMENT_ROOT, quoteMatchText } = require("./fts5-prototype-lib");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runScript(script, args, expectedStatus = 0) {
  const result = spawnSync(process.execPath, [path.join(__dirname, script), ...args], {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  });
  assert(result.status === expectedStatus, `${script} exited ${result.status}: ${result.stderr || result.stdout}`);
  return result;
}

fs.mkdirSync(EXPERIMENT_ROOT, { recursive: true });
const root = fs.mkdtempSync(path.join(EXPERIMENT_ROOT, "test-"));
const source = path.join(root, "source.db");
const target = path.join(root, "mapped", "gallery.db");
const buildOutput = path.join(root, "mapped", "build.json");
const benchmarkOutput = path.join(root, "mapped", "benchmark.json");

try {
  const db = new DatabaseSync(source);
  db.exec(`
    CREATE TABLE collections (id TEXT PRIMARY KEY, title TEXT NOT NULL);
    CREATE INDEX idx_collections_title_nocase ON collections(title COLLATE NOCASE);
    CREATE TABLE media (
      id TEXT PRIMARY KEY,
      collection_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT,
      file_name TEXT,
      src TEXT,
      thumb TEXT,
      detail_thumb TEXT,
      carousel_thumb TEXT,
      poster TEXT
    );
    CREATE INDEX idx_media_title ON media(title);
    INSERT INTO collections(id, title) VALUES ('c1', '测试图集'), ('c2', 'Another gallery');
  `);
  const insert = db.prepare("INSERT INTO media(id, collection_id, type, title, file_name, src, thumb, detail_thumb, carousel_thumb, poster) VALUES (?, ?, 'image', ?, '', ?, NULL, NULL, NULL, NULL)");
  insert.run("m1", "c1", "扫码获取更多作品", "/photos/%E6%B5%8B%E8%AF%95%E7%9B%AE%E5%BD%95/%E6%89%AB%E7%A0%81%E8%8E%B7%E5%8F%96%E6%9B%B4%E5%A4%9A%E4%BD%9C%E5%93%81.jpg");
  insert.run("m2", "c1", "ABC-123 sample.jpg", "/photos/test/ABC-123%20sample.jpg");
  insert.run("m3", "c2", "ordinary.jpg", "/photos/other/ordinary.jpg");
  db.close();

  runScript("build-fts5-prototype.js", ["--source", source, "--db", source, "--variant", "mapped"], 1);
  runScript("build-fts5-prototype.js", ["--source", source, "--db", target, "--variant", "mapped", "--batch-size", "100", "--output", buildOutput]);
  const build = JSON.parse(fs.readFileSync(buildOutput, "utf8"));
  assert(build.total === 3 && build.processed === 3 && build.failed === 0, "Mapped build counts were incorrect");
  assert(build.sqliteIntegrityCheck === "ok", "Synthetic copied database integrity check failed");

  const resultDb = new DatabaseSync(target, { readOnly: true });
  assert(resultDb.prepare("SELECT COUNT(*) AS count FROM media_search_documents").get().count === 3, "Document mapping count mismatch");
  assert(resultDb.prepare("SELECT COUNT(*) AS count FROM media_search_fts_mapped").get().count === 3, "FTS count mismatch");
  assert(resultDb.prepare("SELECT rowid FROM media_search_fts_mapped WHERE media_search_fts_mapped MATCH ?").all(`title : ${quoteMatchText("扫码获")}`).length === 1, "Chinese title MATCH failed");
  assert(resultDb.prepare("SELECT rowid FROM media_search_fts_mapped WHERE media_search_fts_mapped MATCH ?").all(`relative_src : ${quoteMatchText("测试目录")}`).length === 1, "Decoded relative path MATCH failed");
  assert(resultDb.prepare("SELECT id FROM media WHERE title >= ? COLLATE NOCASE AND title < ? COLLATE NOCASE ORDER BY title COLLATE NOCASE LIMIT 61").all("扫码", "扫码\uffff").length === 1, "Two-character title prefix failed");
  resultDb.close();

  runScript("benchmark-fts5.js", ["--db", target, "--variant", "mapped", "--output", benchmarkOutput]);
  const benchmark = JSON.parse(fs.readFileSync(benchmarkOutput, "utf8"));
  assert(benchmark.consistency.mediaCount === 3 && benchmark.consistency.ftsCount === 3, "Synthetic benchmark consistency failed");
  assert(benchmark.plans.fts.some((row) => row.detail.includes("VIRTUAL TABLE INDEX")), "Synthetic FTS plan was not captured");

  console.log(JSON.stringify({
    status: "passed",
    safetyRefusal: true,
    sourceRows: 3,
    mappedRows: 3,
    decodedPathMatch: true,
    chineseTitleMatch: true,
    shortPrefixMatch: true,
    benchmarkConsistency: benchmark.consistency,
  }, null, 2));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
