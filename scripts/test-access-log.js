const assert = require("assert");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { DatabaseSync } = require("node:sqlite");
const galleryDb = require("../gallery-db");

function accessEntry(index, time) {
  return {
    time,
    ip: "127.0.0.1",
    host: "localhost",
    userAgent: "access-log-test",
    type: "test",
    title: `entry-${index}`,
    model: "model",
    work: `work-${index}`,
    hash: `#/test/${index}`,
    pathParts: ["test", String(index)],
  };
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Test server exited with ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      // The isolated server may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for isolated server");
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

function testPageBoundaries(root) {
  for (const total of [0, 1, 49, 50, 51, 100, 101]) {
    const dbFile = path.join(root, `boundary-${total}.db`);
    const base = Date.parse("2026-01-01T00:00:00.000Z");
    const entries = Array.from({ length: total }, (_, index) => ({
      ...accessEntry(index, new Date(base + index * 1000).toISOString()),
      sourceKey: `boundary-${total}-${index}`,
    }));
    galleryDb.importAccessLogs(dbFile, entries);
    const first = galleryDb.getAccessLogsPage(dbFile, 1, 50);
    assert.equal(first.total, total);
    assert.equal(first.totalPages, total ? Math.ceil(total / 50) : 0);
    assert.equal(first.items.length, Math.min(total, 50));
    if (total > 50) {
      const last = galleryDb.getAccessLogsPage(dbFile, first.totalPages, 50);
      assert.equal(last.items.length, total - 50 * (first.totalPages - 1));
    }
  }
}

function testRetentionBoundary(root) {
  const dbFile = path.join(root, "retention.db");
  const cutoff = "2026-01-01T00:00:00.000Z";
  galleryDb.importAccessLogs(dbFile, [
    { ...accessEntry(1, "2025-12-31T23:59:59.999Z"), sourceKey: "old" },
    { ...accessEntry(2, cutoff), sourceKey: "boundary" },
    { ...accessEntry(3, "2026-01-01T00:00:00.001Z"), sourceKey: "new" },
  ]);
  const result = galleryDb.deleteAccessLogsBefore(dbFile, cutoff);
  assert.equal(result.deleted, 1);
  const remaining = galleryDb.getAccessLogsPage(dbFile, 1, 50);
  assert.deepEqual(remaining.items.map((item) => item.title), ["entry-3", "entry-2"]);
  const db = new DatabaseSync(dbFile, { readOnly: true });
  try {
    const index = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?").get("idx_access_logs_time_id");
    assert.equal(index.name, "idx_access_logs_time_id");
  } finally {
    db.close();
  }
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "Codex-PhotogalleryV1-AccessLog-"));
  const dataDir = path.join(root, "data");
  const logsDir = path.join(dataDir, "logs");
  const photosDir = path.join(root, "photos");
  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(photosDir, { recursive: true });
  let child = null;
  let output = "";
  try {
    testPageBoundaries(root);
    testRetentionBoundary(root);

    const base = Date.parse("2026-07-01T00:00:00.000Z");
    const legacy = Array.from({ length: 101 }, (_, index) => JSON.stringify(accessEntry(index, new Date(base + index * 1000).toISOString())));
    legacy.push("malformed historical line");
    fs.writeFileSync(path.join(logsDir, "access-2026-07-01.log"), `${legacy.join("\n")}\n`, "utf8");

    const port = await getFreePort();
    const isolatedEnv = {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      DATA_DIR: dataDir,
      PHOTOS_DIR: photosDir,
      TRASH_DIR: path.join(root, "trash"),
    };
    child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
      cwd: path.join(__dirname, ".."),
      env: isolatedEnv,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForServer(`${baseUrl}/api/config`, child);

    const page1 = await fetch(`${baseUrl}/api/access-log?page=1&pageSize=50`).then((response) => response.json());
    const page2 = await fetch(`${baseUrl}/api/access-log?page=2&pageSize=50`).then((response) => response.json());
    const page3 = await fetch(`${baseUrl}/api/access-log?page=3&pageSize=50`).then((response) => response.json());
    assert.deepEqual([page1.total, page1.totalPages, page1.items.length], [101, 3, 50]);
    assert.deepEqual([page2.total, page2.totalPages, page2.items.length], [101, 3, 50]);
    assert.deepEqual([page3.total, page3.totalPages, page3.items.length], [101, 3, 1]);
    const allIds = [...page1.items, ...page2.items, ...page3.items].map((item) => item.id);
    assert.equal(new Set(allIds).size, 101);
    assert.equal(page1.items[0].title, "entry-100");
    assert.equal(page3.items[0].title, "entry-0");

    const invalid = await fetch(`${baseUrl}/api/access-log?page=-5&pageSize=1000`).then((response) => response.json());
    assert.deepEqual([invalid.page, invalid.pageSize, invalid.items.length], [1, 100, 100]);
    const outOfRange = await fetch(`${baseUrl}/api/access-log?page=999&pageSize=50`).then((response) => response.json());
    assert.equal(outOfRange.page, 3);

    const posted = accessEntry(102, "2026-07-02T00:00:00.000Z");
    const postResponse = await fetch(`${baseUrl}/api/access-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(posted),
    });
    assert.equal(postResponse.status, 200);
    const refreshed = await fetch(`${baseUrl}/api/access-log?page=1&pageSize=50`).then((response) => response.json());
    assert.equal(refreshed.total, 102);
    assert.equal(refreshed.items[0].title, "entry-102");

    assert.equal(fs.existsSync(path.join(logsDir, "access-2026-07-01.log")), true);
    await stopChild(child);
    child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
      cwd: path.join(__dirname, ".."),
      env: isolatedEnv,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    await waitForServer(`${baseUrl}/api/config`, child);
    const afterRestart = await fetch(`${baseUrl}/api/access-log?page=1&pageSize=50`).then((response) => response.json());
    assert.equal(afterRestart.total, 102);
    console.log("Access log isolated smoke passed: boundaries, idempotent migration, pagination, cap, ordering, retention, index, and POST.");
  } catch (error) {
    if (output) process.stderr.write(output);
    throw error;
  } finally {
    await stopChild(child);
    fs.rmSync(root, { recursive: true, force: true });
    assert.equal(fs.existsSync(root), false);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
