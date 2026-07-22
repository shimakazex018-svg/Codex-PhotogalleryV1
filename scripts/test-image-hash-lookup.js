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

const presentImage = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const absentImage = Buffer.concat([presentImage, Buffer.from("not-in-gallery")]);
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

function uploadRawMultipart(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const boundary = options.boundary || "gallery-raw-multipart";
    const nameParameter = options.quoted === false ? "name=image" : 'name="image"';
    const fileNameParameter = options.fileName === null
      ? ""
      : `; filename=${options.quoted === false ? (options.fileName || "renamed.png") : `"${options.fileName || "renamed.png"}`}`;
    const fileNameStarParameter = options.fileNameStar ? `; filename*=UTF-8''${encodeURIComponent(options.fileNameStar)}` : "";
    const mimeHeader = options.mime === "" ? "" : `Content-Type: ${options.mime || "image/png"}\r\n`;
    const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; ${nameParameter}${fileNameParameter}${fileNameStarParameter}\r\n${mimeHeader}\r\n`);
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([head, buffer, tail]);
    const request = http.request({ host: "127.0.0.1", port, path: "/api/image-hash-lookup", method: "POST", headers: {
      "Content-Type": options.contentType || (options.quotedBoundary ? `multipart/form-data; boundary="${boundary}"` : `multipart/form-data; boundary=${boundary}`),
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

async function verifyConcurrentSlot() {
  const boundary = "gallery-concurrent-test";
  const request = http.request({
    host: "127.0.0.1",
    port,
    path: "/api/image-hash-lookup",
    method: "POST",
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "Transfer-Encoding": "chunked" },
  });
  request.on("error", () => {});
  request.write(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="held.png"\r\nContent-Type: image/png\r\n\r\n`);
  request.write(presentImage.subarray(0, 16));
  await new Promise((resolve) => setTimeout(resolve, 50));
  const busy = await upload(presentImage, "concurrent.png", "image/png");
  assert.strictEqual(busy.status, 429);
  assert.strictEqual(busy.payload.code, "UPLOAD_BUSY");
  request.destroy();
  await new Promise((resolve) => setTimeout(resolve, 100));
}

