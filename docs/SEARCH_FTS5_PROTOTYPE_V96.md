# FTS5 Prototype V96

> 状态：第二阶段 A 离线原型已完成；**未接入 `/api/search`、未修改正式数据库、未部署、未发布 v96**。

## 1. 范围、安全边界与数据源

- 正式源库：`D:\GalleryRuntime\data\gallery.db`，1,169,928,192 字节，创建时间 `2026-07-11T23:48:10.945Z`，实验开始时修改时间 `2026-07-15T13:39:32.822Z`。
- 每个实验都由 `DatabaseSync(source, { readOnly: true }) + PRAGMA query_only=ON` 打开源库，再用 `node:sqlite backup()` 写入仓库已忽略的 `tmp/fts5-prototype/<variant>/gallery.db`。
- 最终候选副本：`D:\A8 Codex\Codex-PhotogalleryV1\tmp\fts5-prototype\mapped\gallery.db`。该目录是运行实验数据，不进入 Git。
- 构建脚本要求显式 `--source`、`--db`，拒绝源目标相同、拒绝把正式库作为目标，并把目标限制在 `tmp/fts5-prototype` 下；隔离自动化已实际验证拒绝路径。
- 正式站仍运行 v91；源码前端仍为 v95。没有停止/重启正式 PID、改变端口、读写媒体文件或部署源码。

## 2. SQLite / FTS5 实测能力

实际运行环境为 Node.js `v24.14.0`、SQLite `3.51.2`。`PRAGMA compile_options` 包含 `ENABLE_FTS5`，但可用性结论来自实际 SQL，而不只来自编译选项。

| 能力 | 实测结果 |
|---|---|
| 普通 FTS5 临时表 | 可创建、插入、MATCH |
| `tokenize='trigram'` | 可创建 |
| 中文 Unicode 三字 | `安然模` 的 MATCH 与 LIKE 都命中 |
| 中文 Unicode 两字 | MATCH 返回 0；trigram 不生成可用三元 token |
| trigram LIKE | 无 ESCAPE 时计划为 `VIRTUAL TABLE INDEX 0:L1`；能加速三字以上子串 |
| 安全 LIKE | 加 `ESCAPE '\'` 后计划为 `VIRTUAL TABLE INDEX 0:`，失去 trigram LIKE 约束 |
| 参数化 MATCH | 固定列名、双引号 phrase、整体表达式作为参数可安全处理引号、空格、括号、方括号和连字符 |
| ASCII 大小写 | 默认 trigram 对 `ABC/abc` 均命中；与 SQLite ASCII NOCASE 行为接近 |
| 数字 / 空格 / 标点 | 三个及以上 code point 的实际 phrase 可匹配；不足三字符仍受短词限制 |
| `integrity-check` | 支持并实际通过 |
| `optimize` | 支持并实际通过 |
| `rebuild` | 普通/外部内容原型均支持并实际执行 |

完整副本上的 MATCH/FTS-LIKE 对比：

| 查询 | MATCH 热中位 ms | FTS LIKE + ESCAPE 热中位 ms | MATCH/LIKE 数量 |
|---|---:|---:|---:|
| `No.4720` | 0.443 | 4.234 | 61 / 61 |
| `扫码`（两字） | 不启用，0 | 405.115 | 0 / 4 |
| `ABC-123` | 0.324 | 398.262 | 0 / 0 |
| `a_b` | 0.203 | 402.472 | 0 / 0 |
| `a'b` | 0.240 | 404.249 | 0 / 0 |
| `a"b` | 0.229 | 382.487 | 0 / 0 |

结论：正式接入应使用安全参数化 MATCH；不能用带 ESCAPE 的 FTS LIKE 作为两字后备，也不能为了 `L1` 计划取消 `%/_` 的普通文本转义。

## 3. 真实 schema 与字段分析

`collections` 共 7,287 条，字段为：`id, parent_id, title, folder, path_parts, level, cover, cover_thumb, image_count, video_count, total_image_count, total_video_count, descendant_count, mtime, sort_order`。

`media` 共 474,470 条，字段为：`id, collection_id, type, title, file_name, src, thumb, detail_thumb, carousel_thumb, poster, duration, width, height, size, codec, mtime, sort_order, metadata`。`id` 是 40 位 TEXT SHA-1 主键，不是 INTEGER PRIMARY KEY，不能直接作为 FTS rowid。

真实字段统计：

