# Project Status

## Current version

- Release preparation version: `v1.3-release`
- Branch: `main`
- Application version marker: `v70`
- Status: GitHub release preparation complete after the V1.3 commit and tag are created

## Git tags

| Tag | Purpose |
|---|---|
| `migration-functional-baseline` | Initial functional mirror before repository cleanup |
| `v1.0-migration` | Frozen migration baseline |
| `v1.1-standardized` | GitHub project and documentation standardization |
| `v1.2-clean` | Safe file and historical-document cleanup |
| `v1.2.5-code-clean` | Confirmed unreachable-code cleanup |
| `v1.3-release` | First GitHub release-ready baseline |

## Project purpose

The project indexes an external photo and video directory into SQLite and exposes a local/LAN browser gallery. It is intended for personal media browsing and maintenance rather than public multi-user hosting.

Core capabilities include directory and collection browsing, image lightbox, video Range playback, search, favorites, recent views, highlights, thumbnails, duplicate detection, access logs, background scans, and optional HLS generation.

## Technology stack

- Native HTML, CSS, and JavaScript frontend
- Node.js native HTTP server
- Node.js built-in `node:sqlite`
- FFmpeg and FFprobe for optional media processing
- Windows command/PowerShell deployment scripts
- No third-party npm runtime dependencies or build step

## Current file structure

```text
<project-root>/
├─ index.html
├─ app.js
├─ styles.css
├─ server.js
├─ gallery-db.js
├─ duplicates-worker.js
├─ start-server-48101.cmd
├─ start-site.cmd
├─ start-site.ps1
├─ fix-network-access-48101.cmd
├─ fix-network-access-48101.ps1
├─ make-hls.ps1
├─ data/.gitkeep
├─ photos/.gitkeep
├─ docs/
│  ├─ PROJECT_STATUS.md
│  ├─ DEVELOPMENT.md
│  ├─ MIGRATION_SOURCE.md
│  ├─ MIGRATION_MANIFEST.md
│  ├─ CLEANUP_REPORT.md
│  ├─ CODE_CLEANUP_REPORT.md
│  └─ archive/
├─ README.md
├─ AGENTS.md
├─ 网页.md
├─ CHANGELOG.md
└─ .env.example
```

## Data scale reference

The migration-time environment reported approximately:

- 7,262 collections
- 472,449 media records
- 470,353 images
- 2,096 videos

These values are an environment reference only. The live index can change after scans and cleanup. No production database, index, thumbnails, logs, HLS output, photos, or videos are stored in Git.

## Current runtime model

1. Set runtime environment variables in the launching shell, scheduler, service manager, or deployment environment.
2. Mount the external media directory through `PHOTOS_DIR`.
3. Mount writable SQLite/cache/log storage through `DATA_DIR`.
4. Run `node server.js` or the inherited Windows launch script.
5. Access the configured HTTP listener from the local machine or a controlled network.

The application does not automatically load `.env`, install a Windows service, provide HTTPS, or configure authentication.

## GitHub remote status

- Local remote name: `origin`
- Remote URL: `https://github.com/shimakazex018-svg/Codex-PhotogalleryV1.git`
- Push performed: no
- Remote branch/tag history: not confirmed in V1.3

The connected GitHub application did not list the repository, and the read-only `git ls-remote` check could not connect to `github.com:443` from the current environment. This is not evidence that the remote is empty. Before the first push, repeat `git ls-remote --heads --tags origin` from a network-enabled environment and stop if any incompatible history exists.

## Completed stages

- V1.0: functional mirror migration
- V1.0.1: migration freeze reinforcement
- V1.1: project and GitHub structure standardization
- V1.2: safe file and historical-document cleanup
- V1.2.5: confirmed unreachable-code cleanup
- V1.3: GitHub release preparation and repository safety audit

## Known issues and limitations

- Video poster requests may return 404 after a new process starts without restoring the poster source-path mapping. Video Range and HLS remain available.
- There is no login, role authorization, or application-level access control.
- There is no automated test, lint, typecheck, or build pipeline.
- SQLite schema creation is runtime-managed rather than versioned through migration files.
- Generated thumbnails, logs, HLS, SQLite, and media need external capacity monitoring and backup.
- Historical documents under `docs/archive/` may describe superseded behavior and are not current operating instructions.

## Future plan

Future work requires a separately approved stage:

1. Confirm remote history and push the release-ready branch and tags without force.
2. Address the poster mapping defect with isolated regression coverage.
3. Add access control before exposing the site beyond a trusted network.
4. Add a minimal automated smoke-test and repository CI workflow.
5. Measure before any performance, loading, or UI optimization.

V1.3 does not implement any of these functional changes.
