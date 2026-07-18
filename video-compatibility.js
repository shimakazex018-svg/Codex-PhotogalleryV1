const path = require("path");

const SCANNER_VERSION = "1.0.0";
const RULES_VERSION = "video-compat-v1";
const REPORT_VERSION = 1;
const STATUSES = new Set(["direct_safe", "device_dependent", "fallback_required", "invalid"]);

function isInsideDir(parentDir, childPath) {
  const relative = path.relative(parentDir, childPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveMediaPath(photosDir, src) {
  try {
    const source = String(src || "").trim();
    if (!source || source.startsWith("\\\\") || /^[a-zA-Z]:/.test(source)) return null;
    const sourceUrl = new URL(source, "http://localhost");
    const decodedPath = decodeURIComponent(sourceUrl.pathname);
    if (!decodedPath.startsWith("/photos/") || decodedPath.includes("\0")) return null;
    const relativePath = decodedPath.slice("/photos/".length).replaceAll("/", path.sep);
    if (!relativePath || path.isAbsolute(relativePath)) return null;
    const filePath = path.normalize(path.join(photosDir, relativePath));
    if (!isInsideDir(photosDir, filePath)) return null;
    return {
      filePath,
      relativePath: path.relative(photosDir, filePath).split(path.sep).join("/"),
    };
  } catch (error) {
    return null;
  }
}

function firstStream(streams, type) {
  return (Array.isArray(streams) ? streams : []).find((stream) => stream.codec_type === type) || null;
}

function streamCount(streams, type) {
  return (Array.isArray(streams) ? streams : []).filter((stream) => stream.codec_type === type).length;
}

function normalizedCodec(value) {
  return String(value || "").trim().toLowerCase();
}

function formatNames(format) {
  return new Set(String(format?.format_name || "").toLowerCase().split(",").map((item) => item.trim()).filter(Boolean));
}

function result(status, reasonCode, reason) {
  return { status, reason_code: reasonCode, reason };
}

function classifyProbe(probe) {
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const video = firstStream(streams, "video");
  const audio = firstStream(streams, "audio");
  const duration = Number(probe?.format?.duration || 0);
  if (!video) return result("invalid", "no_video_stream", "No video stream was reported by FFprobe");
  if (!Number.isFinite(duration) || duration <= 0) return result("invalid", "invalid_duration", "Video duration is missing or invalid");

  const containers = formatNames(probe.format);
  const videoCodec = normalizedCodec(video.codec_name);
  const videoTag = normalizedCodec(video.codec_tag_string);
  const audioCodec = normalizedCodec(audio?.codec_name);
  const pixelFormat = normalizedCodec(video.pix_fmt);
  const profile = normalizedCodec(video.profile);
  const browserMp4 = ["mov", "mp4", "m4a", "3gp", "3g2", "mj2"].some((name) => containers.has(name));
  const webm = containers.has("webm");
  const audioDirect = !audio || ["aac", "mp3"].includes(audioCodec);

  if (videoCodec === "mpeg4" && (videoTag === "mp4v" || browserMp4)) {
    return result("fallback_required", "mpeg4_part2_mp4v", "MPEG-4 Part 2/mp4v is not reliably decoded by Chrome");
  }
  if (["mpeg2video", "h263", "vc1", "wmv1", "wmv2", "wmv3", "prores"].includes(videoCodec)) {
    return result("fallback_required", "unsupported_video_codec", `${videoCodec || "Unknown video codec"} requires browser-compatible transcoding`);
  }
  if (videoCodec === "mjpeg") {
    return result("fallback_required", "mjpeg_fallback", "MJPEG video is not treated as cross-device browser-safe");
  }
  if (audio && (["dts", "dca", "wma", "wmav1", "wmav2"].includes(audioCodec) || audioCodec.startsWith("pcm_"))) {
    return result("fallback_required", "unsupported_audio_codec", `${audioCodec || "Unknown audio codec"} is not browser-safe`);
  }

  if (["hevc", "h265"].includes(videoCodec) || ["hvc1", "hev1"].includes(videoTag)) {
    return result("device_dependent", "hevc_device_dependent", "HEVC support depends on the browser, operating system, and hardware decoder");
  }
  if (videoCodec === "vp9") return result("device_dependent", "vp9_device_dependent", "VP9 support is device-dependent");
  if (videoCodec === "av1") return result("device_dependent", "av1_device_dependent", "AV1 support is device-dependent");
  if (audioCodec === "opus") return result("device_dependent", "opus_device_dependent", "Opus support depends on the selected container and device");
  if (/10|12|14|16/.test(pixelFormat) || pixelFormat.includes("p10") || pixelFormat.includes("p12")) {
    return result("device_dependent", "high_bit_depth", "High-bit-depth video is not cross-device browser-safe");
  }
  if (pixelFormat && pixelFormat !== "yuv420p") {
    return result("device_dependent", "non_yuv420p", `${pixelFormat} is not the conservative cross-device pixel format`);
  }
  if (videoCodec === "h264" && profile && !["baseline", "constrained baseline", "main", "high"].includes(profile)) {
    return result("device_dependent", "uncommon_h264_profile", `${video.profile} H.264 profile is not conservatively classified as cross-device safe`);
  }

  if (browserMp4 && videoCodec === "h264" && ["avc1", "avc3", ""].includes(videoTag) && pixelFormat === "yuv420p" && audioDirect) {
    return result("direct_safe", "h264_aac_mp4", "H.264/yuv420p in an MP4-family container with browser-safe audio");
  }
  if (!browserMp4 && !webm) {
    return result("fallback_required", "unsupported_container", `${probe.format?.format_name || "Unknown container"} is not treated as browser-safe`);
  }
  return result("device_dependent", "unknown_combination", "Codec and container combination requires device-specific validation");
}

function summarizeProbe(probe) {
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const video = firstStream(streams, "video") || {};
  const audio = firstStream(streams, "audio") || {};
  const format = probe?.format || {};
  return {
    container: format.format_name || "",
    container_long_name: format.format_long_name || "",
    duration: Number(format.duration || 0),
    bit_rate: Number(format.bit_rate || 0),
    video_codec: video.codec_name || "",
    video_codec_long_name: video.codec_long_name || "",
    video_tag: video.codec_tag_string || "",
    video_profile: video.profile || "",
    video_level: video.level ?? null,
    pixel_format: video.pix_fmt || "",
    width: Number(video.width || 0),
    height: Number(video.height || 0),
    r_frame_rate: video.r_frame_rate || "",
    avg_frame_rate: video.avg_frame_rate || "",
    video_bit_rate: Number(video.bit_rate || 0),
    video_stream_count: streamCount(streams, "video"),
    audio_codec: audio.codec_name || "",
    audio_tag: audio.codec_tag_string || "",
    audio_profile: audio.profile || "",
    sample_rate: Number(audio.sample_rate || 0),
    channels: Number(audio.channels || 0),
    audio_stream_count: streamCount(streams, "audio"),
  };
}

function fingerprint(relativePath, fileSize, mtimeMs) {
  return `${RULES_VERSION}|${relativePath}|${Number(fileSize || 0)}|${Math.round(Number(mtimeMs || 0))}`;
}

function safeError(value, maximum = 1000) {
  return String(value || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function emptyCounts() {
  return { direct_safe: 0, device_dependent: 0, fallback_required: 0, invalid: 0 };
}

function reportSummary(items) {
  const counts = emptyCounts();
  const distributions = { video_codec: {}, container: {}, audio_codec: {}, pixel_format: {} };
  let existingFiles = 0;
  let probeTimeouts = 0;
  let probeFailures = 0;
  let sampleDecodeFailures = 0;
  for (const item of items || []) {
    if (STATUSES.has(item.compatibility_status)) counts[item.compatibility_status] += 1;
    if (item.file_exists) existingFiles += 1;
    if (item.reason_code === "probe_timeout") probeTimeouts += 1;
    if (item.probe_status === "failed") probeFailures += 1;
    if (item.sample_decode_status === "failed") sampleDecodeFailures += 1;
    for (const key of Object.keys(distributions)) {
      const value = String(item[key] || "none");
      distributions[key][value] = (distributions[key][value] || 0) + 1;
    }
  }
  return { total: (items || []).length, existingFiles, counts, probeTimeouts, probeFailures, sampleDecodeFailures, distributions };
}

module.exports = {
  REPORT_VERSION,
  RULES_VERSION,
  SCANNER_VERSION,
  STATUSES,
  classifyProbe,
  fingerprint,
  reportSummary,
  resolveMediaPath,
  safeError,
  summarizeProbe,
};