| 项目 | 数量 |
|---|---:|
| 空 `title` | 0 |
| 空 `file_name` | 474,470（100%） |
| 空 `src` | 0 |
| 不同 `title` | 26,054 |
| `src` 以 `/photos/` 开头 | 474,470（100%） |
| `src` 含反斜杠 | 0 |
| 三字段含 Unicode replacement character | 0 |

`title` 实际承担文件名/显示标题，例如 `扫码获取更多列表网红COS作品写真`；`file_name` 当前没有检索价值，因此最终结构不索引它。`src` 是 URL 编码路径，例如 `%E7%A7%80...`。最终结构先去除固定 `/photos/`，统一 `/`，再安全 `decodeURIComponent`；解码失败时保留去前缀原串。这样既减少约一半索引体积，也允许用户按自然中文路径搜索。

图集只有 7,287 条，v95 图集精确/前缀已有 B-tree，包含扫描也在可接受范围；本阶段没有为图集增加 FTS。

## 4. 结构方案比较与最终选择

### 方案 A：直接外部内容 FTS

实测原型：

```sql
CREATE VIRTUAL TABLE media_search_fts_external USING fts5(
  title,
  file_name,
  src,
  content='media',
  content_rowid='rowid',
  tokenize='trigram'
);
```

优点：索引增量 414,777,344 字节；rebuild 53.59 秒；以 SQLite 内部 rowid 回表较快。缺点：`media.id` 是 TEXT，候选要求的 `content_rowid='id'` 不可行，只能依赖 `media` 隐藏 rowid；无法直接存规范化 `relative_src`；外部内容 `COUNT(*)` 读取主表，不是独立索引证明；更新/删除必须严格提交旧字段，故障恢复与一致性审计更难。因此不选。

### 方案 B：独立 FTS

最初独立表把 `media_id UNINDEXED, title, file_name, relative_src` 存在 FTS 内：索引增量 527,273,984 字节，构建 60.19 秒，能可靠计数与比对，但 `media_id UNINDEXED` 不能高效定位更新/删除行。随后验证了去空列、URL 解码和稳定映射。

### 最终推荐：稳定映射表 + 独立内部内容 FTS

第二阶段 B 建议使用以下正式结构（本阶段原型表名带 `_mapped`，未在正式库创建）：

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

CREATE INDEX idx_media_title_nocase
ON media(title COLLATE NOCASE);
```

`media_search_fts.rowid = media_search_documents.fts_rowid`。映射表使 `media_id -> fts_rowid` 为 O(log n)，避免依赖隐藏 `media.rowid`，也避免按 UNINDEXED `media_id` 扫描 FTS。与无映射解码表相比只增加约 25.2 MiB，但增量更新、删除、孤立检测和恢复边界更清晰，因此选择该结构。`idx_media_title_nocase`只服务两字符标题精确/前缀，实测构建2.486秒、`dbstat`逻辑大小7,127,040字节。

## 5. 完整副本构建结果

| 结构 | 构建后 DB 字节 | 增量字节 | 索引写入秒 | FTS 维护秒 | 峰值 RSS |
|---|---:|---:|---:|---:|---:|
| 外部内容/raw src | 1,584,705,536 | 414,777,344 | 53.586 | 19.681 | 约 43.8 MB（外部监控） |
| 独立/含空 file_name/raw relative | 1,697,202,176 | 527,273,984 | 60.187 | 22.457 | 106,938,368 B |
| 独立/去空列/raw relative | 1,696,489,472 | 526,561,280 | 55.192 | 19.688 | 107,110,400 B |
| 独立/解码 relative/无映射 | 1,427,824,640 | 257,896,448 | 29.205 | 10.439 | 125,018,112 B |
| **最终 mapped + 解码 relative** | **1,454,243,840** | **284,315,648** | **89.052** | **9.943** | **141,426,688 B** |

最终 mapped 重跑：backup 7.334 秒；批次 2,000；总数/成功/失败为 `474470 / 474470 / 0`；最终索引字段空值行 0；Node CPU 累计 user/system 为 22.625/44.563 秒。完整命令（含字段统计、backup、FTS 检查、SQLite 全库 `integrity_check`）墙钟约 205 秒。

上述mapped表构建后再补两字NOCASE索引；它复用了1,518个freelist页面，文件从1,454,243,840增至1,455,153,152字节（实际+909,312），但索引自身`dbstat`为7,127,040字节。FTS结构增量与短词B-tree逻辑成本应分开预算。

资源文件：WAL 峰值 14,893,832 字节、SHM 峰值 32,768 字节、rollback journal 峰值 0；完成 checkpoint 后 WAL/SHM/journal 都为 0。未发现构建异常或持久临时文件。网站启动时不得自动执行此全量构建。

## 6. 原型查询流程与 SQL

三字符以上的媒体流程：

```text
关键词
  -> 现有图集精确/前缀/包含阶段
  -> 无首选图集且仍有预算时：FTS title MATCH（最多 remaining+1）
  -> FTS relative_src MATCH（只补剩余预算，按 rowid 去重）
  -> rowid 查 media_search_documents
  -> media.id 主键回查卡片字段
  -> 最多60条，多取1条判断 hasMore；无 COUNT(*)
