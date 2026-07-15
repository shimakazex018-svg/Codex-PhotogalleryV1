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

const APP_VERSION = "v88";
const DUPLICATE_RECYCLE_LIMIT = 50000;
const HOME_COLLECTION_LIMIT = 40;
const MEDIA_PAGE_LIMIT = 40;
const LIGHTBOX_PRELOAD_AHEAD_COUNT = 3;
const LIGHTBOX_PRELOAD_CONCURRENCY = 2;
const LIGHTBOX_PRELOAD_CACHE_LIMIT = 5;
const LIGHTBOX_DEBUG_STORAGE_KEY = "galleryLightboxDebug";
const LIGHTBOX_PRIORITY = Object.freeze({ current: 0, next: 1, predicted: 3 });
const SCROLL_STATE_STORAGE_KEY = "galleryScrollStatesV1";
const SCROLL_STATE_LIMIT = 75;
const SCROLL_SAVE_DELAY_MS = 150;
const SCROLL_RESTORE_TIMEOUT_MS = 2500;
const HEIC_COMPATIBILITY_COLLECTION_ID = "杏子yada/亮点";
const IMAGE_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 10'%3E%3Crect width='16' height='10' fill='%23e4e7eb'/%3E%3C/svg%3E";

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
  accessLogsLoaded: false,
  accessLogError: "",
  accessLogPage: 1,
  accessLogPageSize: 50,
  accessLogTotal: 0,
  accessLogTotalPages: 0,
  mediaCleanupStatus: null,
  mediaCleanupResults: { items: [], total: 0, page: 1, pageSize: 50 },
  mediaCleanupKind: "non-media",
  mediaCleanupCategory: "",
  mediaCleanupSearch: "",
  mediaCleanupSort: "path",
  mediaCleanupDirection: "asc",
  mediaCleanupPollTimer: null,
  mediaCleanupLoading: false,
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
  recentViewsLoaded: false,
  favoritesLoaded: false,
  userMarksError: "",
  searchQuery: "",
  highlightIndex: 0,
  highlightTimer: null,
  lightboxImages: [],
  lightboxUseCompatibilityPreview: false,
  lightboxRenderToken: 0,
  detailImages: [],
  renderedImageCount: 0,
  imageBatchObserver: null,
  imageBatchScrollHandler: null,
  lazyImageObserver: null,
  pageAbortController: null,
  searchAbortController: null,
  routeGeneration: 0,
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
  scrollPositions: new Map(),
  activeScrollRouteKey: "",
  scrollNavigationIntent: "new",
  pendingScrollNavigationIntent: null,
  scrollRestoreToken: 0,
  scrollSaveTimer: null,
  backToTopAnimationFrameId: null,
};

const view = document.querySelector("#view");
const statusEl = document.querySelector("#status");
const crumbs = document.querySelector("#crumbs");
const refreshButton = document.querySelector("#refreshButton");
const topButton = document.querySelector("#topButton");
const backToTopButton = document.querySelector("#backToTopButton");
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

function currentScrollRouteKey() {
  const hash = location.hash || "#/";
  return [
    hash,
    `q=${encodeURIComponent(state.searchQuery)}`,
    `filter=${state.mediaFilter}`,
    `modelSort=${state.modelSort}`,
    `workSort=${state.workSort}`,
  ].join("|");
}

function searchQueryFromHistoryState(historyState = history.state) {
  if (!historyState || typeof historyState !== "object") return "";
  return normalizeSearch(historyState.gallerySearchQuery || "");
}

function replaceHistorySearchQuery(query) {
  const currentState = history.state && typeof history.state === "object" ? history.state : {};
  history.replaceState({ ...currentState, gallerySearchQuery: normalizeSearch(query) }, "");
}

function applyHistorySearchQuery(historyState = history.state) {
  const query = searchQueryFromHistoryState(historyState);
  state.searchQuery = query;
  state.sqliteSearch = { query, loading: false, collections: [], media: [] };
  if (searchBox) searchBox.value = query;
}

function isValidScrollSnapshot(item) {
  return Boolean(
    item
      && typeof item.routeKey === "string"
      && item.routeKey.length <= 2048
      && Number.isFinite(item.scrollY)
      && item.scrollY >= 0
      && (item.anchorKey === null || (typeof item.anchorKey === "string" && item.anchorKey.length <= 4096))
      && Number.isFinite(item.anchorOffset)
      && Number.isFinite(item.renderedCount)
      && Number.isFinite(item.savedAt),
  );
}

function loadScrollPositions() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(SCROLL_STATE_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return new Map();
    return new Map(
      parsed
        .filter(isValidScrollSnapshot)
        .sort((a, b) => b.savedAt - a.savedAt)
        .slice(0, SCROLL_STATE_LIMIT)
        .map((item) => [item.routeKey, item]),
    );
  } catch (error) {
    return new Map();
  }
}

function persistScrollPositions() {
  try {
    const snapshots = [...state.scrollPositions.values()]
      .filter(isValidScrollSnapshot)
      .sort((a, b) => b.savedAt - a.savedAt)
      .slice(0, SCROLL_STATE_LIMIT);
    state.scrollPositions = new Map(snapshots.map((item) => [item.routeKey, item]));
    sessionStorage.setItem(SCROLL_STATE_STORAGE_KEY, JSON.stringify(snapshots));
  } catch (error) {
    // sessionStorage can be unavailable or full; in-memory restoration remains usable.
  }
}

function stableScrollAnchor(type, value) {
  return `${type}:${String(value || "")}`;
}

function scrollAnchorAttribute(type, value) {
  return `data-scroll-anchor="${escapeHtml(stableScrollAnchor(type, value))}"`;
}

function findAnchorElement(anchorKey) {
  if (!anchorKey) return null;
  return [...document.querySelectorAll("[data-scroll-anchor]")]
    .find((element) => element.dataset.scrollAnchor === anchorKey) || null;
}

function visibleScrollAnchor() {
  const candidates = [...document.querySelectorAll("[data-scroll-anchor]")]
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) => rect.bottom > 0 && rect.top < window.innerHeight);
  if (!candidates.length) return null;
  candidates.sort((a, b) => Math.abs(a.rect.top) - Math.abs(b.rect.top));
  return candidates[0];
}

function captureScrollSnapshot(routeKey = state.activeScrollRouteKey || currentScrollRouteKey()) {
  if (!routeKey) return null;
  const anchor = visibleScrollAnchor();
  const paging = state.mediaPaging;
  return {
    routeKey,
    scrollY: Math.max(0, window.scrollY || window.pageYOffset || 0),
    anchorKey: anchor?.element.dataset.scrollAnchor || null,
    anchorOffset: anchor?.rect.top || 0,
    renderedCount: Math.max(0, Number(state.renderedImageCount || 0)),
    cursor: paging ? Math.max(0, Number(paging.loaded || 0)) : null,
    paging: paging ? {
      loaded: Math.max(0, Number(paging.loaded || 0)),
      total: Math.max(0, Number(paging.total || 0)),
      limit: Math.max(1, Number(paging.limit || MEDIA_PAGE_LIMIT)),
    } : null,
    savedAt: Date.now(),
  };
}

function saveCurrentScrollPosition(persist = false) {
  if (state.scrollSaveTimer) {
    clearTimeout(state.scrollSaveTimer);
    state.scrollSaveTimer = null;
  }
  const snapshot = captureScrollSnapshot();
  if (snapshot) state.scrollPositions.set(snapshot.routeKey, snapshot);
  if (persist) persistScrollPositions();
}

function scheduleScrollPositionSave() {
  clearTimeout(state.scrollSaveTimer);
  state.scrollSaveTimer = setTimeout(() => {
    state.scrollSaveTimer = null;
    const snapshot = captureScrollSnapshot();
    if (snapshot) state.scrollPositions.set(snapshot.routeKey, snapshot);
  }, SCROLL_SAVE_DELAY_MS);
}

function cancelBackToTopAnimation() {
  if (state.backToTopAnimationFrameId !== null) {
    cancelAnimationFrame(state.backToTopAnimationFrameId);
    state.backToTopAnimationFrameId = null;
  }
  backToTopButton?.classList.remove("back-to-top--animating");
}

function cancelScrollRestoration() {
  state.scrollRestoreToken += 1;
}

