# Search FTS5 Integration V96（第二阶段 B1）

> 状态：代码、完整数据库副本迁移、备份/恢复、隔离 API、性能、增量事务和故障恢复验证已完成；正式数据库、正式进程、48102 与正式媒体均未修改。真实 Chrome 因本机 Chrome Extension/native host 缺失而未完成，因此 **v96 尚不能宣称可正式部署**。

## 1. Git 与安全边界

- 分支：`codex/fts5-integration-v96`。
- 基准提交：`e535550efbbf134dd8e17c54ff137be612761a32`。
- 没有 worktree、rebase、reset、amend、push 或 main 合并。
- 正式数据库：`D:\GalleryRuntime\data\gallery.db`，测试前后均为 `1,169,928,192` 字节，mtime `2026-07-15T13:39:32.822Z`。
- 正式 Node：PID 2064；正式 `0.0.0.0:48102` 始终由 PID 2064 监听。
- 全部写入位于 Git 忽略的 `tmp/fts5-integration-v96` 或 `tmp/fts5-integration-test`；未读取、移动或删除正式媒体文件。
- `tmp/fts5-prototype` 未删除。B1 结束时实验目录占用见第 15 节；只有正式部署成功且回滚窗口结束后才可另行清理。

## 2. 真实搜索与媒体写入调用链

```text
app.js setSearchQuery
  -> 250ms debounce / AbortController / request sequence / 30s bounded cache
  -> GET /api/search?q=...&limit=60
  -> server.js handleIndexApi
  -> gallery-db.js search
     -> collections exact -> prefix -> contains
     -> search-fts.js mode resolution
        -> 2 chars: media title exact + prefix
        -> 3+ chars ready: trigram FTS rowids -> mapping -> media PK hydration
        -> auto not-ready: no media contains scan
        -> explicit legacy-like: v95 LIKE
```

实际写 `media` 的入口只有：

1. `server.js scanGallery()` -> `galleryDb.indexGallery()`：全库扫描后重建 `collections/media/covers/scan_state`；FTS 已存在时在同一 SQLite 事务清空并重建 mapping/FTS。
2. `server.js recycleDuplicateItems()` -> 文件先移入回收站 -> `galleryDb.removeMediaRecords()`：`media_hashes/user_marks/media/mapping/FTS` 同一 SQLite 事务删除；若文件已移动但数据库失败，另行标记 `stale`。

不影响搜索文本的入口：`duplicates-worker.js` 只写 `media_hashes`；缩略图、预览、poster 和视频元数据写运行缓存；`upsertScanState` 只写扫描状态。`media-library-cleanup-worker.ps1` 只操作文件与报告，不直接写 `media`，其数据库收敛依赖后续扫描。

仓库搜索未发现其他 `media INSERT/UPDATE/DELETE`。当前产品没有独立的文件重命名/移动数据库 API；此类变化由全库重扫反映。

## 3. 正式 FTS 模块与表结构

核心实现为 `search-fts.js`，迁移、校验、搜索和 `gallery-db.js` 写事务共用，不再复制规范化规则。阶段 A 脚本保留为历史基准，但 URL 解码、MATCH quoting 与 LIKE escaping 已改为调用正式核心。

```sql
CREATE TABLE media_search_documents (
  fts_rowid INTEGER PRIMARY KEY,
  media_id TEXT NOT NULL UNIQUE,
  FOREIGN KEY(media_id) REFERENCES media(id) ON DELETE CASCADE
);

CREATE VIRTUAL TABLE media_search_fts USING fts5(
  title,
  relative_src,
  tokenize='trigram'
);

CREATE INDEX idx_media_title_nocase ON media(title COLLATE NOCASE);
```

`media_search_fts.rowid = media_search_documents.fts_rowid`。FTS 只保存 NFC、连续空白折叠后的 `title` 与去除固定 `photos/` 根、统一 `/`、安全 URL 解码后的相对路径；不修改业务原值，不索引全为空的 `file_name`。

## 4. 搜索模式与安全降级

环境变量：`SEARCH_BACKEND_MODE=auto|fts5|legacy-like`。

| 配置 | 实际行为 |
|---|---|
| `auto` + ready | FTS |
| `auto` + not_created/building/stale/error | `safe-degraded`；只搜图集及两字符媒体标题精确/前缀 |
| `fts5` + ready | 强制 FTS |
| `fts5` + 非 ready | `unavailable`；不执行媒体 LIKE |
| `legacy-like` | 显式 v95 媒体 LIKE，仅人工回滚/诊断 |

