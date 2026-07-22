# v103 repository convergence record

## Audited starting state

- Formal main: `eb3d3d8a9b2d4b14fac36b850fd2bed7cf5fcf14`.
- v102 feature line: `2ce51e2e57b138054c257cb7e6e1e7e3ce449500`.
- Merge base: `362e5f87ef6a4e153fbb3ee813897a29e467094b`.
- The v102 line had 27 commits not in main; main had 6 commits not in the v102 line.
- Five local branches, three actual remote branches, seven release tags and four Worktrees were audited. Every Worktree was initially clean.
- The detached Worktree at `e6cf233` had no unique commit and was already reachable from retained history.
- Two unreachable commits were superseded pre-amend documentation snapshots; the final equivalent documentation commit is reachable. No unreachable business code was found.

## Safety references

- `archive/pre-integration-main-20260722` points to the pre-integration main head.
- `archive/pre-integration-v102-20260722` points to the pre-integration v102 head.

## Integration method

`codex/consolidate-all-features-vNext` was created from the v102 head in a separate Worktree. `origin/main` was merged with `--no-ff`; conflicts in documentation, `app.js`, `index.html`, `server.js` and the Runtime environment allow-list were resolved field-by-field. No rebase, force push, reset, amend of published history, or blanket ours/theirs checkout was used.

The combined result preserves both feature families and adds only integration fixes: unified authorization for image lookup, pHash and video management; shared maintenance mutual exclusion; capability-aware frontend controls; and a video settings renderer regression fix.

## Data and runtime boundary

All destructive validation used a disposable short-path Runtime. Formal `E:\A_秀人`, `E:\回收站` and `D:\GalleryRuntime\data\gallery.db` were not used for scans, moves, restores, pHash generation or video processing. Formal deployment performs only idempotent schema initialization and read-only acceptance.
