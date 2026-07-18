"use strict";

const { spawn, spawnSync } = require("child_process");

function terminate(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  else child.kill("SIGKILL");
}

function createManager(options) {
  let child = null;
  let current = null;

  function status() {
    const database = options.stats();
    return { ...database, ...(current || {}), active: Boolean(child && child.exitCode === null) };
  }

  function start({ limit = 0 } = {}) {
    if (child && child.exitCode === null) { const error = new Error("Perceptual indexing is already active"); error.statusCode = 409; throw error; }
    current = { status: "starting", startedAt: Date.now(), processed: 0, succeeded: 0, failed: 0, skipped: 0 };
    child = spawn(process.execPath, [options.workerFile,
      "--database", options.databaseFile, "--photos", options.photosDir, "--ffmpeg", options.ffmpegPath,
      "--limit", String(Math.max(0, Number(limit) || 0)),
    ], { windowsHide: true, stdio: ["ignore", "ignore", "pipe", "ipc"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { if (stderr.length < 4096) stderr += chunk.toString().slice(0, 4096 - stderr.length); });
    child.on("message", (message) => {
      if (message?.type === "status") current = { ...current, ...message.status };
      if (message?.type === "failed") current = { ...current, status: "failed", recentError: message.error };
    });
    child.once("error", (error) => { current = { ...current, status: "failed", recentError: error.message }; });
    child.once("exit", (code) => {
      child = null;
      if (code && current?.status !== "stopped") current = { ...current, status: "failed", recentError: stderr || `worker exited ${code}` };
      else current = null;
    });
    return status();
  }

  function command(name) {
    if (!child || child.exitCode !== null) { const error = new Error("Perceptual indexing is not active"); error.statusCode = 409; throw error; }
    child.send({ command: name });
    current = { ...current, status: name === "pause" ? "pausing" : name === "resume" ? "running" : "stopping" };
    return status();
  }

  function query(hash64, maxDistance = 10) {
    return new Promise((resolve, reject) => {
      const queryChild = spawn(process.execPath, [options.queryWorkerFile, options.databaseFile, hash64.toString("hex"), String(maxDistance)], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = ""; let stderr = "";
      queryChild.stdout.on("data", (chunk) => { if (stdout.length < 1024 * 1024) stdout += chunk.toString(); });
      queryChild.stderr.on("data", (chunk) => { if (stderr.length < 4096) stderr += chunk.toString().slice(0, 4096 - stderr.length); });
      const timer = setTimeout(() => { terminate(queryChild); reject(new Error("Perceptual query timed out")); }, 15000);
      queryChild.once("error", (error) => { clearTimeout(timer); reject(error); });
      queryChild.once("exit", (code) => {
        clearTimeout(timer);
        if (code !== 0) { reject(new Error(stderr || `query worker exited ${code}`)); return; }
        try { resolve(JSON.parse(stdout)); } catch (error) { reject(new Error("Invalid perceptual query response")); }
      });
    });
  }

  function shutdown() { if (child) { try { child.send({ command: "stop" }); } catch (error) {} terminate(child); } }
  return { pause: () => command("pause"), query, resume: () => command("resume"), shutdown, start, status, stop: () => command("stop") };
}

module.exports = { createManager };
