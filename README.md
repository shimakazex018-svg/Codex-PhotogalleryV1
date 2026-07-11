# Codex Photogallery V1

## 项目介绍

Codex Photogallery V1 是一个从成熟旧站点完整继承的本地/局域网写真图库。项目将外部图片和视频目录索引到 SQLite，通过浏览器提供多级目录浏览、媒体预览、搜索、收藏、最近浏览和维护工具。

当前阶段保留原站技术栈、API、页面行为和部署方式，不包含生产数据库或用户媒体。

## 核心功能

- 多级目录与图集浏览
- 图片灯箱、缩放、拖动和键盘导航
- 图片缩略图与懒加载
- 视频 poster、按需加载和 HTTP Range
- SQLite 媒体索引与后台目录扫描
- 搜索、排序、媒体筛选
- 收藏与最近浏览
- 首页轮播
- 图片查重与回收站移动
- 访问日志
- HLS 生成与静态访问

项目没有账号、登录、上传或管理员角色系统。对局域网或虚拟网络开放时，必须在项目外配置适当的网络访问控制。

## 技术栈

- 前端：原生 HTML、CSS、JavaScript
- 后端：Node.js 原生 `http`
- 数据库：Node.js 内置 `node:sqlite`
- 媒体工具：FFmpeg、FFprobe
- 部署：Windows 命令行、批处理或 PowerShell
- 依赖管理：无第三方 npm 运行依赖

## 项目结构

```text
.
├─ index.html                    # 前端 HTML 入口
├─ app.js                        # 前端路由、渲染和交互
├─ styles.css                    # 页面样式
├─ server.js                     # HTTP 服务、API 和媒体处理
├─ gallery-db.js                 # SQLite schema 与数据访问
├─ duplicates-worker.js          # 图片查重后台任务
├─ start-server-48101.cmd        # Windows 主要启动脚本
├─ start-site.cmd/.ps1           # 简化启动入口
├─ fix-network-access-48101.*    # Windows 防火墙辅助脚本
├─ make-hls.ps1                  # 手工 HLS 生成工具
├─ data/                         # 运行数据占位；内容不进入 Git
├─ photos/                       # 本地媒体占位；内容不进入 Git
├─ docs/                         # 迁移与开发维护文档
├─ 网页.md                       # 功能、页面、API 和交接索引
├─ AGENTS.md                     # Codex/维护者规则
└─ .env.example                  # 环境变量格式示例
```

继承的旧 Windows 部署、HLS 预研、SQLite 迁移和升级路线说明已归档到 `docs/archive/`。它们只用于历史追溯，不能作为当前运行依据。

## 环境要求

- Node.js 24，或其他明确支持 `node:sqlite` 的兼容版本
- FFmpeg/FFprobe：仅视频 poster、元数据和 HLS 功能需要
- Windows：当前启动和网络辅助脚本的已继承运行环境

项目没有 `package.json`，无需执行 `npm install`，也没有构建步骤。

## 环境变量说明

`server.js` 直接读取进程环境变量，不会自动加载 `.env`。`.env.example` 只提供变量名称、说明和格式；请通过启动终端、任务计划程序、服务管理器或部署环境注入实际值。

| 变量 | 用途 | 必需 | 默认值/示例格式 |
|---|---|---|---|
| `PORT` | HTTP 端口 | 否 | `48101` |
| `HOST` | 监听地址 | 否 | `0.0.0.0` |
| `PHOTOS_DIR` | 原始媒体目录 | 否 | `<your-media-folder>` |
| `DATA_DIR` | SQLite、日志和生成缓存目录 | 否 | `<your-runtime-data-folder>` |
| `THUMBNAILS_DIR` | 视频 poster 目录覆盖 | 否 | `<your-thumbnail-folder>` |
| `HLS_DIR` | HLS 输出目录覆盖 | 否 | `<your-hls-folder>` |
| `TRASH_DIR` | 重复媒体回收目标 | 否 | `<your-recycle-folder>` |
| `FFMPEG_PATH` | FFmpeg 可执行文件 | 否 | `ffmpeg` 或 `<path-to-ffmpeg>` |
| `FFPROBE_PATH` | FFprobe 可执行文件 | 否 | `ffprobe` 或 `<path-to-ffprobe>` |
| `DUPLICATE_BATCH_SIZE` | 查重批次大小 | 否 | `100` |
| `ALLOW_REMOTE_DELETE` | 是否允许远程删除类操作 | 否 | `0` |

