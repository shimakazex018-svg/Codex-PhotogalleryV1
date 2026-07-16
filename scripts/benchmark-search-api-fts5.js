"use strict";

const fs = require("fs");
const path = require("path");

function argumentValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] !== undefined ? process.argv[index + 1] : fallback;
}

const baseUrl = argumentValue("--base-url", "http://127.0.0.1:48103").replace(/\/$/, "");
const outputValue = argumentValue("--output");
const cases = [
  ["complete collection", "[XIUREN秀人网] 2020.04.16 NO.2161 安然Maleah [87P 168MB]"],
  ["collection prefix", "[XIUREN秀人网] 2020.04"],
  ["collection middle", "Maleah"],
  ["two Chinese", "安然"],
  ["three Chinese", "秀人网"],
  ["two title prefix", "扫码"],
  ["two middle substring", "码下"],
  ["English", "Maleah"],
  ["number", "2161"],
  ["sparse filename", "theaic.top 0001"],
  ["path fragment", "No.4720"],
  ["high frequency", "theaic.top"],
  ["numeric filename", "0001"],
  ["no result", "__codex_no_result_20260716__"],
  ["extension", "jpg"],
  ["special characters", 'a"*:(b)-c%_\\/'],
];

function median(values) {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
}

async function once(query) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}/api/search?q=${encodeURIComponent(query)}&limit=60&perf=1`);
  const payload = await response.json();
  const elapsedMs = Math.round((performance.now() - started) * 1000) / 1000;
  if (!response.ok) throw new Error(`${response.status}: ${payload.error || "search failed"}`);
  return {
    elapsedMs,
    serverTiming: response.headers.get("server-timing") || "",
    apiTotalMs: payload.performance?.databaseTotalMs || 0,
    collectionMs: payload.performance?.collectionSqlMs || 0,
    mediaMs: payload.performance?.mediaSqlMs || 0,
    resultCount: payload.collections.length + payload.media.length,
    mediaCount: payload.media.length,
    actualMode: payload.searchMode,
    indexStatus: payload.indexStatus,
    degraded: payload.degraded,
    hasMore: payload.hasMore,
  };
}

async function main() {
  const started = performance.now();
  const results = [];
  for (const [type, query] of cases) {
    const cold = await once(query);
    const hot = [];
    for (let index = 0; index < 5; index += 1) hot.push(await once(query));
    results.push({ type, query, cold, hotMedianMs: median(hot.map((item) => item.elapsedMs)), hotSlowestMs: Math.max(...hot.map((item) => item.elapsedMs)), hot });
  }
  const result = { generatedAt: new Date().toISOString(), baseUrl, elapsedMs: Math.round(performance.now() - started), results };
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (outputValue) {
    const output = path.resolve(outputValue);
    const allowed = path.resolve(__dirname, "..", "tmp", "fts5-integration-v96");
    const relative = path.relative(allowed, output);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Output must stay under ${allowed}`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, serialized, "utf8");
  }
  process.stdout.write(serialized);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
