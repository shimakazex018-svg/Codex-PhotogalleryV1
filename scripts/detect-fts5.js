"use strict";

const { DatabaseSync } = require("node:sqlite");
const { quoteMatchText } = require("./fts5-prototype-lib");

function attempt(label, action) {
  try {
    return { label, supported: true, result: action() };
  } catch (error) {
    return { label, supported: false, error: String(error && error.message ? error.message : error) };
  }
}

const db = new DatabaseSync(":memory:");
const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  sqlite: db.prepare("SELECT sqlite_version() AS version").get().version,
  compileOptions: db.prepare("PRAGMA compile_options").all().map((row) => Object.values(row)[0]),
  tests: [],
};

report.tests.push(attempt("ordinary FTS5 table", () => {
  db.exec("CREATE VIRTUAL TABLE ordinary_fts USING fts5(value)");
  db.prepare("INSERT INTO ordinary_fts(value) VALUES (?)").run("ordinary search value");
  return db.prepare("SELECT rowid FROM ordinary_fts WHERE ordinary_fts MATCH ?").all("ordinary");
}));

report.tests.push(attempt("trigram table and Unicode Chinese", () => {
  db.exec("CREATE VIRTUAL TABLE trigram_fts USING fts5(value, tokenize='trigram')");
  const insert = db.prepare("INSERT INTO trigram_fts(rowid, value) VALUES (?, ?)");
  [
    [1, "安然模特 ABC-123 (测试) [样本]"],
    [2, "路径/photos/模特/作品_0001.JPG"],
    [3, "ＡＢＣ 全角１２３ double\"quote single'quote"],
  ].forEach((row) => insert.run(...row));
  return {
    chineseThreeMatch: db.prepare("SELECT rowid FROM trigram_fts WHERE trigram_fts MATCH ?").all(quoteMatchText("安然模")),
    chineseTwoMatch: db.prepare("SELECT rowid FROM trigram_fts WHERE trigram_fts MATCH ?").all(quoteMatchText("安然")),
    chineseLike: db.prepare("SELECT rowid FROM trigram_fts WHERE value LIKE ?").all("%安然模%"),
  };
}));

report.tests.push(attempt("trigram LIKE planner", () => ({
  like: db.prepare("EXPLAIN QUERY PLAN SELECT rowid FROM trigram_fts WHERE value LIKE ?").all("%ABC%"),
  match: db.prepare("EXPLAIN QUERY PLAN SELECT rowid FROM trigram_fts WHERE trigram_fts MATCH ?").all(quoteMatchText("ABC")),
})));

const values = ["ABC", "abc", "123", "ABC-123", "(测试)", "[样本]", "single'quote", "double\"quote", "作品_0001", "/photos/", "ＡＢＣ"];
report.tests.push(attempt("quoted MATCH text cases", () => values.map((value) => ({
  value,
  match: db.prepare("SELECT rowid FROM trigram_fts WHERE trigram_fts MATCH ?").all(quoteMatchText(value)).map((row) => row.rowid),
  like: db.prepare("SELECT rowid FROM trigram_fts WHERE value LIKE ?").all(`%${value}%`).map((row) => row.rowid),
}))));

report.tests.push(attempt("FTS5 integrity-check", () => db.prepare("INSERT INTO trigram_fts(trigram_fts) VALUES ('integrity-check')").run().changes));
report.tests.push(attempt("FTS5 optimize", () => db.prepare("INSERT INTO trigram_fts(trigram_fts) VALUES ('optimize')").run().changes));
report.tests.push(attempt("FTS5 rebuild", () => db.prepare("INSERT INTO trigram_fts(trigram_fts) VALUES ('rebuild')").run().changes));

db.close();
report.fts5CompileOption = report.compileOptions.includes("ENABLE_FTS5");
report.allRequiredCapabilities = report.tests.every((test) => test.supported);
console.log(JSON.stringify(report, null, 2));
if (!report.allRequiredCapabilities) process.exitCode = 1;
