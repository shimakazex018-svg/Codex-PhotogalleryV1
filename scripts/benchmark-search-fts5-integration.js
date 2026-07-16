"use strict";

const fs = require("fs");
const path = require("path");
const galleryDb = require("../gallery-db");
const cli = require("./search-fts-cli-lib");

const dbFile = cli.requireExplicitDatabase();
const outputValue = cli.argumentValue("--output");
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
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function once(query, mode) {
  const started = performance.now();
  const payload = galleryDb.search(dbFile, query, 60, { searchMode: mode, includePerformance: true });
  const elapsedMs = Math.round((performance.now() - started) * 1000) / 1000;
  return {
    elapsedMs,
    databaseMs: payload.performance?.databaseTotalMs || 0,
    collectionMs: payload.performance?.collectionSqlMs || 0,
    mediaMs: payload.performance?.mediaSqlMs || 0,
    count: payload.collections.length + payload.media.length,
    mediaCount: payload.media.length,
    hasMore: payload.hasMore,
    actualMode: payload.searchMode,
    indexStatus: payload.indexStatus,
    degraded: payload.degraded,
  };
}

function benchmark(type, query, mode = "fts5") {
  const cold = once(query, mode);
  const hot = Array.from({ length: 5 }, () => once(query, mode));
  return {
    type,
    query,
    mode,
    cold,
    hotMedianMs: median(hot.map((item) => item.elapsedMs)),
    hotSlowestMs: Math.max(...hot.map((item) => item.elapsedMs)),
    hot,
  };
}

const started = performance.now();
const benchmarks = cases.map(([type, query]) => benchmark(type, query));
const legacy = process.argv.includes("--skip-legacy") ? [] : [
  benchmark("legacy sparse filename", "theaic.top 0001", "legacy-like"),
  benchmark("legacy no result", "__codex_no_result_20260716__", "legacy-like"),
];
const result = {
  generatedAt: new Date().toISOString(),
  database: cli.databaseIdentity(dbFile, false),
  coldDefinition: "first galleryDb.search call before five repeated calls; Windows filesystem cache was not cleared",
  elapsedMs: Math.round(performance.now() - started),
  plans: galleryDb.getSearchDiagnostics(dbFile, "扫码"),
  benchmarks,
  legacy,
};
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
