const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

const dbArgument = argumentValue("--db");
if (!dbArgument) {
  console.error("Usage: node scripts/test-search-api.js --db <isolated-gallery.db> [--port 48191]");
  process.exit(2);
}

const dbFile = path.resolve(dbArgument);
const dataDir = path.dirname(dbFile);
const photosDir = path.join(dataDir, "photos");
const port = Math.min(Math.max(Number(argumentValue("--port")) || 48191, 1024), 65535);
fs.mkdirSync(photosDir, { recursive: true });

const child = spawn(process.execPath, [path.resolve(__dirname, "..", "server.js")], {
  cwd: path.resolve(__dirname, ".."),
  windowsHide: true,
  env: {
    SystemRoot: process.env.SystemRoot || "C:\\Windows",
    TEMP: process.env.TEMP || dataDir,
    TMP: process.env.TMP || process.env.TEMP || dataDir,
    DATA_DIR: dataDir,
    PHOTOS_DIR: photosDir,
    PORT: String(port),
    HOST: "127.0.0.1",
    SEARCH_PERF_LOG: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let stderr = "";
const performanceLogs = [];
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => { stderr += chunk; });
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  for (const line of chunk.split(/\r?\n/)) {
    if (!line.includes('"event":"search-performance"')) continue;
    try {
      performanceLogs.push(JSON.parse(line));
    } catch (error) {
      // The API response remains the primary assertion source.
    }
  }
});

const queries = [
  "[XIUREN秀人网] 2020.04.16 NO.2161 安然Maleah [87P 168MB]",
  "[XIUREN秀人网] 2020.04",
  "Maleah",
  "安然",
  "秀人网",
  "theaic.top 0001",
  "photos",
  "2161",
  "theaic.top",
  "0001",
  "__codex_no_result_20260716__",
  "jpg",
];

async function waitUntilReady() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited before ready: ${stderr}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/config`);
      if (response.ok) return;
    } catch (error) {
      // Retry until the bounded deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Isolated search server did not become ready");
}

async function run() {
  await waitUntilReady();
  const results = [];
  for (const query of queries) {
    const startedAt = performance.now();
    const response = await fetch(`http://127.0.0.1:${port}/api/search?q=${encodeURIComponent(query)}&limit=60&perf=1`);
    if (!response.ok) throw new Error(`Search failed for ${query}: HTTP ${response.status}`);
    const payload = await response.json();
    results.push({
      query,
      apiMs: Math.round((performance.now() - startedAt) * 1000) / 1000,
      sqlMs: Math.round(((payload.performance?.collectionSqlMs || 0) + (payload.performance?.mediaSqlMs || 0)) * 1000) / 1000,
      collections: payload.collections.length,
      media: payload.media.length,
      resultCount: payload.collections.length + payload.media.length,
      hasMore: payload.hasMore,
    });
  }

  const shortResponse = await fetch(`http://127.0.0.1:${port}/api/search?q=a&limit=60&perf=1`);
  const shortPayload = await shortResponse.json();
  if (shortPayload.collections.length || shortPayload.media.length) throw new Error("One-character query was not rejected");
  if (results.some((item) => item.resultCount > 60)) throw new Error("Search result limit exceeded 60");
  await new Promise((resolve) => setTimeout(resolve, 25));
  if (performanceLogs.length !== queries.length + 1) throw new Error("Structured search log count did not match request count");
  console.log(JSON.stringify({ results, shortQueryResultCount: 0, performanceLogCount: performanceLogs.length }, null, 2));
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (child.exitCode !== null) return;
    await new Promise((resolve) => {
      child.once("exit", resolve);
      child.kill();
      setTimeout(resolve, 5000).unref();
    });
  });
