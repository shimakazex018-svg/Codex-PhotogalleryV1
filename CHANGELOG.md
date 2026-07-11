# Changelog

All notable repository-baseline changes are documented here. Functional behavior remains inherited from the migrated site unless a later version explicitly states otherwise.

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
