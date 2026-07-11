# GitHub Release Report

## Repository

- GitHub repository: `https://github.com/shimakazex018-svg/Codex-PhotogalleryV1.git`
- Release date: 2026-07-11
- Published branch: `main`
- Release baseline commit: `12f285cb25b1288f6961683bac18557ebbdd258f`
- Release baseline tag: `v1.3-release`
- Push mode: normal non-force push to an empty remote

This report is committed after the release baseline, so the latest `main` commit is the documentation commit containing this file. The `v1.3-release` tag intentionally remains attached to the verified release baseline above.

## Published versions

| Tag | Commit | Purpose |
|---|---|---|
| `migration-functional-baseline` | `acf83e61afbade5ede48e2b7dd29e04531554f04` | Initial clean functional mirror |
| `v1.0-migration` | `563d8c140ee1912b1bfbd756b1ba1d134eb3860c` | Migration freeze |
| `v1.1-standardized` | `4dbead225c3550c5429d6f53d378c16b093b3ebd` | Project and GitHub standardization |
| `v1.2-clean` | `1e0ac7cbd22eb61c6b62c31cbddbfaf483bad7a7` | File and historical-document cleanup |
| `v1.2.5-code-clean` | `9e54666a363d4467812e55a50521d8c7a42b97bd` | Confirmed unreachable-code cleanup |
| `v1.3-release` | `12f285cb25b1288f6961683bac18557ebbdd258f` | First GitHub release-ready baseline |

## Repository rules

- Use `main` only for reviewed, validated, maintainable states.
- Create clear commits with one responsibility.
- Review `git status`, the full diff, syntax checks, documentation impact, sensitive information, and large files before committing.
- Never force-push or overwrite incompatible remote history.
- Preserve release tags as immutable rollback points.
- Keep functional changes, cleanup, performance work, and UI work in separate approved stages.

## Data excluded from Git

The repository must not contain:

- `data` runtime contents other than `data/.gitkeep`
- `photos` contents other than `photos/.gitkeep`
- SQLite databases or backups
- logs, cache, runtime state, thumbnails, posters, or highlight caches
- HLS playlists and segments
- recycle-bin contents
- test runtime artifacts
- user images, videos, or other media
- real `.env` files, passwords, tokens, cookies, private keys, or production-only configuration

Runtime media and data remain external and are attached through environment variables such as `PHOTOS_DIR` and `DATA_DIR`.

## Verification performed

- Confirmed a clean local worktree on `main`.
- Confirmed the target remote URL.
- Confirmed the remote had no heads or tags before the first push.
- Pushed `main` without force and established `origin/main` tracking.
- Pushed all six version tags without force.
- Verified the remote branch and every tag with `git ls-remote`.
- Confirmed no business code, HTML, CSS, JavaScript, database, port, or data-path changes were made during publication.

## Future maintenance

1. Read `README.md`, `网页.md`, and `AGENTS.md` before changes.
2. Keep production data and user media outside Git.
3. Use isolated data for destructive or media-processing tests.
4. Update `CHANGELOG.md`, `docs/PROJECT_STATUS.md`, and relevant maintenance reports when release facts change.
5. Push normally and verify remote refs after each approved release.
6. Treat poster repair, runtime restoration, performance work, and UI work as separate reviewed stages.

The next planned stage is V1.4 runtime environment restoration. This report does not make runtime or functional changes.
