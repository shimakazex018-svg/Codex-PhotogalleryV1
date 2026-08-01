"use strict";

// Intentionally has no SQLite import: database ownership remains in server.js.
const fs = require("fs");
const crypto = require("crypto");
const { phash64 } = require("./perceptual-hash");

let paused = false;
let stopping = false;
let resolver = null;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256"); const stream = fs.createReadStream(file);
    stream.on("error", reject); stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

process.on("message", async (message) => {
  if (message?.type === "pause") paused = true;
  if (message?.type === "resume") paused = false;
  if (message?.type === "stop") stopping = true;
  if (message?.type !== "items") return;
  for (const item of message.items || []) {
    while (paused && !stopping) { process.send?.({ type: "heartbeat", mediaId: item.mediaId, phase: "paused" }); await wait(250); }
    if (stopping) break;
    const before = fs.statSync(item.absolutePath);
    const result = { mediaId: item.mediaId, collectionId: item.collectionId, sourceSize: item.sourceSize, sourceMtime: item.sourceMtime };
    try { if (item.needsSha256) result.sha256 = await sha256(item.absolutePath); }
    catch (error) { result.shaError = String(error.message || error); }
    try { if (item.needsPhash) result.hash64 = await phash64({ inputPath: item.absolutePath, ffmpegPath: message.ffmpegPath }); }
    catch (error) { result.phashError = String(error.code || error.message || error); }
    try {
      const after = fs.statSync(item.absolutePath);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) { result.sha256 = undefined; result.hash64 = undefined; result.phashError = "SOURCE_CHANGED"; }
    } catch (error) { result.sha256 = undefined; result.hash64 = undefined; result.phashError = "SOURCE_UNAVAILABLE"; }
    process.send?.({ type: "result", result });
  }
  process.send?.({ type: stopping ? "stopped" : "drained" });
});

setImmediate(() => process.send?.({ type: "ready" }));
