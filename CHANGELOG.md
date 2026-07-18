# Changelog

## 2026-07-18 - Unify gallery sorting and add exact image lookup v99

- Replaced page-specific legacy sort modes with eight shared modes covering natural name, image count, video count and content-update time in both directions; added null-last and deterministic name/path tie breakers.
- Moved root collection sorting before pagination, applied the same rules to subdirectories and favorites, kept viewing history chronological, and preserved FTS relevance as the search-specific default.
- Added a single-image, 200 MiB, streaming multipart endpoint that validates extension, MIME and signature, computes the existing original-byte SHA-256 without writing a temporary file, and uses `idx_media_hashes_sha256` to return every relative-path match.
- Added the accessible desktop/mobile upload panel, coverage-aware no-match wording, isolated sort/hash tests and v99 responsive-browser validation. SQLite schema, formal media and generated caches were unchanged.
- Deployed v99 through the existing task-hosted runtime; final Node PID 25840 is the only 48102 listener, loopback/LAN are HTTP 200, formal exact lookup and no-match boundaries passed, and no rollback was required.

## 2026-07-16 - Add bounded video compatibility scanning and result-driven playback v98

- Added a read-only, resumable scanner over SQLite `media.type='video'`; metadata probing is limited to two concurrent FFprobe processes, and only suspect files receive three one-second decode samples with one concurrent FFmpeg process.
- Added centralized `direct_safe`, `device_dependent`, `fallback_required`, and `invalid` classification with structured reason codes, atomic runtime reports, incremental fingerprint reuse, pause/resume/stop, timeout cleanup, filtered pagination, and a new settings page.
- Replaced the collection-name compatibility exception with report-driven media-ID routing. Direct-safe videos retain original lazy Range URLs; only `fallback_required` items may use the single, user-triggered, no-cache H.264/AAC stream; invalid items show an unavailable state.
- Completed the formal 2,096-video scan without changing media or SQLite: 1,432 direct-safe, 267 device-dependent, 395 fallback-required, and 2 invalid. The immediate incremental rerun skipped all 2,096 unchanged rows and started no probe/decode processes.
- Raised static assets to `v98`; verified loopback, LAN and ZeroTier HTTP 200, original Range 206, compatible H.264/yuv420p/AAC output, explicit child-process stop, and exact before/after hashes for five source videos.

## 2026-07-16 - Stream the selected legacy video collection as browser-compatible MP4

- Confirmed that sampled `看球` MP4 files use MPEG-4 Part 2 (`mpeg4/mp4v`) video with AAC audio; HTTP Range and lazy loading were healthy, but Chrome decoded no video dimensions.
- Added a path-scoped, user-triggered compatibility stream that converts only this collection to H.264/AAC fragmented MP4 without modifying source media or writing a transcode cache.
- Limited compatibility work to the latest single stream, capped output at a 960-pixel edge and 30 fps, and added explicit stop handling for pause, video switching, route changes, and client disconnects.
- Kept all other collections on their original Range URLs and raised frontend assets to `v97`.
- Restarted the formal service as Node PID 28048; loopback, LAN and ZeroTier returned HTTP 200, formal output probed as H.264/yuv420p 720×960, and explicit stop reduced the live FFmpeg process count from one to zero.

## 2026-07-16 - Deploy FTS5 search v96 to the formal runtime

- Added an explicit `--allow-formal-db` maintenance-window override while preserving default formal-path refusal, and allowed the runtime launcher to validate and inject `SEARCH_BACKEND_MODE=auto`.
- Created and integrity-checked a timestamped SQLite backup, migrated 474,470 media rows, verified equal media/mapping/FTS counts with zero consistency differences, and optimized the index.
- Restarted the task-hosted formal service on port 48102 with FTS5 active; six search classes returned HTTP 200 without a `SCAN media` plan, and no filesystem scan was started.

## 2026-07-16 - Simplify FTS5 integration to the personal-site core

