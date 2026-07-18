const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { DatabaseSync } = require("node:sqlite");

const root = path.resolve(__dirname, "..");
const worker = path.join(root, "video-compatibility-worker.js");
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
const ffprobe = process.env.FFPROBE_PATH || "ffprobe";
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-video-compat-"));
const photos = path.join(tempRoot, "photos");
const databaseFile = path.join(tempRoot, "gallery.db");
const reportFile = path.join(tempRoot, "video-compatibility-report.json");
fs.mkdirSync(photos, { recursive: true });

function run(executable, args) {
  const result = spawnSync(executable, args, { windowsHide: true, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${path.basename(executable)} failed: ${result.stderr || result.stdout}`);
}

function createVideo(name, codec, audio = true) {
  const file = path.join(photos, name);
  const args = ["-y", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10"];
  if (audio) args.push("-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100");
  args.push("-t", "2", "-c:v", codec);
  if (codec === "libx264") args.push("-pix_fmt", "yuv420p", "-tag:v", "avc1");
  else args.push("-vtag", "mp4v");
  if (audio) args.push("-c:a", "aac", "-shortest");
  args.push(file);
  run(ffmpeg, args);
  return file;
}

function mediaSrc(name) {
  return `/photos/${name.split(path.sep).map(encodeURIComponent).join("/")}`;
}

function createDatabase(rows, file = databaseFile) {
  const db = new DatabaseSync(file);
  db.exec("CREATE TABLE media (id TEXT PRIMARY KEY, collection_id TEXT, type TEXT, title TEXT, file_name TEXT, src TEXT, size INTEGER, mtime REAL)");
  const insert = db.prepare("INSERT INTO media VALUES (?, ?, 'video', ?, ?, ?, ?, ?)");
  for (const row of rows) insert.run(row.id, "test", row.name, row.name, mediaSrc(row.name), row.size || 0, row.mtime || 0);
  db.close();
}

function workerArgs(options = {}) {
  return [worker,
    "--database", options.database || databaseFile,
    "--photos", photos,
    "--report", options.report || reportFile,
    "--ffprobe", options.ffprobe || ffprobe,
    "--ffmpeg", ffmpeg,
    "--mode", options.mode || "incremental",
    "--sample", options.sample === false ? "0" : "1",
    "--probe-concurrency", String(options.concurrency || 2),
    "--probe-timeout-ms", String(options.probeTimeoutMs || 5000),
    "--sample-timeout-ms", "5000",
  ];
}

function runWorker(options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, workerArgs(options), { windowsHide: true, stdio: ["ignore", "ignore", "pipe", "ipc"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve(JSON.parse(fs.readFileSync(options.report || reportFile, "utf8"))) : reject(new Error(stderr || `worker exited ${code}`)));
  });
}

function lifecycleWorker(commandAfterFirstProgress) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, workerArgs({ mode: "full", sample: true }), { windowsHide: true, stdio: ["ignore", "ignore", "pipe", "ipc"] });
    let commanded = false;
    let resumed = false;
    child.on("message", (message) => {
      const status = message?.status || {};
      if (!commanded && status.processed >= 1 && status.status === "running") {
        commanded = true;
        child.send({ command: commandAfterFirstProgress });
      } else if (commandAfterFirstProgress === "pause" && commanded && !resumed && status.status === "paused") {
        resumed = true;
        child.send({ command: "resume" });
      }
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      try {
        assert.strictEqual(code, 0);
        resolve(JSON.parse(fs.readFileSync(reportFile, "utf8")));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function compileSleeper() {
  if (process.platform !== "win32") return "";
  const csc = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe";
  if (!fs.existsSync(csc)) return "";
  const source = path.join(tempRoot, "sleeper.cs");
  const executable = path.join(tempRoot, "sleeper.exe");
  fs.writeFileSync(source, "using System.Threading; class P { static void Main() { Thread.Sleep(30000); } }", "utf8");
  run(csc, ["/nologo", `/out:${executable}`, source]);
  return executable;
}

(async () => {
  try {
    createVideo("safe.mp4", "libx264", true);
    createVideo("fallback.mp4", "mpeg4", true);
    createVideo("silent.mp4", "libx264", false);
    fs.writeFileSync(path.join(photos, "broken.mp4"), "not a video", "utf8");
    const rows = ["safe.mp4", "fallback.mp4", "silent.mp4", "broken.mp4", "missing.mp4"].map((name, index) => {
      const file = path.join(photos, name);
      const stats = fs.existsSync(file) ? fs.statSync(file) : null;
      return { id: `video-${index}`, name, size: stats?.size || 123, mtime: stats?.mtimeMs || 456 };
    });
    createDatabase(rows);

    const first = await runWorker({ sample: false });
    assert.strictEqual(first.status, "completed");
    assert.strictEqual(first.total, 5);
    assert.strictEqual(first.items.find((item) => item.title === "safe.mp4").compatibility_status, "direct_safe");
    assert.strictEqual(first.items.find((item) => item.title === "fallback.mp4").compatibility_status, "fallback_required");
    assert.strictEqual(first.items.find((item) => item.title === "silent.mp4").compatibility_status, "direct_safe");
    assert.strictEqual(first.items.find((item) => item.title === "broken.mp4").reason_code, "probe_failed");
    assert.strictEqual(first.items.find((item) => item.title === "missing.mp4").reason_code, "missing_file");

    const second = await runWorker({ sample: false });
    assert.strictEqual(second.skipped, 5);
    const safe = path.join(photos, "safe.mp4");
    const changedTime = new Date(Date.now() + 5000);
    fs.utimesSync(safe, changedTime, changedTime);
    const third = await runWorker({ sample: false });
    assert.strictEqual(third.scanned, 1);
    assert.strictEqual(third.skipped, 4);

    const paused = await lifecycleWorker("pause");
    assert.strictEqual(paused.status, "completed");
    const stopped = await lifecycleWorker("stop");
    assert.strictEqual(stopped.status, "stopped");

    const sleeper = compileSleeper();
    let timeoutVerified = false;
    if (sleeper) {
      const timeoutDb = path.join(tempRoot, "timeout.db");
      const timeoutReport = path.join(tempRoot, "timeout-report.json");
      createDatabase([rows[0]], timeoutDb);
      const timeout = await runWorker({ database: timeoutDb, report: timeoutReport, ffprobe: sleeper, probeTimeoutMs: 1000, sample: false, concurrency: 1 });
      assert.strictEqual(timeout.items[0].reason_code, "probe_timeout");
      timeoutVerified = true;
    }

    const remaining = spawnSync("tasklist", ["/FI", "IMAGENAME eq ffprobe.exe", "/FO", "CSV", "/NH"], { encoding: "utf8", windowsHide: true });
    console.log(JSON.stringify({ ok: true, first: first.summary, secondSkipped: second.skipped, changedRescanned: third.scanned, pauseResume: paused.status, stop: stopped.status, timeoutVerified, remainingProbeOutput: (remaining.stdout || "").trim() }));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
