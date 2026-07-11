# PROJECT_CONTEXT.md

本文件只记录项目当前事实。历史改动见 `CHANGELOG.md`，最近交接见 `HANDOFF.md`。

## Project identity

- 项目名称：Codex Photogallery V1
- 用途：把外部图片/视频目录索引到 SQLite，并通过本地或受控网络浏览器提供个人媒体图库。
- 前端版本标记：`v70`（`app.js` 中的 `APP_VERSION`）。
- 当前稳定发布标签：`v1.3-release`。
- 当前分支：`main`。

## Current implementation state

- 当前业务代码已经完成旧项目功能镜像、工程标准化和轻度死代码清理。
- GitHub 仓库已经发布 `main` 和既有版本标签。
- 当前本地分支包含 V1.4 与 V1.4.1 两个尚未推送的纯文档提交。
- V1 正式运行环境尚未恢复，当前仓库未连接生产数据库或真实媒体。
- 当前网站未作为 V1 正式服务运行。

## Current runtime behavior

- 当前代码默认端口：`48101`。
- 当前默认监听地址：`0.0.0.0`。
- 当前代码通过进程环境变量读取配置，不自动加载 `.env`。
- 当前启动入口：`node server.js`、`start-server-48101.cmd`、`start-site.cmd`、`start-site.ps1`。
- `start-server-48101.cmd` 会固定设置端口并把 `DATA_DIR` 指向项目内 `data`。
- 已决定但尚未实施的 V1.4 目标端口：`48102`。
- 已决定但尚未实施的正式 runtime：代码仓库外的独立 runtime 目录。

## Core features

- 多级目录与图集浏览；
- 图片灯箱、缩放、拖动和键盘导航；
- 图片缩略图、懒加载和分批渲染；
- 视频 poster、按需加载和 HTTP Range；
- SQLite 索引、搜索和分页媒体查询；
- 收藏、最近观看和用户标记；
- 首页轮播；
- 后台目录扫描；
- 图片 SHA-256 查重、标记和回收站移动；
- 访问日志；
- 可选手工 HLS 生成与静态访问。

## Current data and generated paths

当前代码的路径规则：

| 内容 | 当前路径规则 | Git 状态 |
|---|---|---|
| 原始媒体 | `PHOTOS_DIR`，默认 `<project-root>/photos` | 不提交；仓库仅跟踪 `.gitkeep` |
| SQLite | `DATA_DIR/gallery.db` | 不提交 |
| 图片缩略图 | `DATA_DIR/thumbnails/<width>/` | 不提交 |
| 视频 poster | `THUMBNAILS_DIR`，默认 `DATA_DIR/video-thumbnails` | 不提交 |
| HLS | `HLS_DIR`，默认 `DATA_DIR/hls` | 不提交 |
| 轮播缓存 | `DATA_DIR/highlight-carousel` 和 JSON 描述文件 | 不提交 |
| 视频元数据缓存 | `DATA_DIR/video-metadata.json` | 不提交 |
| 日志 | `DATA_DIR/logs` | 不提交 |
| 回收目录 | `TRASH_DIR`，默认媒体根同级回收目录 | 不提交 |

当前仓库的 `data/` 和 `photos/` 只有 `.gitkeep`；不存在受 Git 管理的生产数据库、媒体、缩略图、HLS、日志或 cache。

## Database facts

- 数据库：SQLite。
- 访问方式：Node 内置 `node:sqlite` 的 `DatabaseSync`。
- schema 由 `gallery-db.js` 运行时使用 `CREATE TABLE/INDEX IF NOT EXISTS` 保证。
- 当前表：`collections`、`media`、`covers`、`scan_state`、`user_marks`、`media_hashes`。
- 当前打开逻辑会启用 WAL 和 `synchronous=NORMAL`。
- 没有独立数据库 migration 文件。

## Deprecated or disabled behavior

- `/api/gallery`：旧 JSON API，当前返回 HTTP 410。
- `/api/refresh`：旧刷新 API，当前返回 HTTP 410。
- `gallery.json` 不是当前主索引，JSON rebuild 已禁用。
- 归档文档位于 `docs/archive/`，不能作为当前运行依据。

## Current known limitations

- 视频 poster 源路径映射在新进程中可能未恢复，poster 请求可能返回 404；视频 Range/HLS 不受此限制。
- 没有登录、角色权限或应用层访问控制。
- 没有 npm 依赖、构建、lint、typecheck 或自动化测试体系。
- 正式 Node 24.x 可执行路径和托管方式：待确认。
- V1.4 独立 runtime 尚未创建：待确认。
- 生产数据库尚未迁移到 V1 runtime：待确认。
- 参数化 env 加载启动器尚未实现：待确认。
- 缩略图、poster、HLS 和日志需要容量统计与清理策略。

## Protected facts

未经单独批准不能随意修改：

- 当前 API 路径和响应语义；
- SQLite schema 和用户标记数据；
- 原始媒体物理位置；
- 代码/运行数据分离原则；
- 视频按需加载和列表资源限制；
- Git 中不包含运行数据；
- 旧项目在 V1 runtime 验证、备份和回滚演练前不能删除。

## Canonical references

- 详细页面、按钮和 API：`网页.md`
- 当前系统结构：`ARCHITECTURE.md`
- 长期技术决策：`DECISIONS.md`
- 任务池：`TODO.md`
- 当前验证方式：`TESTING.md`
- 最新交接：`HANDOFF.md`
- V1.4 runtime 方案：`docs/V1.4_RUNTIME_MIGRATION_PLAN.md`、`docs/V1.4.1_RUNTIME_IMPLEMENTATION_PLAN.md`