- Kept mapped trigram search, two-character title lookup, strict search modes, bounded frontend requests, transactional media/FTS CRUD, basic status, consistency backup and legacy rollback.
- Reduced the state row to schema/status/timestamps/last error; reduced migration commands to dry-run/backup/apply/verify/optimize and consistency commands to quick/full.
- Removed restore/rebuild/status orchestration, full-copy benchmark and recovery-drill scripts, complex filesystem failure scenarios, and Chrome/full-scan/staging/zero-downtime work as future gates.
- Removed the uncommitted B1.5 stress branch, sampling/fault-injection code and the ignored 474,470-file synthetic tree. Formal DB, media, PID 2064 and port 48102 were not modified.

## 2026-07-16 - Integrate FTS5 search candidate v96 on isolated copies

- Added the shared mapped trigram FTS core, explicit migration/status/verify/optimize/backup/restore tooling, strict auto/fts5/legacy-like modes and a read-only index status API.
- Connected candidate search, full gallery index transactions and duplicate-record deletion to mapping/FTS synchronization; filesystem uncertainty marks the index stale and rescans repair it.
- Kept v95 request cancellation/cache/limits and added bounded degraded/two-character guidance; raised only candidate static markers to v96 without deploying formal runtime.
- Migrated and fully compared a 474470-row SQLite copy, verified interruption resume, safe backup/restore, incremental CRUD/rollback/failure cases and isolated 48103 API performance. Formal DB/PID/48102/media were unchanged.
- Real Chrome acceptance was blocked by the missing ChatGPT Chrome Extension native host, and the inherited single-transaction full scanner still needs an isolated full-media peak test; v96 remains not deployable.

## 2026-07-16 - Validate and define FTS5 Prototype V96

- Verified the actual Node 24.14.0 / SQLite 3.51.2 runtime supports FTS5, trigram Unicode, MATCH, trigram LIKE and FTS maintenance commands; confirmed the less-than-three-code-point limitation and safe MATCH quoting behavior.
- Built and compared external-content, independent raw-path, compact, URL-decoded and stable-mapping FTS structures on full 474,470-row online-backup copies without changing the formal database or process.
- Selected a stable `media_id` mapping plus independent internal-content trigram index over `title` and decoded relative path. The final copy added 284,315,648 bytes, built in 89.052 seconds with 2,000-row transactions, peaked at 141,426,688-byte RSS and 14,893,832-byte WAL, and passed SQLite/FTS plus three-layer consistency checks.
- Reduced sparse filename/no-result prototype totals from about 2.3 seconds to 34.320/26.717ms cold and 24.346/22.015ms hot medians in the final indexed run; repeated indexed cold runs remained below 81/27ms. Kept the formal `/api/search`, frontend v95, scanner and deployment unchanged.
- Measured the case-insensitive two-character title prefix index at 7,127,040 logical bytes and 2.486 seconds; it reuses `idx_media_title_nocase` range plans instead of a media scan.
- Validated the two-character media-only term `扫码`: four title-prefix rows via the candidate `idx_media_title_nocase`, zero trigram rows. A 50k Chinese-bigram feasibility sample found 4/4 but remains outside the recommended formal structure.
- Added isolated capability, build, benchmark, MATCH/LIKE semantics, bigram and end-to-end safety scripts plus `docs/SEARCH_FTS5_PROTOTYPE_V96.md`.

## 2026-07-16 - Bound and instrument SQLite search v95

- Measured the formal v91 search path read-only against 7,287 collections and 474,470 media rows. The original plans used collection/media scans plus temporary ORDER BY B-trees, with the 12-query loopback baseline ranging from 6.0 to 16.7 seconds.
- Split collection ranking into exact, indexed prefix and bounded contains stages; added `idx_collections_title_nocase`, selected only card fields, removed media ORDER BY, shared a maximum 60-result budget and used one extra row instead of COUNT.
- Added development-only structured server timing for parameter parsing, collection/media SQL, count, bounded sort, transform, serialization and API total; formal default remains off.
- Added 250ms client debounce, immediate AbortController cancellation, request-sequence protection, 30-second same-query cache and a two-character minimum. Result previews remain lazy WebP requests with no original-photo or video node creation.
- Verified the real-data copy after `PRAGMA optimize`: exact/prefix collection API about 37-39ms, common bounded searches about 12-85ms, sparse filename/no-result about 2.3s. Browser first result rendering was 25.9-36.3ms with at most 60 cards and zero console warnings/errors.
- Kept `LIKE '%query%'` media fallback and its actual `SCAN media` plan explicit; FTS5 remains a separate future review and was not implemented.

