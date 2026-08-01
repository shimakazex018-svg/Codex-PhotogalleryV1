"use strict";
const { spawn } = require("child_process");
const crypto = require("crypto");
const MAX_PIXEL_BYTES = 64 * 1024 * 1024;

function pixelHash({ inputPath, ffmpegPath = "ffmpeg" }) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ["-v", "error", "-nostdin", "-noautorotate", "-i", inputPath, "-frames:v", "1", "-vf", "format=rgb24", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const hash = crypto.createHash("sha256"); let bytes = 0; let stderr = ""; let aborted = false;
    child.stdout.on("data", (chunk) => { bytes += chunk.length; if (bytes > MAX_PIXEL_BYTES) { aborted = true; child.kill(); return; } hash.update(chunk); });
    child.stderr.on("data", (chunk) => { if (stderr.length < 1024) stderr += chunk.toString(); });
    child.once("error", reject);
    child.once("exit", (code) => { if (aborted) { const error = new Error("Decoded pixels exceed review limit"); error.code = "PIXEL_LIMIT"; reject(error); } else if (code || !bytes) reject(new Error(stderr.trim() || "Pixel decode failed")); else resolve({ hash: hash.digest("hex"), bytes, channels: 3 }); });
  });
}
module.exports = { MAX_PIXEL_BYTES, pixelHash };
