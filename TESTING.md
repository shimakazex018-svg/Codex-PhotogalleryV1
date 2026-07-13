# TESTING.md

本文件记录当前有效的启动、静态检查和运行验证方法。任务过程和历史结果不在此记录。

## Environment requirements

- Node.js 24.x，必须支持 `node:sqlite` / `DatabaseSync`。
- FFmpeg 和 FFprobe：视频 poster、元数据和 HLS 验证需要。
- PowerShell / Windows：当前脚本环境。
- 运行验证必须使用独立 `PHOTOS_DIR`、`DATA_DIR` 和可丢弃媒体，除非用户明确授权生产验证。
- 正式 Node 托管方式：待确认；V1.4.2 脚本接受 `-NodePath` 或启动器进程的 `NODE_EXE`。
- V1.4.2 参数化启动器已实现，网站尚未首次启动验收。

Node 预检：

```powershell
node -v
node -e "const { DatabaseSync } = require('node:sqlite'); console.log(Boolean(DatabaseSync))"
```

## Install and build

- `npm install`：不适用，项目没有 `package.json`。
- build：不适用，前端是静态 HTML/CSS/JavaScript。
- lint/typecheck：当前没有配置。
- 自动化测试：当前没有配置。

不得虚构 npm 命令。如果新增工具链，必须同步更新本文件。

## Static syntax checks

业务代码修改后最低要求：

```powershell
node --check server.js
node --check app.js
node --check gallery-db.js
node --check duplicates-worker.js
git diff --check
```

同时检查：

```powershell
git status --short
git diff
```

通过标准：所有语法命令退出码为 0；没有意外文件、敏感信息或运行数据进入 diff。

## Current startup methods

当前代码可通过已注入环境变量的 shell 运行：

```powershell
node server.js
```

正式Runtime状态检查：

```powershell
.\scripts\status-gallery.ps1
```

通过标准：`Status=running`、PID存在、`Port=48102`、`Listening=True`、`NodeRunning=True`，Runtime和日志路径正确。

Windows双击入口验证顺序：

1. `Stop Gallery.cmd`后状态为stopped、PID文件不存在、48102不监听；
2. `Start Gallery.cmd`后首页HTTP 200，CMD退出后Node仍运行；
3. 再次启动必须显示already running且PID不变；
4. `Gallery Status.cmd`必须显示PID、Node、端口、Runtime、配置、日志和访问地址；
5. `Stop Gallery.cmd`只能停止PID元数据对应进程；
6. 最后再次启动并保持运行。

自动启动任务验证：

```powershell
Get-ScheduledTask -TaskName Codex-PhotogalleryV1-Autostart
Get-ScheduledTaskInfo -TaskName Codex-PhotogalleryV1-Autostart
```

Trigger必须是当前用户登录且`Delay=PT30S`；Action必须调用完整绝对路径的`run-gallery-host.ps1`，参数包含`-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass`，工作目录为项目根，权限为Limited，重复实例策略为IgnoreNew，且`ExecutionTimeLimit=PT0S`。

生命周期验收必须覆盖两种场景：启动CMD自行退出，以及网站就绪后手工关闭仍打开的启动CMD。每种场景都等待至少30秒，要求Host PID和Node PID存在、Node PID不变、Node父PID等于Host PID、48102监听PID等于Node PID、任务仍Running、首页HTTP 200、stderr无致命错误，且Host/Node没有可见主窗口。任何PID不一致都必须判定为degraded。

LAN防火墙验收：规则`Codex-PhotogalleryV1-48102-LAN`必须只允许TCP 48102。Private LAN使用LocalAddress=`192.168.31.153`、RemoteAddress=`LocalSubnet`；服务器本机LAN URL 200不等于实体设备通过。

当前继承脚本：

```text
start-server-48101.cmd
start-site.cmd
start-site.ps1
```

注意：

- 当前代码默认端口为 `48101`。
- `start-server-48101.cmd` 会固定端口并覆盖 `DATA_DIR`。
- V1.4.2 runtime 配置端口为 `48102`；无配置运行代码时仍默认 `48101`。
- 正式 runtime 恢复前，不应使用空项目 `data`/`photos` 冒充生产环境。

V1.4.2 只执行环境预检、不启动网站：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-environment.ps1 `
  -EnvFile D:\GalleryRuntime\config\gallery.env `
  -NodePath <node-exe>
