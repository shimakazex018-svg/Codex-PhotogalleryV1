"use strict";

// Isolated end-to-end coverage for the directory-scoped entry point.  It uses
// the same HTTP route, worker, IPC writer queue and SQLite database as a full
// scan, but only two requested source directories may be candidates.
const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-duplicate-scope-"));
const photosDir = path.join(root, "photos");
const dataDir = path.join(root, "data");
const port = 48916;
const bytes = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/Aaf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/Aaf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Ap//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z", "base64");
const differentBytes = Buffer.concat([bytes, Buffer.from("different")]);

function write(relative, contents) {
  const file = path.join(photosDir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, contents); return file;
}
function request(method, pathname, body) {
  return fetch(`http://127.0.0.1:${port}${pathname}`, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined })
    .then(async (response) => ({ status: response.status, body: await response.json() }));
}
async function waitFor(predicate, timeout = 30000) {
  const until = Date.now() + timeout; let last;
  while (Date.now() < until) {
    try { last = await request("GET", "/api/duplicates/status"); if (predicate(last.body)) return last.body; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`timeout: ${JSON.stringify(last?.body)}`);
}

(async () => {
  let server;
  try {
    const firstRoot = path.join(photosDir, "ART-002", "中文 目录", "001");
    const secondRoot = path.join(photosDir, "ART-008", "中文 & 方括号 [目录]", "001");
    write(path.relative(photosDir, path.join(firstRoot, "cross.jpg")), bytes);
    write(path.relative(photosDir, path.join(firstRoot, "inside-a.jpg")), differentBytes);
    write(path.relative(photosDir, path.join(firstRoot, "inside-b.jpg")), differentBytes);
    write(path.relative(photosDir, path.join(secondRoot, "cross-copy.jpg")), bytes);
    write(path.relative(photosDir, path.join(secondRoot, "different.jpg")), Buffer.concat([bytes, Buffer.from("other")]));
    write(path.join("outside", "must-not-hash.jpg"), Buffer.from("outside"));
    server = spawn(process.execPath, [path.join(rootDir, "server.js")], { cwd: rootDir, env: { ...process.env, NODE_ENV: "test", PORT: String(port), HOST: "127.0.0.1", DATA_DIR: dataDir, PHOTOS_DIR: photosDir, TRASH_DIR: path.join(root, "trash"), REMOTE_ADMIN_ENABLED: "0", DUPLICATE_WRITE_BATCH_SIZE: "1" }, stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    await waitFor(() => true);
    assert.equal((await request("POST", "/api/scan")).status, 200);
    const scanUntil = Date.now() + 30000;
    while (Date.now() < scanUntil) { const state = await request("GET", "/api/scan/status"); if (state.body.status === "completed") break; await new Promise((resolve) => setTimeout(resolve, 80)); }
    const invalid = await request("POST", "/api/duplicates/scan", { scope: "directories", roots: [path.join(root, "outside")] });
    assert.ok(invalid.status >= 400, "invalid scope must not fall back to a full scan");
    const dbFile = path.join(dataDir, "gallery.db");
    const holder = spawn(process.execPath, ["--no-warnings", "-e", "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1]);db.exec('BEGIN IMMEDIATE; UPDATE scan_state SET last_scanned_at=last_scanned_at');setTimeout(()=>{db.exec('COMMIT');db.close()},10000)", dbFile], { stdio: "ignore", windowsHide: true });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const started = await request("POST", "/api/duplicates/scan", { scope: "directories", roots: [firstRoot, secondRoot] });
    assert.equal(started.status, 200); assert.equal(started.body.scope, "directories");
    const concurrent = await request("POST", "/api/duplicates/scan");
    assert.equal(concurrent.body.jobId, started.body.jobId, "full and directory starts are mutually exclusive");
    const waiting = await waitFor((state) => state.phase === "waiting-db-lock" && state.dbLockRetries > 0, 20000);
    assert.ok(waiting.queueLength > 0, "scope results remain queued while SQLite is locked");
    await new Promise((resolve) => holder.once("exit", resolve));
    const completed = await waitFor((state) => state.status === "completed");
    assert.equal(completed.totalFiles, 5); assert.equal(completed.processedFiles, 5); assert.equal(completed.successFiles, 5); assert.equal(completed.failedFiles, 0);
    assert.equal(completed.committedFiles, 5); assert.equal(completed.actualImageCount, 5); assert.equal(completed.databaseMatchedCount, 5); assert.equal(completed.unmatchedFileCount, 0);
    assert.ok(completed.reportPath && fs.existsSync(completed.reportPath));
    const result = await request("GET", "/api/duplicates/scope-results");
    assert.equal(result.status, 200); assert.equal(result.body.groups.length, 2);
    assert.equal(result.body.groups.filter((group) => group.kind === "cross-directory").length, 1);
    assert.equal(result.body.groups.filter((group) => group.kind === "within-directory").length, 1);
    const report = JSON.parse(fs.readFileSync(completed.reportPath, "utf8"));
    assert.equal(report.actualImageCount, 5); assert.equal(report.duplicateGroups.length, 2);
    const expectedSha = crypto.createHash("sha256").update(bytes).digest("hex");
    assert.ok(report.duplicateGroups.some((group) => group.sha256 === expectedSha && group.kind === "cross-directory"));
    console.log(JSON.stringify({ ok: true, scope: "directories", actualImages: completed.actualImageCount, committed: completed.committedFiles, groups: result.body.groups.length, dbLockRetries: completed.dbLockRetries, report: completed.reportPath }));
  } finally {
    if (server) { server.kill("SIGTERM"); await new Promise((resolve) => server.once("exit", resolve)); }
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
