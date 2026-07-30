"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const port = Number(process.env.TEST_PORT || 48914);
const root = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-duplicate-service-"));
const photosDir = path.join(root, "测试媒体根目录");
const dataDir = path.join(root, "data");
const trashDir = path.join(root, "trash");
const firstRelative = path.join("ART-002", "测试图集", "001", "sample.jpg");
const secondRelative = path.join("ART-008", "测试图集", "001", "sample-copy.jpg");
const bytes = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/Aaf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/Aaf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Ap//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z", "base64");
const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");

function writeFixture(relative) {
  const file = path.join(photosDir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  return file;
}

function request(method, pathname, body) {
  return fetch(`http://127.0.0.1:${port}${pathname}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (response) => ({ status: response.status, body: await response.json() }));
}

async function waitFor(pathname, terminal) {
  let lastError = null;
  for (let index = 0; index < 150; index += 1) {
    try {
      const result = await request("GET", pathname);
      if (terminal(result.body)) return result.body;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw lastError || new Error(`timeout waiting for ${pathname}`);
}

function startServer() {
  const child = spawn(process.execPath, [path.join(rootDir, "server.js")], {
    cwd: rootDir,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", DATA_DIR: dataDir, PHOTOS_DIR: photosDir, TRASH_DIR: trashDir, REMOTE_ADMIN_ENABLED: "0", DUPLICATE_BATCH_SIZE: "1" },
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  return { child, stderr: () => stderr };
}

(async () => {
  let server = null;
  try {
    const firstFile = writeFixture(firstRelative);
    const secondFile = writeFixture(secondRelative);
    server = startServer();
    await waitFor("/api/media-optimization/status", () => true);

    assert.equal((await request("POST", "/api/scan")).status, 200);
    await waitFor("/api/scan/status", (state) => state.status === "completed");

    const firstStart = await request("POST", "/api/duplicates/scan");
    assert.equal(firstStart.status, 200);
    assert.equal(firstStart.body.status, "running");
    const concurrentStart = await request("POST", "/api/duplicates/scan");
    assert.equal(concurrentStart.status, 200);
    assert.equal(concurrentStart.body.id, firstStart.body.id, "a second full SHA scan must reuse the active task");
    const progress = await request("GET", "/api/duplicates/status");
    assert.equal(progress.status, 200);
    assert.ok(["running", "completed"].includes(progress.body.status));
    assert.equal((await request("GET", "/api/media-optimization/status")).status, 200, "HTTP remains responsive while the worker hashes files");
    await waitFor("/api/duplicates/status", (state) => state.status === "completed");

    const beforeRecycle = await request("GET", "/api/duplicates/status");
    const stats = beforeRecycle.body.stats;
    assert.equal(stats.hashRecordCount, 2);
    assert.equal(stats.hashedCount, 2);
    assert.equal(stats.uniqueHashCount, 1);
    assert.equal(stats.duplicateGroupCount, 1);
    assert.equal(stats.duplicateItemCount, 2, "duplicateItemCount means all files in duplicate groups");
    assert.equal(stats.duplicateSurplusCount, 1, "duplicateSurplusCount means files eligible for recycle");
    const groups = await request("GET", "/api/duplicates?limit=10");
    assert.equal(groups.body.total, 1);
    assert.equal(groups.body.groups[0].items.length, 2);
    assert.deepEqual(groups.body.groups[0].items.map((item) => item.collectionId).sort(), ["ART-002/测试图集/001", "ART-008/测试图集/001"]);

    const diagnosis = spawn(process.execPath, [path.join(rootDir, "scripts", "diagnose-duplicate-sha256.js"), "--db", path.join(dataDir, "gallery.db"), "--photos-dir", photosDir, "--sha256", sha256], { cwd: rootDir, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let diagnosticOutput = "";
    diagnosis.stdout.on("data", (chunk) => { diagnosticOutput += String(chunk); });
    await new Promise((resolve, reject) => diagnosis.on("close", (code) => code === 0 ? resolve() : reject(new Error("diagnostic failed"))));
    const diagnostic = JSON.parse(diagnosticOutput);
    assert.equal(diagnostic.recordCount, 2);
    assert.ok(diagnostic.records.every((record) => record.fileExists));
    assert.ok(diagnostic.records.every((record) => record.absolutePath.includes("测试图集")));

    const recycled = await request("POST", "/api/duplicates/recycle-auto", { limit: 50 });
    assert.equal(recycled.status, 200);
    assert.equal(recycled.body.recycled, 1);
    assert.ok(fs.existsSync(firstFile) !== fs.existsSync(secondFile), "one original remains after project recycle API");
    await request("POST", "/api/scan");
    await waitFor("/api/scan/status", (state) => state.status === "completed");
    await request("POST", "/api/duplicates/scan");
    const afterRecycle = await waitFor("/api/duplicates/status", (state) => state.status === "completed");
    assert.equal(afterRecycle.stats.duplicateGroupCount, 0);

    const movedRelative = fs.existsSync(firstFile) ? secondRelative : firstRelative;
    const source = path.join(trashDir, movedRelative);
    const restore = path.join(photosDir, movedRelative);
    fs.mkdirSync(path.dirname(restore), { recursive: true });
    fs.renameSync(source, restore);
    await request("POST", "/api/scan");
    await waitFor("/api/scan/status", (state) => state.status === "completed");
    await request("POST", "/api/duplicates/scan");
    const afterRestore = await waitFor("/api/duplicates/status", (state) => state.status === "completed");
    assert.equal(afterRestore.stats.duplicateGroupCount, 1);

    fs.unlinkSync(restore);
    await request("POST", "/api/duplicates/scan");
    const failureTolerant = await waitFor("/api/duplicates/status", (state) => state.status === "completed");
    assert.ok(failureTolerant.errorCount >= 1, "one unreadable/missing file must be reported");
    console.log(JSON.stringify({ ok: true, sha256, stats: stats, diagnosisRecords: diagnostic.recordCount, serviceResponsive: true, duplicateTaskDeduplicated: true, recycleAndRestore: true, perFileFailureTolerant: true }));
  } finally {
    if (server?.child) {
      server.child.kill("SIGTERM");
      await new Promise((resolve) => server.child.once("exit", resolve));
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
