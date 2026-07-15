# Changelog

## 2026-07-15 - Recover media-cleanup history after restart v89

- Restored the newest valid completed/stopped media-cleanup report from `DATA_DIR/logs` when Node starts, so a formal restart no longer hides the last read-only scan results.
- Marked recovered reports as read-only: `canDelete=false`, the frontend delete button stays disabled, and direct delete requests return 409 until a new scan completes in the current process.
- Extended the isolated Runtime smoke test to cover recovered status, result pagination and the delete rejection boundary. Formal v89 restart remains pending.

## 2026-07-15 - Move saved galleries into settings and paginate access logs v88

- Added `#/__settings/favorites` and `#/__settings/history` in the existing settings layout; reused the saved-card data, lazy preview, global columns/cover mode, navigation and immediate favorite removal behavior.
- Removed the favorites/recent sections and their startup requests from the home page without deleting marks or changing recent/favorite write APIs.
- Added the idempotent SQLite `access_logs` table and `(time DESC, id DESC)` index. Legacy daily NDJSON is streamed in batches using a content hash and retained as a backup.
- Changed `GET /api/access-log` to real server pagination (`page`, default `pageSize=50`, maximum 100) with stable ordering and totals.
- Added UTC-based 365-day retention at startup and every 24 hours; failures are diagnostic and non-fatal, and cleanup never runs `VACUUM`.
- Added isolated coverage for 0/1/49/50/51/100/101 rows, migration, pagination, parameter caps, ordering, POST, retention boundary and index creation. Formal Runtime deployment and physical iPad/iPhone checks remain pending.
- Verified the isolated UI before the final `v88` cache-marker bump at 1440×900, 1024×768, 768×1024 and 390×844: no page overflow or clipped settings labels, correct saved/history surfaces, 50-row page navigation, and no console warnings/errors. The settings-only stack breakpoint is 820px so iPad portrait keeps a usable content width.

## 2026-07-14 - Deploy media library cleanup v86

- Fast-forwarded formal `main` from `d18a2f2` to the integrated media-cleanup history without conflicts, rebasing or commit rewriting, then restarted only the PID-matched formal Gallery process through the existing task-hosted scripts.
- Confirmed loopback and LAN HTTP 200, frontend `v86`, the existing P0/P1/P3 lightbox behavior, search, favorites/recent sections, scroll restoration, back-to-top, poster-based `preload="none"` video loading and the responsive media-cleanup settings page.
- Ran formal read-only scan job `20260714-232613-22183b82` against the configured `PHOTOS_DIR`: 482,450 files and 7,288 directories completed in 102.126 seconds with zero errors, zero deleted files and zero deleted directories; the single PowerShell worker exited automatically.
- Verified bounded result pagination (`pageSize` capped at 200), category/file-name/relative-path filtering, path/size sorting and the five MediaFreeTree records. Counts requiring manual review are Unknown 24, Archive 4, MetadataOrSidecar 3,318 and Document 4,309.
- Kept `ALLOW_REMOTE_DELETE=0`; a duplicate scan start returned 409 and a LAN delete request returned 403 before confirmation or report processing. No localhost delete request was made.

## 2026-07-14 - Integrate v85 lightbox loading with media cleanup

- Merged the published `origin/main` history into `codex/media-library-cleanup` without rebasing or rewriting either branch.
- Preserved the v85 P0/P1/P3 lightbox scheduler, bounded diagnostics and thumbnail loading behavior alongside the media cleanup worker, APIs, settings route and polling lifecycle.
- Renumbered the long-term decisions so lightbox loading remains DEC-017 and controlled media cleanup is DEC-018.
- Raised the integrated feature-branch frontend cache version to `v86`; the formal main website remains on published `v85` until a separately authorized merge and release.
- Revalidated the merged v86 branch in an isolated localhost runtime: the WebP placeholder preceded the original, the displayed image used high fetch priority, sequential navigation and last-to-first wrapping stayed correct, close/reopen did not allow stale replacement, and the 390x844 lightbox/settings views had no horizontal overflow or console warnings/errors.
- Re-ran the authorized read-only production-media scan as job `20260714-224723-b04c608d`: 482,450 files and 7,288 directories completed in 173.388 seconds with zero errors, zero deleted files and zero deleted directories. Existing and new Runtime reports were retained.

