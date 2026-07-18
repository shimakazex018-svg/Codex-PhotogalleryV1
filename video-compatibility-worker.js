const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { DatabaseSync } = require("node:sqlite");
const compatibility = require("./video-compatibility");

function parseArgs(argv) {
  const values = {};
  for (let index = 2; index < argv.length; index += 2) values[argv[index].replace(/^--/, "")] = argv[index + 1];
  return values;
}

const args = parseArgs(process.argv);
const databaseFile = path.resolve(args.database || "");
const photosDir = path.resolve(args.photos || "");
const reportFile = path.resolve(args.report || "");
const ffprobePath = args.ffprobe || "ffprobe";
const ffmpegPath = args.ffmpeg || "ffmpeg";
const scanMode = args.mode === "full" ? "full" : "incremental";
const sampleDecodeEnabled = args.sample !== "0";
const probeConcurrency = Math.min(Math.max(Number(args["probe-concurrency"]) || 2, 1), 4);
const probeTimeoutMs = Math.min(Math.max(Number(args["probe-timeout-ms"]) || 20000, 1000), 60000);
const sampleTimeoutMs = Math.min(Math.max(Number(args["sample-timeout-ms"]) || 20000, 1000), 60000);
const activeChildren = new Set();
let paused = false;
let stopping = false;
let processedSincePersist = 0;
let sampleTail = Promise.resolve();
let report = null;

function terminateChild(child) {
  if (!child || child.exitCode !== null) return;
  child.compatibilityStopRequested = true;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  } else {
    child.kill("SIGKILL");
  }
}

function terminateAllChildren() {
  for (const child of activeChildren) terminateChild(child);
}

function send(message) {
  if (typeof process.send === "function" && process.connected) process.send(message);
}

function atomicWriteJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const previous = `${filePath}.previous`;
  fs.writeFileSync(temporary, JSON.stringify(payload), "utf8");
  const renameWithRetry = (from, to) => {
    let lastError;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        fs.renameSync(from, to);
        return;
      } catch (error) {
        lastError = error;
        if (!["EPERM", "EACCES", "EBUSY"].includes(error.code)) throw error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
      }
    }
    throw lastError;
  };
  fs.rmSync(previous, { force: true });
  if (fs.existsSync(filePath)) renameWithRetry(filePath, previous);
  try {
    renameWithRetry(temporary, filePath);
    fs.rmSync(previous, { force: true });
  } catch (error) {
    if (!fs.existsSync(filePath) && fs.existsSync(previous)) renameWithRetry(previous, filePath);
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

function readExistingReport() {
  try {
    const parsed = JSON.parse(fs.readFileSync(reportFile, "utf8"));
    return parsed?.report_version === compatibility.REPORT_VERSION && Array.isArray(parsed.items) ? parsed : null;
  } catch (error) {
    return null;
  }
}

function snapshotStatus(status) {
  const now = Date.now();
  report.status = status || report.status;
  report.updated_at = new Date(now).toISOString();
  report.elapsed_ms = Math.max(now - Date.parse(report.started_at || report.updated_at), 0);
  report.summary = compatibility.reportSummary(report.items);
  return {
    status: report.status,
    mode: report.mode,
    sample_decode_enabled: report.sample_decode_enabled,
    total: report.total,
    processed: report.processed,
    scanned: report.scanned,
    skipped: report.skipped,
    succeeded: report.succeeded,
    errors: report.errors,
    current: report.current || "",
    started_at: report.started_at,
    updated_at: report.updated_at,
    elapsed_ms: report.elapsed_ms,
    rules_version: report.rules_version,
    scanner_version: report.scanner_version,
    probe_concurrency: probeConcurrency,
    sample_concurrency: 1,
    phase: report.phase || "metadata",
    sample_total: report.sample_total || 0,
    sample_processed: report.sample_processed || 0,
    sample_failures: report.sample_failures || 0,
    summary: report.summary,
  };
}

function persist(status) {
  snapshotStatus(status);
  atomicWriteJson(reportFile, report);
  processedSincePersist = 0;
  send({ type: "progress", status: snapshotStatus() });
}

function waitUntilRunning() {
  if (!paused || stopping) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (!paused || stopping) {
        clearInterval(timer);
        resolve();
      }
    }, 100);
  });
}