function routeDepth(hash) {
  return String(hash || "#/").replace(/^#\/?/, "").split("/").filter(Boolean).length;
}

function prepareScrollNavigation(intent) {
  cancelBackToTopAnimation();
  cancelScrollRestoration();
  state.scrollNavigationIntent = intent === "restore" ? "restore" : "new";
  state.activeScrollRouteKey = currentScrollRouteKey();
  if (state.scrollNavigationIntent === "new") window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

function nextAnimationFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

async function ensureSavedMediaDepth(snapshot, token, deadline) {
  const targetRendered = Math.max(0, Number(snapshot.renderedCount || 0));
  while (state.renderedImageCount < targetRendered && performance.now() < deadline && token === state.scrollRestoreToken) {
    if (state.renderedImageCount < state.detailImages.length) {
      appendImageBatch();
      await nextAnimationFrame();
      continue;
    }
    const paging = state.mediaPaging;
    const targetCursor = Math.max(targetRendered, Number(snapshot.cursor || snapshot.paging?.loaded || 0));
    if (paging && paging.loaded < paging.total && paging.loaded < targetCursor) {
      const before = paging.loaded;
      await appendRemoteMediaPage();
      if (paging.loaded <= before) break;
      continue;
    }
    break;
  }
}

async function restoreSavedScrollPosition(token) {
  const routeKey = state.activeScrollRouteKey;
  const snapshot = state.scrollPositions.get(routeKey);
  if (!snapshot || token !== state.scrollRestoreToken) return;

  await nextAnimationFrame();
  await nextAnimationFrame();
  const deadline = performance.now() + SCROLL_RESTORE_TIMEOUT_MS;
  await ensureSavedMediaDepth(snapshot, token, deadline);

  if (token !== state.scrollRestoreToken) return;
  const anchor = findAnchorElement(snapshot.anchorKey);
  if (anchor) {
    const delta = anchor.getBoundingClientRect().top - snapshot.anchorOffset;
    window.scrollTo({ top: Math.max(0, window.scrollY + delta), left: 0, behavior: "auto" });
    await nextAnimationFrame();
    const correction = anchor.getBoundingClientRect().top - snapshot.anchorOffset;
    if (Math.abs(correction) > 1) window.scrollTo({ top: Math.max(0, window.scrollY + correction), left: 0, behavior: "auto" });
  } else {
    window.scrollTo({ top: snapshot.scrollY, left: 0, behavior: "auto" });
  }
  state.scrollNavigationIntent = "idle";
  saveCurrentScrollPosition();
}

function requestScrollRestoration() {
  if (state.scrollNavigationIntent !== "restore") return;
  const snapshot = state.scrollPositions.get(state.activeScrollRouteKey);
  if (!snapshot) {
    state.scrollNavigationIntent = "idle";
    return;
  }
  if (snapshot.anchorKey && !document.querySelector("[data-scroll-anchor]") && (state.sqliteLoading || state.sqliteSearch.loading)) return;
  const token = state.scrollRestoreToken;
  restoreSavedScrollPosition(token).catch(() => {});
}

function initScrollRestoration() {
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  applyHistorySearchQuery();
  state.scrollPositions = loadScrollPositions();
  const navigationType = performance.getEntriesByType?.("navigation")?.[0]?.type;
  state.scrollNavigationIntent = navigationType === "reload" ? "restore" : "new";
  state.activeScrollRouteKey = currentScrollRouteKey();

  window.addEventListener("scroll", scheduleScrollPositionSave, { passive: true });
  window.addEventListener("pagehide", () => saveCurrentScrollPosition(true));
  window.addEventListener("popstate", (event) => {
    saveCurrentScrollPosition(true);
    applyHistorySearchQuery(event.state);
    state.pendingScrollNavigationIntent = "restore";
  });
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.("a[href]");
    if (!link) return;
    const target = new URL(link.href, location.href);
    if (target.origin !== location.origin || !target.hash.startsWith("#/")) return;
    saveCurrentScrollPosition(true);
    const intent = routeDepth(target.hash) < routeDepth(location.hash) ? "restore" : "new";
    if (state.searchQuery) {
      event.preventDefault();
      replaceHistorySearchQuery(state.searchQuery);
      state.searchQuery = "";
      state.sqliteSearch = { query: "", loading: false, collections: [], media: [] };
      searchBox.value = "";
      const nextState = history.state && typeof history.state === "object" ? history.state : {};
      history.pushState({ ...nextState, gallerySearchQuery: "" }, "", target.href);
      prepareScrollNavigation(intent);
      beginPageNavigation();
      render();
      return;
    }
    if (target.hash === location.hash) return;
    state.pendingScrollNavigationIntent = intent;
  }, true);
}

function beginPageNavigation() {
  if (lightbox.classList.contains("open")) hideLightbox();
  cancelBackToTopAnimation();
  cancelScrollRestoration();
  state.pageAbortController?.abort();
  state.searchAbortController?.abort();
  state.pageAbortController = new AbortController();
  state.searchAbortController = null;
  state.sqliteLoading = null;
  state.routeGeneration += 1;
}

function initBackToTopButton() {
  if (!backToTopButton || backToTopButton.dataset.initialized === "true") return;
  backToTopButton.dataset.initialized = "true";

  const animationDurationMs = 1000;
  const scrollIdleDelayMs = 200;
  const interruptKeys = new Set(["PageDown", "PageUp", "Home", "End", "ArrowUp", "ArrowDown", " "]);
  let scrollIdleTimer = null;

  const smootherStep = (progress) => progress * progress * progress * (progress * (progress * 6 - 15) + 10);
  const finishAnimation = () => {
    cancelBackToTopAnimation();
    backToTopButton.classList.remove("back-to-top--animating");
  };
  const cancelAnimation = () => {
    if (state.backToTopAnimationFrameId === null) return;
    finishAnimation();
  };
  const markScrolling = () => {
    backToTopButton.classList.add("back-to-top--scrolling");
    clearTimeout(scrollIdleTimer);
    scrollIdleTimer = setTimeout(() => {
      backToTopButton.classList.remove("back-to-top--scrolling");
    }, scrollIdleDelayMs);
  };
  const startAnimation = () => {
    cancelScrollRestoration();
    state.scrollNavigationIntent = "idle";
    const startY = Math.max(0, window.scrollY || window.pageYOffset || 0);
    cancelAnimation();
    if (startY <= 0) {
      window.scrollTo(0, 0);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.scrollTo(0, 0);
      return;
    }

    const startedAt = performance.now();
    backToTopButton.classList.add("back-to-top--animating");
    const animate = (now) => {
      const progress = Math.min(1, Math.max(0, (now - startedAt) / animationDurationMs));
      const nextY = Math.max(0, startY * (1 - smootherStep(progress)));
      window.scrollTo(0, nextY);
      if (progress < 1) {
        state.backToTopAnimationFrameId = requestAnimationFrame(animate);
        return;
      }
      window.scrollTo(0, 0);
      finishAnimation();
      saveCurrentScrollPosition();
    };
    state.backToTopAnimationFrameId = requestAnimationFrame(animate);
  };

  window.addEventListener("scroll", markScrolling, { passive: true });
  window.addEventListener("wheel", cancelAnimation, { passive: true });
  window.addEventListener("touchstart", cancelAnimation, { passive: true });
  window.addEventListener("pointerdown", cancelAnimation, { passive: true });
  window.addEventListener("keydown", (event) => {
    if (interruptKeys.has(event.key)) cancelAnimation();
  });
  backToTopButton.addEventListener("pointerdown", () => backToTopButton.classList.add("back-to-top--interacting"));
  ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
    backToTopButton.addEventListener(eventName, () => backToTopButton.classList.remove("back-to-top--interacting"));
  });
  backToTopButton.addEventListener("click", startAnimation);
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
  if (rerender) saveCurrentScrollPosition(true);
  state.mediaFilter = nextMode;
  localStorage.setItem("galleryMediaFilter", nextMode);
  if (rerender) {
    prepareScrollNavigation("new");
    render();
  }
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
  if (rerender) saveCurrentScrollPosition(true);
  if (scope === "works") {
    state.workSort = nextMode;
    localStorage.setItem("galleryWorkSort", nextMode);
  } else {
    state.modelSort = nextMode;
    localStorage.setItem("galleryModelSort", nextMode);
  }
  updateSortToggle();
  if (rerender) {
    prepareScrollNavigation("new");
    render();
  }
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
  const previousQuery = state.searchQuery;
  const nextQuery = normalizeSearch(value);
  if (previousQuery === nextQuery) return;
  saveCurrentScrollPosition(true);
  state.searchQuery = nextQuery;
  replaceHistorySearchQuery(nextQuery);
  if (state.galleryMode === "sqlite" && state.sqliteSearch.query !== state.searchQuery) {
    state.sqliteSearch = { query: state.searchQuery, loading: false, collections: [], media: [] };
  }
  prepareScrollNavigation(previousQuery && !nextQuery ? "restore" : "new");
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
  if (route.includes("favorites")) return "favorites";
  if (route.includes("history")) return "history";
  if (route.includes("access-log")) return "access-log";
  if (route.includes("media-cleanup")) return "media-cleanup";
  return route.includes("duplicates") ? "duplicates" : "display";
}

