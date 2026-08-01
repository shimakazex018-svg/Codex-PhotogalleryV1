"use strict";
const { hammingDistance64 } = require("./perceptual-hash");
let paused = false; let stopping = false;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
process.on("message", async (message) => {
  if (message?.type === "pause") paused = true;
  if (message?.type === "resume") paused = false;
  if (message?.type === "stop") stopping = true;
  if (message?.type !== "start") return;
  const rows = (message.rows || []).map((row) => ({ id: row.media_id, hash: Buffer.from(row.hash64) }));
  const size = Math.min(Math.max(Number(message.blockSize) || 512, 64), 2048); let compared = Number(message.compared || 0); let matched = Number(message.matched || 0);
  const checkpoint = Array.isArray(message.checkpoint) ? message.checkpoint : [0, 0];
  for (let a = Math.max(0, Number(checkpoint[0]) || 0) * size; a < rows.length && !stopping; a += size) for (let b = a === (Number(checkpoint[0]) || 0) * size ? Math.max(a, (Number(checkpoint[1]) || 0) * size) : a; b < rows.length && !stopping; b += size) {
    while (paused && !stopping) { process.send?.({ type: "heartbeat", phase: "paused", compared }); await wait(250); }
    const hits = []; const aEnd = Math.min(rows.length, a + size); const bEnd = Math.min(rows.length, b + size);
    for (let i = a; i < aEnd; i += 1) for (let j = b === a ? i + 1 : b; j < bEnd; j += 1) {
      const distance = hammingDistance64(rows[i].hash, rows[j].hash); compared += 1;
      if (distance <= 10) { hits.push({ left: rows[i].id < rows[j].id ? rows[i].id : rows[j].id, right: rows[i].id < rows[j].id ? rows[j].id : rows[i].id, distance }); matched += 1; }
    }
    process.send?.({ type: "block", hits, compared, matched, currentBlock: [a / size, b / size], nextCheckpoint: b + size < rows.length ? [a / size, b / size + 1] : [a / size + 1, a / size + 1] });
  }
  process.send?.({ type: stopping ? "stopped" : "finished", compared, matched });
});
setImmediate(() => process.send?.({ type: "ready" }));