function runCommand(executable, commandArgs, timeoutMs) {
  return new Promise((resolve) => {
    if (stopping || paused) {
      resolve({ cancelled: true, code: null, timedOut: false, stdout: "", stderr: "" });
      return;
    }
    const child = spawn(executable, commandArgs, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    activeChildren.add(child);
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      terminateChild(child);
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      if (stdout.length < 4 * 1024 * 1024) stdout += chunk.toString("utf8").slice(0, 4 * 1024 * 1024 - stdout.length);
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 4096) stderr += chunk.toString("utf8").slice(0, 4096 - stderr.length);
    });
    const finish = (code, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      activeChildren.delete(child);
      resolve({
        code,
        timedOut,
        cancelled: child.compatibilityStopRequested && !timedOut && (paused || stopping),
        stdout,
        stderr: compatibility.safeError(error?.message || stderr),
      });
    };
    child.once("error", (error) => finish(null, error));
    child.once("exit", (code) => finish(code, null));
  });
}

async function probeFile(filePath) {
  return runCommand(ffprobePath, [
    "-v", "error",
    "-show_entries", "format=format_name,format_long_name,duration,size,bit_rate:stream=index,codec_type,codec_name,codec_long_name,codec_tag_string,profile,level,pix_fmt,width,height,r_frame_rate,avg_frame_rate,bit_rate,sample_rate,channels",
    "-of", "json",
    filePath,
  ], probeTimeoutMs);
}

function samplePoints(duration) {
  const sampleDuration = Math.min(1, Math.max(duration / 8, 0.25));
  const maximumStart = Math.max(duration - sampleDuration, 0);
  return [0.1, 0.5, 0.9].map((ratio) => Math.min(Math.max(duration * ratio, 0), maximumStart));
}

async function withSampleLock(callback) {
  let release;
  const previous = sampleTail;
  sampleTail = new Promise((resolve) => { release = resolve; });
  await previous;
  try {
    return await callback();
  } finally {
    release();
  }
}

async function sampleDecode(filePath, duration) {
  return withSampleLock(async () => {
    const points = [];
    for (const start of samplePoints(duration)) {
      let command;
      while (true) {
        await waitUntilRunning();
        if (stopping) return { status: "stopped", points };
        command = await runCommand(ffmpegPath, [
          "-v", "error", "-ss", start.toFixed(3), "-i", filePath,
          "-t", "1", "-map", "0:v:0", "-f", "null", "-",
        ], sampleTimeoutMs);
        if (!command.cancelled) break;
      }
      points.push({
        at_seconds: Number(start.toFixed(3)),
        ok: command.code === 0 && !command.timedOut,
        exit_code: command.code,
        timed_out: command.timedOut,
        error: command.code === 0 && !command.timedOut ? "" : command.stderr,
      });
    }
    return { status: points.every((point) => point.ok) ? "passed" : "failed", points };
  });
}

function invalidItem(media, resolved, stats, reasonCode, reason, probeStatus = "failed", probeError = "") {
  return {
    media_id: media.id,
    collection_id: media.collection_id,
    title: media.title || media.file_name || "",
    relative_path: resolved?.relativePath || "",
    file_exists: Boolean(stats),
    file_size: Number(stats?.size || media.size || 0),
    mtime_ms: Number(stats?.mtimeMs || media.mtime || 0),
    fingerprint: compatibility.fingerprint(resolved?.relativePath || "", stats?.size || media.size || 0, stats?.mtimeMs || media.mtime || 0),
    compatibility_status: "invalid",
    reason_code: reasonCode,
    reason,
    probe_status: probeStatus,
    probe_error: compatibility.safeError(probeError),
    sample_decode_status: "not_run",
    sample_decode_points: [],
    scanned_at: new Date().toISOString(),
    scanner_version: compatibility.SCANNER_VERSION,
    rules_version: compatibility.RULES_VERSION,
  };
}