```

固定列名由代码选择；用户字符串只转成 FTS phrase（内部 `"` 变 `""`），完整表达式作为 SQL 参数：

```sql
SELECT rowid
FROM media_search_fts
WHERE media_search_fts MATCH ?
LIMIT ?;
-- 参数示例：title : "theaic.top 0001"
```

回表：

```sql
SELECT
  m.id, m.collection_id, m.type, m.title, m.file_name, m.src,
  m.thumb, m.detail_thumb, m.carousel_thumb, m.poster
FROM media_search_documents d
JOIN media m ON m.id = d.media_id
WHERE d.fts_rowid IN (?, ...);
```

Node 按有限 rowid 列表恢复原顺序；同一媒体在标题和路径均命中时去重。不存在映射或媒体行的 rowid 被过滤并由一致性检查报告。

## 7. 查询执行计划

原 LIKE：

```text
SCAN media
```

最终 FTS：

```text
SCAN media_search_fts_mapped VIRTUAL TABLE INDEX 0:M2
```

回表：

```text
SEARCH d USING INTEGER PRIMARY KEY (rowid=?)
SEARCH m USING INDEX sqlite_autoindex_media_1 (id=?)
```

图集计划（在副本补齐v95尚未部署到正式v91库的索引后）：

```text
SEARCH collections USING INDEX idx_collections_title_nocase (title=?)
SEARCH collections USING INDEX idx_collections_title_nocase (title>? AND title<?)
```

两字标题前缀：

```text
SEARCH media USING INDEX idx_media_title_nocase (title>? AND title<?)
```

没有 `SCAN media`、无临时 ORDER BY/DISTINCT B-tree；FTS 最多请求共享预算加一，不返回全部匹配记录。

## 8. 最终候选性能

“冷”定义为新建只读 SQLite 连接后的第一次查询；没有清空 Windows 文件系统缓存，不能等同物理冷盘。每词另运行 5 次热查询并报告中位数和最慢值。原型总时间包含图集阶段、FTS、映射/媒体回表和对象构造；JSON 网络序列化未接入 HTTP，因此未伪装成已部署 API。

| 类型 / 关键词 | 原 LIKE ms | 冷总 ms | 热中位 ms | 热最慢 ms | 冷 FTS / 回表 ms | 返回 | 60上限 |
|---|---:|---:|---:|---:|---:|---:|---|
| 完整图集名 | 2,501.873* | 56.835 | 27.912 | 35.870 | 0.187 / 0.207 | 1 | 否 |
| 图集前缀 | 2,441.537* | 25.476 | 25.654 | 26.796 | 0.002 / 0.003 | 12 | 否 |
| 图集中间 / `Maleah` | 1.532 | 2.146 | 0.798 | 1.227 | 0.001 / 0.007 | 60 | 是 |
| 两字中文 / `安然` | 2,165.458* | 1.679 | 0.518 | 2.196 | 0.001 / 0.019 | 60 | 是 |
| 三字中文 / `秀人网` | 2,168.417* | 1.945 | 0.489 | 1.286 | 0.002 / 0.007 | 60 | 是 |
| 英文 / `Maleah` | 0.655 | 1.688 | 0.364 | 0.706 | 0.001 / 0.005 | 60 | 是 |
| 数字 / `2161` | 0.821 | 33.511 | 32.204 | 38.088 | 5.202 / 4.704 | 60 | 是 |
| 稀疏文件名 / `theaic.top 0001` | 2,323.317 | **34.320** | **24.346** | 25.651 | 3.379 / 0.822 | 4 | 否 |
| 路径片段 / `No.4720` | 27.757 | 29.443 | 32.656 | 41.313 | 1.488 / 2.046 | 60 | 是 |
| 高频 / `theaic.top` | 0.864 | 33.005 | 29.865 | 34.890 | 0.914 / 3.861 | 60 | 是 |
| 数字文件名 / `0001` | 55.291 | 29.881 | 25.400 | 28.011 | 0.547 / 3.865 | 60 | 是 |
| 无结果 | 2,317.475 | **26.717** | **22.015** | 29.440 | 1.113 / 0.004 | 0 | 否 |
| 扩展名 / `jpg` | 0.914 | 59.464 | 50.942 | 55.341 | 30.363 / 3.303 | 60 | 是 |