任何 FTS 异常都返回通用 503、记录服务端错误并标记 `stale`，不会静默切到 legacy，也不会向客户端返回数据库路径、内部表名或堆栈。

API 保持 `query/collections/media/hasMore/limit` 兼容，并增加 `searchMode/configuredSearchMode/indexStatus/queryLength/degraded/degradedReason`。开发性能字段含 SQL、转换、模式、两字符标记与 FTS 初始命中数。

## 5. 两字符与三字符 SQL

两字符只执行标题精确与前缀：

```sql
SELECT <card columns> FROM media m
WHERE m.title = ? COLLATE NOCASE LIMIT ?;

SELECT <card columns> FROM media m
WHERE m.title >= ? COLLATE NOCASE AND m.title < ? COLLATE NOCASE
ORDER BY m.title COLLATE NOCASE LIMIT ?;
```

三字符以上分两段，所有用户输入先整体转义为参数化双引号 phrase：

```sql
SELECT rowid FROM media_search_fts
WHERE media_search_fts MATCH ? LIMIT ?;

SELECT <card columns>, d.fts_rowid
FROM media_search_documents d
JOIN media m ON m.id = d.media_id
WHERE d.fts_rowid IN (?, ...);
```

Node 按第一段 rowid 数组恢复顺序。共享结果预算最大 60，内部最多取 61，不做 `COUNT(*)`。最终计划：FTS 为 `VIRTUAL TABLE INDEX 0:M2`；mapping 为 `INTEGER PRIMARY KEY (rowid=?)`；media 为 `sqlite_autoindex_media_1 (id=?)`；没有 `SCAN media`、ORDER BY/DISTINCT 临时 B-tree。legacy 计划仍为 `SCAN media`。

## 6. 状态模型

`search_fts_state` 单行记录 schema/migration 版本、`not_created|building|ready|stale|error`、开始/完成/增量同步/完整校验时间、三表计数、错误摘要与 `needs_rebuild`。服务启动和搜索只读该轻量状态，不自动 rebuild，不执行 89 秒构建。`GET /api/search-index/status` 返回记录计数，不暴露路径。

## 7. 迁移、校验、备份与恢复命令

```powershell
node scripts/migrate-search-fts5.js --db <copy.db> --dry-run
node scripts/migrate-search-fts5.js --db <copy.db> --backup --output <versioned-backup.db>
node scripts/migrate-search-fts5.js --db <copy.db> --apply --batch-size 2000
node scripts/migrate-search-fts5.js --db <copy.db> --verify
node scripts/migrate-search-fts5.js --db <copy.db> --optimize
node scripts/migrate-search-fts5.js --db <copy.db> --status
node scripts/migrate-search-fts5.js --db <empty-target.db> --restore --input <validated-backup.db>

node scripts/check-search-index.js --db <copy.db> --dry-run
node scripts/check-search-index.js --db <copy.db> --sample 1000
node scripts/check-search-index.js --db <copy.db> --full
```

所有命令要求显式 `--db`，拒绝 `GalleryRuntime` 等疑似正式写入路径。迁移按 media rowid、默认 2,000 条一事务，状态为 `building` 时从已映射最大 rowid 恢复；`error` 只有显式 `--rebuild` 才清空副本索引重建。脚本不自动寻找数据库、不覆盖备份、不自动 DROP 生产表。

dry-run 保守预算包括完整备份、FTS、WAL/临时空间、维护空间及至少 1 GiB 余量。本次要求 `3,413,598,208` 字节，可用 `869,507,235,840` 字节，空间通过。

## 8. 完整副本迁移、备份和恢复结果

| 项目 | 结果 |
|---|---:|
| 正式只读源 | 1,169,928,192 B；474,470 media；7,287 collections |
| SQLite 在线副本 | SHA-256 `407864aadd9899c449a030f7f3848ffab4588be0c80283f6bde320961efef001`；integrity ok |
| 迁移前备份 | 1,169,928,192 B；同 SHA-256；integrity ok |
| 迁移后副本 | 1,461,190,656 B |
| 增量 | 291,262,464 B |
| 最终显式optimize后 | 1,461,559,296 B；相对基线增量291,631,104 B |
| 干净全量 apply | 142.979 s（含全行对照、integrity、optimize） |
| 构建进度到 450k | 97.048 s；最终 474,470 后进入校验维护 |
| 脚本批次采样峰值 RSS | 143,560,704 B；后续版本已补充校验/维护结束采样 |
| 峰值 WAL / SHM | 14,691,952 / 32,768 B |
| CPU user/system | 40.047 / 68.532 s |
| 三表数量 | 474,470 / 474,470 / 474,470 |
| 完整对照 | 缺失、孤立、重复、title/path mismatch 全 0 |
| 完整 verify | 147.932 s；SQLite integrity ok |
| 所有增量/故障测试后最终full | 134.341 s；三表474,470；全部差异0；integrity ok |

