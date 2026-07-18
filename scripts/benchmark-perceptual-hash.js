"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { DatabaseSync } = require("node:sqlite");
const { hammingDistance64, phash64 } = require("../perceptual-hash");

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) result[argv[index].replace(/^--/, "")] = argv[index + 1];
  return result;
}

const args = parseArgs(process.argv.slice(2));
const databaseFile = path.resolve(args.db || "");
const photosDir = path.resolve(args.photos || "");
const ffmpegPath = args.ffmpeg || process.env.FFMPEG_PATH || "ffmpeg";
const outputFile = args.output ? path.resolve(args.output) : "";
if (!databaseFile || !photosDir || !outputFile) throw new Error("--db, --photos and --output are required");

function mediaPathFromSrc(src) {
  const sourceUrl = new URL(src, "http://localhost");
  if (!sourceUrl.pathname.startsWith("/photos/")) return "";
  const candidate = path.resolve(photosDir, decodeURIComponent(sourceUrl.pathname.slice("/photos/".length)));
  const relative = path.relative(photosDir, candidate);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? candidate : "";
}

function addExistingRows(target, seen, rows, category, limit) {
  let added = 0;
  for (const row of rows) {
    if (added >= limit || seen.has(row.id)) continue;
    const filePath = mediaPathFromSrc(row.src || "");
    if (!filePath || !fs.existsSync(filePath)) continue;
    seen.add(row.id);
    target.push({ ...row, filePath, category });
    added += 1;
  }
  return added;
}

function runFfmpeg(input, output, options) {
  const ffmpegArgs = ["-v", "error", "-nostdin", "-y", "-i", input];
  if (options.filter) ffmpegArgs.push("-vf", options.filter);
  if (options.codecArgs) ffmpegArgs.push(...options.codecArgs);
  ffmpegArgs.push("-frames:v", "1", output);
  const result = spawnSync(ffmpegPath, ffmpegArgs, { windowsHide: true, encoding: "utf8", timeout: 30000 });
  if (result.status !== 0) throw new Error(result.stderr || `${options.name} FFmpeg failed`);
}

const variants = [
  { name: "scale_25", ext: "jpg", filter: "scale=trunc(iw*0.25/2)*2:trunc(ih*0.25/2)*2", codecArgs: ["-q:v", "3"] },
  { name: "scale_10", ext: "jpg", filter: "scale=trunc(iw*0.10/2)*2:trunc(ih*0.10/2)*2", codecArgs: ["-q:v", "3"] },
  { name: "jpeg_q90", ext: "jpg", codecArgs: ["-q:v", "2"] },
  { name: "jpeg_q70", ext: "jpg", codecArgs: ["-q:v", "8"] },
  { name: "jpeg_q40", ext: "jpg", codecArgs: ["-q:v", "18"] },
  { name: "to_jpeg", ext: "jpg", codecArgs: ["-q:v", "4"] },
  { name: "to_webp", ext: "webp", codecArgs: ["-quality", "75"] },
  { name: "brightness", ext: "jpg", filter: "eq=brightness=0.05", codecArgs: ["-q:v", "3"] },
  { name: "contrast", ext: "jpg", filter: "eq=contrast=1.08", codecArgs: ["-q:v", "3"] },
  { name: "sharpen", ext: "jpg", filter: "unsharp=5:5:0.5", codecArgs: ["-q:v", "3"] },
  { name: "border", ext: "jpg", filter: "pad=iw+20:ih+20:10:10:black", codecArgs: ["-q:v", "3"] },
  { name: "crop_5", ext: "jpg", filter: "crop=trunc(iw*0.95/2)*2:trunc(ih*0.95/2)*2", codecArgs: ["-q:v", "3"] },
  { name: "crop_20", ext: "jpg", filter: "crop=trunc(iw*0.80/2)*2:trunc(ih*0.80/2)*2", codecArgs: ["-q:v", "3"] },
  { name: "mirror", ext: "jpg", filter: "hflip", codecArgs: ["-q:v", "3"] },
  { name: "rotate_90", ext: "jpg", filter: "transpose=1", codecArgs: ["-q:v", "3"] },
];

