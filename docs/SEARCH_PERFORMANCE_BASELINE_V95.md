# Search performance baseline v95

## Scope and data source

- Formal Runtime database was inspected read-only: 7,287 `collections`, 474,470 `media`, 1,169,928,192-byte `gallery.db`.
- The before API baseline used the running v91 loopback service with `limit=60`.
- Schema/index changes, `PRAGMA optimize`, modified SQL, API tests and browser tests used a SQLite online-backup copy under Git-ignored `tmp/`; the formal database and media were not modified.
- No test read `gallery.json`, traversed `PHOTOS_DIR`, generated previews, or opened original media.

## Effective call chain

```text
searchBox input
  -> setSearchQuery()
  -> 250 ms debounce / abort previous AbortController / request sequence guard
  -> GET /api/search?q=<query>&limit=60
  -> server.js handleIndexApi()
  -> gallery-db.js search()
     -> exact collection SQL
     -> prefix collection SQL
     -> bounded collection-contains SQL if capacity remains
     -> bounded media-contains SQL only when preferred collection matches do not satisfy the request
  -> JSON serialization
  -> limited collection/media cards using lazy WebP previews
```

The live path does not read `gallery.json` or enumerate the file system. There is no search JOIN, `DISTINCT`, full `COUNT(*)`, or Node-side truncation of an unbounded result set.

## Original SQL

```sql
SELECT c.*, (SELECT COUNT(*) FROM collections child WHERE child.parent_id = c.id) AS child_count
FROM collections c
WHERE c.title LIKE ? OR c.id LIKE ?
ORDER BY c.level, c.title
LIMIT ?;

SELECT *
FROM media
WHERE title LIKE ? OR file_name LIKE ? OR src LIKE ?
ORDER BY type, title
LIMIT ?;
```

All LIKE parameters were `%query%`. The media query scanned 474,470 rows in the worst case, selected large unused fields including `metadata`, and sorted matches in a temporary B-tree.

## Modified SQL

Only card fields are selected. `%` and `_` in user input are escaped and treated literally.

```sql
-- 1. Exact collection name
SELECT <collection-card-columns>,
       (SELECT COUNT(*) FROM collections child WHERE child.parent_id = c.id) AS child_count
FROM collections c
WHERE c.title = ? COLLATE NOCASE
LIMIT ?;

-- 2. Prefix range; upper bound is query || U+FFFF
SELECT <collection-card-columns>,
       (SELECT COUNT(*) FROM collections child WHERE child.parent_id = c.id) AS child_count
FROM collections c
WHERE c.title >= ? COLLATE NOCASE
  AND c.title < ? COLLATE NOCASE
ORDER BY c.title COLLATE NOCASE
LIMIT ?;

-- 3. Collection contains/path fallback (7,287 rows)
SELECT <collection-card-columns>,
       (SELECT COUNT(*) FROM collections child WHERE child.parent_id = c.id) AS child_count
FROM collections c
WHERE c.title LIKE ? ESCAPE '\' COLLATE NOCASE
   OR c.id LIKE ? ESCAPE '\' COLLATE NOCASE
LIMIT ?;

-- 4. Media fallback, at most remaining-limit + 1 rows returned
SELECT id, collection_id, type, title, file_name, src,
       thumb, detail_thumb, carousel_thumb, poster
FROM media
WHERE title LIKE ? ESCAPE '\' COLLATE NOCASE
   OR file_name LIKE ? ESCAPE '\' COLLATE NOCASE
   OR src LIKE ? ESCAPE '\' COLLATE NOCASE
LIMIT ?;
```

The API default is 50 and maximum is 60. All collection stages share `LIMIT 61`; media receives only the remaining result budget plus one. The extra row sets `hasMore` without a total count. Exact or prefix collection matches are returned first and skip the media fallback. At most 61 media rows are ranked in Node so filename/title matches precede path-only matches.

## Query plans

### Before

```text
collections: SCAN c
collections: SEARCH child USING COVERING INDEX idx_collections_parent (parent_id=?)
collections: USE TEMP B-TREE FOR ORDER BY
media:       SCAN media
media:       USE TEMP B-TREE FOR ORDER BY
```

### After on the real-data copy

```text
exact:   SEARCH c USING INDEX idx_collections_title_nocase (title=?)
prefix:  SEARCH c USING INDEX idx_collections_title_nocase (title>? AND title<?)
child:   SEARCH child USING COVERING INDEX idx_collections_parent (parent_id=?)
contains: SCAN c
media:    SCAN media
```

The modified plans no longer contain `USE TEMP B-TREE FOR ORDER BY` or `USE TEMP B-TREE FOR DISTINCT`. `SCAN media` remains for arbitrary substring, filename and path fallback searches.

