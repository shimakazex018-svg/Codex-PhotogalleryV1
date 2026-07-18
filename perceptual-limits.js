"use strict";

const TARGET_BYTES = 150 * 1024 * 1024;
const PREDICTION_LIMIT_BYTES = 400 * 1024 * 1024;
const WARNING_BYTES = 480 * 1024 * 1024;
const HARD_LIMIT_BYTES = 512 * 1024 * 1024;

function diskLimitStatus(bytesAdded) {
  const bytes = Math.max(0, Number(bytesAdded) || 0);
  if (bytes >= HARD_LIMIT_BYTES) return "hard_stop";
  if (bytes >= WARNING_BYTES) return "pause";
  return "ok";
}

module.exports = { TARGET_BYTES, PREDICTION_LIMIT_BYTES, WARNING_BYTES, HARD_LIMIT_BYTES, diskLimitStatus };
