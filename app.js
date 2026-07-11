const text = {
  refreshing: "\u6b63\u5728\u5237\u65b0\u56fe\u7247\u76ee\u5f55...",
  synced: "\u5df2\u540c\u6b65",
  modelUnit: "\u4f4d\u6a21\u7279\u3002",
  openViaServer: "\u8bf7\u901a\u8fc7\u672c\u5730\u670d\u52a1\u6253\u5f00\u7f51\u9875\uff1a\u5728\u8fd9\u4e2a\u76ee\u5f55\u8fd0\u884c node server.js\uff0c\u7136\u540e\u8bbf\u95ee http://localhost:5177",
  cannotRead: "\u7f51\u9875\u5df2\u52a0\u8f7d\uff0c\u4f46\u8fd8\u4e0d\u80fd\u76f4\u63a5\u8bfb\u53d6\u672c\u5730\u56fe\u7247\u76ee\u5f55\u3002",
  home: "\u9996\u9875",
  waitingImage: "\u7b49\u5f85\u56fe\u7247",
  noImages: "\u8fd8\u6ca1\u6709\u53d1\u73b0\u56fe\u7247\u3002\u8bf7\u628a\u56fe\u7247\u6216\u89c6\u9891\u653e\u8fdb photos \u6587\u4ef6\u5939\uff1aphotos / \u6a21\u7279\u540d / \u4f5c\u54c1\u540d / \u56fe\u7247\u6216\u89c6\u9891\u3002",
  works: "\u4e2a\u4f5c\u54c1",
  noWorksSuffix: " \u4e0b\u9762\u8fd8\u6ca1\u6709\u4f5c\u54c1\u6587\u4ef6\u5939\u3002",
  photos: "\u5f20\u56fe\u7247",
  videos: "\u6bb5\u89c6\u9891",
  all: "\u5168\u90e8",
  imagesOnly: "\u4ec5\u56fe\u7247",
  videosOnly: "\u4ec5\u89c6\u9891",
  media: "\u5a92\u4f53",
  detailEmpty: "\u8fd9\u4e2a\u4f5c\u54c1\u91cc\u8fd8\u6ca1\u6709\u8be6\u60c5\u56fe\u7247\u6216\u89c6\u9891\u3002<br />\u8bf7\u653e\u5165 001.jpg\u3001002.jpg \u6216 video.mp4 \u8fd9\u6837\u7684\u6587\u4ef6\uff0ccover.jpg \u53ea\u4f5c\u4e3a\u5c01\u9762\u3002",
  noImagesInFilter: "\u5f53\u524d\u4f5c\u54c1\u6ca1\u6709\u53ef\u663e\u793a\u7684\u56fe\u7247\u3002",
  noVideosInFilter: "\u5f53\u524d\u4f5c\u54c1\u6ca1\u6709\u53ef\u663e\u793a\u7684\u89c6\u9891\u3002",
  modelMissing: "\u6ca1\u6709\u627e\u5230\u8fd9\u4e2a\u6a21\u7279\uff0c\u53ef\u80fd\u662f\u6587\u4ef6\u5939\u540d\u79f0\u5df2\u7ecf\u6539\u8fc7\u3002",
  workMissing: "\u6ca1\u6709\u627e\u5230\u8fd9\u4e2a\u4f5c\u54c1\uff0c\u53ef\u80fd\u662f\u4f5c\u54c1\u6587\u4ef6\u5939\u540d\u79f0\u5df2\u7ecf\u6539\u8fc7\u3002",
  noSearchResults: "\u6ca1\u6709\u627e\u5230\u5339\u914d\u7ed3\u679c\u3002",
};

const APP_VERSION = "v70";
const DUPLICATE_RECYCLE_LIMIT = 50000;

const state = {
  gallery: { models: [] },
  galleryMode: "sqlite",
  sqliteCollections: new Map(),
  sqliteLoading: null,
  sqliteSearch: { query: "", loading: false, collections: [], media: [] },
  mediaPaging: null,
  duplicateGroups: [],
  duplicateOffset: 0,
  duplicateTotal: 0,
  duplicateLoading: false,
  duplicateStatus: null,
  duplicateSelectedIndex: 0,
  duplicateDeleteMarks: [],
  accessLogs: [],
  accessLogsLoading: false,
  lastAccessLogKey: "",
  columns: Number(localStorage.getItem("galleryColumns") || 4),
  coverFit: localStorage.getItem("galleryCoverFit") || "crop",
  mediaFilter: localStorage.getItem("galleryMediaFilter") || "all",
  lazyLoading: localStorage.getItem("galleryLazyLoading") !== "off",
  theme: localStorage.getItem("galleryTheme") || "day",
  modelSort: localStorage.getItem("galleryModelSort") || "name",
  workSort: localStorage.getItem("galleryWorkSort") || "name",
  recentViews: readRecentViews(),
  favorites: readFavorites(),
  searchQuery: "",
  highlightIndex: 0,
  highlightTimer: null,
  lightboxImages: [],
  detailImages: [],
  renderedImageCount: 0,
  imageBatchObserver: null,
  imageBatchScrollHandler: null,
  lightboxIndex: 0,
  lightboxScale: 1,
  lightboxX: 0,
  lightboxY: 0,
  lightboxPointerId: null,
  lightboxDragging: false,
  lightboxDragStartX: 0,
  lightboxDragStartY: 0,
  lightboxDragOriginX: 0,
  lightboxDragOriginY: 0,
  lightboxControlsTimer: null,
};

const view = document.querySelector("#view");
const statusEl = document.querySelector("#status");
const crumbs = document.querySelector("#crumbs");
const refreshButton = document.querySelector("#refreshButton");
const topButton = document.querySelector("#topButton");
const versionFooter = document.querySelector("#versionFooter");
const columnButtons = [...document.querySelectorAll("[data-columns]")];
const coverFitToggle = document.querySelector("#coverFitToggle");
const lazyLoadingToggle = document.querySelector("#lazyLoadingToggle");
const themeToggle = document.querySelector("#themeToggle");
const searchBox = document.querySelector("#searchBox");
const sortToggle = document.querySelector("#sortToggle");
const lightbox = document.querySelector("#lightbox");
const lightboxImage = document.querySelector("#lightboxImage");
const closeLightbox = document.querySelector("#closeLightbox");
const prevImage = document.querySelector("#prevImage");
const nextImage = document.querySelector("#nextImage");
const zoomOutImage = document.querySelector("#zoomOutImage");
const zoomResetImage = document.querySelector("#zoomResetImage");
const zoomInImage = document.querySelector("#zoomInImage");
const openImagePath = document.querySelector("#openImagePath");

const modelSortOptions = [
  { mode: "name", label: "名称" },
  { mode: "works", label: "作品数" },
  { mode: "images", label: "图片数" },
  { mode: "mtime", label: "最近" },
];

const workSortOptions = [
  { mode: "name", label: "名称" },
  { mode: "images", label: "图片数" },
  { mode: "videos", label: "视频数" },
  { mode: "mtime", label: "最近" },
];

const favoritePayloads = new Map();

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
  });
}

function setStatus(message) {
  statusEl.textContent = message || "";
}

function setColumns(count) {
  state.columns = count;
  localStorage.setItem("galleryColumns", String(count));
  document.documentElement.style.setProperty("--columns", count);
  columnButtons.forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.columns) === count);
  });
}

function setCoverFit(mode) {
  const nextMode = mode === "original" ? "original" : "crop";
  state.coverFit = nextMode;
  localStorage.setItem("galleryCoverFit", nextMode);
  document.documentElement.classList.toggle("cover-fit-original", nextMode === "original");
  coverFitToggle.textContent = nextMode === "original" ? "\u5b8c\u6574\u56fe" : "\u540c\u5c3a\u5bf8";
  coverFitToggle.classList.add("active");
  coverFitToggle.setAttribute("aria-label", nextMode === "original" ? "\u5207\u6362\u4e3a\u540c\u5c3a\u5bf8" : "\u5207\u6362\u4e3a\u5b8c\u6574\u56fe");
}

function setMediaFilter(mode, rerender = true) {
  const nextMode = ["all", "images", "videos"].includes(mode) ? mode : "all";
  state.mediaFilter = nextMode;
  localStorage.setItem("galleryMediaFilter", nextMode);
  if (rerender) render();
}

function setLazyLoading(enabled, rerender = true) {
  state.lazyLoading = Boolean(enabled);
  localStorage.setItem("galleryLazyLoading", state.lazyLoading ? "on" : "off");
  document.documentElement.classList.toggle("lazy-loading-off", !state.lazyLoading);
  lazyLoadingToggle.textContent = state.lazyLoading ? "\u5f00" : "\u5173";
  lazyLoadingToggle.classList.toggle("active", state.lazyLoading);
  lazyLoadingToggle.setAttribute("aria-label", state.lazyLoading ? "\u5173\u95ed\u61d2\u52a0\u8f7d" : "\u5f00\u542f\u61d2\u52a0\u8f7d");
  if (rerender) render();
}

function setTheme(mode) {
  const nextMode = mode === "night" ? "night" : "day";
  state.theme = nextMode;
  localStorage.setItem("galleryTheme", nextMode);
  document.documentElement.classList.toggle("theme-night", nextMode === "night");
  themeToggle.textContent = nextMode === "night" ? "\u591c\u95f4" : "\u767d\u5929";
  themeToggle.classList.toggle("active", nextMode === "night");
  themeToggle.setAttribute("aria-label", nextMode === "night" ? "\u5207\u6362\u4e3a\u767d\u5929\u6a21\u5f0f" : "\u5207\u6362\u4e3a\u591c\u95f4\u6a21\u5f0f");
}

function normalizeSearch(value) {
  return String(value || "").trim().toLowerCase();
}

function searchableText(...values) {
  return normalizeSearch(values.filter(Boolean).join(" "));
}

function matchesSearch(values, query = state.searchQuery) {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return true;
  return searchableText(...values).includes(normalizedQuery);
}

function currentSortScope() {
  return parseRoute().modelId ? "works" : "models";
}

function sortOptionsForScope(scope) {
  return scope === "works" ? workSortOptions : modelSortOptions;
}

function sortModeForScope(scope) {
  return scope === "works" ? state.workSort : state.modelSort;
}

function updateSortToggle() {
  const scope = currentSortScope();
  const mode = sortModeForScope(scope);
  const option = sortOptionsForScope(scope).find((item) => item.mode === mode) || sortOptionsForScope(scope)[0];
  sortToggle.textContent = option.label;
  sortToggle.classList.add("active");
  sortToggle.setAttribute("aria-label", `切换排序方式，当前按${option.label}排序`);
}

function setSortMode(scope, mode, rerender = true) {
  const options = sortOptionsForScope(scope);
  const nextMode = options.some((item) => item.mode === mode) ? mode : options[0].mode;
  if (scope === "works") {
    state.workSort = nextMode;
    localStorage.setItem("galleryWorkSort", nextMode);
  } else {
    state.modelSort = nextMode;
    localStorage.setItem("galleryModelSort", nextMode);
  }
  updateSortToggle();
  if (rerender) render();
}

function cycleSortMode() {
  const scope = currentSortScope();
  const options = sortOptionsForScope(scope);
  const currentMode = sortModeForScope(scope);
  const currentIndex = Math.max(0, options.findIndex((item) => item.mode === currentMode));
  const nextMode = options[(currentIndex + 1) % options.length].mode;
  setSortMode(scope, nextMode);
}