第一次实现因每行重复 prepare 被中止在 290,000 条；状态保持 building、主表 474,470、mapping/FTS 同为 290,000。缓存 statements 后又发现 missing-left-join 恢复游标二次扫描，在 370,000 条再次中止；改为最大已映射 media.rowid 后，剩余 104,470 条 27.81 秒建完，并最终完整一致。该过程实际验证了批次提交和两次异常中断恢复。

恢复演练使用 SQLite backup 从已校验迁移前备份生成新副本，源/目标 media 与 collections 数量一致、两端 integrity ok；小库 `--restore` 命令也实际通过。SQLite backup 文件 SHA 可能因页面布局不同，不以字节相同替代 integrity 与业务计数。

## 9. 三表事务与故障测试

- 完整副本单条新增：29.122 ms；mapping/FTS 立即可查。
- title/src 更新：3.852 ms；旧词消失、新词可见；`fts_rowid` 不变。
- 删除：4.825 ms；三表记录同时消失。
- 模拟 mapping 写失败：media 同事务回滚，无半完成记录。
- 重复扫描/重建：唯一 mapping、唯一 rowid、计数不增长。
- 文件已移动但数据库失败：标记 stale，重新扫描恢复。
- 数据库已更新但后续文件操作失败：标记 stale，重新扫描按文件真值恢复。
- 文件删除失败、重命名中断：不宣称原子成功，标记 stale；重新扫描后完整检查通过。

文件系统与 SQLite 不构成 ACID 事务。重复项当前顺序是先移动文件、再提交数据库删除；失败时必须保留错误并 stale。媒体清理 worker 的文件变化由后续全库扫描修复。

已知实现边界：现有 `indexGallery()` 的业务库全量替换本来就是一个大事务；B1 把 FTS 纳入同一事务以保证三表原子性，但尚未把扫描器改造成 2,000 条独立提交。迁移工具是有限批次；正式扫描仍继承大事务/WAL风险。因此即使 Chrome 修复，正式部署前仍建议针对完整隔离媒体树补一次扫描峰值验证，必要时另做 staging/swap 设计，不能把拆事务与三表原子性同时口头宣称完成。

## 10. API 性能回归

以下为隔离 `127.0.0.1:48103`，每词 1 次首查 + 5 次重复；Windows OS cache 未强制清空。

| 类型 | 关键词 | 冷 ms | 热中位 | 热最慢 | 返回 | 媒体 |
|---|---|---:|---:|---:|---:|---:|
| 完整图集 | `[XIUREN秀人网] ... NO.2161 ...` | 152.078（Server 27.078） | 33.457 | 37.356 | 1 | 0 |
| 图集前缀 | `[XIUREN秀人网] 2020.04` | 32.191 | 34.040 | 41.478 | 12 | 0 |
| 图集中间 | `Maleah` | 15.724 | 11.893 | 14.778 | 60 | 0 |
| 两字标题前缀 | `扫码` | 28.006 | 31.006 | 56.040 | 4 | 4 |
| 两字中间 | `码下` | 31.618 | 31.103 | 32.910 | 0 | 0 |
| 数字 | `2161` | 38.332 | 36.794 | 37.992 | 60 | 59 |
| 稀疏文件名 | `theaic.top 0001` | 37.020 | 32.007 | 41.920 | 4 | 4 |
| 路径 | `No.4720` | 28.766 | 39.252 | 56.525 | 60 | 58 |
| 高频 | `theaic.top` | 37.549 | 40.457 | 46.289 | 60 | 60 |
| 数字文件名 | `0001` | 38.895 | 35.150 | 38.808 | 60 | 60 |
| 无结果 | `__codex_no_result_20260716__` | 37.992 | 30.069 | 33.181 | 0 | 0 |
| 扩展名 | `jpg` | 29.118 | 31.027 | 34.681 | 60 | 60 |
| 特殊字符 | `a"*:(b)-c%_\/` | 29.387 | 28.665 | 30.319 | 0 | 0 |