```

只有任务明确授权启动时，才使用 `scripts/start-gallery.ps1`。停止必须使用 `scripts/stop-gallery.ps1`，它会核对 JSON PID 元数据，避免按端口或进程名误停旧项目。

## Isolated smoke environment

只有任务明确允许启动时才使用。要求：

1. 创建 Git 忽略的临时 runtime。
2. 使用独立测试端口。
3. 使用一张生成图片和一个短测试视频。
4. 设置 `ALLOW_REMOTE_DELETE=0`。
5. 不连接生产数据库、真实媒体或旧项目 data。
6. 验证结束后停止进程并清理临时文件。

## API smoke checks

服务已在隔离环境启动后，可设置：

```powershell
$baseUrl = "http://127.0.0.1:<test-port>"
```

最低只读检查：

```powershell
Invoke-RestMethod "$baseUrl/api/config"
Invoke-RestMethod "$baseUrl/api/index/stats"
Invoke-RestMethod "$baseUrl/api/collections/root"
Invoke-RestMethod "$baseUrl/api/highlights"
Invoke-RestMethod "$baseUrl/api/search?q=test&limit=5"
Invoke-RestMethod "$baseUrl/api/scan/status"
Invoke-RestMethod "$baseUrl/api/duplicates/status"
```

`/api/scan`、查重扫描、回收、HLS 和打开路径有副作用或资源成本，不属于默认 smoke。

## Browser checks

运行型前端修改至少检查：

- 首页和 hash 导航；
- 多级目录和媒体详情；
- 搜索；
- 设置页、查重页、访问日志页；
- 收藏和最近观看；
- 图片灯箱和键盘操作；
- 视频只在交互后加载；
- 控制台无新增错误；
- 移动端/窄屏没有明显布局破坏；
- 大列表没有一次性加载全部视频或图片 DOM。

## Database checks

- 禁止用当前应用代码“只读打开”生产源库；数据库打开逻辑会启用 WAL 并保证 schema/index。
- 迁移检查只对 staging/目标副本执行。
- 迁移前记录源/目标大小、mtime 和 SHA-256。
- SQLite 完整性检查工具/命令：待确认正式环境可用的只读工具后补充。
- 运行后可用 `/api/index/stats` 核对 collection/media/image/video 数量。

## Thumbnail checks

V1.4.5正式Runtime策略：

1. 选择一个Runtime中不存在的thumbnail URL。
2. 分别请求对应原图URL和thumbnail兼容URL。
3. 两个响应内容SHA256必须一致。
4. 请求前后Runtime thumbnail文件数必须不变。

未来重新启用生成时，只能在隔离数据中：

1. 请求一个 `/image-thumbnails/480/...jpg`。
2. 确认 HTTP 200、文件写入隔离 `DATA_DIR/thumbnails/480`。
3. 再次请求不应重复生成无界文件。
4. 检查 720/960 路径只在需要时生成。
5. 确认 Git 工作区保持干净。

## Video checks

Range 检查：

```powershell
curl.exe -s -D - -o NUL -H "Range: bytes=0-1023" "$baseUrl/photos/<test-video>"
```

通过标准：HTTP 206、`Accept-Ranges: bytes`、正确 `Content-Range`，且前端未预加载完整视频。

poster 检查：

- 请求媒体返回的 poster URL。
- 必须在新进程中不预热媒体API，直接请求已知poster URL；V1.4.4预期从SQLite恢复源路径并返回HTTP 200。
- 确认文件只写入配置的Runtime poster目录。

HLS 检查只使用测试视频：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\make-hls.ps1 `
  -VideoPath <test-video> `
  -OutputRoot <isolated-hls-root> `
  -FfmpegPath <ffmpeg-exe>
```

通过标准：生成 `.m3u8` 和有限分段，HTTP 可访问；验证后清理隔离产物。禁止对生产媒体全量转码。

## Common failures

| 现象 | 常见原因 |
|---|---|
| `node` 找不到 | 使用 `-NodePath` 或为启动器进程设置 `NODE_EXE` |
| `node:sqlite` 不可用 | Node 版本不兼容 |
| `EADDRINUSE` | 测试/正式端口被占用 |
| `Cannot find module 'D:\A8'` | 使用修复后的 `start-gallery.ps1`；入口路径必须作为带引号的单一参数传递 |
| 首页为空 | `PHOTOS_DIR`/`DATA_DIR` 指向空目录或尚未迁移数据库 |
| SQLite 打开失败 | 权限、文件损坏、错误 data 路径 |
| poster 404 | 检查Runtime数据库中的`media.poster/src`、媒体文件存在性、FFmpeg路径和Runtime poster目录权限 |
| HLS 404 | HLS 未生成或 `HLS_DIR` 不一致 |
| 回收失败 | 远程删除关闭、跨盘 rename 或权限不足 |
| 缩略图增长过快 | 大量页面访问触发按需生成，缺少容量清理 |

## Overall pass criteria

- 相关语法/静态检查通过；
- 关键页面和 API 与修改前语义一致；
- 没有生产数据写入或媒体移动；
- 运行文件只写入隔离/正式外部 runtime；
- 视频保持 poster + 按需加载；
- 没有无界扫描、转码或缓存生成；
- Git 工作区没有运行数据或无关修改；
- 已验证与未验证项目在最终报告和 `HANDOFF.md` 中明确记录。