function compareText(a, b) {
  return String(a || "").localeCompare(String(b || ""), "zh-Hans-CN", { numeric: true });
}

function stableSorted(items, compare) {
  return [...items]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => compare(a.item, b.item) || a.index - b.index)
    .map(({ item }) => item);
}

function sortModels(models) {
  return stableSorted(models, (a, b) => {
    if (state.modelSort === "works") return ((b.count || 0) + (b.nestedCount || 0)) - ((a.count || 0) + (a.nestedCount || 0));
    if (state.modelSort === "images") return (b.totalImageCount || b.imageCount || 0) - (a.totalImageCount || a.imageCount || 0);
    if (state.modelSort === "mtime") return (b.mtime || 0) - (a.mtime || 0);
    return compareText(a.name || a.folder, b.name || b.folder);
  });
}

function sortWorks(works) {
  return stableSorted(works, (a, b) => {
    if (state.workSort === "images") return (b.totalImageCount || b.count || b.imageCount || 0) - (a.totalImageCount || a.count || a.imageCount || 0);
    if (state.workSort === "videos") return (b.totalVideoCount || b.videoCount || 0) - (a.totalVideoCount || a.videoCount || 0);
    if (state.workSort === "mtime") return (b.mtime || 0) - (a.mtime || 0);
    return compareText(a.title || a.folder, b.title || b.folder);
  });
}

function sortSearchWorkResults(results) {
  const sortedWorks = sortWorks(results.map(({ work }) => work));
  const rank = new Map(sortedWorks.map((work, index) => [work, index]));
  return stableSorted(results, (a, b) => (rank.get(a.work) || 0) - (rank.get(b.work) || 0));
}

function setSearchQuery(value) {
  state.searchQuery = normalizeSearch(value);
  if (state.galleryMode === "sqlite" && state.sqliteSearch.query !== state.searchQuery) {
    state.sqliteSearch = { query: state.searchQuery, loading: false, collections: [], media: [] };
  }
  render();
}

function collectionToModel(collection) {
  const childCount = collection.childCount ?? (collection.children || []).length;
  return {
    id: collection.id,
    folder: collection.folder || collection.id,
    name: collection.title || collection.folder || collection.id,
    cover: collection.cover || "",
    coverThumb: collection.coverThumb || "",
    count: childCount,
    nestedCount: collection.descendantCount || 0,
    imageCount: collection.imageCount || 0,
    videoCount: collection.videoCount || 0,
    totalImageCount: collection.totalImageCount || collection.imageCount || 0,
    totalVideoCount: collection.totalVideoCount || collection.videoCount || 0,
    mtime: collection.mtime || 0,
    images: [],
    videos: [],
    works: [],
  };
}

function sqliteMediaToGalleryMedia(item) {
  if (!item) return null;
  if (item.metadata && typeof item.metadata === "object") return item.metadata;
  if (item.type === "image") {
    return {
      file: item.file || item.title || "",
      title: item.title || item.file || "",
      src: item.src || "",
      thumb: item.thumb || item.src || "",
      detailThumb: item.detailThumb || item.thumb || item.src || "",
      carouselThumb: item.carouselThumb || item.thumb || item.src || "",
      width: item.width || 0,
      height: item.height || 0,
      size: item.size || 0,
      mtime: item.mtime || 0,
    };
  }
  return {
    file: item.file || item.title || "",
    title: item.title || item.file || "",
    src: item.src || "",
    poster: item.poster || item.thumb || "",
    thumb: item.thumb || item.poster || "",
    duration: item.duration || 0,
    width: item.width || 0,
    height: item.height || 0,
    size: item.size || 0,
    codec: item.codec || "",
    mtime: item.mtime || 0,
  };
}

function normalizeSqliteCollection(collection) {
  if (!collection) return null;
  const pathParts = collection.pathParts || collection.id.split("/");
  return {
    ...collection,
    folder: collection.folder || pathParts[pathParts.length - 1] || collection.id,
    title: collection.title || collection.folder || collection.id,
    pathParts,
    children: collection.children || [],
    images: collection.images || [],
    videos: collection.videos || [],
    count: collection.childCount ?? (collection.children || []).length,
  };
}

function cacheSqliteCollection(collection) {
  const normalized = normalizeSqliteCollection(collection);
  if (!normalized) return null;
  state.sqliteCollections.set(normalized.id, normalized);
  return normalized;
}

function sqliteCollectionIdFromParts(parts) {
  return parts.join("/");
}

function sqliteHashFromId(id) {
  return encodeHash(String(id || "").split("/").filter(Boolean));
}

