# PROJECT_CONTEXT.md

本文件只记录项目当前事实。历史改动见 `CHANGELOG.md`，最近交接见 `HANDOFF.md`。

## Project identity

- 项目名称：Codex Photogallery V1
- 用途：把外部图片/视频目录索引到 SQLite，并通过本地或受控网络浏览器提供个人媒体图库。
- 前端版本标记：`v79`（`app.js` 中的 `APP_VERSION`）。
- 当前稳定发布标签：`v1.3-release`。
- 当前分支：`main`。

## Current implementation state

- 当前业务代码已经完成旧项目功能镜像、工程标准化和轻度死代码清理。
- GitHub 仓库已经发布 `main` 和既有版本标签。
- 当前本地分支包含尚未推送的 V1.4 规划、上下文体系和 V1.4.2 runtime 实施提交。
- V1.4.2 已在仓库外创建独立 runtime，并迁移经过 SHA256 校验的数据库副本。
- runtime 已配置现有媒体路径。V1.5.0站点已启动作为日常运行候选，PID和48102由正式脚本管理。

## Current runtime behavior

- 当前代码默认端口：`48101`。
- 当前默认监听地址：`0.0.0.0`。
- 当前代码通过进程环境变量读取配置，不自动加载 `.env`。
- 当前启动入口：`node server.js`、`start-server-48101.cmd`、`start-site.cmd`、`start-site.ps1`。
- `start-server-48101.cmd` 会固定设置端口并把 `DATA_DIR` 指向项目内 `data`。
- 正式Runtime当前由配置注入`48102`并监听IPv4 `0.0.0.0`；无配置直接运行源码仍使用历史默认`48101`。
- 正式 runtime 已建立在代码仓库外，并通过新 PowerShell 脚本管理。
- V2.0.1正式Runtime已配置`D:\GalleryRuntime\image-previews`，按需预览生成开启，旧thumbnail生成保持关闭。

## Core features

- 多级目录与图集浏览；
- 图片灯箱、缩放、拖动和键盘导航；
- 图片缩略图、懒加载和分批渲染；
- 视频 poster、按需加载和 HTTP Range；
- SQLite 索引、搜索和分页媒体查询；
- 收藏、最近观看和用户标记；
- hash路由的会话级滚动位置恢复，包含搜索词、稳定锚点和有界媒体深度恢复；
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
| 图片预览 | `IMAGE_PREVIEW_DIR`，默认 `DATA_DIR/image-previews` | 不提交 |
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

- V1.4.4已修复新进程poster源路径恢复：内存未命中时从Runtime SQLite只读回查媒体源，并写入Runtime poster目录。
- V1.4.5正式Runtime禁用新的图片缩略图生成；缺失thumbnail时返回原图，已有少量缓存保留。
- 没有登录、角色权限或应用层访问控制。
- 没有 npm 依赖、构建、lint、typecheck 或自动化测试体系。
- 正式 Node 24.x 托管方式：待确认；脚本支持 `-NodePath` 或启动器进程的 `NODE_EXE`。
- V1.4 独立 runtime 和数据库副本已创建，但首次运行验收尚未执行。
- 参数化 env 加载、预检、启动、停止和 48102 防火墙脚本已经实现。
- `start-gallery.ps1` 已支持含空格的项目路径，并通过实际启动验收。
- 缩略图、poster、HLS 和日志需要容量统计与清理策略。
- 小批量缓存任务已有状态、暂停标记和日志；47万图片全量调度仍未实现且禁止运行。
- HLS保持按需设计，当前实际播放仍使用原视频Range；7天生命周期已配置但尚未实现自动清理。
- PC受控浏览器因当前环境权限未完成自动交互验收；LAN/ZeroTier本机HTTP已通过，实体手机和防火墙管理员步骤待人工确认。
- 根目录已有双击启动、停止、状态和自动启动安装/卸载入口；当前用户登录任务已安装，延迟30秒调用正式PowerShell启动器。
- 手动启动和登录启动统一由任务计划程序以隐藏、非交互PowerShell长期托管`run-gallery-host.ps1`；关闭CMD后任务、host和Node保持运行，桌面不需要长期Gallery控制台窗口。
- LAN为Private，地址`192.168.31.153/24`；安全48102规则脚本已准备，但UAC被取消，规则尚未实际创建。

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
