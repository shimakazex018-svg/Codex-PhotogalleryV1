"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { DatabaseSync } = require("node:sqlite");
const galleryDb = require("../gallery-db");

const rootDir = path.resolve(__dirname, "..");
const port = Number(process.env.TEST_PORT || 48112);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-image-lookup-"));
const dataDir = path.join(tempRoot, "data");
const photosDir = path.join(tempRoot, "photos");
const databaseFile = path.join(dataDir, "gallery.db");
fs.mkdirSync(photosDir, { recursive: true });
galleryDb.getStats(databaseFile);

const presentImage = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("same-original-bytes")]);
const absentImage = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("not-in-gallery")]);
const presentHash = crypto.createHash("sha256").update(presentImage).digest("hex");
const now = new Date().toISOString();
const db = new DatabaseSync(databaseFile);
const insertCollection = db.prepare(
  `INSERT INTO collections (id, parent_id, title, folder, path_parts, level, image_count, video_count, total_image_count, total_video_count, descendant_count, mtime, sort_order)
   VALUES (?, NULL, ?, ?, ?, 1, 1, 0, 1, 0, 0, 1, ?)`
);
insertCollection.run("模特A/图册2", "图册2", "图册2", JSON.stringify(["模特A", "图册2"]), 0);
insertCollection.run("模特B/图册10", "图册10", "图册10", JSON.stringify(["模特B", "图册10"]), 1);
const insertMedia = db.prepare(
  `INSERT INTO media (id, collection_id, type, title, file_name, src, size, mtime, sort_order, metadata)
   VALUES (?, ?, 'image', ?, ?, ?, ?, 1, 0, NULL)`
);
insertMedia.run("media-a", "模特A/图册2", "first.png", "first.png", "/photos/a/first.png", presentImage.length);
insertMedia.run("media-b", "模特B/图册10", "renamed.png", "renamed.png", "/photos/b/renamed.png", presentImage.length);
const insertHash = db.prepare(
  `INSERT INTO media_hashes (media_id, collection_id, file_size, mtime, sha256, updated_at) VALUES (?, ?, ?, 1, ?, ?)`
);
insertHash.run("media-a", "模特A/图册2", presentImage.length, presentHash, now);
insertHash.run("media-b", "模特B/图册10", presentImage.length, presentHash, now);
db.close();

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("isolated server startup timed out")), 15000);
    const onData = (chunk) => {
      if (!String(chunk).includes("Photo gallery site started")) return;
      clearTimeout(timer);
      child.stdout.off("data", onData);
      resolve();
    };
    child.stdout.on("data", onData);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`isolated server exited early: ${code}`));
    });
  });
}

async function upload(buffer, fileName, type) {
  const form = new FormData();
  form.append("image", new Blob([buffer], { type }), fileName);
  const response = await fetch(`http://127.0.0.1:${port}/api/image-hash-lookup`, { method: "POST", body: form });
  return { status: response.status, payload: await response.json() };
}

function uploadUnquotedDisposition(buffer) {
  return new Promise((resolve, reject) => {
    const boundary = "gallery-unquoted-disposition";
    const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name=image; filename=renamed.png\r\nContent-Type: image/png\r\n\r\n`);
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([head, buffer, tail]);
    const request = http.request({ host: "127.0.0.1", port, path: "/api/image-hash-lookup", method: "POST", headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": body.length,
    } }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode, payload: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
    });
    request.on("error", reject);
    request.end(body);
  });
}

function sendAbortedUpload() {
  return new Promise((resolve) => {
    const boundary = "gallery-abort-test";
    const request = http.request({
      host: "127.0.0.1",
      port,
      path: "/api/image-hash-lookup",
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "Transfer-Encoding": "chunked" },
    });
    request.on("error", () => resolve());
    request.write(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="abort.png"\r\nContent-Type: image/png\r\n\r\n`);
    request.write(presentImage.subarray(0, 10));
    request.destroy();
    setTimeout(resolve, 100);
  });
}

(async () => {
  const child = spawn(process.execPath, [path.join(rootDir, "server.js")], {
    cwd: rootDir,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", DATA_DIR: dataDir, PHOTOS_DIR: photosDir, IMAGE_HASH_LOOKUP_MAX_BYTES: "64" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  try {
    await waitForServer(child);
    const hit = await upload(presentImage, "different-name.png", "image/png");
    assert.strictEqual(hit.status, 200);
    assert.strictEqual(hit.payload.matches.length, 2);
    assert.strictEqual(hit.payload.algorithm, "sha256");
    assert.strictEqual(hit.payload.exactByteMatch, true);
    assert.ok(hit.payload.matches.every((item) => !/[A-Z]:\\/i.test(JSON.stringify(item))), "absolute paths must not leak");
    assert.strictEqual(hit.payload.coverage.hashedImages, 2);
    assert.strictEqual(hit.payload.coverage.totalImages, 2);

    const unquoted = await uploadUnquotedDisposition(presentImage);
    assert.strictEqual(unquoted.status, 200);
    assert.strictEqual(unquoted.payload.matches.length, 2);

    const miss = await upload(absentImage, "absent.png", "image/png");
    assert.strictEqual(miss.status, 200);
    assert.strictEqual(miss.payload.matches.length, 0);

    const disguised = await upload(Buffer.from("plain text"), "fake.jpg", "image/jpeg");
    assert.strictEqual(disguised.status, 415);
    assert.strictEqual(disguised.payload.code, "INVALID_IMAGE_SIGNATURE");

    const unsupported = await upload(Buffer.from("plain text"), "fake.txt", "text/plain");
    assert.strictEqual(unsupported.status, 415);
    assert.strictEqual(unsupported.payload.code, "UNSUPPORTED_IMAGE_TYPE");

    const empty = await upload(Buffer.alloc(0), "empty.png", "image/png");
    assert.strictEqual(empty.status, 400);
    assert.strictEqual(empty.payload.code, "EMPTY_FILE");

    const oversized = await upload(Buffer.concat([presentImage, Buffer.alloc(80)]), "large.png", "image/png");
    assert.strictEqual(oversized.status, 413);
    assert.strictEqual(oversized.payload.code, "FILE_TOO_LARGE");

    await sendAbortedUpload();
    const afterAbort = await upload(presentImage, "after-abort.png", "image/png");
    assert.strictEqual(afterAbort.status, 200, "an aborted request must release the concurrency slot");
    assert.ok(!fs.existsSync(path.join(dataDir, "uploads")), "lookup must not create an upload temp directory");

    const planDb = new DatabaseSync(databaseFile, { readOnly: true });
    const plan = planDb.prepare("EXPLAIN QUERY PLAN SELECT media_id FROM media_hashes INDEXED BY idx_media_hashes_sha256 WHERE sha256 = ?").all(presentHash);
    planDb.close();
    assert.ok(plan.some((row) => String(row.detail).includes("idx_media_hashes_sha256")), "hash lookup must use the SHA-256 index");
    console.log(JSON.stringify({ ok: true, matches: hit.payload.matches.length, plan: plan.map((row) => row.detail), tempFiles: 0 }));
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