function mediaResultCover(item) {
  if (!item) return "";
  return item.thumb || item.detailThumb || item.carouselThumb || item.poster || item.src || "";
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "\u65e0";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

function formatResolution(item) {
  return item && item.width && item.height ? `${item.width} x ${item.height}` : "\u65e0";
}

function duplicateHashRoute() {
  return location.hash.replace(/^#\/?/, "") === "__duplicates";
}

function settingsHashRoute() {
  return location.hash.replace(/^#\/?/, "").startsWith("__settings");
}

function settingsSection() {
  const route = location.hash.replace(/^#\/?/, "");
  if (route.includes("access-log")) return "access-log";
  return route.includes("duplicates") ? "duplicates" : "display";
}

async function loadSqliteHome(showMessage = false) {
  if (showMessage) {
    setStatus(text.refreshing);
  }

  const [payload, highlightsPayload] = await Promise.all([
    fetchJson("/api/collections/root"),
    fetchJson("/api/highlights").catch(() => ({ items: [] })),
  ]);
  const collections = (Array.isArray(payload.items) ? payload.items : []).map(cacheSqliteCollection);
  state.gallery = {
    generatedAt: new Date().toISOString(),
    models: collections.map(collectionToModel),
    collections,
    highlights: Array.isArray(highlightsPayload.items) ? highlightsPayload.items : [],
    sqlitePartial: true,
  };
  state.galleryMode = "sqlite";
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} failed`);
  return response.json();
}

async function postJson(url, payload = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`${url} failed`);
  return response.json();
}

async function deleteJson(url) {
  const response = await fetch(url, { method: "DELETE", cache: "no-store" });
  if (!response.ok) throw new Error(`${url} failed`);
  return response.json();
}

async function loadUserMarks() {
  try {
    const [recentPayload, favoritesPayload] = await Promise.all([
      fetchJson("/api/recent"),
      fetchJson("/api/favorites"),
    ]);
    const recentItems = Array.isArray(recentPayload.items) ? recentPayload.items.filter((item) => item && item.hash && item.title).slice(0, 10) : [];
    const favoriteItems = Array.isArray(favoritesPayload.items) ? favoritesPayload.items.filter((item) => item && item.id && item.hash && item.title).slice(0, 100) : [];
    state.recentViews = recentItems;
    state.favorites = favoriteItems;
    saveRecentViews();
    saveFavorites();
  } catch (error) {
    // localStorage remains the offline fallback if the SQLite mark API is unavailable.
  }
}

function saveRecentViewToServer(item) {
  postJson("/api/recent", { item: { id: `recent:${item.hash}`, type: "recent", ...item } }).catch(() => {});
}

function saveFavoriteToServer(item) {
  postJson("/api/favorites", { item }).catch(() => {});
}

function deleteFavoriteFromServer(id) {
  deleteJson(`/api/favorites?id=${encodeURIComponent(id)}`).catch(() => {});
}

async function loadDuplicateDeleteMarks() {
  try {
    const payload = await fetchJson("/api/duplicate-delete-marks");
    state.duplicateDeleteMarks = Array.isArray(payload.items) ? payload.items : [];
  } catch (error) {
    state.duplicateDeleteMarks = [];
  }
}

function duplicateDeleteMarkId(item) {
  return `duplicate-delete:${item.id}`;
}

function isDuplicateDeleteMarked(item) {
  return state.duplicateDeleteMarks.some((mark) => mark.id === duplicateDeleteMarkId(item));
}

async function toggleDuplicateDeleteMark(item) {
  const markId = duplicateDeleteMarkId(item);
  if (isDuplicateDeleteMarked(item)) {
    state.duplicateDeleteMarks = state.duplicateDeleteMarks.filter((mark) => mark.id !== markId);
    await deleteJson(`/api/duplicate-delete-marks?id=${encodeURIComponent(markId)}`).catch(() => null);
  } else {
    const mark = {
      id: markId,
      type: "duplicate-delete",
      title: item.title || item.file || "",
      hash: item.src || item.id,
      cover: item.thumb || item.detailThumb || item.src || "",
      meta: item.collectionTitle || item.collectionId || "",
      mediaId: item.id,
      src: item.src,
      file: item.file,
      collectionId: item.collectionId,
      markedAt: Date.now(),
    };
    state.duplicateDeleteMarks = [mark, ...state.duplicateDeleteMarks.filter((entry) => entry.id !== markId)].slice(0, 500);
    await postJson("/api/duplicate-delete-marks", { item: mark }).catch(() => null);
  }
}

async function recycleDuplicateMedia(ids, mode = "selected") {
  const cleanIds = [...new Set((ids || []).filter(Boolean))];
  if (mode !== "auto" && !cleanIds.length) return null;
  const url = mode === "auto" ? "/api/duplicates/recycle-auto" : "/api/duplicates/recycle";
  const payload = mode === "auto" ? { limit: DUPLICATE_RECYCLE_LIMIT } : { ids: cleanIds, limit: DUPLICATE_RECYCLE_LIMIT };
  const result = await postJson(url, payload);
  await Promise.all([loadDuplicateStatus(), loadDuplicateDeleteMarks(), loadDuplicates(state.duplicateOffset)]);
  return result;
}

async function loadAccessLogs() {
  state.accessLogsLoading = true;
  try {
    const payload = await fetchJson("/api/access-log?limit=100");
    state.accessLogs = Array.isArray(payload.items) ? payload.items : [];
  } catch (error) {
    state.accessLogs = [];
  } finally {
    state.accessLogsLoading = false;
  }
}

function recordAccessLog(entry) {
  const hash = location.hash || "#/";
  const key = `${hash}|${entry.type || ""}|${entry.title || ""}`;
  if (state.lastAccessLogKey === key) return;
  state.lastAccessLogKey = key;
  postJson("/api/access-log", { ...entry, hash }).catch(() => {});
}

function scanStatusText(payload) {
  if (!payload || !payload.status) return "\u6b63\u5728\u540e\u53f0\u626b\u63cf...";
  const dirs = Number(payload.scannedDirectories || 0);
  const files = Number(payload.processedFiles || 0);
  const current = payload.currentDirectory ? ` / ${payload.currentDirectory}` : "";
  if (payload.status === "running") return `\u6b63\u5728\u540e\u53f0\u626b\u63cf... ${dirs} \u4e2a\u76ee\u5f55 / ${files} \u4e2a\u6587\u4ef6${current}`;
  if (payload.status === "completed") return "\u626b\u63cf\u5b8c\u6210\uff0c\u6b63\u5728\u5237\u65b0\u9875\u9762\u6570\u636e...";
  if (payload.status === "failed") return `\u626b\u63cf\u5931\u8d25\uff1a${payload.errorMessage || "\u672a\u77e5\u9519\u8bef"}`;
  return "\u540e\u53f0\u626b\u63cf\u5c1a\u672a\u5f00\u59cb";
}

async function startBackgroundScan() {
  refreshButton.disabled = true;
  try {
    const task = await postJson("/api/scan");
    setStatus(scanStatusText(task));
    for (let attempt = 0; attempt < 720; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const status = await fetchJson("/api/scan/status");
      setStatus(scanStatusText(status));
      if (status.status === "completed") {
        await loadGallery(false);
        return;
      }
      if (status.status === "failed") return;
    }
    setStatus("\u626b\u63cf\u4ecd\u5728\u540e\u53f0\u8fd0\u884c\uff0c\u7a0d\u540e\u518d\u5237\u65b0\u9875\u9762\u3002");
  } catch (error) {
    setStatus("\u65e0\u6cd5\u542f\u52a8\u540e\u53f0\u626b\u63cf\u3002");
  } finally {
    refreshButton.disabled = false;
  }
}

async function fetchSqliteMediaPage(collectionId, offset = 0, limit = 120) {
  const media = await fetchJson(`/api/media?collectionId=${encodeURIComponent(collectionId)}&limit=${limit}&offset=${offset}`);
  return {
    items: Array.isArray(media.items) ? media.items : [],
    total: Number(media.total || 0),
    limit: Number(media.limit || limit),
    offset: Number(media.offset || offset),
  };
}

async function loadSqliteCollection(parts) {
  const id = sqliteCollectionIdFromParts(parts);
  let collection = state.sqliteCollections.get(id);
  const needsChildren = collection && (collection.childCount || 0) > 0 && !(collection.children || []).length;
  if (!collection || !Array.isArray(collection.children) || needsChildren) {
    collection = cacheSqliteCollection(await fetchJson(`/api/collections/${parts.map(encodeURIComponent).join("/")}`));
  }

  if (!collection) throw new Error("collection missing");

  const hasKnownMedia = (collection.images || []).length || (collection.videos || []).length;
  const expectedMedia = (collection.imageCount || 0) + (collection.videoCount || 0);
  if (!hasKnownMedia && expectedMedia > 0) {
    const media = await fetchSqliteMediaPage(collection.id, 0, 120);
    const rawItems = Array.isArray(media.items) ? media.items : [];
    collection.images = rawItems.filter((item) => item.type === "image").map(sqliteMediaToGalleryMedia).filter(Boolean);
    collection.videos = rawItems.filter((item) => item.type === "video").map(sqliteMediaToGalleryMedia).filter(Boolean);
    collection.mediaTotal = media.total || rawItems.length;
    collection.mediaLoaded = rawItems.length;
    collection.mediaPageLimit = media.limit || 120;
    cacheSqliteCollection(collection);
  }

  (collection.children || []).forEach(cacheSqliteCollection);
  return collection;
}

function requestSqliteSearch() {
  const query = state.searchQuery;
  if (!query || state.sqliteSearch.loading || state.sqliteSearch.query !== query) return;
  state.sqliteSearch.loading = true;
  fetchJson(`/api/search?q=${encodeURIComponent(query)}&limit=80`)
    .then((payload) => {
      if (state.searchQuery !== query) return;
      const collections = (payload.collections || []).map(cacheSqliteCollection).filter(Boolean);
      const media = (payload.media || []).map((item) => ({ ...item, galleryMedia: sqliteMediaToGalleryMedia(item) }));
      state.sqliteSearch = { query, loading: false, collections, media };
      render();
    })
    .catch(() => {
      if (state.searchQuery !== query) return;
      state.sqliteSearch = { query, loading: false, collections: [], media: [] };
      render();
    });
}

function renderSqliteRoute(parts) {
  if (state.galleryMode !== "sqlite") return false;
  if (!parts.length) return false;
  const id = sqliteCollectionIdFromParts(parts);
  const cached = state.sqliteCollections.get(id);
  const hasAllNeededChildren = cached && ((cached.childCount || 0) === 0 || (cached.children || []).length > 0);
  const hasAllNeededMedia = cached && (((cached.imageCount || 0) + (cached.videoCount || 0) === 0) || (cached.images || []).length || (cached.videos || []).length);

  if (hasAllNeededChildren && hasAllNeededMedia) {
    renderCollection(cached);
    return true;
  }

  if (state.sqliteLoading === id) {
    renderEmpty(text.refreshing);
    return true;
  }

  state.sqliteLoading = id;
  renderEmpty(text.refreshing);
  loadSqliteCollection(parts)
    .then((collection) => {
      state.sqliteLoading = null;
      renderCollection(collection);
    })
    .catch(() => {
      state.sqliteLoading = null;
      renderEmpty(text.cannotRead);
    });
  return true;
}

async function loadGallery(showMessage = false) {
  if (showMessage) setStatus(text.refreshing);

  try {
    await loadSqliteHome(showMessage);
    setStatus(`${text.synced} ${state.gallery.models.length} ${text.modelUnit}`);
    render();
  } catch (error) {
    setStatus(text.openViaServer);
    renderEmpty(text.cannotRead);
  }
}

function modelById(id) {
  return state.gallery.models.find((model) => model.id === id);
}

function workById(model, workId) {
  if (!model || !workId.length) return null;
  let works = model.works || [];
  let current = null;
  for (const folder of workId) {
    current = works.find((work) => work.folder === folder);
    if (!current) return null;
    works = current.works || [];
  }
  return current;
}

function collectionByPath(parts) {
  if (!parts.length) return null;
  let children = state.gallery.collections || [];
  let current = null;
  for (const part of parts) {
    current = children.find((collection) => collection.folder === part || collection.id === part);
    if (!current) return null;
    children = current.children || [];
  }
  return current;
}

function encodeHash(parts) {
  return `#/${parts.map(encodeURIComponent).join("/")}`;
}

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  return {
    modelId: parts[0] || "",
    workId: parts.slice(1),
  };
}

function renderCrumbs(model, work) {
  const items = [`<a href="#/">${text.home}</a>`];
  if (model) items.push(`<a href="${encodeHash([model.id])}">${escapeHtml(model.name)}</a>`);
  if (work) {
    const parts = work.id.split("/");
    parts.shift();
    const last = parts.pop();
    parts.reduce((pathParts, part) => {
      pathParts.push(part);
      items.push(`<a href="${encodeHash([model.id, ...pathParts])}">${escapeHtml(titleFromName(part))}</a>`);
      return pathParts;
    }, []);
    if (last) items.push(`<strong>${escapeHtml(work.title)}</strong>`);
  }
  crumbs.innerHTML = items.join(" / ");
}

function renderCollectionCrumbs(collection) {
  const items = [`<a href="#/">${text.home}</a>`];
  if (collection) {
    const parts = collection.pathParts || collection.id.split("/");
    parts.forEach((part, index) => {
      const href = encodeHash(parts.slice(0, index + 1));
      const title = index === parts.length - 1 ? collection.title : titleFromName(part);
      items.push(index === parts.length - 1 ? `<strong>${escapeHtml(title)}</strong>` : `<a href="${href}">${escapeHtml(title)}</a>`);
    });
  }
  crumbs.innerHTML = items.join(" / ");
}

function titleFromName(name) {
  return name.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function coverHtml(src, label) {
  if (!src) return `<div class="empty-cover">${escapeHtml(label || text.waitingImage)}</div>`;
  return `<img src="${src}" alt="${escapeHtml(label || "")}" loading="lazy" />`;
}

function readRecentViews() {
  try {
    const items = JSON.parse(localStorage.getItem("galleryRecentViews") || "[]");
    return Array.isArray(items) ? items.filter((item) => item && item.hash && item.title).slice(0, 10) : [];
  } catch (error) {
    return [];
  }
}

function saveRecentViews() {
  localStorage.setItem("galleryRecentViews", JSON.stringify(state.recentViews.slice(0, 10)));
}

function readFavorites() {
  try {
    const items = JSON.parse(localStorage.getItem("galleryFavorites") || "[]");
    return Array.isArray(items) ? items.filter((item) => item && item.id && item.hash && item.title).slice(0, 100) : [];
  } catch (error) {
    return [];
  }
}

function saveFavorites() {
  localStorage.setItem("galleryFavorites", JSON.stringify(state.favorites.slice(0, 100)));
}

function mediaCover(primaryCover, images = [], videos = []) {
  return primaryCover || (images[0] || {}).thumb || (images[0] || {}).src || (videos[0] || {}).poster || "";
}

function findWorkByHash(workHash, works = []) {
  for (const work of works) {
    if (encodeHash(work.id.split("/")) === workHash) return work;
    const nested = findWorkByHash(workHash, work.works || []);
    if (nested) return nested;
  }
  return null;
}

function collectionCoverByHash(hash) {
  const parts = String(hash || "").replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (!parts.length) return "";
  const collection = state.sqliteCollections.get(parts.join("/"));
  return collection ? collection.coverThumb || collection.cover || "" : "";
}

function storedItemCover(item) {
  if (item.cover) return item.cover;
  const sqliteCover = collectionCoverByHash(item.hash);
  if (sqliteCover) return sqliteCover;
  for (const model of state.gallery.models || []) {
    if (encodeHash([model.id]) === item.hash) return model.coverThumb || model.cover || item.cover || "";
    const work = findWorkByHash(item.hash, model.works || []);
    if (work) return work.coverThumb || work.cover || item.cover || "";
  }
  return item.cover || "";
}

function favoriteId(type, hash) {
  return `${type}:${hash}`;
}

function isFavorited(id) {
  return state.favorites.some((item) => item.id === id);
}

function favoriteButtonHtml(item) {
  const active = isFavorited(item.id);
  favoritePayloads.set(item.id, item);
  return `
    <button class="favorite-button${active ? " active" : ""}" type="button"
      data-favorite-id="${escapeHtml(item.id)}"
      aria-pressed="${active ? "true" : "false"}">
      ${active ? "\u5df2\u6536\u85cf" : "\u6536\u85cf"}
    </button>
  `;
}

function toggleFavorite(item) {
  if (isFavorited(item.id)) {
    state.favorites = state.favorites.filter((entry) => entry.id !== item.id);
    deleteFavoriteFromServer(item.id);
  } else {
    state.favorites = [{ ...item, favoritedAt: Date.now() }, ...state.favorites.filter((entry) => entry.id !== item.id)].slice(0, 100);
    saveFavoriteToServer(state.favorites[0]);
  }
  saveFavorites();
  render();
}

function renderFavorites() {
  if (!state.favorites.length) return "";
  return `
    <section class="favorite-section" aria-label="\u6536\u85cf">
      <div class="section-heading">\u6536\u85cf</div>
      <div class="compact-grid">
        ${state.favorites
          .map(
            (item) => `
              <div class="favorite-card">
                <a class="compact-card compact-link" href="${item.hash}">
                  <div class="compact-cover">${coverHtml(storedItemCover(item), item.title)}</div>
                  <div class="compact-info">
                    <h2>${escapeHtml(item.title)}</h2>
                    <p>${escapeHtml(item.type === "model" ? "\u6a21\u7279" : "\u4f5c\u54c1")}${item.meta ? ` / ${escapeHtml(item.meta)}` : ""}</p>
                  </div>
                </a>
                <button class="favorite-remove" type="button" data-favorite-remove="${escapeHtml(item.id)}" aria-label="\u53d6\u6d88\u6536\u85cf">×</button>
              </div>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function recordRecentView(item) {
  const recent = {
    title: item.title,
    meta: item.meta || "",
    hash: item.hash,
    cover: item.cover || "",
    visitedAt: Date.now(),
  };
  state.recentViews = [recent, ...state.recentViews.filter((entry) => entry.hash !== recent.hash)].slice(0, 10);
  saveRecentViews();
  saveRecentViewToServer(recent);
}

function modelFavoriteItem(model) {
  return {
    id: favoriteId("model", encodeHash([model.id])),
    type: "model",
    title: model.name,
    meta: modelMeta(model),
    hash: encodeHash([model.id]),
    cover: mediaCover(model.coverThumb || model.cover, model.images || [], model.videos || []),
  };
}

function workFavoriteItem(model, work) {
  return {
    id: favoriteId("work", encodeHash(work.id.split("/"))),
    type: "work",
    title: work.title,
    meta: `${model.name} / ${workMeta(work)}`,
    hash: encodeHash(work.id.split("/")),
    cover: mediaCover(work.coverThumb || work.cover, work.images || [], work.videos || []),
  };
}

function collectionFavoriteItem(collection) {
  const hash = encodeHash(collection.pathParts || collection.id.split("/"));
  return {
    id: favoriteId(collection.level === 1 ? "model" : "collection", hash),
    type: collection.level === 1 ? "model" : "work",
    title: collection.title,
    meta: collectionMeta(collection),
    hash,
    cover: collection.coverThumb || collection.cover || "",
  };
}

function bindFavoriteButtons() {
  view.querySelectorAll("[data-favorite-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = favoritePayloads.get(button.dataset.favoriteId);
      if (item) toggleFavorite(item);
    });
  });

  view.querySelectorAll("[data-favorite-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.favoriteRemove;
      state.favorites = state.favorites.filter((item) => item.id !== id);
      saveFavorites();
      deleteFavoriteFromServer(id);
      render();
    });
  });
}

