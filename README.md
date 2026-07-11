# Codex Photogallery V1

本项目是从 `D:\A8 Codex\Codex-Photogallery\photo-gallery-site` 选择性迁移的功能等价镜像。它使用原生 HTML/CSS/JavaScript、Node.js 原生 HTTP 服务和 Node 内置 SQLite，为本机、局域网或受控虚拟网络提供图片与视频目录浏览。

## 功能

- 多级目录与图集浏览
- 图片灯箱、缩放和键盘导航
- 视频 poster、按需加载和 HTTP Range
- SQLite 媒体索引、搜索、收藏、最近浏览
- 首页轮播、缩略图、访问日志
- 后台目录扫描和图片查重
- HLS 静态输出与播放

项目没有账号、登录、上传或管理员角色系统。任何网络暴露都应由防火墙、反向代理或其他访问控制保护。

## 环境要求

- Node.js 24 或兼容 `node:sqlite` 的版本
- FFmpeg/FFprobe：视频 poster、元数据和 HLS 功能需要
- Windows 启动脚本为当前已验证部署方式

项目没有 npm 依赖，无需执行 `npm install`。

## 配置

`server.js` 直接读取进程环境变量，不会自动加载 `.env`。可参考 `.env.example`：

- `PORT`：默认 `48101`
- `HOST`：默认 `0.0.0.0`
- `PHOTOS_DIR`：媒体源目录，默认 `./photos`
- `DATA_DIR`：SQLite、缓存和日志目录，默认 `./data`
- `THUMBNAILS_DIR`、`HLS_DIR`、`TRASH_DIR`
- `FFMPEG_PATH`、`FFPROBE_PATH`
- `DUPLICATE_BATCH_SIZE`
- `ALLOW_REMOTE_DELETE`：默认应为 `0`

真实媒体、生产数据库、日志、缩略图和 HLS 输出不得提交 Git。

`.env.example` 只是变量清单，复制为 `.env` 也不会自动生效。请通过当前终端、启动脚本、任务计划程序或服务管理器注入环境变量。不要把真实路径、凭据或生产配置写回 `.env.example`。

目录约束：

- `PHOTOS_DIR` 指向原始图片和视频，只应由明确的媒体管理操作修改。
- `DATA_DIR` 会写入 SQLite、日志、轮播缓存、缩略图和元数据缓存，运行账户必须有读写权限。
- `THUMBNAILS_DIR` 和 `HLS_DIR` 可以放在独立磁盘，但应设置容量监控和备份策略。
- `TRASH_DIR` 是重复图片回收目标；跨盘移动可能失败，生产使用前必须验证。
- `ALLOW_REMOTE_DELETE=1` 会放宽重复图片删除接口限制，未配置额外访问控制时不得启用。

## 启动

启动前确认：

1. 当前目录是 `D:\A8 Codex\Codex-PhotogalleryV1`。
2. Node.js 支持 `node:sqlite`。
3. `PHOTOS_DIR`、`DATA_DIR` 指向预期位置，且不在 Git 跟踪范围内。
4. 端口未被其他进程占用。
5. 如果需要视频 poster、元数据或 HLS，FFmpeg/FFprobe 可执行。

开发或本机运行：

```powershell
node server.js
```

Windows 也可以运行：

```text
start-server-48101.cmd
```

然后访问 `http://127.0.0.1:48101/#/`。

当前脚本不会安装 Windows 服务，也不会设置开机自启。关闭运行 `node server.js` 的终端或正常终止对应 Node 进程即可停止服务。不要使用强制结束方式打断正在执行的扫描、查重或文件移动任务。

## Windows 部署边界

- 当前已继承的部署方式是直接运行 `node server.js` 或 `start-server-48101.cmd`。
- `fix-network-access-48101.cmd`/`.ps1` 会修改 Windows 防火墙或网络配置，必须由管理员明确执行，不属于普通启动流程。
- 项目没有内置 HTTPS、反向代理、身份认证或进程守护。对局域网或虚拟网络开放前，应在项目外配置访问控制。
- 若使用任务计划程序或服务管理器，应把工作目录设为项目根目录，并通过该托管环境注入变量。
- 本阶段不改变现有端口、`PHOTOS_DIR`、`DATA_DIR` 或部署架构。

## 验证

语法检查：

```powershell
node --check server.js
node --check app.js
node --check gallery-db.js
node --check duplicates-worker.js
```

最小冒烟接口：

- `/api/config`
- `/api/index/stats`
- `/api/collections/root`
- `/api/highlights`
- `/api/search?q=test&limit=5`
- `/api/scan/status`
- `/api/duplicates/status`

扫描、查重、回收站和打开文件路径会产生副作用。只能使用隔离测试目录验证，不能对生产媒体执行自动化删除测试。

## 数据和备份

- 备份 `DATA_DIR/gallery.db` 和必要配置。
- 缩略图、poster、轮播和 HLS 通常可重新生成。
- 原始媒体由 `PHOTOS_DIR` 管理，必须单独备份。
- 恢复时先挂载媒体和数据目录，再启动服务并检查索引统计。

不要只备份缩略图或旧 `gallery.json`。SQLite 和原始媒体是主要恢复对象；日志和生成缓存是否备份可按运维需求决定。备份/恢复操作应在后台扫描、查重和文件移动停止后执行。

## 当前冻结基线

- 功能镜像提交：`acf83e61afbade5ede48e2b7dd29e04531554f04`
- 功能镜像标签：`migration-functional-baseline`
- 迁移冻结标签：`v1.0-migration`（V1.0.1 完成时创建）
- V1.0.1 只补强文档和 Git 安全检查，不启动网站、不修改业务源码或运行参数。

## 文档

- `网页.md`：继承交接和功能索引
- `AGENTS.md`：Codex/维护者工作规则
- `docs/MIGRATION_SOURCE.md`：迁移来源与基线
- `docs/MIGRATION_MANIFEST.md`：文件迁移清单
- `README-SERVER-WINDOWS.md`：旧 Windows 部署说明，部分内容可能过时
