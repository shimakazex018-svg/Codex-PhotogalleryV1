"use strict";

const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { argumentValue, escapeLike, quoteMatchText, round } = require("./fts5-prototype-lib");

const dbArgument = argumentValue("--db");
const table = argumentValue("--table", "media_search_fts_mapped");
if (!dbArgument || !/^media_search_fts_[a-z_]+$/.test(table)) {
  console.error("Usage: node scripts/check-fts5-query-semantics.js --db <experiment-gallery.db> [--table media_search_fts_mapped]");
  process.exit(2);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const db = new DatabaseSync(path.resolve(dbArgument), { readOnly: true });
const match = db.prepare(`SELECT rowid FROM ${table} WHERE ${table} MATCH ? LIMIT 61`);
const like = db.prepare(`SELECT rowid FROM ${table} WHERE title LIKE ? ESCAPE '\\' OR relative_src LIKE ? ESCAPE '\\' LIMIT 61`);
const terms = ["No.4720", "扫码", "ABC-123", "a_b", "a'b", "a\"b", "(测试)", "[样本]"];
const results = terms.map((query) => {
  const matchExpression = `title : ${quoteMatchText(query)} OR relative_src : ${quoteMatchText(query)}`;
  const likePattern = `%${escapeLike(query)}%`;
  const matchTimes = [];
  const likeTimes = [];
  let matchRows = [];
  let likeRows = [];
  for (let run = 0; run < 5; run += 1) {
    let startedAt = performance.now();
    matchRows = Array.from(query).length >= 3 ? match.all(matchExpression) : [];
    matchTimes.push(performance.now() - startedAt);
    startedAt = performance.now();
    likeRows = like.all(likePattern, likePattern);
    likeTimes.push(performance.now() - startedAt);
  }
  return {
    query,
    codePoints: Array.from(query).length,
    matchCount: matchRows.length,
    ftsLikeCount: likeRows.length,
    matchMedianMs: round(median(matchTimes)),
    ftsLikeMedianMs: round(median(likeTimes)),
  };
});

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  dbFile: path.resolve(dbArgument),
  table,
  plans: {
    match: db.prepare(`EXPLAIN QUERY PLAN SELECT rowid FROM ${table} WHERE ${table} MATCH ? LIMIT 61`).all(`relative_src : ${quoteMatchText("No.4720")}`),
    ftsLikeWithEscape: db.prepare(`EXPLAIN QUERY PLAN SELECT rowid FROM ${table} WHERE relative_src LIKE ? ESCAPE '\\' LIMIT 61`).all("%No.4720%"),
    ftsLikeWithoutEscape: db.prepare(`EXPLAIN QUERY PLAN SELECT rowid FROM ${table} WHERE relative_src LIKE ? LIMIT 61`).all("%No.4720%"),
  },
  results,
}, null, 2));
db.close();