(async () => {
  const child = spawn(process.execPath, [path.join(rootDir, "server.js")], {
    cwd: rootDir,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", DATA_DIR: dataDir, PHOTOS_DIR: photosDir, IMAGE_HASH_LOOKUP_MAX_BYTES: "1024" },
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
    assert.strictEqual(hit.payload.algorithm, "sha256+phash64-v1");
    assert.strictEqual(hit.payload.exactByteMatch, true);
    assert.ok(Array.isArray(hit.payload.exactMatches));
    assert.ok(Array.isArray(hit.payload.similarMatches));
    assert.ok(hit.payload.perceptualIndex && typeof hit.payload.perceptualIndex === "object");
    assert.strictEqual(hit.payload.uploadedFile.detectedFormat, "png");
    assert.strictEqual(crypto.createHash("sha256").update(presentImage).digest("hex"), presentHash, "local SHA-256 must equal the indexed upload hash");
    assert.ok(hit.payload.matches.every((item) => !/[A-Z]:\\/i.test(JSON.stringify(item))), "absolute paths must not leak");
    assert.strictEqual(hit.payload.coverage.hashedImages, 2);
    assert.strictEqual(hit.payload.coverage.totalImages, 2);

    const unquoted = await uploadRawMultipart(presentImage, { quoted: false });
    assert.strictEqual(unquoted.status, 200);
    assert.strictEqual(unquoted.payload.matches.length, 2);

    const emptyMime = await uploadRawMultipart(presentImage, { mime: "" });
    assert.strictEqual(emptyMime.status, 200, "a clear PNG signature must not require a MIME header");
    assert.strictEqual(emptyMime.payload.matches.length, 2);

    const octetStream = await upload(presentImage, "browser-upload.png", "application/octet-stream");
    assert.strictEqual(octetStream.status, 200, "application/octet-stream is auxiliary metadata only");

    const noExtension = await upload(presentImage, "browser-upload", "image/png");
    assert.strictEqual(noExtension.status, 200, "a clear PNG signature must not require an extension");

    const mimeConflict = await uploadRawMultipart(presentImage, { mime: "Image/JPEG; charset=binary" });
    assert.strictEqual(mimeConflict.status, 200, "the signature must override a conflicting MIME declaration");

    const extensionConflict = await upload(presentImage, "wrong.webp", "image/png");
    assert.strictEqual(extensionConflict.status, 415);
    assert.strictEqual(extensionConflict.payload.code, "EXTENSION_SIGNATURE_MISMATCH");
    assert.strictEqual(extensionConflict.payload.message, "文件扩展名为 WebP，但实际内容识别为 PNG。");
    assert.strictEqual(extensionConflict.payload.declaredExtension, "webp");
    assert.strictEqual(extensionConflict.payload.declaredMime, "image/png");
    assert.strictEqual(extensionConflict.payload.detectedFormat, "png");

    const filenameStar = await uploadRawMultipart(presentImage, {
      fileName: "fallback.png",
      fileNameStar: "中文 长文件名.png",
      mime: "image/png",
      quotedBoundary: true,
    });
    assert.strictEqual(filenameStar.status, 200);
    assert.strictEqual(filenameStar.payload.uploadedFile.fileName, "中文 长文件名.png");

    const filenameStarOnly = await uploadRawMultipart(presentImage, {
      fileName: null,
      fileNameStar: "仅扩展文件名.png",
      mime: "Image/PNG; charset=binary",
    });
    assert.strictEqual(filenameStarOnly.status, 200);
    assert.strictEqual(filenameStarOnly.payload.uploadedFile.fileName, "仅扩展文件名.png");

    const reorderedBoundaryParameter = await uploadRawMultipart(presentImage, {
      contentType: 'multipart/form-data; charset=utf-8; boundary="gallery-raw-multipart"',
    });
    assert.strictEqual(reorderedBoundaryParameter.status, 200);

    const miss = await upload(absentImage, "absent.png", "image/png");
    assert.strictEqual(miss.status, 200);
    assert.strictEqual(miss.payload.matches.length, 0);

    const disguised = await upload(Buffer.from("plain text"), "fake.jpg", "image/jpeg");
    assert.strictEqual(disguised.status, 415);
    assert.strictEqual(disguised.payload.code, "UNRECOGNIZED_IMAGE_SIGNATURE");
    assert.match(disguised.payload.message, /无法识别图片格式/);
    assert.strictEqual(disguised.payload.declaredExtension, "jpg");
    assert.strictEqual(disguised.payload.declaredMime, "image/jpeg");

    const unsupported = await upload(Buffer.from("plain text"), "fake.txt", "text/plain");
    assert.strictEqual(unsupported.status, 415);
    assert.strictEqual(unsupported.payload.code, "UNRECOGNIZED_IMAGE_SIGNATURE");

    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const gif = Buffer.from("GIF89a-synthetic", "ascii");
    const webp = Buffer.concat([Buffer.from("RIFF", "ascii"), Buffer.alloc(4), Buffer.from("WEBP", "ascii"), Buffer.from("synthetic")]);
    const avif = Buffer.alloc(48);
    avif.writeUInt32BE(48, 0);
    avif.write("ftyp", 4, "ascii");
    avif.write("mif1", 8, "ascii");
    avif.write("test", 16, "ascii");
    avif.write("test", 20, "ascii");
    avif.write("test", 24, "ascii");
    avif.write("test", 28, "ascii");
    avif.write("test", 32, "ascii");
    avif.write("avif", 36, "ascii");
    for (const [sample, name, mime, format] of [
      [jpeg, "sample.jpg", "image/jpeg", "jpeg"],
      [gif, "sample.gif", "image/gif", "gif"],
      [webp, "sample.webp", "image/webp", "webp"],
      [avif, "sample.avif", "image/avif", "avif"],
    ]) {
      const result = await upload(sample, name, mime);
      assert.strictEqual(result.status, 200, `${format} signature should be accepted`);
      assert.strictEqual(result.payload.uploadedFile.detectedFormat, format);
    }

    const pngNamedJpeg = await upload(presentImage, "wrong.jpg", "image/jpeg");
    assert.strictEqual(pngNamedJpeg.status, 415);
    assert.strictEqual(pngNamedJpeg.payload.code, "EXTENSION_SIGNATURE_MISMATCH");
    assert.strictEqual(pngNamedJpeg.payload.message, "文件扩展名为 JPEG，但实际内容识别为 PNG。");

    const webpNamedPng = await upload(webp, "wrong.png", "image/png");
    assert.strictEqual(webpNamedPng.status, 415);
    assert.strictEqual(webpNamedPng.payload.code, "EXTENSION_SIGNATURE_MISMATCH");
    assert.strictEqual(webpNamedPng.payload.message, "文件扩展名为 PNG，但实际内容识别为 WebP。");

    const damagedPngHeader = await upload(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00]), "damaged.png", "image/png");
    assert.strictEqual(damagedPngHeader.status, 415);
    assert.strictEqual(damagedPngHeader.payload.code, "UNRECOGNIZED_IMAGE_SIGNATURE");

    const heic = Buffer.alloc(24);
    heic.writeUInt32BE(24, 0);
    heic.write("ftyp", 4, "ascii");
    heic.write("heic", 8, "ascii");
    const unsupportedHeic = await upload(heic, "phone.heic", "image/heic");
    assert.strictEqual(unsupportedHeic.status, 415);
    assert.strictEqual(unsupportedHeic.payload.code, "UNSUPPORTED_ACTUAL_IMAGE_TYPE");
    assert.strictEqual(unsupportedHeic.payload.detectedFormat, "heic");

    const empty = await upload(Buffer.alloc(0), "empty.png", "image/png");
    assert.strictEqual(empty.status, 400);
    assert.strictEqual(empty.payload.code, "EMPTY_FILE");

    const oversized = await upload(Buffer.concat([presentImage, Buffer.alloc(1024)]), "large.png", "image/png");
    assert.strictEqual(oversized.status, 413);
    assert.strictEqual(oversized.payload.code, "FILE_TOO_LARGE");

    await sendAbortedUpload();
    const afterAbort = await upload(presentImage, "after-abort.png", "image/png");
    assert.strictEqual(afterAbort.status, 200, "an aborted request must release the concurrency slot");
    await verifyConcurrentSlot();
    const afterConcurrent = await upload(presentImage, "after-concurrent.png", "image/png");
    assert.strictEqual(afterConcurrent.status, 200, "a rejected concurrent request must not leave the slot occupied");
    assert.ok(!fs.existsSync(path.join(dataDir, "uploads")), "lookup must not create an upload temp directory");

    const planDb = new DatabaseSync(databaseFile, { readOnly: true });
    const plan = planDb.prepare("EXPLAIN QUERY PLAN SELECT media_id FROM media_hashes INDEXED BY idx_media_hashes_sha256 WHERE sha256 = ?").all(presentHash);
    planDb.close();
    assert.ok(plan.some((row) => String(row.detail).includes("idx_media_hashes_sha256")), "hash lookup must use the SHA-256 index");
    assert.match(stderr, /89 50 4E 47 0D 0A 1A 0A/, "diagnostics must include the first 16 bytes, not the complete file");
    assert.ok(!/[A-Z]:\\/i.test(stderr), "diagnostics must not contain absolute Windows paths");
    console.log(JSON.stringify({ ok: true, matches: hit.payload.matches.length, formats: ["jpeg", "png", "webp", "gif", "avif"], sha256Preserved: true, plan: plan.map((row) => row.detail), tempFiles: 0 }));
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