## 2026-07-15 - Move the formal recycle root to the media volume

- Changed only the external Runtime `TRASH_DIR` from `D:\GalleryRuntime\trash` to `E:\回收站`; `PHOTOS_DIR=E:\A_秀人` and all other settings remain unchanged.
- Confirmed the target is a real, empty, non-reparse directory outside the media root with create/write/rename/delete permission, then restarted only the PID-validated formal Host/Node through the existing scripts.
- Verified loopback/LAN HTTP 200 with v91, same-volume mode, the approved job and unchanged 7,851 candidates. No formal recycle or restore request was sent, no manifest/job directory was created, and no media file was moved.

## 2026-07-15 - Refresh media-cleanup touch targets v91

- Raised the media-cleanup action controls to a 44px minimum touch height and bumped both static resource cache markers after the first browser pass showed the old v90 stylesheet remained cached.
- Deployed through the PID-validated scheduled-task scripts, completed the formal read-only scan `20260715-133504-77ec5bd2` with 482,450 files, 7,288 directories, 7,851 non-media candidates and zero errors, and confirmed zero formal moves, restores, cleanup directories or partial files.

## 2026-07-15 - Replace media-cleanup permanent deletion with recoverable recycle v90

- Removed the v86 candidate `File.Delete` execution path and made legacy `POST /api/media-cleanup/delete` return HTTP 410.
- Added localhost-only `POST /api/media-cleanup/recycle` and `/restore` for the approved completed report. Client requests contain only jobId and confirmation text; roots, candidates and manifest paths are server-resolved.
- Reused configured `TRASH_DIR` and preserved source-relative paths under `media-cleanup/<jobId>/files`; added append-only manifest, atomic summary and recycle log.
- Added scan-time revalidation, conflict suffixes, idempotent retry, same-volume rename, single-concurrency cross-volume copy/size-verify/atomic-finalize/source-delete, `CopiedButSourceRetained`, and no-overwrite restore.
- Added target-space preflight and bottom-up true-empty source-directory cleanup while skipping ReparsePoint and the media root.
- Updated the settings page with trash path, same/cross-volume mode, capacity, progress/result metrics, MOVE/RESTORE confirmation and manifest location without loading the full manifest.
- Added isolated same-volume, forced-copy, failure-injection and HTTP API coverage. Tests ended with zero `.partial` files and `TEMP_ROOT_EXISTS=False`; formal `E:\A_秀人` remained untouched.

## 2026-07-15 - Recover media-cleanup history after restart v89

- Restored the newest valid completed/stopped media-cleanup report from `DATA_DIR/logs` when Node starts, so a formal restart no longer hides the last read-only scan results.
- Marked recovered reports as read-only: `canDelete=false`, the frontend delete button stays disabled, and direct delete requests return 409 until a new scan completes in the current process.
- Extended the isolated Runtime smoke test to cover recovered status, result pagination and the delete rejection boundary.
- Formally pushed `fe1a4fa` to `origin/main` and restarted only the PID-matched 48102 Node process from PID 18704 to PID 3468. Loopback/LAN returned HTTP 200 with v89 assets; the saved report `20260714-232613-22183b82` recovered with 7,851 pageable results and deletion disabled.

## 2026-07-15 - Move saved galleries into settings and paginate access logs v88

- Added `#/__settings/favorites` and `#/__settings/history` in the existing settings layout; reused the saved-card data, lazy preview, global columns/cover mode, navigation and immediate favorite removal behavior.
- Removed the favorites/recent sections and their startup requests from the home page without deleting marks or changing recent/favorite write APIs.
- Added the idempotent SQLite `access_logs` table and `(time DESC, id DESC)` index. Legacy daily NDJSON is streamed in batches using a content hash and retained as a backup.
- Changed `GET /api/access-log` to real server pagination (`page`, default `pageSize=50`, maximum 100) with stable ordering and totals.
- Added UTC-based 365-day retention at startup and every 24 hours; failures are diagnostic and non-fatal, and cleanup never runs `VACUUM`.
- Added isolated coverage for 0/1/49/50/51/100/101 rows, migration, pagination, parameter caps, ordering, POST, retention boundary and index creation. Formal Runtime deployment is complete; physical iPad/iPhone checks remain pending.
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