async function main() {
  const db = new DatabaseSync(databaseFile, { readOnly: true });
  db.exec("PRAGMA query_only=ON");
  const selected = [];
  const seen = new Set();
  const selectBySuffix = db.prepare("SELECT id,collection_id,src FROM media WHERE type='image' AND lower(src) LIKE ? ORDER BY id LIMIT 500");
  addExistingRows(selected, seen, selectBySuffix.all("%.jpg"), "jpeg", 30);
  addExistingRows(selected, seen, selectBySuffix.all("%.png"), "png", 10);
  addExistingRows(selected, seen, selectBySuffix.all("%.webp"), "webp", 10);
  const watermarkRows = db.prepare("SELECT id,collection_id,src FROM media WHERE type='image' AND (lower(src) LIKE '%xiuren%' OR lower(src) LIKE '%coservip%' OR lower(src) LIKE '%xiao%') ORDER BY id LIMIT 500").all();
  addExistingRows(selected, seen, watermarkRows, "watermark_path_proxy", 10);

  const burstCollections = db.prepare("SELECT collection_id FROM media WHERE type='image' GROUP BY collection_id HAVING COUNT(*)>=20 ORDER BY collection_id LIMIT 100").all();
  const burstPairs = [];
  const selectBurst = db.prepare("SELECT id,collection_id,src FROM media WHERE type='image' AND collection_id=? ORDER BY sort_order,id LIMIT 2");
  for (const collection of burstCollections) {
    if (burstPairs.length >= 20) break;
    const pair = [];
    for (const row of selectBurst.all(collection.collection_id)) {
      const filePath = mediaPathFromSrc(row.src || "");
      if (filePath && fs.existsSync(filePath)) pair.push({ ...row, filePath, category: "burst" });
    }
    if (pair.length === 2) {
      burstPairs.push(pair);
      for (const item of pair) if (!seen.has(item.id)) { seen.add(item.id); selected.push(item); }
    }
  }
  db.close();

  const originalHashes = [];
  const hashStarted = Date.now();
  for (const item of selected) {
    originalHashes.push({ item, hash: await phash64({ ffmpegPath, inputPath: item.filePath, timeoutMs: 30000 }) });
  }
  const originalHashMs = Date.now() - hashStarted;
  const transformSources = originalHashes.filter(({ item }) => ["jpeg", "png", "webp"].includes(item.category)).slice(0, 50);
  const variantResults = [];
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-phash-benchmark-"));
  try {
    for (let sourceIndex = 0; sourceIndex < transformSources.length; sourceIndex += 1) {
      const source = transformSources[sourceIndex];
      for (const variant of variants) {
        const output = path.join(tempRoot, `${sourceIndex}-${variant.name}.${variant.ext}`);
        runFfmpeg(source.item.filePath, output, variant);
        const variantHash = await phash64({ ffmpegPath, inputPath: output, timeoutMs: 30000 });
        const ranked = originalHashes.map((candidate) => ({
          id: candidate.item.id,
          distance: hammingDistance64(variantHash, candidate.hash),
        })).sort((left, right) => left.distance - right.distance || left.id.localeCompare(right.id));
        const targetDistance = hammingDistance64(variantHash, source.hash);
        variantResults.push({
          variant: variant.name,
          sourceCategory: source.item.category,
          targetDistance,
          rank: ranked.findIndex((candidate) => candidate.id === source.item.id) + 1,
          wrongWithin: Object.fromEntries([4, 6, 8, 10, 12].map((threshold) => [threshold, ranked.filter((candidate) => candidate.id !== source.item.id && candidate.distance <= threshold).length])),
        });
        fs.rmSync(output, { force: true });
      }
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }

  const burstDistances = burstPairs.map((pair) => {
    const left = originalHashes.find((entry) => entry.item.id === pair[0].id);
    const right = originalHashes.find((entry) => entry.item.id === pair[1].id);
    return hammingDistance64(left.hash, right.hash);
  });
  const thresholds = {};
  for (const threshold of [4, 6, 8, 10, 12]) {
    thresholds[threshold] = {
      correct: variantResults.filter((result) => result.targetDistance <= threshold).length,
      missed: variantResults.filter((result) => result.targetDistance > threshold).length,
      wrongCandidates: variantResults.reduce((sum, result) => sum + result.wrongWithin[threshold], 0),
      burstPairsWithin: burstDistances.filter((distance) => distance <= threshold).length,
    };
  }
  const report = {
    generatedAt: new Date().toISOString(),
    algorithm: "phash64-v1",
    sample: {
      originals: originalHashes.length,
      transformedSources: transformSources.length,
      variantsPerSource: variants.length,
      variantResults: variantResults.length,
      categories: selected.reduce((counts, item) => ({ ...counts, [item.category]: (counts[item.category] || 0) + 1 }), {}),
      burstPairs: burstPairs.length,
    },
    performance: {
      originalHashTotalMs: originalHashMs,
      originalHashAverageMs: originalHashes.length ? originalHashMs / originalHashes.length : 0,
    },
    thresholds,
    byVariant: Object.fromEntries(variants.map((variant) => {
      const rows = variantResults.filter((result) => result.variant === variant.name);
      return [variant.name, {
        count: rows.length,
        minDistance: Math.min(...rows.map((row) => row.targetDistance)),
        maxDistance: Math.max(...rows.map((row) => row.targetDistance)),
        averageDistance: rows.reduce((sum, row) => sum + row.targetDistance, 0) / Math.max(rows.length, 1),
        hitAt10: rows.filter((row) => row.targetDistance <= 10).length,
        topRank: rows.filter((row) => row.rank === 1).length,
      }];
    })),
    burstDistances,
  };
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
