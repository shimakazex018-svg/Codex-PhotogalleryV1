"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const galleryDb = require("../gallery-db");
const { hammingDistance64 } = require("../perceptual-hash");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-fingerprint-"));
try {
  const dbFile = path.join(root, "gallery.db"); galleryDb.indexGallery(dbFile, { collections: [] });
  const db = new DatabaseSync(dbFile);
  db.prepare("INSERT INTO collections(id,title,path_parts,level) VALUES('c','c','[]',0)").run();
  const add = db.prepare("INSERT INTO media(id,collection_id,type,src,size,mtime) VALUES(?,?,?,?,?,?)");
  add.run("a", "c", "image", "/photos/a.png", 1, 1); add.run("b", "c", "image", "/photos/b.png", 1, 1);
  db.close();
  const candidates = galleryDb.getFingerprintCandidates(dbFile, { fingerprints: ["sha256", "phash"] });
  assert.equal(candidates.length, 2); assert.ok(candidates.every((row) => row.needsSha256 && row.needsPhash));
  const hash = Buffer.alloc(8, 0);
  const committed = galleryDb.upsertFingerprintBatch(dbFile, candidates.map((row) => ({ ...row, sha256: "a".repeat(64), hash64: hash })));
  assert.equal(committed.shaCommitted, 2); assert.equal(committed.phashCommitted, 2);
  assert.equal(galleryDb.getFingerprintCandidates(dbFile, { fingerprints: ["sha256", "phash"] }).length, 0);
  assert.equal(hammingDistance64(Buffer.alloc(8), Buffer.alloc(8)), 0);
  const result = galleryDb.replaceSimilarityPairs(dbFile, [{ left: "a", right: "b", distance: 10 }]);
  assert.equal(result.committed, 1); assert.equal(galleryDb.getSimilarityPair(dbFile, "b", "a").phash_distance, 10);
  assert.equal(galleryDb.getSimilarityPairsPage(dbFile, { category: "possibly_similar" }).pairs.length, 1);
  console.log("image fingerprint architecture: ok");
} finally { fs.rmSync(root, { recursive: true, force: true }); }
