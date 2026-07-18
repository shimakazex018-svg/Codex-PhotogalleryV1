"use strict";

const { spawn } = require("child_process");

const PHASH_SIZE = 32;
const PHASH_LOW_FREQUENCY_SIZE = 8;
const PHASH_BYTES = 8;
const PHASH_ALGORITHM = "phash64";
const PHASH_ALGORITHM_VERSION = 1;
const DEFAULT_DECODE_TIMEOUT_MS = 15000;

const cosineTable = Array.from({ length: PHASH_LOW_FREQUENCY_SIZE }, (_, frequency) =>
  Float64Array.from({ length: PHASH_SIZE }, (_, position) =>
    Math.cos(((2 * position + 1) * frequency * Math.PI) / (2 * PHASH_SIZE))
  )
);

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function phash64FromGrayPixels(pixels) {
  if (!Buffer.isBuffer(pixels) || pixels.length !== PHASH_SIZE * PHASH_SIZE) {
    throw new TypeError(`pHash input must be exactly ${PHASH_SIZE * PHASH_SIZE} grayscale bytes`);
  }
  const coefficients = new Float64Array(PHASH_LOW_FREQUENCY_SIZE * PHASH_LOW_FREQUENCY_SIZE);
  let coefficientIndex = 0;
  for (let verticalFrequency = 0; verticalFrequency < PHASH_LOW_FREQUENCY_SIZE; verticalFrequency += 1) {
    const verticalCosines = cosineTable[verticalFrequency];
    for (let horizontalFrequency = 0; horizontalFrequency < PHASH_LOW_FREQUENCY_SIZE; horizontalFrequency += 1) {
      const horizontalCosines = cosineTable[horizontalFrequency];
      let sum = 0;
      for (let y = 0; y < PHASH_SIZE; y += 1) {
        const verticalWeight = verticalCosines[y];
        const rowOffset = y * PHASH_SIZE;
        for (let x = 0; x < PHASH_SIZE; x += 1) {
          sum += pixels[rowOffset + x] * horizontalCosines[x] * verticalWeight;
        }
      }
      coefficients[coefficientIndex] = sum;
      coefficientIndex += 1;
    }
  }

  const threshold = median(coefficients.subarray(1));
  const hash = Buffer.alloc(PHASH_BYTES);
  for (let bit = 0; bit < coefficients.length; bit += 1) {
    if (coefficients[bit] > threshold) hash[Math.floor(bit / 8)] |= 1 << (7 - (bit % 8));
  }
  return hash;
}

function hammingDistance64(left, right) {
  if (!Buffer.isBuffer(left) || !Buffer.isBuffer(right) || left.length !== PHASH_BYTES || right.length !== PHASH_BYTES) {
    throw new TypeError("Hamming distance requires two 8-byte buffers");
  }
  let distance = 0;
  for (let index = 0; index < PHASH_BYTES; index += 1) {
    let value = left[index] ^ right[index];
    while (value) {
      value &= value - 1;
      distance += 1;
    }
  }
  return distance;
}

function similarityPercent(distance) {
  const normalizedDistance = Math.min(Math.max(Number(distance) || 0, 0), 64);
  return Math.round((1 - normalizedDistance / 64) * 1000) / 10;
}

function decodeFirstFrameToGray(options = {}) {
  const ffmpegPath = options.ffmpegPath || process.env.FFMPEG_PATH || "ffmpeg";
  const inputPath = options.inputPath || "";
  const inputBuffer = options.inputBuffer;
  if (!inputPath && !Buffer.isBuffer(inputBuffer)) return Promise.reject(new TypeError("inputPath or inputBuffer is required"));
  const timeoutMs = Math.min(Math.max(Number(options.timeoutMs || DEFAULT_DECODE_TIMEOUT_MS), 1000), 60000);
  const inputArgs = inputPath ? ["-i", inputPath] : ["-i", "pipe:0"];
  const args = [
    "-v", "error", "-nostdin", ...inputArgs,
    "-frames:v", "1",
    "-vf", `scale=${PHASH_SIZE}:${PHASH_SIZE}:flags=lanczos,format=gray`,
    "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1",
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true, stdio: [inputPath ? "ignore" : "pipe", "pipe", "pipe"] });
    const stdoutChunks = [];
    let stdoutBytes = 0;
    let stderr = "";
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill();
      const error = new Error("Image decode timed out");
      error.code = "DECODE_TIMEOUT";
      finish(error);
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= PHASH_SIZE * PHASH_SIZE) stdoutChunks.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 8192) stderr += chunk.toString("utf8", 0, Math.min(chunk.length, 8192 - stderr.length));
    });
    child.once("error", (error) => finish(error));
    child.once("exit", (code) => {
      if (settled) return;
      const pixels = Buffer.concat(stdoutChunks);
      if (code !== 0 || pixels.length !== PHASH_SIZE * PHASH_SIZE) {
        const error = new Error(stderr.trim() || `FFmpeg returned ${pixels.length} grayscale bytes with exit code ${code}`);
        error.code = code === 0 ? "INVALID_DECODE_OUTPUT" : "DECODE_FAILED";
        finish(error);
        return;
      }
      finish(null, pixels);
    });
    if (!inputPath) {
      child.stdin.once("error", () => {});
      child.stdin.end(inputBuffer);
    }
  });
}

async function phash64(options = {}) {
  return phash64FromGrayPixels(await decodeFirstFrameToGray(options));
}

module.exports = {
  DEFAULT_DECODE_TIMEOUT_MS,
  PHASH_ALGORITHM,
  PHASH_ALGORITHM_VERSION,
  PHASH_BYTES,
  PHASH_SIZE,
  decodeFirstFrameToGray,
  hammingDistance64,
  phash64,
  phash64FromGrayPixels,
  similarityPercent,
};