async function processMedia(media, previous) {
  const resolved = compatibility.resolveMediaPath(photosDir, media.src);
  if (!resolved) return invalidItem(media, null, null, "path_outside_media_root", "Media URL does not resolve inside the configured media root");
  let stats;
  try {
    stats = fs.statSync(resolved.filePath);
    if (!stats.isFile()) throw new Error("not a file");
  } catch (error) {
    const missing = invalidItem(media, resolved, null, "missing_file", "Video file does not exist or cannot be accessed", "failed", error.code || error.message);
    if (scanMode === "incremental" && previous?.fingerprint === missing.fingerprint && previous.rules_version === compatibility.RULES_VERSION) {
      return { ...previous, skipped_in_last_scan: true };
    }
    return missing;
  }

  const currentFingerprint = compatibility.fingerprint(resolved.relativePath, stats.size, stats.mtimeMs);
  if (scanMode === "incremental" && previous?.fingerprint === currentFingerprint && previous.rules_version === compatibility.RULES_VERSION) {
    return { ...previous, skipped_in_last_scan: true };
  }

  while (true) {
    await waitUntilRunning();
    if (stopping) return null;
    const command = await probeFile(resolved.filePath);
    if (command.cancelled) continue;
    if (command.timedOut) return invalidItem(media, resolved, stats, "probe_timeout", "FFprobe exceeded the per-file timeout", "timeout", command.stderr);
    if (command.code !== 0 || !command.stdout) return invalidItem(media, resolved, stats, "probe_failed", "FFprobe could not read video metadata", "failed", command.stderr);
    let probe;
    try {
      probe = JSON.parse(command.stdout);
    } catch (error) {
      return invalidItem(media, resolved, stats, "probe_failed", "FFprobe returned invalid JSON", "failed", error.message);
    }
    const classification = compatibility.classifyProbe(probe);
    const item = {
      media_id: media.id,
      collection_id: media.collection_id,
      title: media.title || media.file_name || "",
      relative_path: resolved.relativePath,
      file_exists: true,
      file_size: stats.size,
      mtime_ms: stats.mtimeMs,
      fingerprint: currentFingerprint,
      ...compatibility.summarizeProbe(probe),
      compatibility_status: classification.status,
      reason_code: classification.reason_code,
      reason: classification.reason,
      probe_status: "passed",
      probe_error: "",
      sample_decode_status: "not_run",
      sample_decode_points: [],
      skipped_in_last_scan: false,
      scanned_at: new Date().toISOString(),
      scanner_version: compatibility.SCANNER_VERSION,
      rules_version: compatibility.RULES_VERSION,
    };
    return item;
  }
}