function renderRecentViews() {
  if (!state.recentViews.length) return "";
  return `
    <section class="recent-section" aria-label="\u6700\u8fd1\u89c2\u770b">
      <div class="section-heading">\u6700\u8fd1\u89c2\u770b</div>
      <div class="compact-grid">
        ${state.recentViews
          .map(
            (item) => `
              <a class="compact-card compact-link" href="${item.hash}">
                <div class="compact-cover">${coverHtml(storedItemCover(item), item.title)}</div>
                <div class="compact-info">
                  <h2>${escapeHtml(item.title)}</h2>
                  ${item.meta ? `<p>${escapeHtml(item.meta)}</p>` : ""}
                </div>
              </a>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function workMeta(work) {
  const parts = [`${work.count || 0} ${text.photos}`];
  if (work.videoCount) parts.push(`${work.videoCount} ${text.videos}`);
  if (work.childCount) parts.push(`${work.childCount} ${text.works}`);
  return parts.join(" / ");
}

function collectionMeta(collection) {
  const parts = [];
  if ((collection.children || []).length) parts.push(`${collection.children.length} ${text.works}`);
  if (collection.imageCount) parts.push(`${collection.imageCount} ${text.photos}`);
  if (collection.videoCount) parts.push(`${collection.videoCount} ${text.videos}`);
  return parts.length ? parts.join(" / ") : `0 ${text.works}`;
}

function formatDuration(seconds) {
  const total = Math.round(Number(seconds || 0));
  if (!total) return "";
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value) => String(value).padStart(2, "0");
  return hours ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`;
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (!size) return "";
  if (size >= 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(1)}GB`;
  if (size >= 1024 * 1024) return `${Math.round(size / 1024 / 1024)}MB`;
  if (size >= 1024) return `${Math.round(size / 1024)}KB`;
  return `${size}B`;
}

function videoMeta(video) {
  const parts = [];
  const duration = formatDuration(video.duration);
  if (duration) parts.push(duration);
  if (video.width && video.height) parts.push(`${video.width}x${video.height}`);
  const size = formatFileSize(video.size);
  if (size) parts.push(size);
  if (video.codec) parts.push(String(video.codec).toUpperCase());
  return parts.join(" / ");
}

function modelMeta(model) {
  if (model.count) return `${model.count} ${text.works}`;
  const parts = [];
  if (model.imageCount) parts.push(`${model.imageCount} ${text.photos}`);
  if (model.videoCount) parts.push(`${model.videoCount} ${text.videos}`);
  return parts.length ? parts.join(" / ") : `0 ${text.works}`;
}

function collectSearchWorks(model, works = model.works || [], results = []) {
  for (const work of works) {
    results.push({ model, work, pathParts: work.id.split("/") });
    collectSearchWorks(model, work.works || [], results);
  }
  return results;
}

function collectAllSearchWorks(models = state.gallery.models) {
  return models.flatMap((model) => collectSearchWorks(model));
}

function renderHighlightCarousel() {
  const highlights = Array.isArray(state.gallery.highlights) ? state.gallery.highlights : [];
  if (!highlights.length) return "";

  return `
    <section class="highlight-carousel" aria-label="\u4eae\u70b9\u56fe\u7247">
      <button class="highlight-nav highlight-prev" type="button" aria-label="\u4e0a\u4e00\u5f20">&lt;</button>
      <div class="highlight-track">
        ${highlights
          .map(
            (item) => `
              <a class="highlight-card" href="${item.href}">
                <img src="${item.src}" alt="${escapeHtml(item.title || item.model || "")}" loading="lazy" />
              </a>
            `,
          )
          .join("")}
      </div>
      <button class="highlight-nav highlight-next" type="button" aria-label="\u4e0b\u4e00\u5f20">&gt;</button>
      <div class="highlight-progress" aria-hidden="true"><span></span></div>
    </section>
  `;
}

