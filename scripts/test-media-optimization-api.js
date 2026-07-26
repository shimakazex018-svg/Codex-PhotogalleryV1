"use strict";

const assert = require("assert");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "photogallery-media-optimization-api-"));
const port = 48913;
const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
  cwd: path.join(__dirname, ".."),
  env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", DATA_DIR: path.join(root, "data"), PHOTOS_DIR: path.join(root, "photos"), TRASH_DIR: path.join(root, "trash") },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

async function waitForStatus() {
  let lastError = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/media-optimization/status`);
      if (response.ok) return response.json();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError || new Error("server did not start");
}

(async () => {
  try {
    const status = await waitForStatus();
    assert.equal(status.database.engine, "sqlite");
    assert.equal(status.database.journalMode, "WAL");
    assert.equal(status.database.busyTimeoutMs, 5000);
    assert.ok(status.scan && status.duplicates && status.perceptual && status.mediaCleanup && status.videoCompatibility);
    console.log("MEDIA_OPTIMIZATION_API_TEST=PASS");
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
    fs.rmSync(root, { recursive: true, force: true });
    console.log(`TEMP_ROOT_EXISTS=${fs.existsSync(root)}`);
  }
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
