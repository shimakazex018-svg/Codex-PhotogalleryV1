const imageExtensions = new Set([".jpg", ".jpeg", ".jpe", ".jfif", ".png", ".webp", ".gif", ".bmp", ".dib", ".tif", ".tiff", ".heic", ".heif", ".avif", ".jxl", ".ico", ".svg", ".psd", ".dng", ".cr2", ".cr3", ".nef", ".arw", ".orf", ".rw2", ".raf", ".pef", ".srw", ".x3f", ".erf", ".kdc", ".mef", ".mos", ".mrw", ".nrw", ".rwl", ".sr2", ".srf"]);
const videoExtensions = new Set([".mp4", ".m4v", ".mov", ".qt", ".avi", ".mkv", ".wmv", ".asf", ".flv", ".webm", ".mpeg", ".mpg", ".mpe", ".mpv", ".m2v", ".ts", ".m2ts", ".mts", ".vob", ".3gp", ".3g2", ".ogv", ".rm", ".rmvb", ".divx", ".mxf"]);

function isMediaExtension(extension) {
  const value = String(extension || "").toLowerCase();
  return imageExtensions.has(value) || videoExtensions.has(value);
}

module.exports = { imageExtensions, videoExtensions, isMediaExtension };