`*` 这些离线媒体 LIKE 参考仍执行了媒体查询，即使真实 v95 首选图集阶段会跳过媒体；它只用于媒体正确性对照，不代表当前 v95 API。最终表为补齐`idx_collections_title_nocase`和`idx_media_title_nocase`后的最新跑；完整正确性与三层一致性来自补索引前的同schema/同源副本完整跑，两个B-tree不改变媒体或FTS内容。目标慢例均从约2.3秒降到100ms内。两次索引对齐快速跑显示波动范围：稀疏冷34.320-80.311ms/热中位24.346-29.549ms，无结果冷21.832-26.717ms/热中位22.015-25.993ms，`jpg`冷59.464-114.228ms/热中位50.942-51.561ms；表中保留最新跑，范围同时披露。

尝试在补索引后把全部LIKE正确性和一致性再次合并重跑时，单核CPU持续增长并在600秒命令上限被终止，结果文件未覆盖；随后使用`--skip-reference --skip-consistency`隔离重跑原型性能，4秒完成并捕获上述计划/时间。先前完整正确性、一致性以及最终重建`integrity_check`仍通过。第二阶段B应把长参考扫描拆成独立作业，避免一个总命令失去阶段可观测性。

## 9. 正确性与语义差异

三字符以上的稀疏文件名、无结果、文件名中段、`No.4720` 路径片段、空格、英文、数字和数字+字母样本的有限结果与参考一致；结果顺序由“标题优先、路径补充”明确化，不承诺复刻原 SQL 无 ORDER BY 的偶然 rowid 顺序。

FTS trigram 与原 LIKE **不完全同义**：

- 少于 3 个 Unicode code point 的 MATCH 无结果；单字符标点、`%`、`_`、斜杠不进入媒体 MATCH。
- 去掉固定 `/photos/` 后，搜索 `photos` 不再返回全库，这是有意移除无业务意义固定前缀。
- URL 解码后，自然中文目录（如 `秀人网`）会新增真实路径命中；旧 LIKE 对 `%AB` 等 URL 编码字节的偶然 ASCII 命中会消失。
- 高频词的前 61 个 ID 可能因标题优先规则与原无序 LIKE 不同，但没有同一媒体重复。
- ASCII 大小写在本数据样本一致；全角字符不自动折叠到半角。
- 所有引号和特殊字符都作为普通 phrase 参数处理，没有 MATCH 语法注入或 SQL 拼接。

## 10. 短关键词结果与产品规则

| 词 | code point | 图集命中 | 媒体标题前缀 | 原媒体 LIKE | trigram MATCH |
|---|---:|---:|---:|---:|---:|
| `安` | 1 | 61 | 0 | 0 | 0 |
| `安然` | 2 | 61 | 0 | 0 | 0 |
| `a` | 1 | 61 | 61 | 61 | 0 |
| `ab` | 2 | 8 | 0 | 61 | 0 |
| `abc` | 3 | 0 | 0 | 12（编码串偶然命中） | 0（解码后无自然文本命中） |
| `1` | 1 | 61 | 61 | 61 | 0 |
| `12` | 2 | 61 | 61 | 61 | 0 |
| `123` | 3 | 45 | 57 | 61 | 61 |
| `A1` | 2 | 0 | 0 | 61 | 0 |
| `A12` | 3 | 0 | 0 | 25 | 25 |
| `扫码` | 2 | **0** | **4** | **4** | **0** |

推荐短词方案 2：

- 1 个字符：不搜索媒体；图集是否继续显示由现有前端最少 2 字符规则保持关闭。
- 2 个字符：继续图集搜索；媒体只做 `title COLLATE NOCASE` 精确/前缀范围查询，使用第二阶段B新增的`idx_media_title_nocase`，不做中间包含、不退回全表扫描。
- 3 个及以上字符：启用标题优先、路径补充的 trigram MATCH。

“扫码”是本次专门找到的两字媒体词：不在任何图集名，4 条媒体标题都以“扫码”开头，因此方案 2 可用 B-tree 找回 4/4。

