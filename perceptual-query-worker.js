"use strict";

const { DatabaseSync } = require("node:sqlite");
const { hammingDistance64 } = require("./perceptual-hash");

const databaseFile = process.argv[2];
const queryHash = Buffer.from(process.argv[3] || "", "hex");
const maxDistance = Math.min(Math.max(Number(process.argv[4]) || 10, 0), 14);
if (!databaseFile || queryHash.length !== 8) throw new Error("database and 8-byte hash are required");

const db = new DatabaseSync(databaseFile, { readOnly: true });
db.exec("PRAGMA query_only=ON");
const best = [];
let candidates = 0;
for (const row of db.prepare("SELECT media_id, hash64 FROM media_perceptual_hashes WHERE status = 1 AND length(hash64) = 8").iterate()) {
  candidates += 1;
  const distance = hammingDistance64(queryHash, Buffer.from(row.hash64));
  if (distance > maxDistance) continue;
  best.push({ mediaId: row.media_id, hammingDistance: distance });
  best.sort((left, right) => left.hammingDistance - right.hammingDistance || left.mediaId.localeCompare(right.mediaId));
  if (best.length > 50) best.pop();
}
db.close();
process.stdout.write(JSON.stringify({ candidates, matches: best }));
