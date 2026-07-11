# Development and Maintenance Guide

## Scope

This project intentionally keeps the inherited flat runtime structure. Do not move or split `server.js`, `app.js`, `styles.css`, `gallery-db.js`, or `duplicates-worker.js` without a separately approved refactor and full regression plan.

## Before a change

1. Read `README.md`, `网页.md`, and `AGENTS.md`.
2. Check the current branch, commit, tags, and `git status`.
3. Identify the active entry point, routes, API handlers, configuration reads, and data side effects related to the task.
4. Review correctness, data safety, disk/memory/CPU/network impact, browser resource cleanup, security, and maintainability.
5. State the files to change, risks, validation method, and anything requiring user confirmation.

## Active files

| File | Responsibility |
|---|---|
| `index.html` | Static HTML shell and lightbox markup |
| `app.js` | Hash routing, rendering, browser state, and API calls |
| `styles.css` | All current page and responsive styles |
| `server.js` | HTTP server, API routing, scans, media serving, thumbnails, and logs |
| `gallery-db.js` | SQLite schema and queries |
| `duplicates-worker.js` | Background duplicate hashing |
| `make-hls.ps1` | Manual HLS generation |
| `start-*.cmd/.ps1` | Windows launch entry points |
| `fix-network-access-48101.*` | Optional administrator network configuration |

Historical or specialist documents are references, not runtime entry points. Confirm their claims against current code before acting on them.

## Configuration

The application reads `process.env` directly and does not load `.env`. Use `.env.example` only as a format reference. Never commit real media paths, credentials, tokens, cookies, private keys, or production-only configuration.

Runtime data and source code must remain separate:

- `PHOTOS_DIR`: original user media
- `DATA_DIR`: SQLite, logs, thumbnails, carousel, and metadata cache
- `HLS_DIR`: generated HLS output when overridden
- `TRASH_DIR`: duplicate-media recycle destination

## Validation without starting the site

For documentation, configuration-template, or repository-only changes:

```powershell
node --check server.js
node --check app.js
node --check gallery-db.js
node --check duplicates-worker.js
```

Also verify:

- business source files did not change unexpectedly;
- `git diff --check` has no new whitespace errors;
- Git tracks no runtime data, database, logs, cache, generated media, or secrets;
- `.gitignore` matches representative forbidden paths.

Do not start the website when the task explicitly prohibits it.

## Runtime validation

Only when explicitly authorized, use an isolated `PHOTOS_DIR`, `DATA_DIR`, port, and disposable media. Never test scan, duplicate removal, HLS generation, or file movement against production data. Stop the isolated process and remove test artifacts after validation.

Minimum functional coverage depends on the change and may include:

- homepage and static assets;
- root, collection, media, search, favorites, recent, scan, duplicate, and log APIs;
- image thumbnails and lightbox;
- video Range, poster, and HLS;
- settings and duplicate pages;
- browser console and responsive layout.

## Media and resource rules

- Keep video `poster` and `preload="none"` or `metadata` behavior.
- Keep image lazy loading and batched rendering for large collections.
- Avoid mounting every video player in large lists.
- Clean event listeners, timers, requests, object URLs, and playing media when components or views are replaced.
- Keep scan, duplicate hashing, thumbnail generation, and transcoding concurrency bounded.
- Maintain upload/media path validation and file/database consistency for destructive operations.
- Treat generated thumbnails, HLS, logs, SQLite, and user media as runtime data, never Git content.

## Commit workflow

1. Review `git status` and the full diff.
2. Confirm unrelated user changes were not altered.
3. Run the relevant syntax and functional checks.
4. Scan changed content for secrets and large runtime files.
5. Update README, `网页.md`, migration, cleanup, or operations documentation when facts change.
6. Create one clear commit for one responsibility.
7. Create a version tag only after the worktree is clean and the tag target is verified.

Never force-push or overwrite incompatible remote history.

## Phase gates

- `migration-functional-baseline`: initial functional mirror
- `v1.0-migration`: migration freeze
- `v1.1-standardized`: GitHub project standardization

Code cleanup, performance work, and UI changes require separate stages and commits.
