function dailyDue(now, hour, minute, state) {
  const due = new Date(now);
  due.setHours(hour, minute, 0, 0);
  return now >= due && (!state || state.status !== "completed");
}

function nextDailyTime(now, hour, minute) {
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
}

module.exports = { dailyDue, nextDailyTime };
