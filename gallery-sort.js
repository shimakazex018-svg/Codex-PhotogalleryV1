(function attachGallerySort(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GallerySort = api;
})(typeof globalThis === "object" ? globalThis : this, () => {
  "use strict";

  const SORT_OPTIONS = Object.freeze([
    { mode: "name_asc", label: "名称正序" },
    { mode: "name_desc", label: "名称倒序" },
    { mode: "image_count_asc", label: "图片数少→多" },
    { mode: "image_count_desc", label: "图片数多→少" },
    { mode: "video_count_asc", label: "视频数少→多" },
    { mode: "video_count_desc", label: "视频数多→少" },
    { mode: "updated_asc", label: "更新时间旧→新" },
    { mode: "updated_desc", label: "更新时间新→旧" },
  ]);
  const SORT_MODES = new Set(SORT_OPTIONS.map((item) => item.mode));
  const LEGACY_SORT_MODES = Object.freeze({
    name: "name_asc",
    works: "image_count_desc",
    images: "image_count_desc",
    imageCount: "image_count_desc",
    videos: "video_count_desc",
    videoCount: "video_count_desc",
    mtime: "updated_desc",
    recent: "updated_desc",
  });
  const collator = typeof Intl === "object" && Intl.Collator
    ? new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" })
    : null;

  function normalizeSortMode(value, fallback = "name_asc") {
    const raw = String(value || "");
    if (SORT_MODES.has(raw)) return raw;
    if (LEGACY_SORT_MODES[raw]) return LEGACY_SORT_MODES[raw];
    return SORT_MODES.has(fallback) ? fallback : "name_asc";
  }

  function textValue(item) {
    return String(item?.title ?? item?.name ?? item?.folder ?? "").trim();
  }

  function pathValue(item) {
    if (Array.isArray(item?.pathParts)) return item.pathParts.join("/");
    return String(item?.id ?? item?.collectionPath ?? item?.path ?? item?.hash ?? "");
  }

  function imageCountValue(item) {
    return item?.totalImageCount ?? item?.imageCount ?? item?.imagesCount;
  }

  function videoCountValue(item) {
    return item?.totalVideoCount ?? item?.videoCount ?? item?.videosCount;
  }

  function updatedValue(item) {
    return item?.mtime ?? item?.updatedAt ?? item?.updated_at;
  }

  function compareText(left, right) {
    const a = String(left || "");
    const b = String(right || "");
    return collator ? collator.compare(a, b) : a.localeCompare(b, "zh-CN", { numeric: true, sensitivity: "base" });
  }

  function numericValue(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function compareNullable(left, right, direction, compare) {
    const leftMissing = left === null || left === undefined || left === "";
    const rightMissing = right === null || right === undefined || right === "";
    if (leftMissing || rightMissing) {
      if (leftMissing && rightMissing) return 0;
      return leftMissing ? 1 : -1;
    }
    return compare(left, right) * direction;
  }

  function compareCollections(left, right, requestedMode) {
    const mode = normalizeSortMode(requestedMode);
    const direction = mode.endsWith("_desc") ? -1 : 1;
    let primary = 0;
    if (mode.startsWith("name_")) {
      primary = compareNullable(textValue(left), textValue(right), direction, compareText);
    } else if (mode.startsWith("image_count_")) {
      const leftCount = numericValue(imageCountValue(left));
      const rightCount = numericValue(imageCountValue(right));
      primary = compareNullable(leftCount >= 0 ? leftCount : null, rightCount >= 0 ? rightCount : null, direction, (a, b) => a - b);
    } else if (mode.startsWith("video_count_")) {
      const leftCount = numericValue(videoCountValue(left));
      const rightCount = numericValue(videoCountValue(right));
      primary = compareNullable(leftCount >= 0 ? leftCount : null, rightCount >= 0 ? rightCount : null, direction, (a, b) => a - b);
    } else {
      const leftUpdated = numericValue(updatedValue(left));
      const rightUpdated = numericValue(updatedValue(right));
      primary = compareNullable(leftUpdated > 0 ? leftUpdated : null, rightUpdated > 0 ? rightUpdated : null, direction, (a, b) => a - b);
    }
    if (primary) return primary;
    const byName = compareNullable(textValue(left), textValue(right), 1, compareText);
    if (byName) return byName;
    return compareText(pathValue(left), pathValue(right));
  }

  function sortCollections(items, mode) {
    return [...(Array.isArray(items) ? items : [])]
      .map((item, index) => ({ item, index }))
      .sort((left, right) => compareCollections(left.item, right.item, mode) || left.index - right.index)
      .map(({ item }) => item);
  }

  return Object.freeze({ SORT_OPTIONS, normalizeSortMode, compareText, compareCollections, sortCollections });
});
