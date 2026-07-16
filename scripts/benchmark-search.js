const path = require("path");
const galleryDb = require("../gallery-db");

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

const dbArgument = argumentValue("--db");
if (!dbArgument) {
  console.error("Usage: node scripts/benchmark-search.js --db <isolated-gallery.db> [--optimize]");
  process.exit(2);
}

const dbFile = path.resolve(dbArgument);
const queries = [
  { type: "exact collection", query: "[XIUREN秀人网] 2020.04.16 NO.2161 安然Maleah [87P 168MB]" },
  { type: "collection prefix", query: "[XIUREN秀人网] 2020.04" },
  { type: "collection middle", query: "Maleah" },
  { type: "two Chinese characters", query: "安然" },
  { type: "three Chinese characters", query: "秀人网" },
  { type: "English name", query: "Maleah" },
  { type: "number", query: "2161" },
  { type: "file name", query: "theaic.top 0001" },
  { type: "path fragment", query: "photos" },
  { type: "high frequency", query: "theaic.top" },
  { type: "no result", query: "__codex_no_result_20260716__" },
  { type: "many media matches", query: "jpg" },
];

if (process.argv.includes("--optimize")) galleryDb.optimizeDatabase(dbFile);

const results = queries.map(({ type, query }) => {
  const payload = galleryDb.search(dbFile, query, 60, { includePerformance: true });
  const diagnostics = galleryDb.getSearchDiagnostics(dbFile, query);
  const planDetails = Object.fromEntries(
    Object.entries(diagnostics.plans).map(([name, rows]) => [name, rows.map((row) => row.detail)]),
  );
  return {
    type,
    query,
    collections: payload.collections.length,
    media: payload.media.length,
    resultCount: payload.collections.length + payload.media.length,
    hasMore: payload.hasMore,
    exactCollectionMatch: payload.exactCollectionMatch,
    performance: payload.performance,
    plans: planDetails,
    fullScans: [...new Set(Object.values(planDetails).flat().filter((detail) => /^SCAN (media|c)\b/.test(detail)))],
  };
});

const diagnostics = galleryDb.getSearchDiagnostics(dbFile, "Maleah");
console.log(JSON.stringify({
  dbFile,
  generatedAt: new Date().toISOString(),
  indexes: diagnostics.indexes,
  results,
}, null, 2));