function renderModelGrid(models) {
  return `
    <div class="grid">
      ${models
        .map(
          (model) => `
            <a class="model-card" href="${encodeHash([model.id])}">
              <div class="cover">
                ${coverHtml(model.coverThumb || model.cover, model.name)}
                <span class="badge">${escapeHtml(model.name)}</span>
              </div>
              <h2 class="model-title">${escapeHtml(model.name)}</h2>
              <div class="meta">
                <span>${modelMeta(model)}</span>
              </div>
            </a>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderSearchWorkGrid(results) {
  return `
    <div class="grid">
      ${results
        .map(
          ({ model, work, pathParts }) => `
            <a class="work-card" href="${encodeHash(pathParts)}">
              <div class="cover">
                ${coverHtml(work.coverThumb || work.cover, work.title)}
                <span class="badge">${escapeHtml(model.name)}</span>
              </div>
              <div class="work-info">
                <h2 class="work-title">${escapeHtml(work.title)}</h2>
                <div class="meta"><span>${escapeHtml(model.name)} / ${workMeta(work)}</span></div>
              </div>
            </a>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderSqliteSearchMediaGrid(items) {
  return `
    <div class="grid">
      ${items
        .map((item) => {
          const media = item.galleryMedia || sqliteMediaToGalleryMedia(item);
          return `
            <a class="work-card" href="${sqliteHashFromId(item.collectionId)}">
              <div class="cover">
                ${coverHtml(mediaResultCover(media), media.title || item.title)}
                <span class="badge">${escapeHtml(item.type === "video" ? text.videos : text.photos)}</span>
              </div>
              <div class="work-info">
                <h2 class="work-title">${escapeHtml(media.title || item.title || item.file || "")}</h2>
                <div class="meta"><span>${escapeHtml(item.collectionId || "")}</span></div>
              </div>
            </a>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderSqliteSearchResults() {
  const query = state.searchQuery;
  if (!query) return false;

  if (state.sqliteSearch.query !== query) {
    state.sqliteSearch = { query, loading: false, collections: [], media: [] };
  }

  if (!state.sqliteSearch.loading && !state.sqliteSearch.collections.length && !state.sqliteSearch.media.length) {
    requestSqliteSearch();
  }

  const collections = state.sqliteSearch.collections || [];
  const media = state.sqliteSearch.media || [];
  const hasResults = collections.length || media.length;
  view.innerHTML = `
    <div class="search-summary">${escapeHtml(query)} / ${collections.length} ${text.works} / ${media.length} ${text.media}</div>
    ${state.sqliteSearch.loading ? `<div class="empty-state">${text.refreshing}</div>` : ""}
    ${!state.sqliteSearch.loading && hasResults ? `
      ${collections.length ? `<section class="search-section"><h2>目录</h2>${renderCollectionGrid(collections)}</section>` : ""}
      ${media.length ? `<section class="search-section"><h2>媒体</h2>${renderSqliteSearchMediaGrid(media)}</section>` : ""}
    ` : ""}
    ${!state.sqliteSearch.loading && !hasResults ? `<div class="empty-state">${text.noSearchResults}</div>` : ""}
  `;
  return true;
}

async function loadDuplicates(offset = 0) {
  state.duplicateLoading = true;
  state.duplicateOffset = Math.max(0, offset);
  try {
    const payload = await fetchJson(`/api/duplicates?limit=20&offset=${state.duplicateOffset}`);
    state.duplicateGroups = Array.isArray(payload.groups) ? payload.groups : [];
    state.duplicateTotal = Number(payload.total || 0);
    state.duplicateSelectedIndex = 0;
  } catch (error) {
    state.duplicateGroups = [];
    state.duplicateTotal = 0;
  } finally {
    state.duplicateLoading = false;
  }
}

async function loadDuplicateStatus() {
  try {
    state.duplicateStatus = await fetchJson("/api/duplicates/status");
  } catch (error) {
    state.duplicateStatus = null;
  }
}

function duplicateMetaRows(item) {
  const pathText = (item.collectionPathParts || []).join(" / ") || item.collectionId || "\u65e0";
  const rows = [
    ["\u540d\u79f0", item.title || item.file || "\u65e0"],
    ["\u6240\u5c5e\u56fe\u96c6", item.collectionTitle || "\u65e0"],
    ["\u76ee\u5f55", pathText],
    ["\u5927\u5c0f", formatBytes(item.fileSize || item.size)],
    ["\u5206\u8fa8\u7387", formatResolution(item)],
    ["\u5f55\u5236\u8bbe\u5907", item.device || "\u65e0"],
    ["\u5730\u70b9", item.location || "\u65e0"],
    ["SHA256", item.sha256 ? `${item.sha256.slice(0, 16)}...` : "\u65e0"],
  ];
  return rows
    .map(
      ([label, value]) => `
        <div class="duplicate-meta-row">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `,
    )
    .join("");
}

function duplicateItemHtml(item, role) {
  if (!item) return `<div class="duplicate-item empty-state">\u6ca1\u6709\u53ef\u6bd4\u8f83\u7684\u56fe\u7247</div>`;
  const marked = isDuplicateDeleteMarked(item);
  return `
    <article class="duplicate-item ${role}">
      <div class="duplicate-item-actions">
        <button class="duplicate-open-folder" type="button" data-duplicate-open="${escapeHtml(item.src || "")}">\u6253\u5f00\u6587\u4ef6\u5939</button>
        <button class="duplicate-delete-mark${marked ? " active" : ""}" type="button" data-duplicate-mark="${escapeHtml(item.id)}">
          ${marked ? "\u5df2\u6807\u8bb0\u5f85\u5220\u9664" : "\u6807\u8bb0\u5f85\u5220\u9664"}
        </button>
        <button class="duplicate-recycle-one" type="button" data-duplicate-recycle="${escapeHtml(item.id)}">\u653e\u5165\u56de\u6536\u7ad9</button>
      </div>
      <div class="duplicate-image-wrap">
        <img src="${escapeHtml(item.detailThumb || item.thumb || item.src || "")}" alt="${escapeHtml(item.title || item.file || "")}" loading="lazy" />
      </div>
      <div class="duplicate-meta">
        ${duplicateMetaRows(item)}
      </div>
    </article>
  `;
}

function duplicatePageHtml() {
  const group = state.duplicateGroups[state.duplicateSelectedIndex] || null;
  const items = group ? group.items || [] : [];
  const status = state.duplicateStatus || {};
  const stats = status.stats || {};
  const currentNumber = state.duplicateOffset + state.duplicateSelectedIndex + 1;
  const scanRunning = status.status === "running";
  return `
    <section class="duplicates-page">
      <div class="duplicates-header">
        <div>
          <h1>\u91cd\u590d\u9879${state.duplicateTotal ? ` (${state.duplicateTotal})` : ""}</h1>
          <p>\u57fa\u4e8e SHA256 \u7684\u5b8c\u5168\u91cd\u590d\u68c0\u6d4b\u3002\u5220\u9664\u64cd\u4f5c\u4f1a\u628a\u6587\u4ef6\u526a\u5207\u5230\u201c\u56de\u6536\u7ad9\u201d\u6587\u4ef6\u5939\u3002</p>
        </div>
        <div class="duplicates-actions">
          <button id="duplicateScanButton" type="button">${scanRunning ? "\u505c\u6b62\u626b\u63cf" : "\u626b\u63cf\u91cd\u590d\u56fe\u7247"}</button>
          <button id="duplicateReloadButton" type="button">\u5237\u65b0\u7ed3\u679c</button>
          <button id="duplicateRecycleMarkedButton" type="button">\u5220\u9664\u5df2\u6807\u8bb0</button>
          <button id="duplicateRecycleAutoButton" type="button">\u4e00\u952e\u5220\u9664\u91cd\u590d\u56fe\u7247</button>
        </div>
      </div>
      <div class="duplicates-status">
        <span>\u5df2\u5efa\u7acb\u54c8\u5e0c ${stats.hashedCount || 0} / ${stats.imageCount || 0}</span>
        <span>\u5f85\u5904\u7406 ${stats.pendingCount || 0}</span>
        <span>\u626b\u63cf\u72b6\u6001 ${escapeHtml(status.status || "idle")}</span>
        <span>\u9519\u8bef ${status.errorCount || 0}</span>
        <span>\u5df2\u6807\u8bb0\u5f85\u5220\u9664 ${state.duplicateDeleteMarks.length}</span>
      </div>
      ${state.duplicateLoading ? `<div class="empty-state">${text.refreshing}</div>` : ""}
      ${!state.duplicateLoading && group ? `
        <div class="duplicate-compare">
          <div class="duplicate-group-toolbar">
            <button class="keep-all" type="button">\u5168\u90e8\u4fdd\u7559</button>
            <span>${currentNumber} / ${state.duplicateTotal}</span>
            <strong>${items.length} \u4e2a\u76f8\u540c\u6587\u4ef6</strong>
            <div class="duplicate-group-nav">
              <button id="duplicatePrevButton" type="button" ${currentNumber <= 1 ? "disabled" : ""}>&lt; \u4e0a\u4e00\u4e2a</button>
              <button id="duplicateNextButton" type="button" ${currentNumber >= state.duplicateTotal ? "disabled" : ""}>\u4e0b\u4e00\u4e2a &gt;</button>
            </div>
          </div>
          <div class="duplicate-pair">
            ${duplicateItemHtml(items[0], "left")}
            ${duplicateItemHtml(items[1], "right")}
          </div>
        </div>
      ` : ""}
      ${!state.duplicateLoading && !group ? `<div class="empty-state">\u8fd8\u6ca1\u6709\u91cd\u590d\u7ed3\u679c\u3002\u5148\u70b9\u51fb\u201c\u626b\u63cf\u91cd\u590d\u56fe\u7247\u201d\u5efa\u7acb\u54c8\u5e0c\u7d22\u5f15\u3002</div>` : ""}
    </section>
  `;
}

function renderDuplicatePage() {
  renderCrumbs();
  crumbs.innerHTML = `<a href="#/">${text.home}</a> / <a href="#/__settings">\u8bbe\u7f6e</a> / <strong>\u56fe\u7247\u67e5\u91cd</strong>`;
  view.innerHTML = duplicatePageHtml();
  bindDuplicatePage();
}

function renderDuplicateSurface() {
  if (settingsHashRoute()) {
    renderSettingsPage();
    return;
  }
  renderDuplicatePage();
}

function formatAccessTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function accessLogPageHtml() {
  const rows = state.accessLogs || [];
  return `
    <section class="access-log-page">
      <h1>\u8bbf\u95ee\u65e5\u5fd7</h1>
      <p>\u8bb0\u5f55\u8fdb\u5165\u6a21\u7279\u3001\u56fe\u96c6\u548c\u8bbe\u7f6e\u9875\u7684\u9875\u9762\u7ea7\u8bbf\u95ee\u3002</p>
      <button class="access-log-refresh" id="accessLogRefreshButton" type="button">\u5237\u65b0\u65e5\u5fd7</button>
      ${state.accessLogsLoading ? `<div class="empty-state">${text.refreshing}</div>` : ""}
      ${!state.accessLogsLoading && rows.length ? `
        <div class="access-log-table">
          <div class="access-log-row access-log-head">
            <span>\u65f6\u95f4</span>
            <span>IP</span>
            <span>\u7c7b\u578b</span>
            <span>\u6a21\u7279</span>
            <span>\u56fe\u96c6</span>
          </div>
          ${rows.map((item) => `
            <div class="access-log-row">
              <span>${escapeHtml(formatAccessTime(item.time))}</span>
              <span>${escapeHtml(item.ip || "")}</span>
              <span>${escapeHtml(item.type || "")}</span>
              <span>${escapeHtml(item.model || item.title || "")}</span>
              <span>${escapeHtml(item.work || (Array.isArray(item.pathParts) ? item.pathParts.slice(1).join(" / ") : ""))}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${!state.accessLogsLoading && !rows.length ? `<div class="empty-state">\u8fd8\u6ca1\u6709\u8bbf\u95ee\u8bb0\u5f55\u3002</div>` : ""}
    </section>
  `;
}

function renderSettingsPage() {
  renderCrumbs();
  const section = settingsSection();
  recordAccessLog({ type: "settings", title: section === "duplicates" ? "\u56fe\u7247\u67e5\u91cd" : section === "access-log" ? "\u8bbf\u95ee\u65e5\u5fd7" : "\u663e\u793a\u8bbe\u7f6e", model: "", work: "", pathParts: ["__settings", section] });
  crumbs.innerHTML = `<a href="#/">${text.home}</a> / <strong>\u8bbe\u7f6e</strong>`;
  view.innerHTML = `
    <section class="settings-page">
      <aside class="settings-sidebar">
        <a class="${section === "display" ? "active" : ""}" href="#/__settings">\u663e\u793a\u8bbe\u7f6e</a>
        <a class="${section === "duplicates" ? "active" : ""}" href="#/__settings/duplicates">\u56fe\u7247\u67e5\u91cd</a>
        <a class="${section === "access-log" ? "active" : ""}" href="#/__settings/access-log">\u8bbf\u95ee\u65e5\u5fd7</a>
      </aside>
      <div class="settings-content">
        ${section === "duplicates" ? duplicatePageHtml() : section === "access-log" ? accessLogPageHtml() : `
          <h1>\u663e\u793a\u8bbe\u7f6e</h1>
          <p>\u8fd9\u4e9b\u9009\u9879\u4f1a\u7acb\u5373\u5e94\u7528\u5230\u56fe\u96c6\u6d4f\u89c8\u3002</p>
          <div class="settings-panel" id="settingsToolbarMount"></div>
        `}
      </div>
    </section>
  `;

  const mount = document.querySelector("#settingsToolbarMount");
  const toolbarSettings = document.querySelector("#toolbarSettings");
  if (mount && toolbarSettings) mount.appendChild(toolbarSettings);
  if (section === "duplicates") bindDuplicatePage();
  if (section === "access-log") {
    document.querySelector("#accessLogRefreshButton")?.addEventListener("click", async () => {
      await loadAccessLogs();
      renderSettingsPage();
    });
  }
}

function restoreToolbarSettings() {
  const toolbar = document.querySelector(".toolbar");
  const settingsButton = document.querySelector("#settingsButton");
  const toolbarSettings = document.querySelector("#toolbarSettings");
  if (toolbar && settingsButton && toolbarSettings && toolbarSettings.parentElement !== toolbar) {
    toolbar.insertBefore(toolbarSettings, settingsButton);
  }
}

async function ensureSettingsPage() {
  if (settingsSection() === "duplicates" && !state.duplicateGroups.length && !state.duplicateLoading) {
    await Promise.all([loadDuplicateStatus(), loadDuplicateDeleteMarks(), loadDuplicates(0)]);
  }
  if (settingsSection() === "access-log" && !state.accessLogs.length && !state.accessLogsLoading) {
    await loadAccessLogs();
  }
  renderSettingsPage();
}

function bindDuplicatePage() {
  document.querySelector("#duplicateScanButton")?.addEventListener("click", async () => {
    if ((state.duplicateStatus || {}).status === "running") {
      await postJson("/api/duplicates/stop").catch(() => null);
    } else {
      await postJson("/api/duplicates/scan").catch(() => null);
    }
    await loadDuplicateStatus();
    await loadDuplicateDeleteMarks();
    renderDuplicateSurface();
  });
  document.querySelector("#duplicateReloadButton")?.addEventListener("click", async () => {
    await loadDuplicateStatus();
    await loadDuplicateDeleteMarks();
    await loadDuplicates(state.duplicateOffset);
    renderDuplicateSurface();
  });
  document.querySelector("#duplicateRecycleMarkedButton")?.addEventListener("click", async () => {
    const ids = state.duplicateDeleteMarks.map((mark) => mark.mediaId).filter(Boolean);
    if (!ids.length) {
      alert("\u8fd8\u6ca1\u6709\u6807\u8bb0\u5f85\u5220\u9664\u7684\u56fe\u7247\u3002");
      return;
    }
    if (!confirm(`\u786e\u5b9a\u628a ${ids.length} \u5f20\u5df2\u6807\u8bb0\u56fe\u7247\u526a\u5207\u5230\u201c\u56de\u6536\u7ad9\u201d\u6587\u4ef6\u5939\uff1f`)) return;
    const result = await recycleDuplicateMedia(ids, "selected").catch((error) => ({ recycled: 0, failed: [{ error: error.message }] }));
    const failed = result.failed || [];
    alert(`\u5df2\u79fb\u52a8\u5230\u56de\u6536\u7ad9\u6587\u4ef6\u5939 ${result.recycled || 0} \u5f20\uff0c\u5931\u8d25 ${failed.length} \u5f20\u3002${failed[0]?.error ? `\\n${failed[0].error}` : ""}`);
    renderDuplicateSurface();
  });
  document.querySelector("#duplicateRecycleAutoButton")?.addEventListener("click", async () => {
    if (!confirm("\u786e\u5b9a\u4e00\u952e\u5904\u7406\u91cd\u590d\u9879\uff1f\u6bcf\u4e2a\u91cd\u590d\u7ec4\u4fdd\u7559\u7b2c\u4e00\u5f20\uff0c\u5176\u4f59\u56fe\u7247\u526a\u5207\u5230\u201c\u56de\u6536\u7ad9\u201d\u6587\u4ef6\u5939\u3002\u672c\u6b21\u4f1a\u5c3d\u53ef\u80fd\u5904\u7406\u5f53\u524d\u91cd\u590d\u5019\u9009\uff0c\u6587\u4ef6\u8f83\u591a\u65f6\u53ef\u80fd\u8017\u65f6\u8f83\u4e45\u3002")) return;
    const result = await recycleDuplicateMedia([], "auto").catch((error) => ({ recycled: 0, failed: [{ error: error.message }] }));
    const failed = result.failed || [];
    alert(`\u5df2\u79fb\u52a8\u5230\u56de\u6536\u7ad9\u6587\u4ef6\u5939 ${result.recycled || 0} \u5f20\uff0c\u5931\u8d25 ${failed.length} \u5f20\u3002${failed[0]?.error ? `\\n${failed[0].error}` : ""}`);
    renderDuplicateSurface();
  });
  document.querySelector("#duplicatePrevButton")?.addEventListener("click", async () => {
    const previous = state.duplicateOffset + state.duplicateSelectedIndex - 1;
    await loadDuplicates(previous);
    renderDuplicateSurface();
  });
  document.querySelector("#duplicateNextButton")?.addEventListener("click", async () => {
    const next = state.duplicateOffset + state.duplicateSelectedIndex + 1;
    await loadDuplicates(next);
    renderDuplicateSurface();
  });
  document.querySelectorAll("[data-duplicate-open]").forEach((button) => {
    button.addEventListener("click", async () => {
      await openImagePathBySrc(button.dataset.duplicateOpen || "");
    });
  });
  const itemMap = new Map();
  (state.duplicateGroups[state.duplicateSelectedIndex]?.items || []).forEach((item) => itemMap.set(item.id, item));
  document.querySelectorAll("[data-duplicate-mark]").forEach((button) => {
    button.addEventListener("click", async () => {
      const item = itemMap.get(button.dataset.duplicateMark);
      if (!item) return;
      await toggleDuplicateDeleteMark(item);
      renderDuplicateSurface();
    });
  });
  document.querySelectorAll("[data-duplicate-recycle]").forEach((button) => {
    button.addEventListener("click", async () => {
      const item = itemMap.get(button.dataset.duplicateRecycle);
      if (!item) return;
      if (!confirm(`\u786e\u5b9a\u628a\u8fd9\u5f20\u56fe\u7247\u526a\u5207\u5230\u201c\u56de\u6536\u7ad9\u201d\u6587\u4ef6\u5939\uff1f\\n${item.title || item.file || ""}`)) return;
      const result = await recycleDuplicateMedia([item.id], "selected").catch((error) => ({ recycled: 0, failed: [{ error: error.message }] }));
      const failed = result.failed || [];
      alert(`\u5df2\u79fb\u52a8\u5230\u56de\u6536\u7ad9\u6587\u4ef6\u5939 ${result.recycled || 0} \u5f20\uff0c\u5931\u8d25 ${failed.length} \u5f20\u3002${failed[0]?.error ? `\\n${failed[0].error}` : ""}`);
      renderDuplicateSurface();
    });
  });
}

async function ensureDuplicatePage() {
  if (!state.duplicateGroups.length && !state.duplicateLoading) {
    await Promise.all([loadDuplicateStatus(), loadDuplicateDeleteMarks(), loadDuplicates(0)]);
  }
  renderDuplicatePage();
}

function setupHighlightCarousel() {
  clearHighlightCarouselTimer();

  const carousel = document.querySelector(".highlight-carousel");
  const track = document.querySelector(".highlight-track");
  const cards = [...document.querySelectorAll(".highlight-card")];
  const progress = document.querySelector(".highlight-progress span");
  const prevButton = document.querySelector(".highlight-prev");
  const nextButton = document.querySelector(".highlight-next");
  if (!carousel || !track || cards.length <= 1) return;
  const intervalMs = 10000;
  const now = Date.now();
  state.highlightIndex = Math.floor(now / intervalMs) % cards.length;
  state.highlightTimer = { timeoutId: null, intervalId: null };

  const centerActiveCard = () => {
    const card = cards[state.highlightIndex];
    if (!card) return;

    const carouselCenter = carousel.clientWidth / 2;
    const cardCenter = card.offsetLeft + card.offsetWidth / 2;
    track.style.transform = `translateX(${carouselCenter - cardCenter}px)`;
  };

  const restartProgress = (elapsedMs = 0) => {
    if (!progress) return;
    progress.classList.remove("running", "resuming");
    progress.style.animationDuration = "";
    progress.style.transform = "scaleX(0)";
    void progress.offsetWidth;
    if (elapsedMs > 0) {
      progress.style.transform = `scaleX(${Math.min(0.99, elapsedMs / intervalMs)})`;
      progress.style.animationDuration = `${Math.max(1, intervalMs - elapsedMs)}ms`;
      progress.classList.add("resuming");
    } else {
      progress.classList.add("running");
    }
  };

  const moveHighlight = (step, resetTimer = true) => {
    state.highlightIndex = (state.highlightIndex + step + cards.length) % cards.length;
    centerActiveCard();
    restartProgress();
    if (resetTimer) scheduleNext(intervalMs);
  };

  const advance = () => {
    moveHighlight(1, false);
  };

  const scheduleNext = (delayMs) => {
    clearTimeout(state.highlightTimer.timeoutId);
    clearInterval(state.highlightTimer.intervalId);
    state.highlightTimer.timeoutId = setTimeout(() => {
      advance();
      state.highlightTimer.intervalId = setInterval(advance, intervalMs);
    }, Math.max(1, delayMs));
  };

  prevButton?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    moveHighlight(-1);
  });
  nextButton?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    moveHighlight(1);
  });

  centerActiveCard();
  const elapsedMs = now % intervalMs;
  restartProgress(elapsedMs);
  scheduleNext(intervalMs - elapsedMs);
}

function clearHighlightCarouselTimer() {
  if (state.highlightTimer && typeof state.highlightTimer === "object") {
    clearTimeout(state.highlightTimer.timeoutId);
    clearInterval(state.highlightTimer.intervalId);
  } else {
    clearTimeout(state.highlightTimer);
    clearInterval(state.highlightTimer);
  }
  state.highlightTimer = null;
}

function clearImageBatchLoading() {
  state.imageBatchObserver?.disconnect();
  state.imageBatchObserver = null;
  if (state.imageBatchScrollHandler) {
    window.removeEventListener("scroll", state.imageBatchScrollHandler);
    state.imageBatchScrollHandler = null;
  }
  state.detailImages = [];
  state.renderedImageCount = 0;
  state.mediaPaging = null;
}

function renderModels() {
  renderCrumbs();
  if (!state.searchQuery) {
    recordAccessLog({ type: "home", title: text.home, model: "", work: "", pathParts: [] });
  }

  if (!state.gallery.models.length) {
    renderEmpty(text.noImages);
    return;
  }

  if (state.searchQuery && state.galleryMode === "sqlite") {
    renderSqliteSearchResults();
    return;
  }

  if (state.searchQuery) {
    const models = sortModels(state.gallery.models.filter((model) => matchesSearch([model.name, model.folder, model.id])));
    const workResults = sortSearchWorkResults(collectAllSearchWorks().filter(({ work }) => matchesSearch([work.title, work.folder, work.id])));
    const hasResults = models.length || workResults.length;

    view.innerHTML = `
      <div class="search-summary">${escapeHtml(state.searchQuery)} / ${models.length} ${text.modelUnit} / ${workResults.length} ${text.works}</div>
      ${hasResults ? `
        ${models.length ? `<section class="search-section"><h2>模特</h2>${renderModelGrid(models)}</section>` : ""}
        ${workResults.length ? `<section class="search-section"><h2>作品</h2>${renderSearchWorkGrid(workResults)}</section>` : ""}
      ` : `<div class="empty-state">${text.noSearchResults}</div>`}
    `;
    return;
  }

  view.innerHTML = `
    ${renderHighlightCarousel()}
    ${renderFavorites()}
    ${renderRecentViews()}
    ${renderModelGrid(sortModels(state.gallery.models))}
  `;
  setupHighlightCarousel();
  bindFavoriteButtons();
}

function renderWorks(model) {
  renderCrumbs(model);
  recordAccessLog({ type: "model", title: model.name, model: model.name, work: "", pathParts: [model.id] });

  if (!model.works.length && ((model.images || []).length || (model.videos || []).length)) {
    recordRecentView({
      title: model.name,
      meta: modelMeta(model),
      hash: encodeHash([model.id]),
      cover: mediaCover(model.cover, model.images || [], model.videos || []),
    });
    renderMediaDetail({
      title: model.name,
      meta: modelMeta(model),
      actions: favoriteButtonHtml(modelFavoriteItem(model)),
      images: model.images || [],
      videos: model.videos || [],
      poster: model.cover,
      emptyMessage: text.detailEmpty,
    });
    return;
  }

  if (!model.works.length) {
    view.innerHTML = `
      <section class="detail-header">
        <div class="title-row">
          <h1 class="view-title">Tag: ${escapeHtml(model.name)}</h1>
          ${favoriteButtonHtml(modelFavoriteItem(model))}
        </div>
      </section>
      <div class="empty-state">${model.name}${text.noWorksSuffix}</div>
    `;
    bindFavoriteButtons();
    return;
  }

  const workResults = state.searchQuery
    ? sortSearchWorkResults(collectSearchWorks(model).filter(({ work }) => matchesSearch([work.title, work.folder, work.id])))
    : [];

  view.innerHTML = `
    <section class="detail-header">
      <div class="title-row">
        <h1 class="view-title">Tag: ${escapeHtml(model.name)}</h1>
        ${favoriteButtonHtml(modelFavoriteItem(model))}
      </div>
    </section>
    ${state.searchQuery ? `
      <div class="search-summary">${escapeHtml(state.searchQuery)} / ${workResults.length} ${text.works}</div>
      ${workResults.length ? renderSearchWorkGrid(workResults) : `<div class="empty-state">${text.noSearchResults}</div>`}
    ` : renderWorkGrid(model, sortWorks(model.works), [model.id])}
  `;
  bindFavoriteButtons();
}

function renderCollection(collection) {
  renderCollectionCrumbs(collection);
  const parts = collection.pathParts || collection.id.split("/");
  recordAccessLog({
    type: collection.level <= 1 ? "model" : "collection",
    title: collection.title,
    model: titleFromName(parts[0] || collection.title || ""),
    work: parts.length > 1 ? collection.title : "",
    pathParts: parts,
  });

  const children = sortWorks(collection.children || []);
  const images = collection.images || [];
  const videos = collection.videos || [];
  const hasChildren = children.length > 0;
  const hasMedia = images.length > 0 || videos.length > 0;
  const favorite = favoriteButtonHtml(collectionFavoriteItem(collection));

  if (!hasChildren && hasMedia) {
    recordRecentView({
      title: collection.title,
      meta: collectionMeta(collection),
      hash: encodeHash(collection.pathParts || collection.id.split("/")),
      cover: mediaCover(collection.coverThumb || collection.cover, images, videos),
    });
    renderMediaDetail({
      title: collection.level === 1 ? `Tag: ${collection.title}` : collection.title,
      meta: collectionMeta(collection),
      actions: favorite,
      images,
      videos,
      poster: collection.cover,
      emptyMessage: text.detailEmpty,
      paging: state.galleryMode === "sqlite" && collection.imageCount > images.length ? {
        collectionId: collection.id,
        loaded: collection.mediaLoaded || (images.length + videos.length),
        total: collection.mediaTotal,
        limit: collection.mediaPageLimit || 120,
      } : null,
    });
    return;
  }

  if (!hasChildren && !hasMedia) {
    view.innerHTML = `
      <section class="detail-header">
        <div class="title-row">
          <h1 class="view-title">${collection.level === 1 ? `Tag: ${escapeHtml(collection.title)}` : escapeHtml(collection.title)}</h1>
          ${favorite}
        </div>
      </section>
      <div class="empty-state">${escapeHtml(collection.title)}${text.noWorksSuffix}</div>
    `;
    bindFavoriteButtons();
    return;
  }

  const mediaFilter = videos.length ? state.mediaFilter : "all";
  const showImages = mediaFilter === "all" || mediaFilter === "images";
  const showVideos = mediaFilter === "all" || mediaFilter === "videos";
  const visibleImages = showImages ? images : [];
  const visibleVideos = showVideos ? videos : [];
  state.detailImages = visibleImages;
  state.lightboxImages = visibleImages.map((image) => image.src);

  view.innerHTML = `
    <section class="detail-header">
      <div class="title-row">
        <h1 class="view-title">${collection.level === 1 ? `Tag: ${escapeHtml(collection.title)}` : escapeHtml(collection.title)}</h1>
        ${favorite}
      </div>
      <div class="detail-meta">${escapeHtml(collectionMeta(collection))}</div>
      ${videos.length ? renderMediaFilter({ videos }) : ""}
    </section>
    ${hasChildren ? renderCollectionGrid(children) : ""}
    ${hasChildren && hasMedia ? `<section class="collection-media-section">` : ""}
    ${hasMedia ? `${renderVideos(visibleVideos, collection.cover)}${renderImages(visibleImages)}` : ""}
    ${hasChildren && hasMedia ? `</section>` : ""}
  `;
  bindDetailMediaControls(mediaFilter);
  bindFavoriteButtons();
}

function renderWorkGrid(model, works, pathParts) {
  return `
    <div class="grid">
      ${works
        .map(
          (work) => `
            <a class="work-card" href="${encodeHash([...pathParts, work.folder])}">
              <div class="cover">
                ${coverHtml(work.coverThumb || work.cover, work.title)}
                <span class="badge">${escapeHtml(model.name)}</span>
              </div>
              <div class="work-info">
                <h2 class="work-title">${escapeHtml(work.title)}</h2>
                <div class="meta"><span>${workMeta(work)}</span></div>
              </div>
            </a>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderCollectionGrid(collections) {
  return `
    <div class="grid">
      ${collections
        .map(
          (collection) => `
            <a class="work-card" href="${encodeHash(collection.pathParts || collection.id.split("/"))}">
              <div class="cover">
                ${coverHtml(collection.coverThumb || collection.cover, collection.title)}
                <span class="badge">${escapeHtml(collection.pathParts?.[0] ? titleFromName(collection.pathParts[0]) : collection.title)}</span>
              </div>
              <div class="work-info">
                <h2 class="work-title">${escapeHtml(collection.title)}</h2>
                <div class="meta"><span>${collectionMeta(collection)}</span></div>
              </div>
            </a>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderMediaFilter(work) {
  const videos = work.videos || [];
  if (!videos.length) return "";

  return `
    <div class="media-filter" aria-label="${text.media}">
      <span>${text.media}</span>
      <button type="button" data-media-filter="all">${text.all}</button>
      <button type="button" data-media-filter="images">${text.imagesOnly}</button>
      <button type="button" data-media-filter="videos">${text.videosOnly}</button>
    </div>
  `;
}

function renderVideos(videos, poster) {
  if (!videos.length) return "";
  return `
    <div class="video-stack">
      ${videos
        .map(
          (video) => `
            <figure class="video-item">
              <video ${state.lazyLoading ? `data-src="${video.src}" preload="none"` : `src="${video.src}" preload="metadata"`} ${video.poster || poster ? `poster="${video.poster || poster}"` : ""} controls></video>
              <figcaption>
                <span>${escapeHtml(video.title)}</span>
                ${videoMeta(video) ? `<small>${escapeHtml(videoMeta(video))}</small>` : ""}
              </figcaption>
            </figure>
          `,
        )
        .join("")}
    </div>
  `;
}

const imageBatchSize = 50;

function renderImageButtons(images, startIndex = 0) {
  return images
    .map(
      (image, index) => `
        <button type="button" data-image-index="${startIndex + index}">
          <img src="${image.previewThumb || image.thumb || image.src}" alt="${escapeHtml(image.title)}" loading="${state.lazyLoading ? "lazy" : "eager"}" />
        </button>
      `,
    )
    .join("");
}

function renderImages(images, hasMoreRemoteMedia = false) {
  if (!images.length) return "";
  const initialImages = state.lazyLoading ? images.slice(0, imageBatchSize) : images;
  state.renderedImageCount = initialImages.length;
  return `
    <div class="photo-stack">
      ${renderImageButtons(initialImages)}
    </div>
    ${images.length > state.renderedImageCount || hasMoreRemoteMedia ? `<div class="image-batch-sentinel" id="imageBatchSentinel" aria-hidden="true"></div>` : ""}
  `;
}

function bindDetailMediaControls(filter) {
  view.querySelectorAll("[data-media-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mediaFilter === filter);
    button.addEventListener("click", () => setMediaFilter(button.dataset.mediaFilter));
  });

  view.querySelectorAll("[data-image-index]").forEach((button) => {
    button.addEventListener("click", () => openLightbox(Number(button.dataset.imageIndex)));
  });

  setupImageBatchLoading();

  view.querySelectorAll("video[data-src]").forEach((video) => {
    const loadVideo = () => {
      if (!video.src) {
        video.src = video.dataset.src;
        video.load();
      }
    };

    video.addEventListener("pointerdown", loadVideo, { once: true });
    video.addEventListener("play", loadVideo, { once: true });
  });
}

function bindImageButtons(container) {
  container.querySelectorAll("[data-image-index]").forEach((button) => {
    button.addEventListener("click", () => openLightbox(Number(button.dataset.imageIndex)));
  });
}

async function appendRemoteMediaPage() {
  const paging = state.mediaPaging;
  if (!paging || paging.loading || paging.loaded >= paging.total) return false;
  paging.loading = true;
  try {
    const media = await fetchSqliteMediaPage(paging.collectionId, paging.loaded, paging.limit);
    const rawItems = media.items || [];
    const newImages = rawItems.filter((item) => item.type === "image").map(sqliteMediaToGalleryMedia).filter(Boolean);
    const newVideos = rawItems.filter((item) => item.type === "video").map(sqliteMediaToGalleryMedia).filter(Boolean);
    const collection = state.sqliteCollections.get(paging.collectionId);
    if (collection) {
      collection.images = [...(collection.images || []), ...newImages];
      collection.videos = [...(collection.videos || []), ...newVideos];
      collection.mediaLoaded = (collection.mediaLoaded || 0) + rawItems.length;
      cacheSqliteCollection(collection);
    }
    state.detailImages.push(...newImages);
    state.lightboxImages.push(...newImages.map((image) => image.src));
    paging.loaded += rawItems.length;
    paging.total = media.total || paging.total;
    paging.loading = false;
    return newImages.length > 0 || newVideos.length > 0;
  } catch (error) {
    paging.loading = false;
    return false;
  }
}

function appendImageBatch() {
  const stack = view.querySelector(".photo-stack");
  const sentinel = view.querySelector("#imageBatchSentinel");
  if (!stack || !sentinel) return;

  const nextImages = state.detailImages.slice(state.renderedImageCount, state.renderedImageCount + imageBatchSize);
  if (!nextImages.length) {
    if (state.mediaPaging && state.mediaPaging.loaded < state.mediaPaging.total) {
      appendRemoteMediaPage().then((appended) => {
        if (appended) appendImageBatch();
      });
      return;
    }
    state.imageBatchObserver?.disconnect();
    state.imageBatchObserver = null;
    if (state.imageBatchScrollHandler) {
      window.removeEventListener("scroll", state.imageBatchScrollHandler);
      state.imageBatchScrollHandler = null;
    }
    sentinel.remove();
    return;
  }

  const fragment = document.createElement("template");
  fragment.innerHTML = renderImageButtons(nextImages, state.renderedImageCount);
  const nodes = fragment.content;
  bindImageButtons(nodes);
  stack.append(nodes);
  state.renderedImageCount += nextImages.length;

  if (state.renderedImageCount >= state.detailImages.length && (!state.mediaPaging || state.mediaPaging.loaded >= state.mediaPaging.total)) {
    state.imageBatchObserver?.disconnect();
    state.imageBatchObserver = null;
    if (state.imageBatchScrollHandler) {
      window.removeEventListener("scroll", state.imageBatchScrollHandler);
      state.imageBatchScrollHandler = null;
    }
    sentinel.remove();
  }
}

function setupImageBatchLoading() {
  state.imageBatchObserver?.disconnect();
  state.imageBatchObserver = null;
  if (state.imageBatchScrollHandler) {
    window.removeEventListener("scroll", state.imageBatchScrollHandler);
    state.imageBatchScrollHandler = null;
  }

  const sentinel = view.querySelector("#imageBatchSentinel");
  if (!sentinel || state.renderedImageCount >= state.detailImages.length) return;

  if (!("IntersectionObserver" in window)) {
    state.imageBatchScrollHandler = () => {
      const sentinelRect = sentinel.getBoundingClientRect();
      if (sentinelRect.top < window.innerHeight + 900) appendImageBatch();
    };
    window.addEventListener("scroll", state.imageBatchScrollHandler, { passive: true });
    return;
  }

  state.imageBatchObserver = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) appendImageBatch();
  }, { rootMargin: "900px 0px" });
  state.imageBatchObserver.observe(sentinel);
}

