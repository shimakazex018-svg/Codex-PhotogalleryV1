const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const galleryDb = require("../gallery-db");
const { dailyDue, nextDailyTime } = require("../maintenance-schedule");

const at = (hour, minute) => new Date(2026, 6, 22, hour, minute, 0, 0);
assert.equal(dailyDue(at(3, 59), 4, 0, null), false);
assert.equal(dailyDue(at(4, 0), 4, 0, null), true);
assert.equal(dailyDue(at(4, 30), 4, 0, null), true);
assert.equal(dailyDue(at(4, 30), 4, 0, { status: "skipped-busy" }), true);
assert.equal(dailyDue(at(4, 30), 4, 0, { status: "completed" }), false);
assert.equal(nextDailyTime(at(3, 59), 4, 0).getDate(), 22);
assert.equal(nextDailyTime(at(4, 0), 4, 0).getDate(), 23);

const root = fs.mkdtempSync(path.join(os.tmpdir(), "Codex-PhotogalleryV1-DailyIndex-"));
const dbFile = path.join(root, "gallery.db");
try {
  const first = galleryDb.upsertMaintenanceState(dbFile, { taskKey: "daily-index-scan", scheduledDate: "2026-07-22", startedAt: "2026-07-22T04:00:00.000Z", status: "running" });
  assert.equal(first.status, "running");
  const completed = galleryDb.upsertMaintenanceState(dbFile, { taskKey: "daily-index-scan", scheduledDate: "2026-07-22", startedAt: first.started_at, finishedAt: "2026-07-22T04:01:00.000Z", status: "completed", result: { changed: false } });
  assert.equal(completed.status, "completed");
  assert.equal(galleryDb.getMaintenanceState(dbFile, "daily-index-scan", "2026-07-22").started_at, first.started_at);
  console.log("DAILY_INDEX_SCHEDULER_TEST=PASS");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
  console.log(`TEMP_ROOT_EXISTS=${fs.existsSync(root)}`);
}