async function main() {
  if (!databaseFile || !photosDir || !reportFile) throw new Error("database, photos, and report arguments are required");
  const database = new DatabaseSync(databaseFile, { readOnly: true });
  let videos;
  try {
    videos = database.prepare("SELECT id, collection_id, title, file_name, src, size, mtime FROM media WHERE type = 'video' ORDER BY id").all();
  } finally {
    database.close();
  }

  const existing = readExistingReport();
  const previousItems = new Map((existing?.items || []).map((item) => [item.media_id, item]));
  const resultItems = new Map();
  report = {
    report_version: compatibility.REPORT_VERSION,
    scanner_version: compatibility.SCANNER_VERSION,
    rules_version: compatibility.RULES_VERSION,
    status: "running",
    mode: scanMode,
    sample_decode_enabled: sampleDecodeEnabled,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    elapsed_ms: 0,
    total: videos.length,
    processed: 0,
    scanned: 0,
    skipped: 0,
    succeeded: 0,
    errors: 0,
    current: "",
    phase: "metadata",
    sample_total: 0,
    sample_processed: 0,
    sample_failures: 0,
    items: [],
    summary: compatibility.reportSummary([]),
  };
  persist("running");

  let cursor = 0;
  const runners = Array.from({ length: probeConcurrency }, async () => {
    while (!stopping) {
      await waitUntilRunning();
      if (stopping) break;
      const index = cursor;
      cursor += 1;
      if (index >= videos.length) break;
      const media = videos[index];
      report.current = media.title || media.file_name || media.id;
      const previous = previousItems.get(media.id);
      const item = await processMedia(media, previous);
      if (!item) break;
      resultItems.set(media.id, item);
      report.processed += 1;
      if (item.skipped_in_last_scan) report.skipped += 1;
      else report.scanned += 1;
      if (item.probe_status === "passed") report.succeeded += 1;
      else report.errors += 1;
      report.items = videos.map((video) => resultItems.get(video.id)).filter(Boolean);
      processedSincePersist += 1;
      send({ type: "progress", status: snapshotStatus(paused ? "paused" : "running") });
      if (processedSincePersist >= 25) persist(paused ? "paused" : "running");
    }
  });

  await Promise.all(runners);
  if (!stopping && sampleDecodeEnabled) {
    const mediaById = new Map(videos.map((media) => [media.id, media]));
    const candidates = report.items.filter((item) =>
      ["device_dependent", "fallback_required"].includes(item.compatibility_status)
      && (!item.skipped_in_last_scan || item.sample_decode_status === "not_run")
    );
    report.phase = "sample_decode";
    report.sample_total = candidates.length;
    report.sample_processed = 0;
    report.sample_failures = 0;
    persist("running");
    for (const item of candidates) {
      await waitUntilRunning();
      if (stopping) break;
      const media = mediaById.get(item.media_id);
      const resolved = compatibility.resolveMediaPath(photosDir, media?.src || "");
      report.current = item.title || item.media_id;
      if (!resolved || !fs.existsSync(resolved.filePath)) {
        item.sample_decode_status = "failed";
        item.sample_decode_points = [];
      } else {
        const sample = await sampleDecode(resolved.filePath, item.duration);
        if (sample.status === "stopped") break;
        item.sample_decode_status = sample.status;
        item.sample_decode_points = sample.points;
      }
      report.sample_processed += 1;
      if (item.sample_decode_status === "failed") report.sample_failures += 1;
      processedSincePersist += 1;
      send({ type: "progress", status: snapshotStatus(paused ? "paused" : "running") });
      if (processedSincePersist >= 10) persist(paused ? "paused" : "running");
    }
  }
  report.current = "";
  report.phase = stopping ? report.phase : "complete";
  report.items = videos.map((video) => resultItems.get(video.id)).filter(Boolean);
  persist(stopping ? "stopped" : "completed");
  send({ type: "done", status: snapshotStatus() });
  if (process.connected) process.disconnect();
}

process.on("message", (message) => {
  if (message?.command === "pause" && !stopping) {
    paused = true;
    terminateAllChildren();
    if (report) persist("paused");
  } else if (message?.command === "resume" && !stopping) {
    paused = false;
    if (report) persist("running");
  } else if (message?.command === "stop") {
    stopping = true;
    paused = false;
    terminateAllChildren();
  }
});

process.on("SIGTERM", () => {
  stopping = true;
  paused = false;
  terminateAllChildren();
});

main().catch((error) => {
  stopping = true;
  paused = false;
  terminateAllChildren();
  if (report) {
    report.error = compatibility.safeError(error.message);
    try { persist("failed"); } catch (writeError) {}
  }
  send({ type: "failed", error: compatibility.safeError(error.message) });
  if (process.connected) process.disconnect();
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 50).unref();
});
