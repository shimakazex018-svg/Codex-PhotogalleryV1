# Search FTS5 Integration V96

> 当前范围：个人局域网写真图集的最小 FTS5 搜索实现。正式数据库、正式媒体、PID 2064 和端口 48102 未修改，本候选未部署。

## 1. 保留的搜索结构

正式核心只使用三张搜索相关表：

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
```

`media_search_fts.rowid = media_search_documents.fts_rowid`。FTS 只保存 NFC、折叠空白后的标题，以及安全 URL 解码、统一 `/`、去除固定 `photos/` 根后的相对路径。业务 `media` 原值不改写，空的 `file_name` 不重复索引。

`search_fts_state` 只保存：schema version、`not_created|building|ready|stale|error`、开始/完成/最后同步/最后校验时间和最后错误。服务启动只读状态，不自动创建、构建、rebuild 或 DROP FTS 表。

## 2. 查询规则

- 图集：名称完全匹配、前缀匹配、包含匹配，优先于媒体结果。
- 1 字符：不搜索媒体。
- 2 字符：只使用 `idx_media_title_nocase` 做标题完全匹配和前缀匹配。
- 3 字符及以上：`media_search_fts MATCH ?`，先取最多 61 个 rowid，再经 mapping 和 `media.id` 回表，返回最多 60 条并用第 61 条判断 `hasMore`。
- 不执行完整结果 `COUNT(*)`，不把全部命中加载到 Node.js 后截断。

模式：

- `auto`：只有状态 `ready` 才使用 FTS；否则安全降级为图集搜索和两字符标题规则，绝不自动扫描完整 media LIKE。
- `fts5`：索引不可用时明确返回 unavailable 状态。
- `legacy-like`：只供人工代码回滚显式启用。

## 3. 写入同步

当前实际存在的媒体新增、更新、删除、全库扫描重建和重复项数据库删除，都在同一个 SQLite 事务内同步 `media`、mapping 和 FTS。mapping 的整数 rowid 在媒体内容更新时保持稳定。

文件系统和 SQLite 不能组成跨系统 ACID 事务。处理规则保持简单：文件操作成功后更新数据库；数据库更新失败时记录错误并标记 `stale`；后续手工重新扫描恢复一致性。不实现补偿日志重放、自动恢复队列或多阶段回滚编排。

## 4. 最小迁移命令

所有命令必须显式提供数据库路径，并拒绝疑似正式数据库路径：

```powershell
node scripts/migrate-search-fts5.js --db <copy.db> --dry-run
node scripts/migrate-search-fts5.js --db <copy.db> --backup --output <new-backup.db>
node scripts/migrate-search-fts5.js --db <copy.db> --apply
node scripts/migrate-search-fts5.js --db <copy.db> --verify
node scripts/migrate-search-fts5.js --db <copy.db> --optimize
```

`apply` 默认每批 2,000 条并可重复执行。中断后再次执行会从 media 起点重新分批幂等 upsert；失败只记录 `error`，不维护恢复游标，也不自动清空或替换数据库。

一致性检查只有两种：

```powershell
node scripts/check-search-index.js --db <copy.db> --quick
node scripts/check-search-index.js --db <copy.db> --full
```

quick 检查三表数量、缺失、孤立、重复映射、SQLite quick check 和 FTS integrity；full 额外逐条比较 title/相对路径并执行 SQLite integrity check。

备份使用 SQLite `backup()` 获得一致快照，不覆盖已有文件，完成后检查 integrity 和基础业务计数。恢复只保留为人工离线操作，不提供自动文件替换或远程恢复接口。

## 5. 前端行为

- 250 ms 防抖；
- 新关键词使用 `AbortController` 取消旧请求；
- 请求序号阻止乱序覆盖；
- 30 秒、有容量上限的同词缓存；
- 空词和少于 2 字符不请求搜索 API；
- 每次最多渲染 60 条；
- 搜索缩略图继续懒加载并使用 WebP 预览，不请求原图或挂载视频播放器。

## 6. 已验证结果

Node.js v24.14.0、SQLite 3.51.2 下已验证 FTS5、trigram、中文 Unicode、integrity-check 和 optimize。完整隔离数据库副本中 media、mapping、FTS 均为 474,470，缺失、孤立、重复、title 和 relative path 不一致均为 0。

典型三字符稀疏和无结果 FTS 查询约 30–40 ms；显式 legacy LIKE 对照约 2.4–2.6 秒。两字符查询使用 `idx_media_title_nocase`；三字符查询计划使用 FTS 虚拟索引、mapping 整数主键和 media 主键，不扫描完整 media 表。

核心隔离测试覆盖：迁移、稳定 rowid、媒体新增/更新/删除、事务失败回滚、stale 安全降级、重新扫描恢复、legacy-like 回滚和完整一致性。

## 7. 范围边界

FTS5 搜索优化到本最小方案结束，不再保留额外生产级扩展或浏览器自动化验收计划。是否迁移和部署由用户未来单独决定。