bigram 小原型使用 50,000 条真实样本，仅生成中文汉字二元 token：构建 1.244 秒，数据库 3,231,744 字节，线性估算全库约 30,667,312 字节；“扫码” MATCH 1.051 ms，4/4、0 漏报、0 多报。它尚未覆盖全库、多语种、标点、增量更新和大量词分布，故不纳入最终正式结构；若将来产品必须支持两字中间包含，再单独做完整副本验收。

## 11. 一致性设计与下一阶段同步事件

最终完整副本审计：`media=474470`、`documents=474470`、`FTS=474470`；缺失/孤立 document、缺失/孤立 FTS、字段不一致全部为 0。可信检查应同时运行：

1. 三表实际 COUNT；内部内容 FTS 的 COUNT 有独立含义。
2. `media LEFT JOIN documents` 检测缺失映射；反向检测孤立映射。
3. `documents LEFT JOIN FTS ON rowid` 与反向 JOIN 检测缺失/孤立 FTS。
4. 分批比较 FTS `title/relative_src` 与主表规范化结果。
5. `INSERT INTO media_search_fts(media_search_fts) VALUES('integrity-check')`。

第二阶段 B 必须把以下操作纳入同一 SQLite 事务：

| 事件 | 同步动作 |
|---|---|
| 新增媒体 | 写 media；写 documents 取得稳定 rowid；写 FTS title/relative_src |
| 删除媒体 | 先由 documents 唯一索引取得 rowid；删 FTS；删 documents；再删 media |
| 修改文件名/title | 由 media_id 定位 rowid，更新 media 和对应 FTS title |
| 移动媒体/src 改变 | 更新 media.src，并重新生成解码 relative_src |
| 图集移动/重命名 | 只有实际重写后代 media.src 时才批量更新 FTS；单纯 collections.title 仍走现有 B-tree |
| 媒体库清理/文件失效 | 复用删除事务，不允许只删主表 |
| 重复项移入回收站 | 成功移动且主表确认删除时同步删除 FTS；失败/保留源时不删 |
| 扫描新增/更新/删除 | 扫描事务提交前同步三表；失败整体回滚并记录 |
| 全库重建 | 显式维护命令、先备份、分批构建到候选表、审计通过后再在维护窗口切换；网站启动不自动重建 |

故障恢复以“主表为真源、映射/FTS可重建”为原则。下一阶段应先实现独立一致性命令和 dry-run，再接扫描器事件，最后才切 `/api/search`；任何一步失败都保持 v95 LIKE fallback 可回滚。

## 12. 文件、测试与停止条件

新增原型文件：

- `scripts/fts5-prototype-lib.js`
- `scripts/detect-fts5.js`
- `scripts/build-fts5-prototype.js`
- `scripts/benchmark-fts5.js`
- `scripts/check-fts5-query-semantics.js`
- `scripts/prototype-media-bigram.js`
- `scripts/inspect-fts5-short-index.js`
- `scripts/test-fts5-prototype.js`
- `docs/SEARCH_FTS5_PROTOTYPE_V96.md`

生命周期文档同步：`PROJECT_CONTEXT.md`、`ARCHITECTURE.md`、`DECISIONS.md`、`TODO.md`、`TESTING.md`、`CHANGELOG.md`、`HANDOFF.md`、`网页.md`。

提交前cached diff摘要：17个文件，新增1,474行、删除5行；只含脚本和文档。`tmp/fts5-prototype`约7.86GB实验数据库/JSON保持Git忽略，未进入暂存区。`gallery-db.js`、`server.js`、`app.js`、`index.html`和正式配置无diff。

自动化/静态验证包括 FTS 能力脚本、完整副本多类结构及最终 mapped 重跑、正确性/性能/计划/一致性基准、MATCH/LIKE 对比、50k bigram、隔离端到端测试、项目固定 `node --check` 与 `git diff --check`。补索引后的合并全套重跑发生一次600秒超时；隔离性能重跑通过。没有启动网站、浏览器或正式 API，因为本阶段不接入运行流程和页面。

## 13. 定型结论

SQLite 3.51.2 的 FTS5 trigram 在本项目 Node 环境可用。推荐进入第二阶段 B，但只按本报告的“稳定映射 + 独立内部内容 FTS + 解码相对路径 + 2字标题前缀/3字 trigram”方案做迁移与增量同步；不建议直接使用 `content='media'` 外部内容表，也不建议此时引入 bigram 正式索引。

第二阶段 A 到此停止：未创建正式表、未改 `/api/search`、未改扫描器、未改前端版本、未部署 v96。
