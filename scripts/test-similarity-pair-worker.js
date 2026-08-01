"use strict";
const assert = require("assert"); const path = require("path"); const { fork } = require("child_process");
const rows = [0, 6, 7, 10, 11].map((distance, index) => { const hash = Buffer.alloc(8); for (let bit = 0; bit < distance; bit += 1) hash[Math.floor(bit / 8)] |= 1 << (bit % 8); return { media_id: `m${index}`, hash64: hash }; });
const child = fork(path.join(__dirname, "..", "similarity-pair-worker.js"), [], { stdio: ["ignore", "ignore", "ignore", "ipc"], windowsHide: true });
const hits = [];
child.on("message", (message) => { if (message.type === "ready") child.send({ type: "start", rows, blockSize: 64 }); if (message.type === "block") hits.push(...message.hits); if (message.type === "finished") { try { assert.ok(hits.every((pair) => pair.left < pair.right && pair.distance <= 10)); assert.ok(hits.some((pair) => pair.distance === 10)); assert.ok(!hits.some((pair) => pair.distance === 11)); console.log("similarity pair worker: ok"); } finally { child.disconnect(); } } });