function renderMediaDetail({ title, meta, actions = "", images, videos, poster, emptyMessage, paging = null }) {
  const hasVideos = videos.length > 0;
  const filter = hasVideos ? state.mediaFilter : "all";
  const showImages = filter === "all" || filter === "images";
  const showVideos = filter === "all" || filter === "videos";
  const visibleImages = showImages ? images : [];
  const visibleVideos = showVideos ? videos : [];
  state.detailImages = visibleImages;
  state.lightboxImages = visibleImages.map((image) => image.src);
  state.mediaPaging = paging && showImages ? { ...paging, loading: false } : null;

  const message = filter === "videos" ? text.noVideosInFilter : filter === "images" ? text.noImagesInFilter : emptyMessage;

  view.innerHTML = `
    <section class="detail-header">
      <div class="title-row">
        <h1 class="view-title">${escapeHtml(title)}</h1>
        ${actions}
      </div>
      <div class="detail-meta">${escapeHtml(meta)}</div>
      ${renderMediaFilter({ videos })}
    </section>
    ${visibleVideos.length || visibleImages.length ? `${renderVideos(visibleVideos, poster)}${renderImages(visibleImages, Boolean(state.mediaPaging))}` : `<div class="empty-state">${message}</div>`}
  `;

  bindDetailMediaControls(filter);
  bindFavoriteButtons();
}

