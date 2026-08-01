const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const rootDir = __dirname;
function resolveConfiguredPath(value, fallback) { return value ? (path.isAbsolute(value) ? value : path.resolve(rootDir, value)) : fallback; }
const photosDir = resolveConfiguredPath(process.env.PHOTOS_DIR, path.join(rootDir, "photos"));
const testDelayMs = process.env.NODE_ENV === "test" ? Math.min(Math.max(Number(process.env.DUPLICATE_TEST_FILE_DELAY_MS || 0), 0), 1000) : 0;
let stopRequested = false;
let candidateReply = null;
let lastProgressAt = 0;
let lastProgressProcessed = 0;

function isInsideDir(parentDir, childPath) {
  const relative = path.relative(parentDir, childPath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}
function mediaSrcToPath(src) {
  try {
    const parsed = new URL(src, "http://localhost");
    const decoded = decodeURIComponent(parsed.pathname);
    if (!decoded.startsWith("/photos/")) return "";
    const filePath = path.normalize(path.join(photosDir, decoded.replace(/^\/photos\/?/, "")));
    return isInsideDir(photosDir, filePath) ? filePath : "";
  } catch { return ""; }
}
function send(type, payload = {}) {
  if (typeof process.send === "function") process.send({ type, payload });
  else process.stdout.write(`${JSON.stringify({ type, ...payload })}\n`);
}
function sha256File(filePath, heartbeat) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    const timer = setInterval(() => heartbeat?.(), 3000);
    const finish = (callback, value) => { clearInterval(timer); callback(value); };
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", (error) => finish(reject, error));
    stream.on("end", () => finish(resolve, hash.digest("hex")));
  });
}
function emitProgress(progress, force = false) {
  const now = Date.now();
  if (!force && progress.processedFiles - lastProgressProcessed < 25 && now - lastProgressAt < 500) return;
  lastProgressAt = now; lastProgressProcessed = progress.processedFiles;
  send("duplicate-scan-progress", progress);
}
function delayForTest() { return testDelayMs ? new Promise((resolve) => setTimeout(resolve, testDelayMs)) : Promise.resolve(); }
function nextCandidates(afterMediaId) {
  return new Promise((resolve, reject) => {
    candidateReply = { resolve, reject };
    send("duplicate-scan-request-candidates", { afterMediaId });
  });
}
process.on("message", (message) => {
  if (message?.type === "duplicate-scan-stop") stopRequested = true;
  if (message?.type === "duplicate-scan-candidates" && candidateReply) {
    const reply = candidateReply; candidateReply = null; reply.resolve(message.payload || {});
  }
  if (message?.type === "duplicate-scan-abort" && candidateReply) {
    const reply = candidateReply; candidateReply = null; reply.reject(new Error(message.payload?.error || "duplicate scan aborted"));
  }
});

async function run() {
  const progress = { phase: "enumerating", totalFiles: 0, processedFiles: 0, successFiles: 0, failedFiles: 0, committedFiles: 0,
    processedBytes: 0, currentPath: "", currentDirectory: "", recentErrors: [] };
  send("duplicate-scan-ready");
  let afterMediaId = "";
  for (;;) {
    if (stopRequested) break;
    const reply = await nextCandidates(afterMediaId);
    if (reply.totalFiles !== undefined) progress.totalFiles = Number(reply.totalFiles || 0);
    if (reply.phase) progress.phase = reply.phase;
    if (!Array.isArray(reply.items) || !reply.items.length) break;
    progress.phase = "hashing";
    send("duplicate-scan-phase", progress);
    for (const item of reply.items) {
      if (stopRequested) break;
      const filePath = mediaSrcToPath(item.src || "");
      progress.currentPath = filePath || item.file || item.title || item.src || "";
      progress.currentDirectory = filePath ? path.dirname(filePath) : "";
      let result;
      try {
        if (!filePath || !fs.existsSync(filePath)) {
          const error = { code: "ENOENT", message: "扫描过程中该文件不存在" };
          result = { item, sha256: "", fileError: error.message, error };
        } else {
          try { progress.processedBytes += fs.statSync(filePath).size || 0; } catch {}
          result = { item, sha256: await sha256File(filePath, () => emitProgress(progress, true)) };
        }
      } catch (error) {
        result = { item, sha256: "", fileError: error.message || String(error), error: { code: error.code || "HASH_FAILED", message: error.message || String(error) } };
      }
      progress.processedFiles += 1;
      if (result.fileError) {
        progress.failedFiles += 1;
        progress.recentErrors.push({ time: new Date().toISOString(), mediaId: item.id, path: progress.currentPath, stage: "hashing", errorCode: result.error.code, code: result.error.code, message: result.error.message, attempt: 1, isFinal: true });
      } else progress.successFiles += 1;
      progress.recentErrors = progress.recentErrors.slice(-20);
      send("duplicate-scan-hash-result", { result: {
        mediaId: item.id, collectionId: item.collectionId, fileSize: item.size || 0, mtime: item.mtime || 0, sha256: result.sha256,
        width: item.width || null, height: item.height || null,
        metadata: { file: item.file || "", title: item.title || "", collectionTitle: item.collectionTitle || "", ...(result.fileError ? { hashError: result.fileError } : {}) },
      }, progress });
      emitProgress(progress); await delayForTest();
    }
    afterMediaId = String(reply.items.at(-1)?.id || afterMediaId);
  }
  send(stopRequested ? "duplicate-scan-cancelled" : "duplicate-scan-finished-hashing", { ...progress, phase: stopRequested ? "stopping" : "grouping" });
  // Keep IPC alive long enough for the terminal message to reach the writer.
  setTimeout(() => { if (process.connected) process.disconnect(); }, 25);
}
run().catch((error) => { console.error(error.stack || error.message || String(error)); process.exit(1); });
