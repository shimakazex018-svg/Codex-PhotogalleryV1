const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const compatibility = require("./video-compatibility");

function readJson(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed?.report_version === compatibility.REPORT_VERSION && Array.isArray(parsed.items) ? parsed : null;
  } catch (error) {
    try {
      const previous = JSON.parse(fs.readFileSync(`${filePath}.previous`, "utf8"));
      return previous?.report_version === compatibility.REPORT_VERSION && Array.isArray(previous.items) ? previous : null;
    } catch (previousError) {
      return null;
    }
  }
}

function terminateChild(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  else child.kill("SIGKILL");
}

function publicItem(item) {
  if (!item) return null;
  return {
    mediaId: item.media_id,
    collectionId: item.collection_id,
    title: item.title,
    relativePath: item.relative_path,
    fileExists: item.file_exists,
    fileSize: item.file_size,
    mtimeMs: item.mtime_ms,
    container: item.container,
    duration: item.duration,
    videoCodec: item.video_codec,
    videoTag: item.video_tag,
    videoProfile: item.video_profile,
    pixelFormat: item.pixel_format,
    width: item.width,
    height: item.height,
    audioCodec: item.audio_codec,
    compatibilityStatus: item.compatibility_status,
    reasonCode: item.reason_code,
    reason: item.reason,
    probeStatus: item.probe_status,
    probeError: item.probe_error,
    sampleDecodeStatus: item.sample_decode_status,
    sampleDecodePoints: item.sample_decode_points,
    scannedAt: item.scanned_at,
    rulesVersion: item.rules_version,
  };
}

