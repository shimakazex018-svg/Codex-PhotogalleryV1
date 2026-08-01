"use strict";
const assert = require("assert");
const fs = require("fs"); const os = require("os"); const path = require("path");
const { createManager } = require("../image-fingerprint-manager");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-fingerprint-manager-"));
const file = path.join(root, "sample.bin"); fs.writeFileSync(file, "fingerprint-test");
let committed = []; let supplied = false;
const manager = createManager({ workerFile: path.join(__dirname, "..", "image-fingerprint-worker.js"), statusFile: path.join(root, "status.json"), ffmpegPath: "ffmpeg",
  candidates: () => supplied ? [] : (supplied = true, [{ mediaId: "a", collectionId: "c", absolutePath: file, sourceSize: fs.statSync(file).size, sourceMtime: fs.statSync(file).mtimeMs, needsSha256: true, needsPhash: false }]),
  commit: (items) => { committed.push(...items); return { shaCommitted: items.filter((item) => item.sha256).length, phashCommitted: 0, lastMediaId: items.at(-1).mediaId }; },
});
(async () => { try {
  manager.start({ fingerprints: ["sha256"] });
  for (let i = 0; i < 100 && manager.status().state !== "completed"; i += 1) await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(manager.status().state, "completed", JSON.stringify(manager.status())); assert.equal(committed.length, 1); assert.equal(committed[0].sha256.length, 64);
  console.log("image fingerprint manager: ok");
} finally { fs.rmSync(root, { recursive: true, force: true }); } })().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