## 2026-07-14 - Add media library cleanup settings

- Added a single-process, sequential PowerShell scanner that reads only configured `PHOTOS_DIR` metadata, skips reparse points, reports conservative image/video formats, and exits after completion or cancellation.
- Added bounded status/results APIs with category/search/path/size pagination and reports written directly to the existing Runtime logs directory.
- Added explicit `DELETE`/“删除” confirmation, current-job report binding, repeated root/reparse validation, localhost/`ALLOW_REMOTE_DELETE` enforcement, and bottom-up true-empty-directory cleanup.
- Added the `#/__settings/media-cleanup` interface, responsive results table, progress/statistics, cancellation and custom confirmation dialog; the integrated feature branch now uses frontend version `v86`.
- Validated isolated scan, duplicate-start rejection, stop cleanup, localhost test deletion, HTTP responsiveness, Chinese paths, mobile layout, and complete temporary-directory removal; production deletion was not performed.
- Confirmed that a correctly formed delete request through the LAN address returns HTTP 403 when `ALLOW_REMOTE_DELETE=0`, while the same isolated localhost workflow remains available.
- Completed one formal read-only scan from the existing Runtime `PHOTOS_DIR`: 482,450 files, 7,288 directories, 7,851 non-media candidates (4,204,588,435 bytes), 269 empty directories, 5 media-free trees, 2 suspicious tiny media files, and zero scan errors. No formal file or directory was deleted.

## 2026-07-14 - Prioritize the current lightbox original

- Replaced the shared FIFO lightbox path with a normalized-URL task scheduler that tracks network, decode, ready, failure and abort states and reuses in-flight promises.
- Added an independent P0 immediate channel for the current original, a decoded P1 next image, delayed low-priority P3 predictions, bounded retry, cancellation and five-entry retention.
- Kept the clicked WebP preview visible while the original loads and decodes, configured display attributes before `src`, and prevented stale callbacks from replacing the current image.
- Limited detail-page preview requests to the viewport neighborhood, marked non-critical thumbnails low priority, and added opt-in bounded timing diagnostics without default console noise.
- Preserved server cache policy, APIs, media paths, video/HLS behavior and visual layout; raised the frontend cache version to `v85`.

## 2026-07-14 - Preload upcoming lightbox images

- Changed image lightboxes to show the existing on-demand WebP preview immediately, then replace it with the current original image when ready.
- Added a session-scoped preload manager with a default three-image look-ahead, maximum concurrency of two, next-image decode attempt, URL task reuse, and a five-entry previous/current/ahead cache window.
- Added Save-Data and effective-connection downgrades, cyclic/small-gallery deduplication, one controlled retry for an explicitly viewed failed original, and generation/render-token guards.
- Closing the lightbox or changing routes now cancels pending idle timers, clears queued work and Image references, and prevents stale callbacks from replacing the current image.
- Preserved original media paths, HEIC compatibility previews, video `preload="none"`, video/HLS behavior, API formats, database schema, and Runtime paths; raised the frontend cache version to `v81`.

## 2026-07-14 - Display mislabeled HEIC images in the selected lightbox

- Confirmed that the seven `杏子yada/亮点` source files use HEIC content despite their `.jpg` names and `image/jpeg` responses, so Chrome cannot decode them directly.
- Scoped the existing bounded WebP preview URL to this collection's lightbox only; all other collection lightboxes continue to request their original image URLs.
- Preserved original photo paths for the lightbox `路径` action and did not modify media files, database records, server routes, styles, or other page behavior.
- Raised the frontend cache version to `v80`.

## 2026-07-14 - Restore gallery scroll position on history navigation

- Added route-scoped scroll snapshots with stable DOM anchors, relative offsets, rendered media depth, paging cursor, and bounded in-memory/session storage retention.
- Distinguished new navigation from browser history and parent/breadcrumb returns; new pages start at the top while Back, Forward, parent returns, and reload restore the prior visible item.
- Restored only the required existing 24/40 media batches with a 2.5-second loading budget instead of mounting or requesting an entire gallery.
- Preserved search queries in the current browser history entry so search-result detail navigation and refresh can restore both the query and its exact result position.
- Cancelled conflicting return-to-top animation/restoration work during route changes and raised the frontend cache version to `v79`.