不要把真实路径、密码、Token、Cookie、密钥或生产配置提交到 Git。

## 数据目录说明

- `PHOTOS_DIR` 保存用户原始图片和视频，应独立备份，不得纳入 Git。
- `DATA_DIR` 会写入 `gallery.db`、日志、缩略图、轮播缓存和媒体元数据缓存。
- `THUMBNAILS_DIR` 和 `HLS_DIR` 会持续产生文件，应配置磁盘容量监控和清理策略。
- `TRASH_DIR` 是文件移动目标。跨盘移动可能失败，只能先用可丢弃文件验证。
- 仓库内的 `data/.gitkeep`、`photos/.gitkeep` 只是空目录占位文件。

备份应至少覆盖原始媒体和 SQLite。备份或恢复前，应先停止扫描、查重和文件移动任务。

## 启动方式说明

启动前确认 Node.js、外部数据目录权限和所需环境变量。然后在项目根目录运行：

```powershell
node server.js
```

Windows 也可以运行：

```text
start-server-48101.cmd
```

默认本机入口为 `http://127.0.0.1:48101/#/`。

关闭运行服务的终端或正常终止对应 Node 进程即可停止。不要强制中断正在执行的扫描、查重或媒体移动任务。

## Windows 部署说明

- 当前部署方式是直接运行 Node 服务；项目不会自动安装 Windows Service。
- 使用任务计划程序或服务管理器时，工作目录必须设为项目根目录，并在托管环境中注入变量。
- `fix-network-access-48101.cmd`/`.ps1` 会修改系统网络或防火墙配置，只能由管理员明确执行。
- 项目没有内置 HTTPS、反向代理、身份认证或进程守护。
- 不要把真实生产配置写入仓库中的启动脚本。

更完整的维护流程见 `docs/DEVELOPMENT.md`。

## Git 维护说明

- Git 根目录必须是当前项目根目录。
- 只提交源码、脚本、文档和非敏感配置模板。
- 禁止提交 `data`、`photos`、数据库、日志、缓存、缩略图、HLS、回收站或用户媒体。
- 修改前阅读 `README.md`、`网页.md` 和 `AGENTS.md`。
- 修改后查看完整 diff、检查语法、更新文档并创建职责清晰的 commit。
- 禁止强制推送或覆盖远程历史。

当前基线标签：

- `migration-functional-baseline`
- `v1.0-migration`
- `v1.1-standardized`
- `v1.2-clean`
- `v1.2.5-code-clean`
- `v1.3-release`（完成 GitHub 发布准备后创建）

## 已知限制

- 没有登录、角色权限或应用层访问控制。
- 没有 npm 构建、lint、typecheck 或自动化测试体系。
- SQLite schema 由运行时代码保证，没有独立迁移版本系统。
- 启动扫描、查重和媒体处理会消耗 CPU、内存和磁盘 I/O。
- 缩略图、日志和其他生成文件需要外部容量管理。
- SQLite 媒体返回的视频 poster URL 在新进程未恢复源路径映射时可能 404；视频本体 Range 和 HLS 不受影响。
- 历史专项文档可能包含旧时点说明，使用前需与当前代码和本 README 核对。

## 文档索引

- `网页.md`：页面、路由、按钮、API、数据库和交接索引
- `AGENTS.md`：未来 Codex 和维护者必须遵守的规则
- `docs/DEVELOPMENT.md`：开发、验证和提交工作流
- `docs/CLEANUP_REPORT.md`：V1.2 文件、脚本和代码候选审计
- `docs/CODE_CLEANUP_REPORT.md`：V1.2.5 死代码证据与验证结果
- `docs/PROJECT_STATUS.md`：当前发布版本、结构、规模、问题和后续计划
- `docs/MIGRATION_SOURCE.md`：迁移来源、验证与冻结记录
- `docs/MIGRATION_MANIFEST.md`：迁移文件映射和 Git 审计
- `docs/archive/`：已被当前文档替代但仍有追溯价值的历史说明
- `CHANGELOG.md`：版本阶段和发布变更记录
