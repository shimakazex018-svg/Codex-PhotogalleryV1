# ARCHITECTURE.md

本文件只描述当前架构、模块关系和数据流。当前事实摘要见 `PROJECT_CONTEXT.md`。

## System overview

```text
Browser SPA
  ├─ static: index.html / app.js / styles.css
  └─ HTTP API
       └─ server.js
            ├─ gallery-db.js -> SQLite gallery.db
            ├─ filesystem -> PHOTOS_DIR
            ├─ generated files -> DATA_DIR
            ├─ duplicates-worker.js -> SQLite + PHOTOS_DIR
            ├─ scripts/media-library-cleanup-worker.ps1 -> PHOTOS_DIR metadata + DATA_DIR/logs reports
            └─ FFmpeg / FFprobe
```

项目是单进程 Node HTTP 服务加一个按需子进程 worker，没有前后端构建步骤、框架路由器、ORM 或包管理依赖。

## Source modules

| 文件 | 当前职责 |
|---|---|
| `index.html` | 静态 HTML shell、顶部工具栏、状态区和灯箱结构 |
| `app.js` | hash 路由、页面渲染、客户端状态、API 请求、灯箱、视频按需加载和设置页 |
| `styles.css` | 全部当前页面、响应式和状态样式 |
| `server.js` | HTTP 服务、静态资源、API 路由、扫描任务、媒体/缩略图/HLS、日志和文件操作 |
| `gallery-db.js` | SQLite schema、索引、查询、用户标记和查重数据访问 |
| `duplicates-worker.js` | 图片 SHA-256 查重后台进程和进度输出 |
| `scripts/media-library-cleanup-worker.ps1` | 单线程媒体库元数据扫描、分类报告、受控候选删除和空目录清理 |
| `make-hls.ps1` | 手工 HLS 生成工具 |
| `scripts/gallery-runtime-common.ps1` | V1.4.2 env 白名单解析、运行前校验和环境变量映射 |
| `scripts/check-environment.ps1` | V1.4.2 只读环境预检，不启动网站 |
| `scripts/start-gallery.ps1`、`scripts/stop-gallery.ps1` | 独立 runtime 的启动和 PID 隔离停止入口 |
| `scripts/status-gallery.ps1` | 通过PID元数据和本机TCP连接显示运行状态、端口、Node、Runtime和日志 |
| 根目录`* Gallery.cmd` | 只负责双击入口和结果展示，全部复用`scripts/` PowerShell核心 |
| `scripts/install/uninstall-gallery-autostart.ps1` | 管理唯一的当前用户登录任务`Codex-PhotogalleryV1-Autostart` |
| `scripts/run-gallery-host.ps1` | 任务计划程序的长期宿主；注入环境、记录PID并等待Node退出，使任务保持Running |
| `start-*.cmd/.ps1` | 旧的 Windows 启动入口；不作为 V1.4 runtime 入口 |
| `fix-network-access-48101.*` | 当前端口绑定的 Windows 防火墙/ZeroTier 辅助工具 |

## Frontend architecture

- 单页应用由 `location.hash` 驱动。
- `#/`：首页。
- `#/<path...>`：任意 collection/图集路径。
- `#/__settings`：显示设置。
- `#/__settings/favorites`：收藏图册。
- `#/__settings/history`：观看历史。
- `#/__settings/duplicates`：图片查重。
- `#/__settings/access-log`：访问日志。
- `#/__settings/media-cleanup`：媒体库清理扫描、报告和删除确认。
- `#/__duplicates`：旧查重兼容入口。
- 灯箱不是独立路由，由 overlay 和内存状态控制。

前端直接使用原生 DOM、事件监听、`fetch`、`localStorage` 和 `sessionStorage`，没有组件框架或状态库。媒体列表使用缩略图、懒加载和分批图片渲染；视频在交互/播放时才设置资源地址。

灯箱使用两阶段图片显示：点击后立即复用卡片的按需WebP预览，当前原图完成网络加载和`decode()`后再替换。规范化原图URL是任务唯一键，任务状态覆盖`idle/queued/loading/loaded/decoding/ready/failed/aborted`；已加载或进行中的网络/解码Promise可复用。当前原图使用不计入普通并发的P0立即通道并设置`fetchPriority=high`，下一张为P1并提前解码，第二/第三张预测图为P3且只在当前图显示后调度；普通预加载最大并发2，缓存窗口最多5项，并按Save-Data/2G/3G降级。关闭灯箱或换路由会取消队列和旧会话任务并提升generation，render token阻止旧回调覆盖。列表只请求按需WebP预览，视口外图片保持懒加载并使用低请求优先级；视频数组不参与灯箱调度。

