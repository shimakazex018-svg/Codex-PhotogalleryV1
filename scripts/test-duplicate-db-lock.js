"use strict";

// Isolated regression: a separate SQLite writer holds the lock for ten
// seconds while the real duplicate worker hashes 1,500 files.  The scan must
// report waiting-db-lock, recover, and commit every result exactly once.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const rootDir = path.resolve(__dirname, "..");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-duplicate-lock-"));
const photosDir = path.join(root, "photos"); const dataDir = path.join(root, "data"); const port = 48915;
const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/Aaf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/Aaf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Ap//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z", "base64");
function request(method, pathname) { return fetch(`http://127.0.0.1:${port}${pathname}`, { method }).then(async (response) => ({ status: response.status, body: await response.json() })); }
async function waitFor(predicate, timeout = 30000) { const until = Date.now() + timeout; let last; while (Date.now() < until) { try { last = await request("GET", "/api/duplicates/status"); if (predicate(last.body)) return last.body; } catch {} await new Promise((resolve) => setTimeout(resolve, 100)); } throw new Error(`timeout: ${JSON.stringify(last?.body)}`); }
function makeFiles() { for (let i = 0; i < 1500; i += 1) { const file = path.join(photosDir, "set", `${String(i).padStart(4, "0")}.jpg`); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, jpeg); } }
(async () => {
  let server;
  try {
    makeFiles();
    server = spawn(process.execPath, [path.join(rootDir, "server.js")], { cwd: rootDir, env: { ...process.env, NODE_ENV: "test", PORT: String(port), HOST: "127.0.0.1", DATA_DIR: dataDir, PHOTOS_DIR: photosDir, TRASH_DIR: path.join(root, "trash"), REMOTE_ADMIN_ENABLED: "0", DUPLICATE_WRITE_BATCH_SIZE: "100" }, stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    await waitFor(() => true); assert.equal((await request("POST", "/api/scan")).status, 200);
    const scanUntil = Date.now() + 30000; while (Date.now() < scanUntil) { const state = await request("GET", "/api/scan/status"); if (state.body.status === "completed") break; await new Promise((resolve) => setTimeout(resolve, 100)); }
    const dbFile = path.join(dataDir, "gallery.db");
    const holder = spawn(process.execPath, ["--no-warnings", "-e", "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1]);db.exec('PRAGMA busy_timeout=1000; BEGIN IMMEDIATE; UPDATE scan_state SET last_scanned_at=last_scanned_at');setTimeout(()=>{db.exec('COMMIT');db.close()},10000)", dbFile], { stdio: "ignore", windowsHide: true });
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal((await request("POST", "/api/duplicates/scan")).status, 200);
    const waiting = await waitFor((state) => state.phase === "waiting-db-lock" && state.dbLockRetries > 0, 20000);
    assert.ok(waiting.queueLength > 0); assert.ok(waiting.dbLockWaitMs > 0);
    await new Promise((resolve) => holder.once("exit", resolve));
    const completed = await waitFor((state) => state.status === "completed", 45000);
    assert.equal(completed.failedFiles, 0); assert.equal(completed.committedFiles, 1500); assert.equal(completed.stats.hashedCount, 1500);
    const quick = spawn(process.execPath, ["--no-warnings", "-e", "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1],{readOnly:true});console.log(db.prepare('PRAGMA quick_check').get().quick_check);db.close()", dbFile], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    let quickText = ""; quick.stdout.on("data", (chunk) => { quickText += String(chunk); }); await new Promise((resolve, reject) => quick.on("exit", (code) => code === 0 ? resolve() : reject(new Error("quick_check failed")))); assert.equal(quickText.trim(), "ok");
    console.log(JSON.stringify({ ok: true, waitingDbLock: true, committed: completed.committedFiles, dbLockRetries: completed.dbLockRetries, quickCheck: quickText.trim() }));
  } finally { if (server) { server.kill("SIGTERM"); await new Promise((resolve) => server.once("exit", resolve)); } fs.rmSync(root, { recursive: true, force: true }); }
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
