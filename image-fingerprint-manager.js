"use strict";
const fs = require("fs");
const { fork } = require("child_process");

const BACKOFF = [100, 250, 500, 1000, 2000, 3000, 5000];
const active = new Set(["starting", "running", "paused", "stopping", "waiting-db-lock"]);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const lockError = (error) => /SQLITE_BUSY|SQLITE_LOCKED|database(?: table)? is locked/i.test(`${error?.code || ""} ${error?.message || error || ""}`);

function createManager(options) {
  let child = null; let queue = []; let writing = false; let stopped = false; let state = restore();
  function restore() {
    try { const old = JSON.parse(fs.readFileSync(options.statusFile, "utf8")); return active.has(old.state) ? { ...old, state: "interrupted", phase: "interrupted", finishedAt: new Date().toISOString() } : old; }
    catch { return { jobId: "", state: "idle", phase: "idle", scope: "all", fingerprints: [], totalFiles: 0, processedFiles: 0, pendingWrites: 0, lockRetryCount: 0, lockWaitMilliseconds: 0, shaCalculated: 0, shaCommitted: 0, shaFailed: 0, phashCalculated: 0, phashCommitted: 0, phashFailed: 0, phashReused: 0 }; }
  }
  function persist() { state.updatedAt = new Date().toISOString(); state.pendingWrites = queue.length; fs.mkdirSync(require("path").dirname(options.statusFile), { recursive: true }); const tmp = `${options.statusFile}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(state, null, 2)); fs.renameSync(tmp, options.statusFile); }
  function snapshot() { return { ...state, active: Boolean(child && child.exitCode === null), pendingWrites: queue.length }; }
  async function flush() {
    if (writing || !queue.length) return; writing = true;
    try { while (queue.length) {
      const batch = queue.slice(0, 100); let done = false;
      for (let i = 0; i < BACKOFF.length; i += 1) try {
        state.phase = "committing"; const committed = options.commit(batch); queue.splice(0, batch.length);
        state.shaCommitted += committed.shaCommitted; state.phashCommitted += committed.phashCommitted; state.lastSuccessfulCommitAt = new Date().toISOString(); state.checkpointMediaId = committed.lastMediaId; done = true; persist(); break;
      } catch (error) {
        if (!lockError(error) || i === BACKOFF.length - 1) throw error;
        state.phase = "waiting-db-lock"; state.lockRetryCount += 1; state.lockWaitMilliseconds += BACKOFF[i]; persist(); await wait(BACKOFF[i]);
      }
      if (!done) break;
    }} finally { writing = false; if (!queue.length && stopped) finish(); else if (!queue.length) void dispatch(); }
  }
  function finish() { if (state.state === "stopping") state.state = "cancelled"; else if (state.state !== "failed") state.state = "completed"; state.phase = state.state; state.finishedAt = new Date().toISOString(); persist(); try { child?.disconnect(); } catch {} child = null; }
  function start(input = {}) {
    if (child && child.exitCode === null) { const e = new Error("Image fingerprint scan is already active"); e.statusCode = 409; throw e; }
    const fingerprints = [...new Set(input.fingerprints || ["sha256", "phash"])].filter((value) => value === "sha256" || value === "phash");
    if (!fingerprints.length) { const e = new Error("At least one fingerprint is required"); e.statusCode = 400; throw e; }
    state = { jobId: `image-fingerprint-scan-${Date.now()}`, state: "starting", phase: "enumerating", scope: input.scope || "all", roots: input.roots || [], fingerprints,
      limit: Math.min(Math.max(Number(input.limit) || 0, 0), 100000), totalFiles: 0, processedFiles: 0, currentPath: "", pendingWrites: 0, lockRetryCount: 0, lockWaitMilliseconds: 0, startedAt: new Date().toISOString(), updatedAt: "", finishedAt: "",
      shaCalculated: 0, shaCommitted: 0, shaFailed: 0, phashCalculated: 0, phashCommitted: 0, phashFailed: 0, phashReused: 0, checkpointMediaId: "", lastSuccessfulCommitAt: "" };
    queue = []; stopped = false; persist();
    child = fork(options.workerFile, [], { windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"] });
    child.on("message", async (message) => {
      if (message?.type === "ready") { state.state = "running"; persist(); await dispatch(); }
      if (message?.type === "result") { const result = message.result; state.processedFiles += 1; state.currentPath = result.absolutePath || state.currentPath;
        if (result.sha256) state.shaCalculated += 1; else if (result.shaError) state.shaFailed += 1;
        if (result.hash64) state.phashCalculated += 1; else if (result.phashError && state.fingerprints.includes("phash")) state.phashFailed += 1;
        queue.push(result); persist(); void flush(); }
      if (message?.type === "drained") { if (stopped) { void flush(); return; } await dispatch(); }
      if (message?.type === "stopped") { stopped = true; void flush(); }
    });
    child.on("exit", () => { if (!stopped && state.state !== "completed" && state.state !== "failed") { stopped = true; void flush(); } });
    return snapshot();
  }
  async function dispatch() {
    if (!child || stopped) return;
    if (queue.length >= 400) { state.phase = "waiting-db-writer"; persist(); setTimeout(dispatch, 100); return; }
    const remaining = state.limit ? Math.max(0, state.limit - state.totalFiles) : 200;
    if (!remaining) { stopped = true; if (!writing && !queue.length) finish(); else void flush(); return; }
    const rows = options.candidates({ afterMediaId: state.checkpointMediaId, fingerprints: state.fingerprints, scope: state.scope, roots: state.roots, limit: Math.min(200, remaining) });
    if (!rows.length) { stopped = true; if (!writing && !queue.length) finish(); else void flush(); return; }
    state.totalFiles += rows.length; state.phase = "hashing"; persist(); child.send({ type: "items", items: rows, ffmpegPath: options.ffmpegPath });
  }
  function command(name) { if (!child) { const e = new Error("No active image fingerprint scan"); e.statusCode = 409; throw e; } if (name === "stop") { state.state = "stopping"; stopped = true; } else state.state = name === "pause" ? "paused" : "running"; state.phase = state.state; child.send({ type: name }); persist(); return snapshot(); }
  return { start, status: snapshot, pause: () => command("pause"), resume: () => command("resume"), stop: () => command("stop") };
}
module.exports = { BACKOFF, createManager };
