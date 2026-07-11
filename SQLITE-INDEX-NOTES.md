# SQLite Index Notes

The site now uses SQLite as the primary data source.

## Main Data Flow

- Frontend startup reads `/api/collections/root`.
- Collection pages read `/api/collections/:id`.
- Detail pages read `/api/media?collectionId=...`.
- Search reads `/api/search?q=...`.
- Highlights read `/api/highlights`.
- Refresh uses `/api/refresh-index`.

The frontend no longer uses `/api/gallery` during normal browsing.

## Compatibility Files

- `data/gallery.db` is the active index database.
- `data/gallery.json` is still generated as a diagnostic and rescue file.
- `/api/gallery` and `/api/refresh` are still available on the server for manual recovery and comparison, but they are not part of the normal frontend path.

## Tables

- `collections`: collection tree nodes.
- `media`: image and video rows.
- `covers`: cover cache.
- `scan_state`: global and per-directory scan signatures.
- `user_marks`: reserved for future favorites and user marks.

## Refresh Behavior

- If the global directory signature has not changed, `/api/refresh-index` skips the full scan.
- If files changed, the current safe behavior is to fall back to the full scanner and rebuild the SQLite index.
- Per-directory change detection is available through `/api/index/changed-directories`.

## Recovery

If `data/gallery.db` is corrupt, SQLite API handlers try to rebuild it from `data/gallery.json`.

If both files are unusable, delete `data/gallery.db` and run a refresh so the site can rebuild the index from the photo directory.
