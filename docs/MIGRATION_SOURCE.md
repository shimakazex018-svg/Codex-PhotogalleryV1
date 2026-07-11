# Migration Source

## Source baseline

| Item | Value |
|---|---|
| Source root | `D:\A8 Codex\Codex-Photogallery\photo-gallery-site` |
| Source role | 唯一功能镜像来源，只读参考 |
| Source branch | `feature/sqlite-index-api` |
| Source HEAD | `6e3b275b2598fc19751116af71983b43e83bf960` |
| Migration date | 2026-07-11 |
| Destination | `D:\A8 Codex\Codex-PhotogalleryV1` |
| Migration operator | Codex |
| Source clean | 否 |

## Uncommitted source baseline

迁移依据是源目录当前实际运行工作树，而不只是 HEAD。审计时存在以下状态：

- 已修改：`app.js`、`gallery-db.js`、`index.html`、`server.js`、`start-server-48101.cmd`、`start-site.cmd`、`start-site.ps1`、`styles.css`
- 未跟踪：`duplicates-worker.js`
- 相对 HEAD 的统计：约 2235 行新增、125 行删除

当前运行行为依赖这些未提交内容，因此它们作为完整功能基线迁移。

## Evidence

- 前端版本：`APP_VERSION = "v70"`
- 后端入口：`server.js`
- 数据源：SQLite，`/api/config` 返回 `useSqliteApi=true`
- 数据层：`gallery-db.js`
- 查重后台：`duplicates-worker.js`
- 旧 `/api/gallery` 返回 410
- 源站首页与关键只读 API 在审计时可用

## Migrated scope

- 当前生效 HTML、CSS、JavaScript
- Node HTTP 服务和 SQLite 数据层
- 查重 worker
- Windows 启动/网络脚本
- HLS 工具和现有维护说明
- `网页.md`

## Excluded scope

- 源 `.git`
- `data` 和 `photos`
- 生产 SQLite、旧 JSON、日志、缓存、缩略图、poster 和 HLS 产物
- 用户媒体
- `backups` 和 `Codex-Photogallery-git`

## External runtime data

生产运行通过 `PHOTOS_DIR` 和 `DATA_DIR` 挂载外部数据。新项目不包含生产数据。迁移验证使用 `test-runtime` 下的隔离数据，该目录被 Git 忽略。

## Destination-only migration adjustments

业务源码保持源工作树内容。为消除路径迁移和机器绑定问题，仅调整启动配置：

- 移除旧服务器 `E:\A_秀人` 默认路径。
- 移除旧用户 Codex runtime 的 Node 绝对路径。
- FFmpeg 缺省值改为可配置的 `ffmpeg`。
- `ALLOW_REMOTE_DELETE` 默认改为 `0`，功能开关仍保留。
- 添加安全环境变量模板和 Git 忽略规则。

这些调整不修改数据库 schema、API、页面功能或媒体处理语义。

## Pending production confirmation

- 生产媒体和数据最终挂载位置
- 是否存在任务计划程序或服务管理器托管
- 是否实际使用 HLS
- 是否仍需要旧 `#/__duplicates` 兼容路由
- 是否有外部程序依赖 `gallery.json`

