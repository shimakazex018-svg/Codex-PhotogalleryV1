# Changelog

## V2.0.1 - 2026-07-13

- Added bounded on-demand WebP previews with immutable versioned responses.
- Reduced home/media batches, added viewport image loading, current/next carousel loading, fetch cancellation, and strict video `preload="none"`.
- Added isolated preview smoke coverage and read-only cache statistics.

All notable repository-baseline changes are documented here. Functional behavior remains inherited from the migrated site unless a later version explicitly states otherwise.

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