function createManager(options) {
  const reportFile = options.reportFile;
  let child = null;
  let currentStatus = null;
  let cachedReport = null;
  let cachedMtime = -1;

  function loadReport(force = false) {
    try {
      const mtime = fs.statSync(reportFile).mtimeMs;
      if (force || mtime !== cachedMtime) {
        cachedReport = readJson(reportFile);
        cachedMtime = mtime;
      }
    } catch (error) {
      cachedReport = null;
      cachedMtime = -1;
    }
    return cachedReport;
  }

  function reportStatus() {
    const report = loadReport();
    if (!report) {
      return {
        status: "not_started",
        total: options.videoCount(),
        processed: 0,
        scanned: 0,
        skipped: 0,
        succeeded: 0,
        errors: 0,
        current: "",
        rules_version: compatibility.RULES_VERSION,
        scanner_version: compatibility.SCANNER_VERSION,
        report_file: "video-compatibility-report.json",
      };
    }
    const status = !child && ["running", "paused"].includes(report.status) ? "interrupted" : report.status;
    return {
      status,
      mode: report.mode,
      sample_decode_enabled: report.sample_decode_enabled,
      total: report.total,
      processed: report.processed,
      scanned: report.scanned,
      skipped: report.skipped,
      succeeded: report.succeeded,
      errors: report.errors,
      current: report.current || "",
      phase: report.phase || "metadata",
      sample_total: report.sample_total || 0,
      sample_processed: report.sample_processed || 0,
      sample_failures: report.sample_failures || 0,
      started_at: report.started_at,
      updated_at: report.updated_at,
      elapsed_ms: report.elapsed_ms,
      rules_version: report.rules_version,
      scanner_version: report.scanner_version,
      probe_concurrency: 2,
      sample_concurrency: 1,
      summary: report.summary || compatibility.reportSummary(report.items),
      report_file: "video-compatibility-report.json",
      report_size: fs.statSync(reportFile).size,
    };
  }

  function status() {
    const diskStatus = reportStatus();
    if (currentStatus?.status === "starting" && diskStatus.status === "running") return diskStatus;
    return currentStatus || diskStatus;
  }

  function start({ mode = "incremental", sample = true } = {}) {
    if (child && child.exitCode === null) {
      const error = new Error("Video compatibility scan is already active");
      error.statusCode = 409;
      throw error;
    }
    currentStatus = { ...reportStatus(), status: "starting", mode: mode === "full" ? "full" : "incremental" };
    child = spawn(process.execPath, [
      options.workerFile,
      "--database", options.databaseFile,
      "--photos", options.photosDir,
      "--report", reportFile,
      "--ffprobe", options.ffprobePath,
      "--ffmpeg", options.ffmpegPath,
      "--mode", mode === "full" ? "full" : "incremental",
      "--sample", sample ? "1" : "0",
      "--probe-concurrency", "2",
      "--probe-timeout-ms", "20000",
      "--sample-timeout-ms", "20000",
    ], { windowsHide: true, stdio: ["ignore", "ignore", "pipe", "ipc"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 4096) stderr += chunk.toString("utf8").slice(0, 4096 - stderr.length);
    });
    child.on("message", (message) => {
      if (message?.status) currentStatus = { ...message.status, report_file: "video-compatibility-report.json" };
      if (message?.type === "failed") options.log("video_compatibility_scan_failed", { error: compatibility.safeError(message.error) });
      loadReport(true);
    });
    child.once("error", (error) => {
      currentStatus = { ...reportStatus(), status: "failed", error: compatibility.safeError(error.message) };
      options.log("video_compatibility_scan_failed", { error: compatibility.safeError(error.message) });
    });
    child.once("exit", (code) => {
      const stoppedChild = child;
      if (child === stoppedChild) child = null;
      loadReport(true);
      currentStatus = null;
      if (code !== 0) options.log("video_compatibility_scan_failed", { code, error: compatibility.safeError(stderr) });
    });
    return status();
  }

  function command(name) {
    if (!child || child.exitCode !== null) {
      const error = new Error("Video compatibility scan is not active");
      error.statusCode = 409;
      throw error;
    }
    child.send({ command: name });
    currentStatus = { ...status(), status: name === "pause" ? "pausing" : name === "resume" ? "running" : "stopping" };
    return status();
  }

  function query(queryOptions = {}) {
    const report = loadReport();
    const pageSize = Math.min(Math.max(Number(queryOptions.pageSize) || 50, 1), 100);
    const statusFilter = compatibility.STATUSES.has(queryOptions.status) ? queryOptions.status : "";
    const search = String(queryOptions.search || "").trim().toLocaleLowerCase("en-US").slice(0, 200);
    let items = report?.items || [];
    if (statusFilter) items = items.filter((item) => item.compatibility_status === statusFilter);
    if (search) items = items.filter((item) => `${item.title || ""} ${item.relative_path || ""}`.toLocaleLowerCase("en-US").includes(search));
    const total = items.length;
    const pages = Math.max(Math.ceil(total / pageSize), 1);
    const page = Math.min(Math.max(Number(queryOptions.page) || 1, 1), pages);
    return { page, pageSize, total, pages, items: items.slice((page - 1) * pageSize, page * pageSize).map(publicItem) };
  }

  function getItem(mediaId) {
    return (loadReport()?.items || []).find((item) => item.media_id === mediaId) || null;
  }

  function augmentMedia(payload) {
    const reportItems = new Map((loadReport()?.items || []).map((item) => [item.media_id, item]));
    return {
      ...payload,
      items: (payload.items || []).map((item) => {
        const compatibilityItem = reportItems.get(item.id);
        return compatibilityItem ? {
          ...item,
          compatibilityStatus: compatibilityItem.compatibility_status,
          compatibilityReasonCode: compatibilityItem.reason_code,
          compatibilityReason: compatibilityItem.reason,
        } : item;
      }),
    };
  }

  function shutdown() {
    if (!child || child.exitCode !== null) return;
    try { child.send({ command: "stop" }); } catch (error) {}
    terminateChild(child);
  }

  return {
    augmentMedia,
    getItem,
    pause: () => command("pause"),
    query,
    resume: () => command("resume"),
    shutdown,
    start,
    status,
    stop: () => command("stop"),
  };
}

module.exports = { createManager, publicItem };
