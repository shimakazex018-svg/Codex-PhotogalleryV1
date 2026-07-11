# Migration Source

## Source baseline

| Item | Value |
|---|---|
| Source root | `<legacy-project-root>` |
| Source role | 唯一功能镜像来源，只读参考 |
| Source branch | `feature/sqlite-index-api` |
| Source HEAD | `6e3b275b2598fc19751116af71983b43e83bf960` |
| Migration date | 2026-07-11 |
| Destination | `<project-root>` |
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

迁移验证结束后，`test-runtime` 及其图片、视频、SQLite、HLS 和日志已经清理。仓库中的 `data` 和 `photos` 仅保留空目录占位文件 `.gitkeep`。

## Destination-only migration adjustments

业务源码保持源工作树内容。为消除路径迁移和机器绑定问题，仅调整启动配置：

- 移除旧服务器的机器专属媒体目录默认值。
- 移除旧用户 Codex runtime 的 Node 绝对路径。
- FFmpeg 缺省值改为可配置的 `ffmpeg`。
- `ALLOW_REMOTE_DELETE` 默认改为 `0`，功能开关仍保留。
- 添加安全环境变量模板和 Git 忽略规则。

这些调整不修改数据库 schema、API、页面功能或媒体处理语义。

## Destination functional baseline

| Item | Value |
|---|---|
| Git root | `<project-root>` |
| Branch | `main` |
| Initial mirror commit | `acf83e61afbade5ede48e2b7dd29e04531554f04` |
| Initial mirror tag | `migration-functional-baseline` |
| Commit subject | `chore: establish migrated functional baseline` |
| Production data copied | 否 |
| Source `.git` copied | 否 |

## Migration verification summary

隔离测试使用独立端口、独立 `PHOTOS_DIR`、独立 `DATA_DIR`、一张生成图片和一个生成视频完成。验证覆盖：

- 首页和静态资源
- SQLite 初始化与扫描
- 根目录、目录详情、媒体和搜索 API
- 图片缩略图
- 视频 HTTP Range（206）
- 收藏和最近浏览写入隔离数据库
- 查重任务状态与单图片哈希
- HLS 生成与清单访问
- 核心 JavaScript 语法检查

没有对生产数据库、生产媒体或旧项目执行写操作。迁移完成后没有保留测试数据库、媒体、日志或缓存。

已知继承风险：SQLite 媒体可返回视频 poster URL，但新进程没有从数据库恢复 poster 源路径映射时，请求可能返回 404。视频本体 Range 和 HLS 不受影响。该问题属于后续独立缺陷，不在 V1.0/V1.0.1 中修改。

## V1.0.1 migration freeze

V1.0.1 仅校正文档、环境变量说明、启动/部署说明并审计 Git 内容；没有启动网站，没有修改端口、`PHOTOS_DIR`、`DATA_DIR`、数据库、API 或业务源码。完成提交所创建的 `v1.0-migration` 标签是长期迁移冻结点。

## Pending production confirmation

- 生产媒体和数据最终挂载位置
- 是否存在任务计划程序或服务管理器托管
- 是否实际使用 HLS
- 是否仍需要旧 `#/__duplicates` 兼容路由
- 是否有外部程序依赖 `gallery.json`