legacy 稀疏词冷/热中位/最慢为 `2380.197/2458.413/2491.167 ms`；无结果为 `2559.671/2359.559/2609.119 ms`。legacy 成绩未混入 FTS。

`auto` stale 实测：三字符稀疏词 media SQL `0 ms`、媒体 0、`safe-degraded=true`；两字符“扫码”仍用标题索引返回 4；状态 API 13.58 ms。

## 11. 前端与状态接口

- 保留 v95 的 250 ms 防抖、AbortController、请求序号、30 秒/20 项缓存、2 字符下限、60 上限、lazy WebP、无原图卡片与无 video 节点。
- 增加非弹窗的 building/stale/error 安全降级提示，以及两字符无媒体结果的规则提示。
- `APP_VERSION` 与 `index.html` 静态资源标记更新为候选 v96；未部署正式站。
- `GET /api/search-index/status` 只读状态记录，返回配置/实际模式、schema、三表记录计数、时间、错误与 rebuild 建议；没有远程 rebuild API。

## 12. Chrome 验收

未完成，不能以 API 或模拟 DOM 替代。实际连接检查结果：Chrome 150.0.7871.116 已安装；当前用户 Chrome User Data 目录不存在；`HKCU\Software\Google\Chrome\NativeMessagingHosts\com.openai.codexextension` 不存在；native host manifest 不存在。按工具安全规则未自行安装或修复。

因此桌面/iPhone/iPad、连续输入 10 次、控制台 0 warning/error、网络不请求原图和结果跳转位置等真实 Chrome 项目仍待补测。需要从 Codex 插件 UI 重新安装 Chrome 插件并确认 ChatGPT Chrome Extension 已启用后重试。

## 13. 正式部署方案（本阶段未执行）

1. 确认 v95、阶段 A 与本 B1 提交及正式工作区干净。
2. 记录正式数据库绝对路径、大小、mtime、journal、media/collections 数量和磁盘空间。
3. 从停止正式写入/停止服务开始进入维护窗口。
4. 用 SQLite backup 创建不覆盖的版本化备份，执行 integrity 与计数校验；失败立即停止。
5. migration dry-run；空间、schema、状态任一阻断即停止。
6. apply 2,000 批次；失败保持服务停止，审核 building/error 后选择续跑或副本验证过的 rebuild。
7. verify、完整一致性、optimize；任何 integrity/三表不一致立即停止。
8. 索引 ready 后才以 `SEARCH_BACKEND_MODE=fts5` 启动候选服务，此时可恢复只读浏览；媒体写入应等 API smoke、固定基准及增量测试通过后恢复。
9. 完成真实 Chrome 桌面/移动验收、扫描峰值验证并观察 CPU/RSS/WAL/日志后，才可确认 v96。

不承诺停机时长。仅搜索语义或性能问题可代码级回滚；主表 integrity、持续 SQLite 错误或严重三表损坏必须数据库恢复。

## 14. 回滚方案

代码快速回滚：停止/重启候选进程并设置 `SEARCH_BACKEND_MODE=legacy-like`，或切回 v95 代码；保留 FTS/mapping，不 DROP；验证图集、媒体浏览和搜索，同时接受稀疏/无结果约 2.3–2.6 秒。

数据库完整回滚：停止所有正式写入；保留故障库供分析；用已校验迁移前备份恢复到新文件并原子替换维护目标；再次 integrity、media/collections 计数；启动 v95；检查 48102、首页、图集、媒体和搜索。生产不提供自动 DROP FTS 回滚。

## 15. 文件与候选结论

主要修改：`search-fts.js`、`gallery-db.js`、`server.js`、`app.js`、`index.html`、`.env.example`；新增迁移、备份、校验、基准和事务/故障测试脚本；更新项目生命周期文档。

实验数据库均在 Git 忽略目录。当前`tmp/fts5-prototype`为27个文件、7,864,952,370字节；B1的`tmp/fts5-integration-v96`为10个文件、4,092,829,650字节。两者均保留；清理前应再次统计大小并等待正式部署成功及回滚窗口结束。

候选结论：FTS 查询、迁移、恢复、完整一致性、隔离 API、安全降级和增量事务核心已验证；由于真实 Chrome 被环境阻断，且正式全库扫描仍继承单大事务并缺少完整隔离媒体树峰值验收，v96 当前状态为 **B1 集成候选，不可正式部署**。