滚动恢复由 `app.js` 管理：`history.scrollRestoration` 使用 `manual`，内存与 `sessionStorage` 最多保留75条路由快照。快照包含稳定DOM锚点、相对视口偏移、scrollY、已渲染媒体数量和分页游标；历史/父级返回按现有24张DOM批次和40条API分页补齐到锚点，普通新导航保持顶部。搜索词写入对应的History entry，Back/Forward和刷新可恢复搜索结果上下文。

## Backend architecture

`server.js` 使用 Node `http.createServer(handleRequest)`。主要职责：

1. 解析环境变量和运行目录。
2. 创建所需 runtime 目录。
3. 提供静态前端文件。
4. 提供图片、视频 Range、缩略图、poster、轮播和 HLS 静态响应。
5. 路由 SQLite 查询 API。
6. 启动扫描子进程和查重 worker。
7. 写入应用日志和访问日志。
8. 限制路径逃逸，并对部分破坏性接口实施本机/配置检查。

`RUN_SCAN_ONCE=1` 时，`server.js` 作为一次性扫描子进程运行；否则启动 HTTP 服务和小时轮播刷新调度。

## Main APIs

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/api/config` | 数据源配置 |
| GET | `/api/index/stats` | SQLite 索引统计 |
| GET | `/api/collections/root` | 首页 collection |
| GET | `/api/collections/:id` | collection 详情 |
| GET | `/api/media` | collection 媒体分页 |
| GET | `/api/search` | SQLite 搜索 |
| GET | `/api/highlights` | 首页轮播 |
| GET/POST/DELETE | `/api/recent` | 最近观看标记 |
| GET/POST/DELETE | `/api/favorites` | 收藏标记 |
| GET/POST/DELETE | `/api/duplicate-delete-marks` | 查重待删除标记 |
| POST / GET | `/api/scan`、`/api/scan/status` | 后台扫描任务与状态 |
| POST / GET | `/api/duplicates/scan`、`/api/duplicates/status` | 查重任务与状态 |
| POST | `/api/duplicates/stop` | 停止查重 |
| GET | `/api/duplicates` | 重复组分页 |
| POST | `/api/duplicates/recycle` | 回收选中重复媒体 |
| POST | `/api/duplicates/recycle-auto` | 自动选择并回收重复媒体 |
| GET/POST | `/api/access-log` | SQLite访问日志分页与写入；GET使用`page/pageSize` |
| POST/GET | `/api/media-cleanup/scan/start`、`/api/media-cleanup/scan/stop`、`/api/media-cleanup/status` | 清理扫描生命周期 |
| GET/POST | `/api/media-cleanup/results`、`/api/media-cleanup/delete` | 流式分页结果和本机确认删除 |
| POST | `/api/open-photo-path` | 打开媒体路径 |
| GET | `/api/refresh-index` | 后端索引刷新入口 |
| GET | `/api/index/changes` | 目录变化摘要 |
| GET | `/api/index/changed-directories` | 变化目录列表 |
| GET | `/api/gallery`、`/api/refresh` | 已禁用旧 API，返回 410 |

所有 API 当前没有账号/Session/Token 鉴权。删除重复媒体接口有本机/`ALLOW_REMOTE_DELETE` 控制，但这不等价于完整认证系统。

媒体清理任务独立于 SQLite 索引扫描。Node 同时只持有一个 worker 句柄，PowerShell 顺序枚举并约每 5000 个对象原子更新进度；报告直接流式写入 `DATA_DIR/logs`。Node 查询 NDJSON 时仅保留当前排序页所需的有界候选（offset 最大 50000、pageSize 最大 200），响应删除绝对路径。删除请求不接收路径，只解析当前 completed 报告，并复用 `ALLOW_REMOTE_DELETE`/localhost 边界。

## Database architecture

`gallery-db.js` 使用 `DatabaseSync` 直接访问 SQLite。

| 表 | 作用 |
|---|---|
| `collections` | collection 树、封面、计数和排序 |
| `media` | 图片/视频、URL、缩略图、元数据和排序 |
| `covers` | collection 封面缓存 |
| `scan_state` | 全局和目录扫描签名 |
| `user_marks` | 收藏、最近和查重标记 |
| `media_hashes` | 图片哈希及查重元数据 |
| `access_logs` | 页面访问记录；按`time DESC, id DESC`稳定分页 |

数据库打开时启用 WAL 并保证表/index 存在。`access_logs`使用`idx_access_logs_time_id`索引；旧按日NDJSON访问日志在启动时流式、分批、幂等导入，原文件不删除。访问日志默认保留365天，启动时检查一次并每24小时清理一次，不自动`VACUUM`。数据库属于运行数据，不进入 Git。

## Media and thumbnail architecture

- `/photos/...` 映射到 `PHOTOS_DIR`，路径必须保持在媒体根内。
- 图片缩略图 URL：`/image-thumbnails/{480|720|960}/<hash>.jpg`。
- 图片缩略图文件：`DATA_DIR/thumbnails/<width>/`。
- 图片预览入口：`/api/image-preview?url=...`，成功后重定向到版本化 `/image-previews/<sha256>.webp`。
- 图片预览文件：`IMAGE_PREVIEW_DIR`；单进程内单并发、同key去重、仅按请求生成。
- 视频 poster URL：`/video-posters/<hash>.jpg`。
- 视频 poster 文件：`THUMBNAILS_DIR`，默认 `DATA_DIR/video-thumbnails`。
- poster进程内映射未命中时，服务端按poster URL从SQLite只读回查`src`并验证媒体根路径。
- HLS URL：`/hls/...`；文件来自 `HLS_DIR`。
- 轮播 URL：`/highlight-carousel/...`；文件来自 `DATA_DIR/highlight-carousel`。
- FFprobe 元数据缓存：`DATA_DIR/video-metadata.json`。

V1.4.5 Runtime继续关闭旧图片缩略图生成。V2.0.1列表改用独立WebP预览，失败不再回退原图。poster继续按需生成。HLS由脚本手工生成，不应在启动或列表加载时全量转码。

V1.4.4小批量缓存工具把状态、暂停标记和逐项日志写入Runtime `logs`，不修改数据库或媒体。它不是全量调度器。

## Duplicate-detection flow

```text
Browser duplicate page
  -> POST /api/duplicates/scan
  -> server.js spawns duplicates-worker.js
  -> worker reads candidate images from gallery.db
  -> worker reads PHOTOS_DIR files and computes SHA-256
  -> media_hashes updated in gallery.db
  -> browser polls /api/duplicates/status and /api/duplicates
