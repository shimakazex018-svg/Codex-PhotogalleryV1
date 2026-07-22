const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { DatabaseSync } = require("node:sqlite");
const galleryDb = require("../gallery-db");

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
assert.doesNotMatch(appSource, /confirm\("该图集将在至少1小时后/);
assert.match(appSource, /data-collection-recycle-action="force-retry"/);
assert.match(appSource, /\/api\/collection-recycle\/force-retry/);
assert.match(appSource, /failed-awaiting-review/);
assert.match(serverSource, /response\.once\("close", onResponseDone\)/);
assert.match(serverSource, /response\.once\("error", onResponseDone\)/);
assert.match(serverSource, /pipeFileResponse\(response, filePath, \{ start, end \}\)/);
assert.match(serverSource, /sendFile\(request, response, posterPath\)/);

const root = fs.mkdtempSync(path.join(os.tmpdir(), "Codex-PhotogalleryV1-CollectionRecycle-"));
const photos = path.join(root, "photos"), trash = path.join(root, "trash"), data = path.join(root, "data");
const port = 49200 + Math.floor(Math.random() * 500);
function file(relative, size = 4) {
  const target = path.join(photos, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const handle = fs.openSync(target, "w");
  try { fs.ftruncateSync(handle, size); } finally { fs.closeSync(handle); }
}
file("Parent/Leaf/a.jpg");
file("Parent/Leaf/b.mp4");
file("Parent/WithTxt/a.jpg");
file("Parent/WithTxt/readme.txt");
file("Parent/Container/Sub/a.jpg");
file("Parent/Heic/a.heic");
file("梦心玥/爱蜜社/普通图集/a.jpg", 1024);
file("梦心玥/爱蜜社/自动重试/locked.jpg", 32 * 1024 * 1024);
file("梦心玥/爱蜜社/强制释放/locked.mp4", 32 * 1024 * 1024);

let child;
let childOutput = "";
const base = `http://127.0.0.1:${port}`;
async function request(url, options = {}) {
  const response = await fetch(base + url, { ...options, headers: { Origin: base, "Content-Type": "application/json", ...(options.headers || {}) } });
  let body = {};
  try { body = await response.json(); } catch {}
  return { response, body };
}
async function waitFor(predicate, timeout = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { if (await predicate()) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error("Timed out");
}
function encodedMediaPath(relative) {
  return `/photos/${relative.split(/[\\/]/).map(encodeURIComponent).join("/")}`;
}
function holdMedia(relative, headers = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const req = http.get(base + encodedMediaPath(relative), { headers }, (response) => {
      settled = true;
      response.on("error", () => {});
      response.pause();
      resolve({ request: req, response });
    });
    req.on("error", (error) => { if (!settled) reject(error); });
  });
}
function closeHeldMedia(held) {
  held.response.destroy();
  held.request.destroy();
}
function start() {
  childOutput = "";
  child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], { env: { ...process.env, NODE_ENV: "test", PORT: String(port), HOST: "127.0.0.1",
    PHOTOS_DIR: photos, TRASH_DIR: trash, DATA_DIR: data, REMOTE_ADMIN_ENABLED: "1",
    REMOTE_ADMIN_CIDRS: "lan:192.168.31.0/24,zerotier:192.168.192.0/24", REMOTE_ADMIN_ORIGINS: base,
    COLLECTION_RECYCLE_TEST_INTERVAL_MS: "40", COLLECTION_RECYCLE_RETRY_DELAY_MS: "120", DAILY_INDEX_SCAN_ENABLED: "0",
    ENABLE_IMAGE_PREVIEW_GENERATION: "0" }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  child.stdout.on("data", (chunk) => { childOutput += chunk.toString(); });
  child.stderr.on("data", (chunk) => { childOutput += chunk.toString(); });
}
async function stop() {
  if (!child) return;
  child.kill();
  await new Promise((resolve) => child.once("close", resolve));
  child = null;
}
async function status(collectionId) {
  return (await request(`/api/collection-recycle/status?collectionId=${encodeURIComponent(collectionId)}`)).body;
}
async function queueItem(collectionId) {
  const queue = (await request("/api/collection-recycle/queue?pageSize=100")).body;
  return queue.items.find((item) => item.collectionId === collectionId);
}
async function markDue(collectionId) {
  const result = await request("/api/collection-recycle/mark", { method: "POST", body: JSON.stringify({ collectionId }) });
  assert.equal(result.response.status, 200);
  const db = new DatabaseSync(path.join(data, "gallery.db"));
  db.prepare("UPDATE collection_recycle_queue SET scheduled_at=? WHERE id=?").run(new Date(Date.now() - 1000).toISOString(), result.body.item.id);
  db.close();
  return result.body.item;
}

function testLegacySchemaMigration() {
  const migrationFile = path.join(root, "migration", "gallery.db");
  fs.mkdirSync(path.dirname(migrationFile), { recursive: true });
  const legacyDb = new DatabaseSync(migrationFile);
  legacyDb.exec(`CREATE TABLE collection_recycle_queue (
    id TEXT PRIMARY KEY, collection_id TEXT NOT NULL, relative_path TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL,
    marked_at TEXT NOT NULL, eligible_at TEXT NOT NULL, scheduled_at TEXT NOT NULL, started_at TEXT, finished_at TEXT,
    source_path_snapshot TEXT NOT NULL, recycle_path TEXT, error TEXT, requested_ip TEXT, requested_scope TEXT,
    index_refresh_error TEXT, updated_at TEXT NOT NULL);
    CREATE UNIQUE INDEX idx_collection_recycle_active ON collection_recycle_queue(collection_id) WHERE status IN ('pending','recycling');`);
  legacyDb.close();
  galleryDb.getCollectionRecyclePage(migrationFile, 1, 10);
  const migratedDb = new DatabaseSync(migrationFile, { readOnly: true });
  const migratedColumns = new Set(migratedDb.prepare("PRAGMA table_info(collection_recycle_queue)").all().map((column) => column.name));
  assert.ok(migratedColumns.has("retry_count"));
  assert.ok(migratedColumns.has("next_retry_time"));
  assert.ok(migratedColumns.has("last_error"));
  assert.match(migratedDb.prepare("SELECT sql FROM sqlite_master WHERE name='idx_collection_recycle_active'").get().sql, /retry-waiting/);
  migratedDb.close();
}

(async () => {
  let heldAuto = null;
  let heldForce = null;
  try {
    testLegacySchemaMigration();
    start();
    await waitFor(async () => { try { return (await fetch(base + "/api/config")).ok; } catch { return false; } });
    let result = await request("/api/scan", { method: "POST", body: "{}" });
    assert.equal(result.response.status, 200);
    await waitFor(async () => (await request("/api/scan/status")).body.status === "completed", 20000);

    const schemaDb = new DatabaseSync(path.join(data, "gallery.db"));
    const columns = new Set(schemaDb.prepare("PRAGMA table_info(collection_recycle_queue)").all().map((column) => column.name));
    assert.ok(columns.has("retry_count"));
    assert.ok(columns.has("next_retry_time"));
    assert.ok(columns.has("last_error"));
    assert.match(schemaDb.prepare("SELECT sql FROM sqlite_master WHERE name='idx_collection_recycle_active'").get().sql, /retry-waiting/);
    schemaDb.close();

    result = await request("/api/admin/capabilities", { headers: { "X-Forwarded-For": "10.10.10.10" } });
    assert.equal(result.body.scope, "local");
    assert.equal(result.body.sourceAddress, "127.0.0.1");
    assert.equal(result.body.canMarkCollectionRecycle, true);
    const badOrigin = await fetch(base + "/api/collection-recycle/force-retry", { method: "POST", headers: { Origin: "http://evil.invalid" } });
    assert.equal(badOrigin.status, 403);

    assert.equal((await status("Parent/Leaf")).eligible, true);
    assert.equal((await status("Parent")).eligible, false);
    assert.equal((await status("Parent/WithTxt")).reason, "contains-non-media");
    assert.equal((await status("Parent/Heic")).eligible, true);

    result = await request("/api/collection-recycle/mark", { method: "POST", body: JSON.stringify({ collectionId: "Parent/Leaf" }) });
    assert.ok(Date.parse(result.body.item.scheduledAt) - Date.parse(result.body.item.markedAt) >= 3600000);
    await stop();
    start();
    await waitFor(async () => (await status("Parent/Leaf")).item?.status === "pending");
    result = await request("/api/collection-recycle/cancel", { method: "POST", body: JSON.stringify({ collectionId: "Parent/Leaf" }) });
    assert.equal(result.body.cancelled, 1);
    fs.mkdirSync(path.join(trash, "Parent", "Leaf"), { recursive: true });
    await markDue("Parent/Leaf");
    await waitFor(() => !fs.existsSync(path.join(photos, "Parent", "Leaf")));
    assert.ok(fs.readdirSync(path.join(trash, "Parent")).some((name) => name.startsWith("Leaf.__recycle_")));
    assert.equal((await queueItem("Parent/Leaf")).status, "conflict-renamed");
    await waitFor(async () => (await request("/api/scan/status")).body.status !== "running", 20000);

    const normalResponse = await fetch(base + encodedMediaPath("梦心玥/爱蜜社/普通图集/a.jpg"));
    await normalResponse.arrayBuffer();
    await waitFor(async () => (await status("梦心玥/爱蜜社/普通图集")).activeStreams.length === 0);

    heldAuto = await holdMedia("梦心玥/爱蜜社/自动重试/locked.jpg");
    await waitFor(async () => (await status("梦心玥/爱蜜社/自动重试")).activeStreams.some((stream) => stream.type === "image"));
    await markDue("梦心玥/爱蜜社/自动重试");
    await waitFor(async () => (await status("梦心玥/爱蜜社/自动重试")).item?.status === "retry-waiting");
    let autoStatus = await status("梦心玥/爱蜜社/自动重试");
    assert.equal(autoStatus.item.retryCount, 0);
    assert.ok(autoStatus.item.nextRetryTime);
    assert.match(autoStatus.item.lastError, /EPERM|EBUSY/);
    assert.equal(autoStatus.activeStreams[0].pid, child.pid);
    closeHeldMedia(heldAuto);
    heldAuto = null;
    await waitFor(() => !fs.existsSync(path.join(photos, "梦心玥", "爱蜜社", "自动重试")), 10000);
    assert.equal((await queueItem("梦心玥/爱蜜社/自动重试")).status, "recycled");
    await waitFor(async () => (await request("/api/scan/status")).body.status !== "running", 20000);

    heldForce = await holdMedia("梦心玥/爱蜜社/强制释放/locked.mp4", { Range: "bytes=0-33554431" });
    assert.equal(heldForce.response.statusCode, 206);
    assert.equal(heldForce.response.headers["accept-ranges"], "bytes");
    assert.match(heldForce.response.headers["content-range"], /^bytes 0-33554431\//);
    await waitFor(async () => (await status("梦心玥/爱蜜社/强制释放")).activeStreams.some((stream) => stream.type === "video"));
    await markDue("梦心玥/爱蜜社/强制释放");
    await waitFor(async () => (await status("梦心玥/爱蜜社/强制释放")).item?.status === "failed-awaiting-review", 15000);
    const failedStatus = await status("梦心玥/爱蜜社/强制释放");
    assert.equal(failedStatus.item.retryCount, 12);
    assert.equal(failedStatus.canRetry, true);
    assert.ok(failedStatus.activeStreams.some((stream) => stream.path.endsWith(path.join("强制释放", "locked.mp4"))));
    result = await request("/api/collection-recycle/retry", { method: "POST", body: JSON.stringify({ collectionId: "梦心玥/爱蜜社/强制释放" }) });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.item.status, "retry-waiting");
    result = await request("/api/collection-recycle/force-retry", { method: "POST", body: JSON.stringify({ collectionId: "梦心玥/爱蜜社/强制释放" }) });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.item.status, "recycled");
    assert.ok(result.body.releasedStreams.some((stream) => stream.type === "video" && stream.pid === child.pid));
    heldForce = null;
    assert.equal(fs.existsSync(path.join(photos, "梦心玥", "爱蜜社", "强制释放")), false);
    assert.equal(fs.existsSync(path.join(trash, "梦心玥", "爱蜜社", "强制释放")), true);

    const logText = fs.readdirSync(path.join(data, "logs")).filter((name) => /^\d{4}-\d{2}-\d{2}\.log$/.test(name))
      .map((name) => fs.readFileSync(path.join(data, "logs", name), "utf8")).join("\n");
    assert.match(logText, /collection_recycle_retry_scheduled/);
    assert.match(logText, /"errorType":"(EPERM|EBUSY)"/);
    assert.match(logText, /"sourcePath":/);
    assert.match(logText, /"targetPath":/);
    assert.match(logText, /"occupyingFiles":/);
    assert.match(logText, /"pid":/);
    console.log("COLLECTION_RECYCLE_TEST=PASS");
  } finally {
    if (heldAuto) closeHeldMedia(heldAuto);
    if (heldForce) closeHeldMedia(heldForce);
    await stop();
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    console.log(`TEMP_ROOT_EXISTS=${fs.existsSync(root)}`);
  }
})().catch((error) => { console.error(error); if (childOutput) console.error(childOutput); process.exitCode = 1; });