async function loadSqliteHome(showMessage = false) {
  if (showMessage) {
    setStatus(text.refreshing);
  }

  const [payload, highlightsPayload] = await Promise.all([
    fetchJson(`/api/collections/root?limit=${HOME_COLLECTION_LIMIT}`, { signal: state.pageAbortController?.signal }),
    fetchJson("/api/highlights", { signal: state.pageAbortController?.signal }).catch((error) => {
      if (error.name === "AbortError") throw error;
      return { items: [] };
    }),
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

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options });
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

async function loadFavoriteMarks(signal = null) {
  try {
    const favoritesPayload = await fetchJson("/api/favorites", { signal });
    const favoriteItems = Array.isArray(favoritesPayload.items) ? favoritesPayload.items.filter((item) => item && item.id && item.hash && item.title).slice(0, 100) : [];
    state.favorites = favoriteItems;
    saveFavorites();
    state.userMarksError = "";
  } catch (error) {
    if (error.name === "AbortError") throw error;
    state.userMarksError = "无法从服务端读取收藏，当前显示本机缓存。";
  }
  state.favoritesLoaded = true;
}

async function loadRecentMarks(signal = null) {
  try {
    const recentPayload = await fetchJson("/api/recent", { signal });
    const recentItems = Array.isArray(recentPayload.items) ? recentPayload.items.filter((item) => item && item.hash && item.title).slice(0, 10) : [];
    state.recentViews = recentItems;
    saveRecentViews();
    state.userMarksError = "";
  } catch (error) {
    if (error.name === "AbortError") throw error;
    state.userMarksError = "无法从服务端读取观看历史，当前显示本机缓存。";
  }
  state.recentViewsLoaded = true;
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

async function loadAccessLogs(page = state.accessLogPage || 1, signal = state.pageAbortController?.signal) {
  state.accessLogsLoading = true;
  state.accessLogError = "";
  try {
    const payload = await fetchJson(`/api/access-log?page=${encodeURIComponent(page)}&pageSize=${state.accessLogPageSize}`, { signal });
    state.accessLogs = Array.isArray(payload.items) ? payload.items : [];
    const hasServerPagination = [payload.page, payload.pageSize, payload.total, payload.totalPages].every((value) => Number.isFinite(Number(value)));
    state.accessLogPage = hasServerPagination ? Number(payload.page || 1) : 1;
    state.accessLogPageSize = hasServerPagination ? Number(payload.pageSize || 50) : Math.max(state.accessLogs.length, 1);
    state.accessLogTotal = hasServerPagination ? Number(payload.total || 0) : state.accessLogs.length;
    state.accessLogTotalPages = hasServerPagination ? Number(payload.totalPages || 0) : (state.accessLogs.length ? 1 : 0);
  } catch (error) {
    if (error.name === "AbortError") throw error;
    state.accessLogs = [];
    state.accessLogError = "访问日志加载失败，请稍后重试。";
  } finally {
    state.accessLogsLoading = false;
    if (!signal?.aborted) state.accessLogsLoaded = true;
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

async function fetchSqliteMediaPage(collectionId, offset = 0, limit = MEDIA_PAGE_LIMIT, signal = state.pageAbortController?.signal) {
  const media = await fetchJson(`/api/media?collectionId=${encodeURIComponent(collectionId)}&limit=${limit}&offset=${offset}`, { signal });
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
    collection = cacheSqliteCollection(await fetchJson(`/api/collections/${parts.map(encodeURIComponent).join("/")}`, { signal: state.pageAbortController?.signal }));
  }

  if (!collection) throw new Error("collection missing");

  const hasKnownMedia = (collection.images || []).length || (collection.videos || []).length;
  const expectedMedia = (collection.imageCount || 0) + (collection.videoCount || 0);
  if (!hasKnownMedia && expectedMedia > 0) {
    const media = await fetchSqliteMediaPage(collection.id, 0, MEDIA_PAGE_LIMIT);
    const rawItems = Array.isArray(media.items) ? media.items : [];
    collection.images = rawItems.filter((item) => item.type === "image").map(sqliteMediaToGalleryMedia).filter(Boolean);
    collection.videos = rawItems.filter((item) => item.type === "video").map(sqliteMediaToGalleryMedia).filter(Boolean);
    collection.mediaTotal = media.total || rawItems.length;
    collection.mediaLoaded = rawItems.length;
    collection.mediaPageLimit = media.limit || MEDIA_PAGE_LIMIT;
    cacheSqliteCollection(collection);
  }

  (collection.children || []).forEach(cacheSqliteCollection);
  return collection;
}

function requestSqliteSearch() {
  const query = state.searchQuery;
  if (!query || state.sqliteSearch.loading || state.sqliteSearch.query !== query) return;
  state.sqliteSearch.loading = true;
  state.searchAbortController?.abort();
  state.searchAbortController = new AbortController();
  fetchJson(`/api/search?q=${encodeURIComponent(query)}&limit=80`, { signal: state.searchAbortController.signal })
    .then((payload) => {
      if (state.searchQuery !== query) return;
      const collections = (payload.collections || []).map(cacheSqliteCollection).filter(Boolean);
      const media = (payload.media || []).map((item) => ({ ...item, galleryMedia: sqliteMediaToGalleryMedia(item) }));
      state.sqliteSearch = { query, loading: false, collections, media };
      render();
    })
    .catch((error) => {
      if (error.name === "AbortError") return;
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
  const generation = state.routeGeneration;
  renderEmpty(text.refreshing);
  loadSqliteCollection(parts)
    .then((collection) => {
      if (generation !== state.routeGeneration || sqliteCollectionIdFromParts(parseRouteParts()) !== id) return;
      state.sqliteLoading = null;
      renderCollection(collection);
      queueMicrotask(requestScrollRestoration);
    })
    .catch((error) => {
      if (error.name === "AbortError" || generation !== state.routeGeneration) return;
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

function parseRouteParts() {
  const { modelId, workId } = parseRoute();
  return modelId ? [modelId, ...workId] : [];
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

function imagePreviewUrl(src) {
  return src ? `/api/image-preview?url=${encodeURIComponent(src)}&size=768` : "";
}

function useCompatibilityLightboxPreview(collectionId = "") {
  return collectionId === HEIC_COMPATIBILITY_COLLECTION_ID;
}

function getLightboxPreloadCount() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (connection?.saveData) return 0;
  if (connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g") return 1;
  if (connection?.effectiveType === "3g") return 2;
  return LIGHTBOX_PRELOAD_AHEAD_COUNT;
}

function getLightboxPreloadIndices(currentIndex, imageCount, count = getLightboxPreloadCount()) {
  if (imageCount <= 1 || count <= 0) return [];
  const indices = [];
  const seen = new Set([currentIndex]);
  for (let offset = 1; offset < imageCount && indices.length < count; offset += 1) {
    const index = (currentIndex + offset) % imageCount;
    if (seen.has(index)) continue;
    seen.add(index);
    indices.push(index);
  }
  return indices;
}

function canonicalLightboxUrl(src) {
  if (!src) return "";
  try {
    return new URL(src, window.location.href).href;
  } catch (error) {
    return "";
  }
}

function createLightboxPreloadManager() {
  let generation = 0;
  let active = false;
  let preloadActiveCount = 0;
  let currentActiveCount = 0;
  let maxPreloadActiveCount = 0;
  let maxTotalActiveCount = 0;
  let maxCacheSize = 0;
  let queue = [];
  const cache = new Map();
  const scheduledTasks = new Set();
  const events = [];

  function debugEnabled() {
    return localStorage.getItem(LIGHTBOX_DEBUG_STORAGE_KEY) === "1"
      || new URLSearchParams(window.location.search).get("lightboxDebug") === "1";
  }

  function publishDebugSummary() {
    if (!debugEnabled()) return;
    document.documentElement.dataset.lightboxDiagnosticsSummary = JSON.stringify({
      active,
      cacheSize: cache.size,
      queueSize: queue.length,
      preloadActiveCount,
      currentActiveCount,
      maxPreloadActiveCount,
      maxTotalActiveCount,
      maxCacheSize,
    });
  }

  function record(entry, event, details = {}) {
    const item = {
      event,
      index: entry?.index ?? -1,
      url: entry?.canonicalUrl || "",
      priority: entry?.priority ?? null,
      status: entry?.status || "",
      at: performance.now(),
      ...details,
    };
    events.push(item);
    if (events.length > 200) events.splice(0, events.length - 200);
    if (debugEnabled()) {
      console.debug("[lightbox-image]", item);
      document.documentElement.dataset.lightboxDiagnostics = JSON.stringify(events.slice(-40));
      publishDebugSummary();
    }
    return item;
  }

  function resolveNetwork(entry) {
    if (entry.networkSettled) return;
    entry.networkSettled = true;
    entry.networkResolve(entry);
  }

  function abortEntry(entry, reason = "pruned") {
    if (!entry || entry.status === "aborted" || entry.status === "failed") return;
    entry.image.onload = null;
    entry.image.onerror = null;
    if (entry.status === "loading") entry.image.src = "";
    entry.status = "aborted";
    entry.completedAt = performance.now();
    entry.abortReason = reason;
    record(entry, "aborted", { reason });
    resolveNetwork(entry);
  }

  function clearScheduledTasks() {
    for (const task of scheduledTasks) {
      if (task.type === "idle") window.cancelIdleCallback(task.id);
      else clearTimeout(task.id);
    }
    scheduledTasks.clear();
  }

  function scheduleLowPriority(callback) {
    const task = { type: "timeout", id: 0 };
    const run = () => {
      scheduledTasks.delete(task);
      callback();
    };
    if (typeof window.requestIdleCallback === "function") {
      task.type = "idle";
      task.id = window.requestIdleCallback(run, { timeout: 250 });
    } else {
      task.id = window.setTimeout(run, 75);
    }
    scheduledTasks.add(task);
  }

  async function ensureDecoded(entry) {
    if (!entry) return null;
    entry.decodeRequested = true;
    if (entry.status === "ready" || entry.status === "failed" || entry.status === "aborted") return entry;
    await entry.networkPromise;
    if (entry.status === "ready" || entry.status === "failed" || entry.status === "aborted") return entry;
    if (entry.decodePromise) return entry.decodePromise;
    entry.decodeStartedAt = performance.now();
    entry.status = "decoding";
    record(entry, "decode-start");
    entry.decodePromise = (async () => {
      try {
        if (typeof entry.image.decode === "function") await entry.image.decode();
        entry.decodeCompletedAt = performance.now();
        entry.status = "ready";
        record(entry, "decode-complete");
      } catch (error) {
        entry.decodeCompletedAt = performance.now();
        entry.decodeError = error || true;
        entry.status = "ready";
        record(entry, "decode-fallback", { message: error?.message || "decode failed after load" });
      }
      return entry;
    })();
    return entry.decodePromise;
  }

  function startEntry(entry, immediate = false) {
    if (!active || entry.generation !== generation || entry.status === "aborted") {
      abortEntry(entry, "stale-generation");
      return;
    }
    if (entry.status === "loading" || entry.status === "loaded" || entry.status === "decoding" || entry.status === "ready") return;
    entry.status = "loading";
    entry.startedAt = performance.now();
    entry.countsAgainstPreload = !immediate;
    if (entry.countsAgainstPreload) {
      preloadActiveCount += 1;
      maxPreloadActiveCount = Math.max(maxPreloadActiveCount, preloadActiveCount);
    } else currentActiveCount += 1;
    const totalActiveCount = preloadActiveCount + currentActiveCount;
    maxTotalActiveCount = Math.max(maxTotalActiveCount, totalActiveCount);
    entry.image.decoding = "async";
    entry.image.fetchPriority = entry.priority <= LIGHTBOX_PRIORITY.next ? "high" : "low";
    record(entry, "request-start", { immediate, queuedFor: entry.startedAt - entry.queuedAt });
    entry.image.onload = () => {
      entry.status = "loaded";
      entry.loadedAt = performance.now();
      record(entry, "load", { requestDuration: entry.loadedAt - entry.startedAt });
      resolveNetwork(entry);
      if (entry.decodeRequested) void ensureDecoded(entry);
    };
    entry.image.onerror = (error) => {
      entry.error = error || true;
      entry.status = "failed";
      entry.completedAt = performance.now();
      record(entry, "failed");
      resolveNetwork(entry);
    };
    entry.networkPromise.finally(() => {
      if (entry.countsAgainstPreload) preloadActiveCount = Math.max(0, preloadActiveCount - 1);
      else currentActiveCount = Math.max(0, currentActiveCount - 1);
      pumpQueue();
    });
    entry.image.src = entry.canonicalUrl;
  }

  function pumpQueue() {
    if (!active) return;
    queue.sort((left, right) => left.priority - right.priority || left.queuedAt - right.queuedAt);
    while (preloadActiveCount < LIGHTBOX_PRELOAD_CONCURRENCY && queue.length) {
      const entry = queue.shift();
      if (!entry || entry.status !== "queued" || entry.generation !== generation || cache.get(entry.canonicalUrl) !== entry) {
        if (entry) abortEntry(entry, "stale-queue");
        continue;
      }
      startEntry(entry, false);
    }
  }

  function createEntry(canonicalUrl, index, options, retryCount = 0) {
    let networkResolve;
    const networkPromise = new Promise((done) => { networkResolve = done; });
    return {
      canonicalUrl,
      index,
      status: "idle",
      image: new Image(),
      networkPromise,
      networkResolve,
      networkSettled: false,
      decodePromise: null,
      error: null,
      startedAt: 0,
      loadedAt: 0,
      completedAt: 0,
      priority: options.priority,
      decodeRequested: options.decode,
      queuedAt: performance.now(),
      generation,
      retryCount,
      reusedCount: 0,
      priorityUpgrades: 0,
      countsAgainstPreload: false,
    };
  }

  function prepare(src, index, options) {
    const canonicalUrl = canonicalLightboxUrl(src);
    if (!active || !canonicalUrl) return null;
    let entry = cache.get(canonicalUrl);
    let retryCount = 0;
    if (entry?.status === "failed" && options.explicitRetry && entry.retryCount < 1) {
      retryCount = entry.retryCount + 1;
      cache.delete(canonicalUrl);
      entry = null;
    }
    if (entry) {
      entry.index = index;
      entry.decodeRequested ||= options.decode;
      entry.reusedCount += 1;
      if (options.priority < entry.priority) {
        entry.priority = options.priority;
        entry.priorityUpgrades += 1;
        entry.image.fetchPriority = entry.priority <= LIGHTBOX_PRIORITY.next ? "high" : "low";
        record(entry, "priority-upgrade");
      } else {
        record(entry, "request-reused", { cacheHint: entry.status });
      }
      return entry;
    }
    entry = createEntry(canonicalUrl, index, options, retryCount);
    cache.set(canonicalUrl, entry);
    while (cache.size > LIGHTBOX_PRELOAD_CACHE_LIMIT) {
      const oldest = [...cache.values()].find((candidate) => candidate !== entry);
      if (!oldest) break;
      abortEntry(oldest, "cache-limit");
      cache.delete(oldest.canonicalUrl);
    }
    maxCacheSize = Math.max(maxCacheSize, cache.size);
    record(entry, "created");
    return entry;
  }

  function enqueue(entry) {
    if (!entry || entry.status !== "idle") return entry;
    entry.status = "queued";
    entry.queuedAt = performance.now();
    record(entry, "queued");
    queue.push(entry);
    pumpQueue();
    return entry;
  }

  function startCurrent(entry) {
    if (!entry) return null;
    if (entry.status === "queued") queue = queue.filter((candidate) => candidate !== entry);
    if (entry.status === "idle" || entry.status === "queued") startEntry(entry, true);
    else if (entry.status === "loading") entry.image.fetchPriority = "high";
    return entry;
  }

  function prune(currentIndex, urls, aheadIndices) {
    const keepIndices = new Set([currentIndex, ...aheadIndices]);
    if (urls.length > 1) keepIndices.add((currentIndex - 1 + urls.length) % urls.length);
    const keepUrls = new Set([...keepIndices].map((index) => canonicalLightboxUrl(urls[index])).filter(Boolean));
    for (const [url, entry] of cache) {
      if (keepUrls.has(url)) continue;
      abortEntry(entry, "outside-window");
      cache.delete(url);
    }
    queue = queue.filter((entry) => cache.get(entry.canonicalUrl) === entry);
  }

  function schedule(currentIndex, urls) {
    if (!active || !urls.length) return { entry: null, generation };
    clearScheduledTasks();
    const currentGeneration = generation;
    const aheadIndices = getLightboxPreloadIndices(currentIndex, urls.length);
    prune(currentIndex, urls, aheadIndices);
    const currentEntry = prepare(urls[currentIndex], currentIndex, { priority: LIGHTBOX_PRIORITY.current, decode: true, explicitRetry: true });
    startCurrent(currentEntry);
    aheadIndices.forEach((index, offset) => {
      const options = {
        priority: offset === 0 ? LIGHTBOX_PRIORITY.next : LIGHTBOX_PRIORITY.predicted,
        decode: offset === 0,
        explicitRetry: false,
      };
      if (offset === 0) {
        const nextEntry = enqueue(prepare(urls[index], index, options));
        if (nextEntry) void ensureDecoded(nextEntry);
      }
      else scheduleLowPriority(() => {
        if (!active || generation !== currentGeneration) return;
        enqueue(prepare(urls[index], index, options));
      });
    });
    return { entry: currentEntry, ready: ensureDecoded(currentEntry), generation: currentGeneration };
  }

  function stop() {
    active = false;
    generation += 1;
    clearScheduledTasks();
    queue = [];
    for (const entry of cache.values()) abortEntry(entry, "session-stop");
    cache.clear();
    publishDebugSummary();
  }

  return {
    open(currentIndex, urls) {
      stop();
      active = true;
      return schedule(currentIndex, urls);
    },
    schedule,
    stop,
    isCurrent(expectedGeneration) {
      return active && generation === expectedGeneration;
    },
    markInteraction(url, index, event = "click") {
      record({ canonicalUrl: canonicalLightboxUrl(url), index, priority: LIGHTBOX_PRIORITY.current, status: "interaction" }, event);
    },
    markPlaceholderDisplayed(url, index) {
      record({ canonicalUrl: canonicalLightboxUrl(url), index, priority: LIGHTBOX_PRIORITY.current, status: "preview" }, "placeholder-displayed");
    },
    markDisplayed(url, index) {
      const entry = cache.get(canonicalLightboxUrl(url));
      if (!entry) return;
      entry.displayedAt = performance.now();
      record(entry, "displayed", { index });
    },
    diagnostics() {
      return {
        active,
        generation,
        preloadActiveCount,
        currentActiveCount,
        cacheSize: cache.size,
        queueSize: queue.length,
        maxPreloadActiveCount,
        maxTotalActiveCount,
        maxCacheSize,
        entries: [...cache.values()].map(({ index, canonicalUrl, status, priority, retryCount, decodeRequested, decodeStartedAt, decodeCompletedAt, reusedCount, priorityUpgrades }) => ({
          index,
          canonicalUrl,
          status,
          priority,
          retryCount,
          decodeRequested,
          decodeStartedAt,
          decodeCompletedAt,
          reusedCount,
          priorityUpgrades,
        })),
        events: events.slice(),
      };
    },
    cacheLimit: LIGHTBOX_PRELOAD_CACHE_LIMIT,
  };
}

const lightboxPreloadManager = createLightboxPreloadManager();

window.galleryLightboxDebug = {
  enable() {
    localStorage.setItem(LIGHTBOX_DEBUG_STORAGE_KEY, "1");
  },
  disable() {
    localStorage.removeItem(LIGHTBOX_DEBUG_STORAGE_KEY);
  },
  snapshot() {
    return lightboxPreloadManager.diagnostics();
  },
};

function lazyImageHtml(src, label, attributes = "") {
  if (!src) return `<div class="empty-cover">${escapeHtml(label || text.waitingImage)}</div>`;
  return `<img src="${IMAGE_PLACEHOLDER}" data-preview-src="${escapeHtml(imagePreviewUrl(src))}" alt="${escapeHtml(label || "")}" loading="lazy" decoding="async" fetchpriority="low" ${attributes} />`;
}

function setupLazyPreviewImages() {
  state.lazyImageObserver?.disconnect();
  state.lazyImageObserver = null;
  const images = [...document.querySelectorAll("img[data-preview-src]")];
  if (!images.length) return;
  const load = (image) => {
    if (!image.dataset.previewSrc) return;
    const rect = image.getBoundingClientRect();
    const inViewport = rect.bottom >= 0 && rect.top <= window.innerHeight;
    image.fetchPriority = inViewport ? "auto" : "low";
    image.src = image.dataset.previewSrc;
    delete image.dataset.previewSrc;
  };
  if (!("IntersectionObserver" in window)) {
    images.slice(0, 24).forEach(load);
    return;
  }
  state.lazyImageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      load(entry.target);
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "25% 0px" });
  images.forEach((image) => state.lazyImageObserver.observe(image));
}

function coverHtml(src, label) {
  return lazyImageHtml(src, label);
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

function syncFavoriteButtonStates() {
  view.querySelectorAll("[data-favorite-id]").forEach((button) => {
    const active = isFavorited(button.dataset.favoriteId);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.textContent = active ? "已收藏" : "收藏";
  });
}

function currentRouteNeedsFavoriteState() {
  const route = location.hash.replace(/^#\/?/, "");
  return Boolean(route && !route.startsWith("__"));
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

function storedItemTimestamp(item, field) {
  const numeric = Number(item?.[field] || 0);
  if (numeric) return numeric;
  const parsed = Date.parse(item?.updatedAt || item?.createdAt || "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

function favoriteItemsForDisplay() {
  return stableSorted(state.favorites || [], (a, b) => {
    if (state.modelSort === "mtime") return storedItemTimestamp(b, "favoritedAt") - storedItemTimestamp(a, "favoritedAt");
    if (state.modelSort === "name") return compareText(a.title, b.title);
    return 0;
  });
}

function renderFavorites() {
  if (!state.favorites.length) return "";
  return `
    <section class="favorite-section" aria-label="\u6536\u85cf">
      <div class="section-heading">\u6536\u85cf</div>
      <div class="compact-grid">
        ${favoriteItemsForDisplay()
          .map(
            (item) => `
              <div class="favorite-card" ${scrollAnchorAttribute("favorite", item.id)}>
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
  const recentItems = stableSorted(state.recentViews, (a, b) => storedItemTimestamp(b, "visitedAt") - storedItemTimestamp(a, "visitedAt"));
  return `
    <section class="recent-section" aria-label="\u6700\u8fd1\u89c2\u770b">
      <div class="section-heading">\u6700\u8fd1\u89c2\u770b</div>
      <div class="compact-grid">
        ${recentItems
          .map(
            (item) => `
              <a class="compact-card compact-link" href="${item.hash}" ${scrollAnchorAttribute("recent", item.hash)}>
                <div class="compact-cover">${coverHtml(storedItemCover(item), item.title)}</div>
                <div class="compact-info">
                  <h2>${escapeHtml(item.title)}</h2>
                  ${item.meta ? `<p>${escapeHtml(item.meta)}</p>` : ""}
                  ${item.visitedAt || item.updatedAt ? `<p>${escapeHtml(formatAccessTime(item.visitedAt || item.updatedAt))}</p>` : ""}
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
              <a class="highlight-card" href="${item.href}" ${scrollAnchorAttribute("highlight", item.href)}>
                <img src="${IMAGE_PLACEHOLDER}" data-carousel-src="${escapeHtml(item.src)}" alt="${escapeHtml(item.title || item.model || "")}" loading="lazy" decoding="async" />
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
            <a class="model-card" href="${encodeHash([model.id])}" ${scrollAnchorAttribute("model", model.id)}>
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
            <a class="work-card" href="${encodeHash(pathParts)}" ${scrollAnchorAttribute("work", work.id)}>
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
            <a class="work-card" href="${sqliteHashFromId(item.collectionId)}" ${scrollAnchorAttribute("search-media", item.id || media.src || item.title)}>
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
        ${lazyImageHtml(item.src || "", item.title || item.file || "")}
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
    queueMicrotask(setupLazyPreviewImages);
    return;
  }
  renderDuplicatePage();
  queueMicrotask(setupLazyPreviewImages);
}

function formatAccessTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function accessLogPageTokens(currentPage, totalPages) {
  if (totalPages <= 0) return [];
  const pages = new Set([1, totalPages]);
  for (let page = Math.max(1, currentPage - 2); page <= Math.min(totalPages, currentPage + 2); page += 1) pages.add(page);
  const ordered = [...pages].sort((a, b) => a - b);
  const tokens = [];
  ordered.forEach((page, index) => {
    if (index && page - ordered[index - 1] > 1) tokens.push("ellipsis");
    tokens.push(page);
  });
  return tokens;
}

function favoriteSettingsPageHtml() {
  return `
    <section class="stored-collections-page">
      <h1>收藏图册</h1>
      <p>收藏数据与图册页共用；取消收藏后会立即更新当前列表。</p>
      ${state.userMarksError ? `<div class="inline-error">${escapeHtml(state.userMarksError)}</div>` : ""}
      ${state.favorites.length ? renderFavorites() : `<div class="empty-state">还没有收藏图册。</div>`}
    </section>
  `;
}

function historySettingsPageHtml() {
  return `
    <section class="stored-collections-page">
      <h1>观看历史</h1>
      <p>按最近访问时间倒序显示最近观看过的图册。</p>
      ${state.userMarksError ? `<div class="inline-error">${escapeHtml(state.userMarksError)}</div>` : ""}
      ${state.recentViews.length ? renderRecentViews() : `<div class="empty-state">还没有观看记录。</div>`}
    </section>
  `;
}

function accessLogPageHtml() {
  const rows = state.accessLogs || [];
  const page = state.accessLogPage || 1;
  const totalPages = state.accessLogTotalPages || 0;
  const tokens = accessLogPageTokens(page, totalPages);
  return `
    <section class="access-log-page">
      <h1>\u8bbf\u95ee\u65e5\u5fd7</h1>
      <p>\u8bb0\u5f55\u8fdb\u5165\u6a21\u7279\u3001\u56fe\u96c6\u548c\u8bbe\u7f6e\u9875\u7684\u9875\u9762\u7ea7\u8bbf\u95ee\u3002</p>
      <button class="access-log-refresh" id="accessLogRefreshButton" type="button">\u5237\u65b0\u65e5\u5fd7</button>
      ${state.accessLogsLoading ? `<div class="empty-state">${text.refreshing}</div>` : ""}
      ${!state.accessLogsLoading && state.accessLogError ? `<div class="inline-error">${escapeHtml(state.accessLogError)}</div>` : ""}
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
      ${!state.accessLogsLoading && !state.accessLogError && !rows.length ? `<div class="empty-state">\u8fd8\u6ca1\u6709\u8bbf\u95ee\u8bb0\u5f55\u3002</div>` : ""}
      <nav class="access-log-pagination" aria-label="访问日志分页">
        <button type="button" data-access-log-page="1" ${page <= 1 || !totalPages ? "disabled" : ""}>首页</button>
        <button type="button" data-access-log-page="${Math.max(1, page - 1)}" ${page <= 1 || !totalPages ? "disabled" : ""}>上一页</button>
        <div class="access-log-page-numbers">
          ${tokens.map((token) => token === "ellipsis" ? `<span aria-hidden="true">…</span>` : `<button type="button" data-access-log-page="${token}" class="${token === page ? "active" : ""}" ${token === page ? "aria-current=\"page\" disabled" : ""}>${token}</button>`).join("")}
        </div>
        <button type="button" data-access-log-page="${Math.min(totalPages || 1, page + 1)}" ${!totalPages || page >= totalPages ? "disabled" : ""}>下一页</button>
        <button type="button" data-access-log-page="${Math.max(1, totalPages)}" ${!totalPages || page >= totalPages ? "disabled" : ""}>末页</button>
        <span class="access-log-page-summary">第 ${totalPages ? page : 0} / ${totalPages} 页，共 ${state.accessLogTotal || 0} 条</span>
      </nav>
    </section>
  `;
}

function stopMediaCleanupPolling() {
  if (state.mediaCleanupPollTimer) clearTimeout(state.mediaCleanupPollTimer);
  state.mediaCleanupPollTimer = null;
}

function mediaCleanupActive(status = state.mediaCleanupStatus?.status) {
  return ["scanning", "stopping", "deleting"].includes(status);
}

async function loadMediaCleanupStatus() {
  state.mediaCleanupStatus = await fetchJson("/api/media-cleanup/status");
  return state.mediaCleanupStatus;
}

async function loadMediaCleanupResults(page = 1) {
  const status = state.mediaCleanupStatus || {};
  if (!status.id || !["completed", "delete-completed", "stopped"].includes(status.status)) return;
  state.mediaCleanupLoading = true;
  const query = new URLSearchParams({
    jobId: status.id,
    page: String(Math.max(page, 1)),
    pageSize: String(state.mediaCleanupResults.pageSize || 50),
    kind: state.mediaCleanupKind,
    category: state.mediaCleanupCategory,
    search: state.mediaCleanupSearch,
    sort: state.mediaCleanupSort,
    direction: state.mediaCleanupDirection,
  });
  try {
    state.mediaCleanupResults = await fetchJson(`/api/media-cleanup/results?${query}`);
  } finally {
    state.mediaCleanupLoading = false;
  }
}

function cleanupMetric(label, value) {
  return `<span><small>${escapeHtml(label)}</small><strong>${escapeHtml(value ?? 0)}</strong></span>`;
}

function mediaCleanupPageHtml() {
  const status = state.mediaCleanupStatus || {};
  const summary = status.summary || status.progress || {};
  const results = state.mediaCleanupResults || { items: [], total: 0, page: 1, pageSize: 50 };
  const active = mediaCleanupActive(status.status);
  const totalPages = Math.max(Math.ceil(Number(results.total || 0) / Number(results.pageSize || 50)), 1);
  const tabs = [
    ["non-media", "", "非媒体文件"],
    ["directory", "EmptyDirectory", "空目录"],
    ["directory", "MediaFreeTree", "无媒体目录树"],
    ["zero-byte-media", "", "0字节媒体"],
    ["suspicious-media", "", "可疑小媒体"],
    ["error", "", "错误"],
    ["deletion", "", "删除记录"],
  ];
  return `
    <section class="media-cleanup-page">
      <div class="media-cleanup-header">
        <div><h1>媒体库清理</h1><p>只读取文件元数据进行低负载扫描；扫描完成前不会删除任何内容。</p></div>
        <div class="media-cleanup-actions">
          <button id="mediaCleanupStart" type="button" ${active ? "disabled" : ""}>开始扫描</button>
          <button id="mediaCleanupStop" type="button" ${status.status !== "scanning" ? "disabled" : ""}>停止扫描</button>
          <button id="mediaCleanupDelete" class="danger" type="button" ${status.status !== "completed" ? "disabled" : ""}>删除候选文件</button>
        </div>
      </div>
      <div class="media-cleanup-root"><strong>当前媒体根目录</strong><code>${escapeHtml(status.rootPath || "读取中…")}</code></div>
      <div class="media-cleanup-state"><strong>状态：${escapeHtml(status.status || "idle")}</strong><span>${escapeHtml(status.errorMessage || summary.currentPath || "")}</span></div>
      <div class="media-cleanup-metrics">
        ${cleanupMetric("文件", summary.totalFiles ?? summary.scannedFiles)}
        ${cleanupMetric("目录", summary.scannedDirectories)}
        ${cleanupMetric("图片", summary.imageCount)}
        ${cleanupMetric("视频", summary.videoCount)}
        ${cleanupMetric("非媒体", summary.nonMediaCount)}
        ${cleanupMetric("非媒体容量", formatBytes(summary.nonMediaBytes || 0))}
        ${cleanupMetric("空目录", summary.emptyDirectoryCount)}
        ${cleanupMetric("无媒体树", summary.mediaFreeTreeCount)}
        ${cleanupMetric("0字节媒体", summary.zeroByteMediaCount)}
        ${cleanupMetric("可疑小媒体", summary.suspiciousTinyMediaCount)}
        ${cleanupMetric("ReparsePoint", summary.reparsePointCount)}
        ${cleanupMetric("错误", summary.errorCount)}
        ${cleanupMetric("耗时", summary.elapsedMilliseconds ? `${(summary.elapsedMilliseconds / 1000).toFixed(1)} 秒` : "-")}
      </div>
      <div class="media-cleanup-tabs">
        ${tabs.map(([kind, category, label]) => `<button type="button" data-cleanup-kind="${kind}" data-cleanup-category="${category}" class="${state.mediaCleanupKind === kind && state.mediaCleanupCategory === category ? "active" : ""}">${label}</button>`).join("")}
      </div>
      <div class="media-cleanup-filters">
        <select id="mediaCleanupCategory">
          <option value="">全部分类</option>
          ${["Archive","Document","MetadataOrSidecar","TemporaryOrPartial","ExecutableOrScript","SystemJunk","Extensionless","Unknown","EmptyDirectory","LeafNonMediaDirectory","MediaFreeTree","Image","Video","ReparsePoint","LongPath","ScanError"].map((category) => `<option value="${category}" ${state.mediaCleanupCategory === category ? "selected" : ""}>${category}</option>`).join("")}
        </select>
        <input id="mediaCleanupSearch" value="${escapeHtml(state.mediaCleanupSearch)}" placeholder="搜索文件名或相对路径" maxlength="200" />
        <select id="mediaCleanupSort"><option value="path" ${state.mediaCleanupSort === "path" ? "selected" : ""}>按路径</option><option value="size" ${state.mediaCleanupSort === "size" ? "selected" : ""}>按大小</option></select>
        <select id="mediaCleanupDirection"><option value="asc" ${state.mediaCleanupDirection === "asc" ? "selected" : ""}>升序</option><option value="desc" ${state.mediaCleanupDirection === "desc" ? "selected" : ""}>降序</option></select>
        <button id="mediaCleanupApply" type="button">查询</button>
      </div>
      ${state.mediaCleanupLoading ? `<div class="empty-state">${text.refreshing}</div>` : `
        <div class="media-cleanup-table">
          <div class="media-cleanup-row head"><span>分类</span><span>路径</span><span>大小</span><span>时间</span></div>
          ${(results.items || []).map((item) => `<div class="media-cleanup-row"><span>${escapeHtml(item.category || item.kind || "")}</span><span title="${escapeHtml(item.relativePath || "")}">${escapeHtml(item.relativePath || "")}</span><span>${formatBytes(item.sizeBytes || 0)}</span><span>${escapeHtml(formatAccessTime(item.lastWriteTime || ""))}</span></div>`).join("")}
        </div>
      `}
      ${!state.mediaCleanupLoading && !(results.items || []).length ? `<div class="empty-state">当前筛选没有结果。</div>` : ""}
      <div class="media-cleanup-pagination"><button id="mediaCleanupPrev" type="button" ${Number(results.page || 1) <= 1 ? "disabled" : ""}>上一页</button><span>${results.page || 1} / ${totalPages}（${results.total || 0} 条）</span><button id="mediaCleanupNext" type="button" ${Number(results.page || 1) >= totalPages ? "disabled" : ""}>下一页</button></div>
      <div class="media-cleanup-modal" id="mediaCleanupModal" hidden>
        <div class="media-cleanup-dialog" role="dialog" aria-modal="true" aria-labelledby="mediaCleanupDialogTitle">
          <h2 id="mediaCleanupDialogTitle">确认删除非媒体候选</h2>
          <p>将按本次报告顺序删除 ${summary.nonMediaCount || 0} 个候选，预计释放 ${formatBytes(summary.nonMediaBytes || 0)}。图片、视频、0字节媒体、可疑小媒体和 ReparsePoint 不会删除；随后只清理真正空目录。</p>
          <label>请输入 DELETE 或 删除<input id="mediaCleanupConfirmation" autocomplete="off" /></label>
          <div><button id="mediaCleanupCancelDelete" type="button">取消</button><button id="mediaCleanupConfirmDelete" class="danger" type="button" disabled>确认删除</button></div>
        </div>
      </div>
    </section>
  `;
}

function scheduleMediaCleanupPolling() {
  stopMediaCleanupPolling();
  if (!mediaCleanupActive()) return;
  state.mediaCleanupPollTimer = setTimeout(async () => {
    if (settingsSection() !== "media-cleanup") return;
    try {
      const previous = state.mediaCleanupStatus?.status;
      await loadMediaCleanupStatus();
      if (previous !== state.mediaCleanupStatus?.status && ["completed", "delete-completed", "stopped"].includes(state.mediaCleanupStatus?.status)) await loadMediaCleanupResults(1);
    } catch (error) {}
    renderSettingsPage();
  }, 1000);
}

function bindMediaCleanupPage() {
  scheduleMediaCleanupPolling();
  document.querySelector("#mediaCleanupStart")?.addEventListener("click", async () => { await postJson("/api/media-cleanup/scan/start"); state.mediaCleanupResults = { items: [], total: 0, page: 1, pageSize: 50 }; await loadMediaCleanupStatus(); renderSettingsPage(); });
  document.querySelector("#mediaCleanupStop")?.addEventListener("click", async () => { await postJson("/api/media-cleanup/scan/stop"); await loadMediaCleanupStatus(); renderSettingsPage(); });
  document.querySelectorAll("[data-cleanup-kind]").forEach((button) => button.addEventListener("click", async () => { state.mediaCleanupKind=button.dataset.cleanupKind; state.mediaCleanupCategory=button.dataset.cleanupCategory || ""; await loadMediaCleanupResults(1); renderSettingsPage(); }));
  document.querySelector("#mediaCleanupApply")?.addEventListener("click", async () => { state.mediaCleanupCategory=document.querySelector("#mediaCleanupCategory").value; state.mediaCleanupSearch=document.querySelector("#mediaCleanupSearch").value.trim(); state.mediaCleanupSort=document.querySelector("#mediaCleanupSort").value; state.mediaCleanupDirection=document.querySelector("#mediaCleanupDirection").value; await loadMediaCleanupResults(1); renderSettingsPage(); });
  document.querySelector("#mediaCleanupPrev")?.addEventListener("click", async () => { await loadMediaCleanupResults(Math.max(1, Number(state.mediaCleanupResults.page || 1)-1)); renderSettingsPage(); });
  document.querySelector("#mediaCleanupNext")?.addEventListener("click", async () => { await loadMediaCleanupResults(Number(state.mediaCleanupResults.page || 1)+1); renderSettingsPage(); });
  const modal=document.querySelector("#mediaCleanupModal"); const input=document.querySelector("#mediaCleanupConfirmation"); const confirmButton=document.querySelector("#mediaCleanupConfirmDelete");
  document.querySelector("#mediaCleanupDelete")?.addEventListener("click", () => { modal.hidden=false; input.focus(); });
  document.querySelector("#mediaCleanupCancelDelete")?.addEventListener("click", () => { modal.hidden=true; input.value=""; confirmButton.disabled=true; });
  input?.addEventListener("input", () => { confirmButton.disabled = !["DELETE","删除"].includes(input.value.trim()); });
  confirmButton?.addEventListener("click", async () => { confirmButton.disabled=true; await postJson("/api/media-cleanup/delete", { jobId: state.mediaCleanupStatus.id, confirmation: input.value.trim() }); modal.hidden=true; await loadMediaCleanupStatus(); renderSettingsPage(); });
}

function renderSettingsPage() {
  renderCrumbs();
  const section = settingsSection();
  const sectionTitles = { favorites: "收藏图册", history: "观看历史", display: "显示设置", duplicates: "图片查重", "media-cleanup": "媒体库清理", "access-log": "访问日志" };
  recordAccessLog({ type: "settings", title: sectionTitles[section] || "设置", model: "", work: "", pathParts: ["__settings", section] });
  crumbs.innerHTML = `<a href="#/">${text.home}</a> / <strong>\u8bbe\u7f6e</strong>`;
  view.innerHTML = `
    <section class="settings-page">
      <aside class="settings-sidebar">
        <a class="${section === "favorites" ? "active" : ""}" href="#/__settings/favorites">收藏图册</a>
        <a class="${section === "history" ? "active" : ""}" href="#/__settings/history">观看历史</a>
        <a class="${section === "display" ? "active" : ""}" href="#/__settings">\u663e\u793a\u8bbe\u7f6e</a>
        <a class="${section === "duplicates" ? "active" : ""}" href="#/__settings/duplicates">\u56fe\u7247\u67e5\u91cd</a>
        <a class="${section === "media-cleanup" ? "active" : ""}" href="#/__settings/media-cleanup">媒体库清理</a>
        <a class="${section === "access-log" ? "active" : ""}" href="#/__settings/access-log">\u8bbf\u95ee\u65e5\u5fd7</a>
      </aside>
      <div class="settings-content">
        ${section === "favorites" ? favoriteSettingsPageHtml() : section === "history" ? historySettingsPageHtml() : section === "duplicates" ? duplicatePageHtml() : section === "access-log" ? accessLogPageHtml() : section === "media-cleanup" ? mediaCleanupPageHtml() : `
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
  if (section === "favorites") bindFavoriteButtons();
  if (section === "media-cleanup") bindMediaCleanupPage();
  if (section === "access-log") {
    document.querySelector("#accessLogRefreshButton")?.addEventListener("click", async () => {
      const loading = loadAccessLogs(state.accessLogPage || 1);
      renderSettingsPage();
      try {
        await loading;
        if (settingsSection() === "access-log") renderSettingsPage();
      } catch (error) {
        if (error.name !== "AbortError" && settingsSection() === "access-log") renderSettingsPage();
      }
    });
    document.querySelectorAll("[data-access-log-page]").forEach((button) => button.addEventListener("click", async () => {
      const loading = loadAccessLogs(Number(button.dataset.accessLogPage || 1));
      renderSettingsPage();
      try {
        await loading;
        if (settingsSection() === "access-log") renderSettingsPage();
      } catch (error) {
        if (error.name !== "AbortError" && settingsSection() === "access-log") renderSettingsPage();
      }
    }));
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
  if (settingsSection() === "favorites" && !state.favoritesLoaded) {
    await loadFavoriteMarks(state.pageAbortController?.signal);
  }
  if (settingsSection() === "history" && !state.recentViewsLoaded) {
    await loadRecentMarks(state.pageAbortController?.signal);
  }
  if (settingsSection() === "duplicates" && !state.duplicateGroups.length && !state.duplicateLoading) {
    await Promise.all([loadDuplicateStatus(), loadDuplicateDeleteMarks(), loadDuplicates(0)]);
  }
  if (settingsSection() === "access-log" && !state.accessLogsLoaded && !state.accessLogsLoading) {
    await loadAccessLogs(1);
  }
  if (settingsSection() === "media-cleanup") {
    await loadMediaCleanupStatus();
    if (state.mediaCleanupStatus?.id && ["completed", "delete-completed", "stopped"].includes(state.mediaCleanupStatus.status) && !state.mediaCleanupResults.items.length) await loadMediaCleanupResults(1);
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
  if (!carousel || !track || !cards.length) return;
  const intervalMs = 10000;
  const now = Date.now();
  state.highlightIndex = Math.floor(now / intervalMs) % cards.length;
  state.highlightTimer = { timeoutId: null, intervalId: null };

  const loadAllCarouselImages = () => {
    cards.forEach((card) => {
      const image = card.querySelector("img[data-carousel-src]");
      if (!image) return;
      image.loading = "eager";
      image.src = image.dataset.carouselSrc;
      delete image.dataset.carouselSrc;
    });
  };

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

  loadAllCarouselImages();
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
  state.lazyImageObserver?.disconnect();
  state.lazyImageObserver = null;
  view.querySelectorAll("video").forEach((video) => {
    video.pause();
    video.removeAttribute("src");
    video.load();
  });
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
    ${renderModelGrid(sortModels(state.gallery.models))}
  `;
  setupHighlightCarousel();
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
  queueMicrotask(setupLazyPreviewImages);
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
      collectionId: collection.id,
      title: collection.level === 1 ? `Tag: ${collection.title}` : collection.title,
      meta: collectionMeta(collection),
      actions: favorite,
      images,
      videos,
      poster: collection.cover,
      emptyMessage: text.detailEmpty,
      paging: state.galleryMode === "sqlite" && (collection.mediaTotal || (collection.imageCount + collection.videoCount)) > (collection.mediaLoaded || (images.length + videos.length)) ? {
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
  state.lightboxUseCompatibilityPreview = useCompatibilityLightboxPreview(collection.id);
  const mediaTotal = collection.mediaTotal || (collection.imageCount + collection.videoCount);
  const mediaLoaded = collection.mediaLoaded || (images.length + videos.length);
  state.mediaPaging = state.galleryMode === "sqlite" && showImages && mediaLoaded < mediaTotal ? {
    collectionId: collection.id,
    loaded: mediaLoaded,
    total: mediaTotal,
    limit: collection.mediaPageLimit || MEDIA_PAGE_LIMIT,
    loading: false,
  } : null;

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
    ${hasMedia ? `${renderVideos(visibleVideos, collection.cover)}${renderImages(visibleImages, Boolean(state.mediaPaging))}` : ""}
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
            <a class="work-card" href="${encodeHash([...pathParts, work.folder])}" ${scrollAnchorAttribute("work", work.id || [...pathParts, work.folder].join("/"))}>
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
            <a class="work-card" href="${encodeHash(collection.pathParts || collection.id.split("/"))}" ${scrollAnchorAttribute("collection", collection.id)}>
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
            <figure class="video-item" ${scrollAnchorAttribute("video", video.src || video.file)}>
              <video data-src="${video.src}" preload="none" ${video.poster || poster ? `poster="${video.poster || poster}"` : ""} controls></video>
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

const imageBatchSize = 24;

function renderImageButtons(images, startIndex = 0) {
  return images
    .map(
      (image, index) => `
        <button type="button" data-image-index="${startIndex + index}" ${scrollAnchorAttribute("media", image.src || image.file)}>
          ${lazyImageHtml(image.src, image.title, `data-original="${escapeHtml(image.src)}"`)}
        </button>
      `,
    )
    .join("");
}

function renderImages(images, hasMoreRemoteMedia = false) {
  if (!images.length) return "";
  const initialImages = images.slice(0, imageBatchSize);
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
    button.addEventListener("click", () => openLightbox(Number(button.dataset.imageIndex), button.querySelector("img")?.currentSrc || ""));
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
    button.addEventListener("click", () => openLightbox(Number(button.dataset.imageIndex), button.querySelector("img")?.currentSrc || ""));
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
  setupLazyPreviewImages();
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
      if (sentinelRect.top < window.innerHeight + 300) appendImageBatch();
    };
    window.addEventListener("scroll", state.imageBatchScrollHandler, { passive: true });
    return;
  }

  state.imageBatchObserver = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) appendImageBatch();
  }, { rootMargin: "300px 0px" });
  state.imageBatchObserver.observe(sentinel);
}

function renderMediaDetail({ collectionId = "", title, meta, actions = "", images, videos, poster, emptyMessage, paging = null }) {
  const hasVideos = videos.length > 0;
  const filter = hasVideos ? state.mediaFilter : "all";
  const showImages = filter === "all" || filter === "images";
  const showVideos = filter === "all" || filter === "videos";
  const visibleImages = showImages ? images : [];
  const visibleVideos = showVideos ? videos : [];
  state.detailImages = visibleImages;
  state.lightboxImages = visibleImages.map((image) => image.src);
  state.lightboxUseCompatibilityPreview = useCompatibilityLightboxPreview(collectionId);
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
  stopMediaCleanupPolling();
  restoreToolbarSettings();
  clearHighlightCarouselTimer();
  clearImageBatchLoading();
  updateSortToggle();
  queueMicrotask(setupLazyPreviewImages);
  queueMicrotask(requestScrollRestoration);

  if (duplicateHashRoute()) {
    renderEmpty(text.refreshing);
    ensureDuplicatePage();
    return;
  }

  if (settingsHashRoute()) {
    renderEmpty(text.refreshing);
    ensureSettingsPage().catch((error) => {
      if (error.name !== "AbortError") renderEmpty(text.cannotRead);
    });
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

function openLightbox(index, clickedPreview = "") {
  state.lightboxIndex = index;
  lightboxPreloadManager.markInteraction(state.lightboxImages[index], index);
  lightbox.classList.add("open");
  lightbox.setAttribute("aria-hidden", "false");
  updateLightbox(true, clickedPreview);
  showLightboxControls();
}

function lightboxAssetUrls() {
  return state.lightboxImages.map((src) => state.lightboxUseCompatibilityPreview ? imagePreviewUrl(src) : src);
}

function lightboxPreloadUrls() {
  const urls = lightboxAssetUrls();
  if (state.lightboxUseCompatibilityPreview) urls[state.lightboxIndex] = "";
  return urls;
}

function lightboxPreviewForIndex(index, src) {
  const image = view.querySelector(`[data-image-index="${index}"] img`);
  const currentSrc = image?.currentSrc || image?.src || "";
  if (currentSrc && currentSrc !== IMAGE_PLACEHOLDER) return currentSrc;
  return imagePreviewUrl(src);
}

function setLightboxImageSource(src, renderToken, phase) {
  if (!src || renderToken !== state.lightboxRenderToken) return;
  lightboxImage.decoding = "async";
  lightboxImage.fetchPriority = "high";
  lightbox.classList.toggle("showing-preview", phase === "preview");
  lightbox.classList.toggle("image-loading", phase === "original");
  lightbox.classList.remove("image-error");
  lightboxImage.onload = () => {
    if (renderToken !== state.lightboxRenderToken) return;
    if (phase === "preview") {
      lightboxPreloadManager.markPlaceholderDisplayed(src, state.lightboxIndex);
    } else {
      lightbox.classList.remove("showing-preview", "image-loading", "image-error");
      lightboxPreloadManager.markDisplayed(src, state.lightboxIndex);
    }
  };
  lightboxImage.onerror = () => {
    if (renderToken !== state.lightboxRenderToken) return;
    lightbox.classList.remove("image-loading");
    lightbox.classList.add("image-error");
  };
  lightboxImage.src = src;
}

function updateLightbox(newSession = false, clickedPreview = "") {
  const src = state.lightboxImages[state.lightboxIndex];
  const renderToken = ++state.lightboxRenderToken;
  const previewUrl = clickedPreview || lightboxPreviewForIndex(state.lightboxIndex, src);
  const assetUrls = lightboxPreloadUrls();
  resetLightboxZoom();
  setLightboxImageSource(previewUrl || IMAGE_PLACEHOLDER, renderToken, "preview");
  const preload = newSession
    ? lightboxPreloadManager.open(state.lightboxIndex, assetUrls)
    : lightboxPreloadManager.schedule(state.lightboxIndex, assetUrls);
  if (!src || !preload.entry) {
    return;
  }

  const originalUrl = preload.entry.canonicalUrl;
  if (preload.entry.status === "ready") {
    setLightboxImageSource(originalUrl, renderToken, "original");
    return;
  }

  preload.ready.then((entry) => {
    if (renderToken !== state.lightboxRenderToken || !lightboxPreloadManager.isCurrent(preload.generation)) return;
    if (!lightbox.classList.contains("open") || state.lightboxIndex < 0) return;
    if (entry.status === "ready") {
      if (canonicalLightboxUrl(previewUrl) !== entry.canonicalUrl) setLightboxImageSource(entry.canonicalUrl, renderToken, "original");
      return;
    }
    if (entry.status === "failed") lightbox.classList.add("image-error");
  });
}

function stepLightbox(direction) {
  if (!state.lightboxImages.length) return;
  state.lightboxIndex = (state.lightboxIndex + direction + state.lightboxImages.length) % state.lightboxImages.length;
  lightboxPreloadManager.markInteraction(state.lightboxImages[state.lightboxIndex], state.lightboxIndex, direction > 0 ? "next" : "previous");
  updateLightbox();
  showLightboxControls();
}

function hideLightbox() {
  state.lightboxRenderToken += 1;
  lightboxPreloadManager.stop();
  lightbox.classList.remove("open");
  lightbox.classList.remove("controls-hidden", "dragging", "showing-preview", "image-loading", "image-error");
  lightbox.setAttribute("aria-hidden", "true");
  lightboxImage.onload = null;
  lightboxImage.onerror = null;
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
topButton.addEventListener("click", () => {
  cancelScrollRestoration();
  state.scrollNavigationIntent = "idle";
  window.scrollTo({ top: 0, behavior: "smooth" });
});
window.addEventListener("hashchange", () => {
  const intent = state.pendingScrollNavigationIntent || "new";
  state.pendingScrollNavigationIntent = null;
  prepareScrollNavigation(intent);
  beginPageNavigation();
  render();
  if (currentRouteNeedsFavoriteState() && !state.favoritesLoaded) {
    loadFavoriteMarks(state.pageAbortController.signal)
      .then(syncFavoriteButtonStates)
      .catch((error) => {
        if (error.name !== "AbortError") syncFavoriteButtonStates();
      });
  }
});
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
initBackToTopButton();
initScrollRestoration();

(async () => {
  beginPageNavigation();
  try {
    await loadGallery(false);
    if (currentRouteNeedsFavoriteState() && !state.favoritesLoaded) {
      await loadFavoriteMarks(state.pageAbortController.signal);
      syncFavoriteButtonStates();
    }
  } catch (error) {
    if (error.name !== "AbortError") throw error;
  }
})();