## Index inventory

| Table | Index | Columns/purpose | Search use |
|---|---|---|---|
| collections | `sqlite_autoindex_collections_1` | primary key `id` | other exact id lookups |
| collections | `idx_collections_parent` | `(parent_id, sort_order)` | child count and directory ordering |
| collections | `idx_collections_title` | `title` BINARY | retained compatibility index |
| collections | `idx_collections_title_nocase` | `title COLLATE NOCASE` | new exact and prefix search index |
| collections | `idx_collections_mtime` | `mtime` | non-search ordering/maintenance |
| media | `sqlite_autoindex_media_1` | primary key `id` | exact id operations |
| media | `idx_media_collection` | `(collection_id, type, sort_order)` | collection media paging and ordering |
| media | `idx_media_title` | `title` | not usable by `%query%` fallback |
| media | `idx_media_mtime` | `mtime` | non-search ordering/maintenance |
| media | `idx_media_thumb` | `thumb` | preview source lookup |
| media | `idx_media_detail_thumb` | `detail_thumb` | preview source lookup |
| media | `idx_media_carousel_thumb` | `carousel_thumb` | preview source lookup |

No media index was added: a B-tree cannot accelerate leading-wildcard substring search, and duplicating a 474k-row index would add disk/write cost without removing `SCAN media`. No existing index was removed because each has a distinct current lookup/order role or compatibility collation.

## Before/after measurements

API timings are measured loopback wall-clock timings. Before is formal v91; after is modified v95 on the consistent real-data copy and isolated port. SQL is the after-run sum of collection and media SQL timings.

| Type / query | Before API ms | After SQL ms | After API ms | Results (C/M) | Plan/full scan |
|---|---:|---:|---:|---:|---|
| exact collection / full NO.2161 title | 14,646.3 | 0.4 | 17.3 | 1/0 | exact index only; no media scan executed |
| collection prefix / `[XIUREN秀人网] 2020.04` | 6,012.9 | 0.6 | 11.7 | 3/0 | prefix range index only; no media scan executed |
| middle/English / `Maleah` | 6,156.0 | 1.0 | 14.5 | 60/0 | bounded collection scan; media skipped |
| two Chinese / `安然` | 6,941.5 | 1.1 | 12.4 | 52/0 | indexed prefix; media skipped |
| three Chinese / `秀人网` | 6,549.8 | 0.3 | 10.5 | 2/0 | exact collection index; media skipped |
| file name / `theaic.top 0001` | 7,958.1 | 2,303.1 | 2,314.7 | 0/4 | full media scan remains |
| path / `photos` | 6,636.7 | 24.1 | 34.7 | 0/60 | media scan stops after 61 matches |
| number / `2161` | 8,043.3 | 18.6 | 29.2 | 1/59 | media scan stops after remaining budget |
| high frequency / `theaic.top` | 7,417.9 | 19.0 | 30.5 | 0/60 | media scan stops after 61 matches |
| numeric filename / `0001` | 16,686.9 | 61.7 | 70.2 | 0/60 | media scan stops after 61 matches |
| no result | 9,576.1 | 2,302.9 | 2,313.0 | 0/0 | complete media scan remains |
| many media / `jpg` | 7,786.5 | 17.8 | 25.1 | 0/60 | media scan stops after 61 matches |

Browser v95 debug measurements on the isolated service:

- Exact collection: response received 19.8ms; first complete result DOM 21.2ms; 1 card.
- `Maleah`: response received 13.0ms; first complete result DOM 17.6ms; exactly 60 cards.
- All 60 result images used `loading="lazy"` and `/api/image-preview`; zero card `/photos/` original URLs and zero `<video>` nodes.
- A 100ms old-query/new-query sequence ended with only the new query; one-character `a` rendered the explicit minimum-length message and no cards.
- Browser console warnings/errors: 0.

## Development timing switch

Set `SEARCH_PERF_LOG=1` only in a development/isolated process. Each search writes one structured `search-performance` JSON log with request receipt timestamp, parameter parsing, database open, collection SQL, media SQL, count (always zero), bounded sort, transform, serialization, API total, and result counts. Default/formal value is off.

Open the page with `?searchPerf=1` while the server switch is enabled to include database phases in the response and expose front-end response/first-render timing through the bounded debug record and `#view` data attributes. Normal users receive neither verbose server logs nor front-end timing records.

## Remaining bottleneck and next-stage recommendation

Arbitrary media substring, sparse filename, path and no-result searches still use `LIKE '%query%'` and `SCAN media`; the measured worst remaining cases are about 2.3 seconds on the isolated real-data copy. The low-risk stage is complete. FTS5 is recommended as the next separately reviewed stage only if these remaining cases must become consistently sub-second; it was not implemented here.