```

回收操作会移动真实文件并删除/更新数据库记录，必须使用隔离数据验证。

## Startup flow

当前启动流程：

```text
launcher or shell
  -> inject process environment
  -> node server.js
  -> resolve paths
  -> ensure runtime directories
  -> open SQLite on first query/operation
  -> schedule hourly highlight refresh
  -> listen on HOST:PORT
```

Windows正式运行外层由任务计划程序以隐藏、非交互PowerShell托管`run-gallery-host.ps1`；CMD只触发任务，不直接派生Node。Host等待Node退出，PID元数据分别记录Host和Node；status同时核对Node父PID与48102监听PID。

应用不会自动加载 `.env`。V1.4.2 PowerShell 启动器安全解析外部 `gallery.env`，并把 `POSTER_DIR` 映射为当前服务端使用的 `THUMBNAILS_DIR` 后启动子进程。

V1.4.2 runtime 的图片缩略图和日志分别使用 `data/thumbnails`、`data/logs` directory junction 指向 runtime 顶层目录；这保持现有服务端派生路径不变。HLS、poster 和 trash 直接通过现有环境变量指向 runtime 顶层目录。

## Runtime versus source

源代码/Git：

- `.js`、`.html`、`.css`；
- 脚本；
- `.env.example` 等非敏感模板；
- 文档。

运行数据/不进入 Git：

- `gallery.db`、SQLite side files 和备份；
- 原始照片/视频；
- 图片缩略图、视频 poster、轮播和 HLS；
- 日志、cache、临时测试文件；
- 真实 `.env` 和机器专属路径。

## Authentication and permissions

- 登录模块：不存在。
- 用户/管理员角色：不存在。
- HTTP API 鉴权：不存在。
- 文件系统权限、网络边界和破坏性接口的本机检查是当前主要保护。
- 面向非可信网络部署前必须新增独立访问控制评审。
