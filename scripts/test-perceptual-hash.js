"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { DatabaseSync } = require("node:sqlite");
const {
  PHASH_ALGORITHM,
  PHASH_ALGORITHM_VERSION,
  hammingDistance64,
  phash64,
  similarityPercent,
} = require("../perceptual-hash");
const { WARNING_BYTES, HARD_LIMIT_BYTES, diskLimitStatus } = require("../perceptual-limits");

const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";
const tempBase = process.env.TEST_TEMP_ROOT ? path.resolve(process.env.TEST_TEMP_ROOT) : os.tmpdir();
fs.mkdirSync(tempBase, { recursive: true });
const tempRoot = process.env.PHASH_TEST_DIR || fs.mkdtempSync(path.join(tempBase, "gallery-phash-test-"));

function runFfmpeg(args) {
  const result = spawnSync(ffmpegPath, ["-v", "error", "-y", ...args], { windowsHide: true, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `FFmpeg exited with ${result.status}`);
}

async function run() {
  const source = path.join(tempRoot, "source.png");
  const thumbnail = path.join(tempRoot, "thumbnail.jpg");
  const recompressed = path.join(tempRoot, "recompressed.webp");
  const different = path.join(tempRoot, "different.png");
  runFfmpeg(["-f", "lavfi", "-i", "testsrc2=size=640x480:rate=1", "-frames:v", "1", source]);
  runFfmpeg(["-i", source, "-vf", "scale=64:48", "-q:v", "4", thumbnail]);
  runFfmpeg(["-i", source, "-quality", "55", recompressed]);
  runFfmpeg(["-f", "lavfi", "-i", "smptebars=size=640x480:rate=1", "-frames:v", "1", different]);

  const sourceHash = await phash64({ ffmpegPath, inputPath: source });
  assert.strictEqual(sourceHash.length, 8);
  assert.deepStrictEqual(await phash64({ ffmpegPath, inputPath: source }), sourceHash);
  const bufferedHash = await phash64({ ffmpegPath, inputBuffer: fs.readFileSync(source) });
  assert.deepStrictEqual(bufferedHash, sourceHash);
  const thumbnailDistance = hammingDistance64(sourceHash, await phash64({ ffmpegPath, inputPath: thumbnail }));
  const recompressedDistance = hammingDistance64(sourceHash, await phash64({ ffmpegPath, inputPath: recompressed }));
  const differentDistance = hammingDistance64(sourceHash, await phash64({ ffmpegPath, inputPath: different }));
  assert.ok(thumbnailDistance <= 10, `thumbnail distance ${thumbnailDistance}`);
  assert.ok(recompressedDistance <= 10, `recompressed distance ${recompressedDistance}`);
  assert.ok(differentDistance > 10, `different distance ${differentDistance}`);

  assert.strictEqual(hammingDistance64(Buffer.alloc(8), Buffer.alloc(8)), 0);
  assert.strictEqual(hammingDistance64(Buffer.alloc(8), Buffer.alloc(8, 0xff)), 64);
  assert.strictEqual(hammingDistance64(Buffer.from("8000000000000000", "hex"), Buffer.alloc(8)), 1);
  assert.strictEqual(similarityPercent(0), 100);
  assert.strictEqual(similarityPercent(4), 93.8);
  assert.strictEqual(similarityPercent(10), 84.4);
  assert.strictEqual(diskLimitStatus(WARNING_BYTES - 1), "ok");
  assert.strictEqual(diskLimitStatus(WARNING_BYTES), "pause");
  assert.strictEqual(diskLimitStatus(HARD_LIMIT_BYTES - 1), "pause");
  assert.strictEqual(diskLimitStatus(HARD_LIMIT_BYTES), "hard_stop");
  assert.strictEqual(PHASH_ALGORITHM, "phash64");
  assert.strictEqual(PHASH_ALGORITHM_VERSION, 1);

  const databaseFile = path.join(tempRoot, "hash.db");
  const db = new DatabaseSync(databaseFile);
  db.exec("CREATE TABLE hashes (id TEXT PRIMARY KEY, value BLOB NOT NULL CHECK(length(value)=8)) WITHOUT ROWID");
  db.prepare("INSERT INTO hashes(id,value) VALUES (?,?)").run("sign-bit", sourceHash);
  const storedHash = db.prepare("SELECT value FROM hashes WHERE id=?").get("sign-bit").value;
  assert.ok(storedHash instanceof Uint8Array);
  assert.deepStrictEqual(Buffer.from(storedHash), sourceHash);
  db.close();

  process.stdout.write(`${JSON.stringify({
    ok: true,
    algorithm: `${PHASH_ALGORITHM}-v${PHASH_ALGORITHM_VERSION}`,
    bytes: sourceHash.length,
    thumbnailDistance,
    recompressedDistance,
    differentDistance,
    blobRoundTrip: true,
  })}\n`);
}

if (process.env.PHASH_TEST_CHILD === "1") {
  run().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
} else {
  const result = spawnSync(process.execPath, [__filename], {
    env: { ...process.env, PHASH_TEST_CHILD: "1", PHASH_TEST_DIR: tempRoot },
    windowsHide: true,
    encoding: "utf8",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  if (result.status !== 0) process.exitCode = result.status || 1;
}