## 2026-07-13 - Add responsive back-to-top control

- Added a body-level floating back-to-top button that remains available across hash routes without changing existing navigation or media behavior.
- Added compact responsive positioning with safe-area offsets, a 25% idle state, full-opacity interaction feedback, keyboard focus styling, and a layer below the lightbox.
- Added a cancellable 1000 ms smootherstep scroll animation with direct reduced-motion fallback and bumped frontend cache assets to `v73`.

## V2.0.1 - 2026-07-13

- Added bounded on-demand WebP previews with immutable versioned responses.
- Reduced home/media batches, added viewport image loading, current/next carousel loading, fetch cancellation, and strict video `preload="none"`.
- Added isolated preview smoke coverage and read-only cache statistics.
- Disabled idle carousel advancement so an untouched home page never walks through and downloads all 20 previews.

All notable repository-baseline changes are documented here. Functional behavior remains inherited from the migrated site unless a later version explicitly states otherwise.

## 2026-07-14 - Load every highlight preview and restore autoplay

- Changed only the homepage highlight carousel to load all 20 bounded WebP preview URLs during initialization instead of the current and next items only.
- Restored the original leftward one-card autoplay cadence of 10 seconds; manual navigation resets the next 10-second interval.
- Kept original-image URLs, other lists, video loading, carousel navigation, CSS, APIs, and Runtime configuration unchanged.
- Updated the frontend script cache version to `v75`.

## 2026-07-13 - Allow gallery access over ZeroTier

- Added an idempotent, UAC-gated ZeroTier-only firewall script and double-click entry for TCP 48102.
- Restricted the rule to the actual ZeroTier local IPv4 and prefix-derived remote subnet without changing ZeroTier, the LAN rule, runtime settings, or business code.
- Applied the rule after user-approved UAC and verified Private profile, exact local/remote scope, TCP 48102, and the unchanged LAN rule.
- Verified host-side HTTP 200 through loopback, physical LAN, and `192.168.192.1`; external-device validation remains a manual gate.

## 2026-07-13 - Run the Windows host without a visible console

- Changed the Scheduled Task Action to use non-interactive hidden PowerShell and explicitly hide the Node child window.
- Strengthened runtime status reporting to distinguish task state, Host PID, Node PID, Node parent PID, listener PID, and HTTP state; PID mismatches are no longer healthy.
- Reproduced the visible-host risk from the prior Interactive, non-hidden task Action and recorded the real Task Scheduler -> PowerShell host -> Node process tree.
- Passed 30-second tests for automatic launcher exit and manual launcher close, duplicate-start isolation, precise stop, and final hidden runtime startup.

## 2026-07-12 - Detach Windows runtime and prepare secure LAN access

- Replaced orphan-style Node launching with a Scheduled Task host that remains Running for the website lifetime and records host/Node PID plus exit data.
- Unified manual and logon startup through the same task; start/stop/status now report and manage task, parent PID, listener, and HTTP health.
- Passed the required 30-second closed-CMD validation with the same Node PID, Running task, TCP listener, HTTP 200, and empty stderr; duplicate start kept the same PID.
- Added a LAN-only firewall script and UAC CMD entry using TCP 48102, LAN local address, Private/LocalSubnet scope, and no ZeroTier changes.
- Recorded that UAC was canceled in the automation session, so the firewall rule and physical remote-device test remain pending.

## 2026-07-12 - Add Windows one-click runtime management

- Added double-click CMD wrappers for start, stop, status, autostart install, and autostart uninstall; all wrappers locate the project through `%~dp0` and reuse existing PowerShell logic.
- Added safe current-user Scheduled Task installation and removal for `Codex-PhotogalleryV1-Autostart` with a 30-second logon delay, Limited privileges, and IgnoreNew instance policy.
- Improved start handling for an already-running gallery and user-profile WinGet Node discovery; kept shared JSON PID metadata across start/stop/status.
- Verified stop, first start, duplicate start, status, isolated stop, final start, task definition, and manual task trigger without modifying business code or Runtime data.

## 2026-07-12 - Diagnose local browser access