function renderDetail(model, work) {
  renderCrumbs(model, work);

  const images = work.images || [];
  const videos = work.videos || [];
  const childWorks = work.works || [];

  if (!images.length && !videos.length && childWorks.length) {
    view.innerHTML = `
      <section class="detail-header">
        <div class="title-row">
          <h1 class="view-title">${escapeHtml(work.title)}</h1>
          ${favoriteButtonHtml(workFavoriteItem(model, work))}
        </div>
        <div class="detail-meta">${escapeHtml(model.name)} / ${childWorks.length} ${text.works}</div>
      </section>
      ${renderWorkGrid(model, sortWorks(childWorks), work.id.split("/"))}
    `;
    bindFavoriteButtons();
    return;
  }

  recordRecentView({
    title: work.title,
    meta: `${model.name} / ${workMeta(work)}`,
    hash: encodeHash(work.id.split("/")),
    cover: mediaCover(work.cover, images, videos),
  });
  renderMediaDetail({
    title: work.title,
    meta: `${model.name} / ${workMeta(work)}`,
    actions: favoriteButtonHtml(workFavoriteItem(model, work)),
    images,
    videos,
    poster: work.cover,
    emptyMessage: text.detailEmpty,
  });
}

function renderEmpty(message) {
  view.innerHTML = `<div class="empty-state">${message}</div>`;
}

