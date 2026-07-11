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

## 启动

开发或本机运行：

```powershell
node server.js
```

Windows 也可以运行：

```text
start-server-48101.cmd
```

然后访问 `http://127.0.0.1:48101/#/`。

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

## 文档

- `网页.md`：继承交接和功能索引
- `AGENTS.md`：Codex/维护者工作规则
- `docs/MIGRATION_SOURCE.md`：迁移来源与基线
- `docs/MIGRATION_MANIFEST.md`：文件迁移清单
- `README-SERVER-WINDOWS.md`：旧 Windows 部署说明，部分内容可能过时