- Confirmed the previous gallery PID was stale and port 48102 had no listener when the browser failure was investigated.
- Restarted the formal Runtime; PID `60468` now listens on IPv4 `0.0.0.0:48102`.
- Verified localhost, loopback, LAN, static assets, core APIs, redirects, MIME types, and Windows proxy state.
- Found no HTML, JavaScript, CSS, HTTPS redirect, MIME, old-path, or proxy defect requiring code changes.
- Added `docs/V1.5_BROWSER_ACCESS_DIAGNOSIS.md` and a precise manual browser checklist.

## 2026-07-12 - Begin V1.5.0 daily runtime takeover

### Added

- Added `scripts/status-gallery.ps1` with PID, TCP port, Node, Runtime, env, and log reporting without requiring CIM listener access.
- Added the Windows Task Scheduler design, operation manual, and explicit V1.5 acceptance report.

### Validation

- Started the formal Runtime as PID `56500`; status reports running on 48102 and stderr is empty.
- Verified homepage through localhost, LAN, and ZeroTier addresses from the host, plus core APIs, search, original image, video Range, settings shell, and temporary favorite/recent create-read-delete flows.
- Recorded that controlled PC browser automation was blocked by Windows permissions and physical mobile access remains an honest manual gate.
- Attempted the existing firewall script; it safely refused without an administrator token and made no system change.

### Scope

- No UI, performance, database optimization, scan, full cache generation, HLS generation, or autostart task registration was performed.

## 2026-07-12 - Finalize V1.4.5 Runtime cache policy

### Changed

- Disabled new image thumbnail generation in the formal Runtime while preserving existing test files and thumbnail URL compatibility; cache misses now serve the original image.
- Changed the bounded cache tool's image default to zero and added an explicit image-request confirmation gate.
- Added Runtime configuration for a seven-day HLS lifecycle policy without enabling deletion.

### Added

- Added a read-only Runtime capacity script and expanded environment checks for tools, cache policy, and free disk space.
- Added `docs/V1.4.5_RUNTIME_FINAL_CHECK.md` with final image, poster, HLS, lifecycle, capacity, environment, and V1.5 guidance.

### Validation

- Verified an uncached thumbnail URL returned byte-identical original image content without increasing the 40-file thumbnail cache.
- Verified poster HTTP 200, database SHA256 unchanged, HLS remains empty, and the service stopped cleanly.
- No cache deletion, full generation, scan, duplicate task, schema change, UI optimization, or performance work ran.

## 2026-07-12 - Establish V1.4.4 Runtime cache generation

### Fixed

- Restored video poster sources from Runtime SQLite when the in-process mapping is empty, removing the new-process poster 404 without using legacy cache paths.
- Required `make-hls.ps1` to use configured `HLS_DIR` or an explicit output root instead of a repository-local default.

### Added

- Added bounded image/poster cache generation with Runtime state, pause marker, resume behavior, and append-only logs.
- Added `docs/V1.4.4_CACHE_REBUILD_PLAN.md` with cache logic, sample evidence, full-rebuild gates, risks, and rollback.

### Validation

- Generated 20 image thumbnail samples and 3 video poster samples with zero failures; no HLS was generated.
- Verified pause rejection and zero-item resume behavior.
- Confirmed poster direct access works after process restart, stderr is empty, media is unchanged, and the Runtime database SHA256 matches the migration baseline.
- Stopped PID `37356`; port 48102 is no longer listening.

## 2026-07-12 - Fix launcher path handling and pass V1.4.3 validation

### Fixed

- Fixed `scripts/start-gallery.ps1` so a `server.js` path containing spaces is passed to Node as one argument while preserving Node selection, environment injection, logs, and PID metadata.

### Validation

- Passed a non-service `node --check` boundary test using the real spaced project path.
- Started PID `57900` on port 48102 and passed homepage, config, SQLite stats, root collections, highlights, original image, one thumbnail, and video Range checks.
- Recorded the existing poster HTTP 404 without fixing it.
- Stopped the service, removed PID metadata, and confirmed 48102 was no longer listening.

### Scope

- No business code, API, database schema, port, data path, Runtime structure, media, scanning, duplicate processing, deletion, or HLS behavior changed.

## 2026-07-12 - Record failed V1.4.3 first-start validation

### Added