function render() {
  restoreToolbarSettings();
  clearHighlightCarouselTimer();
  clearImageBatchLoading();
  updateSortToggle();

  if (duplicateHashRoute()) {
    renderEmpty(text.refreshing);
    ensureDuplicatePage();
    return;
  }

  if (settingsHashRoute()) {
    renderEmpty(text.refreshing);
    ensureSettingsPage();
    return;
  }

  const { modelId, workId } = parseRoute();
  const routeParts = modelId ? [modelId, ...workId] : [];

  if (state.searchQuery && state.galleryMode === "sqlite") {
    renderCrumbs();
    renderSqliteSearchResults();
    return;
  }

  if (renderSqliteRoute(routeParts)) return;

  if (modelId && Array.isArray(state.gallery.collections)) {
    const collection = collectionByPath(routeParts);
    if (collection) {
      renderCollection(collection);
      return;
    }
  }

  const model = modelById(modelId);
  const work = workById(model, workId);

  if (!modelId) {
    renderModels();
    return;
  }

  if (!model) {
    renderCrumbs();
    renderEmpty(text.modelMissing);
    return;
  }

  if (!workId.length) {
    renderWorks(model);
    return;
  }

  if (!work) {
    renderCrumbs(model);
    renderEmpty(text.workMissing);
    return;
  }

  renderDetail(model, work);
}

function openLightbox(index) {
  state.lightboxIndex = index;
  updateLightbox();
  lightbox.classList.add("open");
  lightbox.setAttribute("aria-hidden", "false");
  showLightboxControls();
}

function updateLightbox() {
  const src = state.lightboxImages[state.lightboxIndex];
  lightboxImage.src = src || "";
  resetLightboxZoom();
}

function stepLightbox(direction) {
  if (!state.lightboxImages.length) return;
  state.lightboxIndex = (state.lightboxIndex + direction + state.lightboxImages.length) % state.lightboxImages.length;
  updateLightbox();
  showLightboxControls();
}

function hideLightbox() {
  lightbox.classList.remove("open");
  lightbox.classList.remove("controls-hidden", "dragging");
  lightbox.setAttribute("aria-hidden", "true");
  lightboxImage.src = "";
  clearTimeout(state.lightboxControlsTimer);
  resetLightboxZoom();
}

function clampLightboxScale(value) {
  return Math.min(5, Math.max(1, value));
}

function clampLightboxPan() {
  if (state.lightboxScale <= 1) {
    state.lightboxX = 0;
    state.lightboxY = 0;
    return;
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const scaledWidth = lightboxImage.offsetWidth * state.lightboxScale;
  const scaledHeight = lightboxImage.offsetHeight * state.lightboxScale;
  if (!scaledWidth || !scaledHeight) return;

  if (scaledWidth > viewportWidth) {
    const maxX = (scaledWidth - viewportWidth) / 2;
    state.lightboxX = Math.min(maxX, Math.max(-maxX, state.lightboxX));
  } else {
    state.lightboxX = 0;
  }

  if (scaledHeight > viewportHeight) {
    const maxY = (scaledHeight - viewportHeight) / 2;
    state.lightboxY = Math.min(maxY, Math.max(-maxY, state.lightboxY));
  } else {
    state.lightboxY = 0;
  }
}

function applyLightboxTransform() {
  clampLightboxPan();
  lightboxImage.style.transform = `translate(${state.lightboxX}px, ${state.lightboxY}px) scale(${state.lightboxScale})`;
  lightbox.classList.toggle("zoomed", state.lightboxScale > 1);
}

function resetLightboxZoom() {
  state.lightboxScale = 1;
  state.lightboxX = 0;
  state.lightboxY = 0;
  state.lightboxPointerId = null;
  state.lightboxDragging = false;
  lightbox.classList.remove("zoomed", "dragging");
  applyLightboxTransform();
}

function zoomLightbox(factor) {
  const nextScale = clampLightboxScale(state.lightboxScale * factor);
  state.lightboxScale = nextScale;
  if (nextScale === 1) {
    state.lightboxX = 0;
    state.lightboxY = 0;
  }
  applyLightboxTransform();
  showLightboxControls();
}

function handleLightboxWheel(event) {
  if (!lightbox.classList.contains("open")) return;
  event.preventDefault();
  zoomLightbox(event.deltaY < 0 ? 1.12 : 1 / 1.12);
}

function showLightboxControls() {
  if (!lightbox.classList.contains("open")) return;
  lightbox.classList.remove("controls-hidden");
  clearTimeout(state.lightboxControlsTimer);
  state.lightboxControlsTimer = setTimeout(() => {
    lightbox.classList.add("controls-hidden");
  }, 5000);
}

function startLightboxDrag(event) {
  showLightboxControls();
  if (state.lightboxScale <= 1) return;
  event.preventDefault();
  state.lightboxDragging = true;
  state.lightboxPointerId = event.pointerId;
  state.lightboxDragStartX = event.clientX;
  state.lightboxDragStartY = event.clientY;
  state.lightboxDragOriginX = state.lightboxX;
  state.lightboxDragOriginY = state.lightboxY;
  lightbox.classList.add("dragging");
  lightboxImage.setPointerCapture(event.pointerId);
}

function moveLightboxDrag(event) {
  showLightboxControls();
  if (!state.lightboxDragging || state.lightboxPointerId !== event.pointerId) return;
  state.lightboxX = state.lightboxDragOriginX + event.clientX - state.lightboxDragStartX;
  state.lightboxY = state.lightboxDragOriginY + event.clientY - state.lightboxDragStartY;
  applyLightboxTransform();
}

function endLightboxDrag(event) {
  if (state.lightboxPointerId !== event.pointerId) return;
  state.lightboxDragging = false;
  state.lightboxPointerId = null;
  lightbox.classList.remove("dragging");
  showLightboxControls();
}

async function openCurrentImagePath() {
  const src = state.lightboxImages[state.lightboxIndex];
  if (!src) return;
  showLightboxControls();
  await openImagePathBySrc(src);
}

async function openImagePathBySrc(src) {
  if (!src) return;
  try {
    const response = await fetch("/api/open-photo-path", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ src }),
    });

    if (!response.ok) {
      const message = await response.text();
      alert(message || "\u65e0\u6cd5\u6253\u5f00\u56fe\u7247\u5b58\u653e\u8def\u5f84\u3002");
    }
  } catch (error) {
    alert("\u65e0\u6cd5\u6253\u5f00\u56fe\u7247\u5b58\u653e\u8def\u5f84\u3002");
  }
}

columnButtons.forEach((button) => {
  button.addEventListener("click", () => setColumns(Number(button.dataset.columns)));
});

coverFitToggle.addEventListener("click", () => setCoverFit(state.coverFit === "original" ? "crop" : "original"));

lazyLoadingToggle.addEventListener("click", () => setLazyLoading(!state.lazyLoading));
themeToggle.addEventListener("click", () => setTheme(state.theme === "night" ? "day" : "night"));
searchBox.addEventListener("input", () => setSearchQuery(searchBox.value));
searchBox.addEventListener("search", () => setSearchQuery(searchBox.value));
sortToggle.addEventListener("click", cycleSortMode);

refreshButton.addEventListener("click", startBackgroundScan);
topButton.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
window.addEventListener("hashchange", render);
closeLightbox.addEventListener("click", hideLightbox);
prevImage.addEventListener("click", () => stepLightbox(-1));
nextImage.addEventListener("click", () => stepLightbox(1));
zoomOutImage.addEventListener("click", () => zoomLightbox(1 / 1.25));
zoomResetImage.addEventListener("click", () => {
  resetLightboxZoom();
  showLightboxControls();
});
zoomInImage.addEventListener("click", () => zoomLightbox(1.25));
openImagePath.addEventListener("click", openCurrentImagePath);
lightbox.addEventListener("click", (event) => {
  if (event.target === lightbox) hideLightbox();
});
lightbox.addEventListener("wheel", handleLightboxWheel, { passive: false });
lightbox.addEventListener("pointermove", showLightboxControls);
lightbox.addEventListener("pointerdown", showLightboxControls);
lightboxImage.addEventListener("pointerdown", startLightboxDrag);
lightboxImage.addEventListener("pointermove", moveLightboxDrag);
lightboxImage.addEventListener("pointerup", endLightboxDrag);
lightboxImage.addEventListener("pointercancel", endLightboxDrag);
window.addEventListener("keydown", (event) => {
  if (!lightbox.classList.contains("open")) return;
  showLightboxControls();
  if (event.key === "Escape") hideLightbox();
  if (event.key === "ArrowLeft") stepLightbox(-1);
  if (event.key === "ArrowRight") stepLightbox(1);
  if (event.key === "+" || event.key === "=") zoomLightbox(1.25);
  if (event.key === "-") zoomLightbox(1 / 1.25);
  if (event.key === "0") {
    resetLightboxZoom();
    showLightboxControls();
  }
});

setColumns(state.columns);
setCoverFit(state.coverFit);
setMediaFilter(state.mediaFilter, false);
setLazyLoading(state.lazyLoading, false);
setTheme(state.theme);
setSortMode("models", state.modelSort, false);
setSortMode("works", state.workSort, false);
if (versionFooter) versionFooter.textContent = `版本 ${APP_VERSION}`;

(async () => {
  await loadUserMarks();
  await loadGallery(false);
})();
