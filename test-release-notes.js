const fs = require("fs");
const path = require("path");

const root = __dirname;
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
const notes = JSON.parse(fs.readFileSync(path.join(root, "release-notes.json"), "utf8"));
const currentVersion = appSource.match(/const APP_VERSION = "([^"]+)";/)?.[1];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(Array.isArray(notes) && notes.length >= 2, "release notes must include current and historical versions");
assert(notes[0].version === currentVersion, "latest release note must match APP_VERSION");
assert(indexSource.includes(`styles.css?v=${currentVersion}`), "styles cache version must match APP_VERSION");
assert(indexSource.includes(`gallery-sort.js?v=${currentVersion}`), "gallery-sort cache version must match APP_VERSION");
assert(indexSource.includes(`app.js?v=${currentVersion}`), "app cache version must match APP_VERSION");
assert(appSource.includes("版本更新记录暂时无法加载，请稍后重试。"), "friendly load failure message is required");
assert(appSource.includes('role="alert"'), "release notes failure message must be announced");
assert(appSource.includes('if (section !== "release-notes")'), "release notes page must not write access logs or SQLite");

let previousDate = "9999-12-31";
let previousTime = Number.POSITIVE_INFINITY;
for (const note of notes) {
  assert(typeof note.version === "string" && note.version, "version is required");
  assert(typeof note.releasedAt === "string" && note.releasedAt, `${note.version}: releasedAt is required`);
  assert(Array.isArray(note.items) && note.items.length >= 1 && note.items.length <= 3, `${note.version}: expected 1-3 items`);
  assert(note.items.every((item) => typeof item === "string" && item.length <= 30), `${note.version}: item exceeds 30 characters`);
  const releasedTime = Date.parse(note.releasedAt);
  assert(Number.isFinite(releasedTime), `${note.version}: invalid releasedAt`);
  const releasedDate = note.releasedAt.slice(0, 10);
  assert(releasedDate <= previousDate, "release notes must be newest first");
  if (releasedDate === previousDate && note.timePrecision !== "date" && previousTime !== Number.POSITIVE_INFINITY) {
    assert(releasedTime <= previousTime, "same-day minute releases must be newest first");
  }
  previousDate = releasedDate;
  previousTime = releasedTime;
}

const publicCopy = JSON.stringify(notes);
assert(!/[A-Z]:\\/i.test(publicCopy), "release notes must not expose Windows paths");
assert(!/\b(?:git|commit|branch|pid|sqlite|database)\b/i.test(publicCopy), "release notes must not expose internal details");

console.log(`release notes validation passed: ${notes.length} versions, current ${currentVersion}`);