- Added `docs/V1.4.3_RUNTIME_VALIDATION_REPORT.md` with the attempted PID, startup parameters, log evidence, validation matrix, stop result, and next gate.

### Result

- The launcher created PID `55336`, but Node exited before listening because the project entry path containing spaces was split at `D:\A8`.
- No API, database, media, thumbnail, video, poster, HLS, scan, duplicate, or delete validation ran.
- The stop script removed the stale PID record and port 48102 was confirmed not listening.

### Scope

- The failure was recorded without repairing scripts or modifying business code, database content, media, configuration, or firewall state.

## 2026-07-12 - Implement V1.4.2 independent runtime

### Added

- Added safe PowerShell environment parsing, preflight, start, stop, and TCP 48102 firewall scripts under `scripts/`.
- Added `docs/V1.4.2_RUNTIME_IMPLEMENTATION.md` with directory, database hash, configuration, startup, rollback, and risk records.
- Created the external `D:\GalleryRuntime` structure and a SHA256-verified `gallery.db` copy outside Git.

### Changed

- Updated current context, architecture, decisions, TODO, testing, and handoff documentation to reflect the implemented-but-not-started runtime.

### Validation

- Source-before, source-after, and target database SHA256 values matched.
- No website, SQLite connection, firewall rule, scan, thumbnail, poster, HLS, or media mutation was started.
- Business JavaScript, HTML, CSS, API behavior, database schema, and legacy project were not modified.

## 2026-07-11 - Initialize Codex long-term context documentation

### Added

- Added `PROJECT_CONTEXT.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `TODO.md`, `TESTING.md`, and `HANDOFF.md` as stable context entry points.

### Changed

- Reorganized `AGENTS.md` around mandatory reading order, fixed validation workflow, documentation lifecycle, Git rules, and runtime-data protection.
- Appended this documentation initialization record to `CHANGELOG.md`.

### Files

- `AGENTS.md`
- `PROJECT_CONTEXT.md`
- `ARCHITECTURE.md`
- `DECISIONS.md`
- `TODO.md`
- `TESTING.md`
- `CHANGELOG.md`
- `HANDOFF.md`

### Validation

- Audited repository files, entry points, routes, SQLite schema, startup scripts, `.gitignore`, Git state, and current validation methods.
- Confirmed no business code, startup logic, database, UI, API, or runtime data changed.

### Notes

- Current code still defaults to port `48101`; the V1.4 target `48102` and independent runtime are decisions pending implementation.
- New Codex sessions must follow the reading order in `AGENTS.md`.

## v1.3-release - 2026-07-11

- Added the release-ready project status document.
- Completed full Git object, runtime-data, large-file, and sensitive-information audits.
- Replaced machine-specific paths in current documentation with semantic placeholders.
- Configured the GitHub remote without pushing; remote history remains unverified because the current environment could not connect to GitHub.

## v1.2.5-code-clean - 2026-07-11

- Removed six confirmed unreachable private functions from `server.js`.
- Preserved the active SQLite highlight, API, scan, media, and database call chains.
- Added static and isolated runtime verification evidence.

## v1.2-clean - 2026-07-11

- Added the cleanup report.
- Archived four superseded historical documents without losing their history.
- Audited runtime scripts and core-code cleanup candidates conservatively.

## v1.1-standardized - 2026-07-11

- Standardized README, AGENTS, environment template, Git ignore rules, and maintenance documentation.
- Kept the inherited flat runtime file structure and business logic unchanged.

## v1.0-migration - 2026-07-11

- Froze the selected functional migration source and repository baseline.
- Documented runtime data separation, environment variables, startup, deployment, and migration evidence.

## migration-functional-baseline - 2026-07-11

- Established the first clean functional mirror in an independent Git repository.
- Excluded the legacy Git directory, production data, user media, logs, caches, thumbnails, and generated output.

# V2.0.1 audit - 2026-07-13

- Audited mobile bandwidth, shallow directory loading, image/video rendering, pagination, caching, and request cancellation without changing business code.
- Confirmed that 20 Runtime carousel files occupied 150.15 MiB and that disabled thumbnail generation can make thumbnail URLs return original images.
- Added `docs/V2.0.1_MOBILE_BANDWIDTH_AUDIT.md`; browser transfer metrics remain pending manual DevTools verification.
