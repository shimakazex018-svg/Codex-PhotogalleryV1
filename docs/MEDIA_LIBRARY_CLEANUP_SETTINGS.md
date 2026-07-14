# 媒体库清理设置

## 页面入口与范围

- 入口：设置 → 媒体库清理，hash 路由 `#/__settings/media-cleanup`。
- 扫描根目录只读取服务端启动时解析的 `PHOTOS_DIR`；API 不接受客户端 root/path。
- 扫描只读取路径、扩展名、大小、时间、属性和目录结构，不读取媒体内容，不解码，不调用 FFmpeg/FFprobe，不计算哈希。
- 同时只允许一个清理扫描或删除任务；Node 异步启动隐藏的 PowerShell 子进程，网站不等待任务同步完成。

## 白名单与分类

图片白名单集中定义于 `scripts/media-library-cleanup-worker.ps1`，覆盖常见 Web 图片、TIFF/HEIF/AVIF/JXL、PSD 与主流 RAW 扩展名。视频白名单覆盖 MP4/MOV/AVI/MKV/WMV/WebM/MPEG/TS/M2TS/VOB/3GP/OGV/RM/MXF 等格式。扩展名比较不区分大小写；网站是否能播放某格式不影响其媒体身份。

非媒体分类：`Archive`、`Document`、`MetadataOrSidecar`、`TemporaryOrPartial`、`ExecutableOrScript`、`SystemJunk`、`Extensionless`、`Unknown`。0 字节媒体、低于 4096 bytes 的可疑小媒体、LongPath、ReparsePoint 和 ScanError 只报告，不进入普通删除候选。

目录分类：

- `EmptyDirectory`：没有文件和子目录；
- `LeafNonMediaDirectory`：叶目录内只有非媒体文件；
- `MediaFreeTree`：整棵子树没有媒体，只报告最上层主要候选；
- `ResultingEmptyDirectory`：删除后重新枚举，并自底向上确认真正为空后才删除。

## 生命周期与停止

`POST /api/media-cleanup/scan/start` 创建时间戳加随机后缀的 `jobId`。PowerShell 使用单线程深度优先枚举，每约 5000 个对象更新一次进度；停止请求写入当前任务专属取消标记，worker 在有界检查点退出，报告标记 `incomplete=true`，状态变为 `stopped`。完成、停止、失败后子进程均退出，取消标记和原子写入临时文件会清理。

网页轮询 `GET /api/media-cleanup/status`。结果通过 `GET /api/media-cleanup/results` 流式读取 NDJSON 内部索引，支持分类、文件名/相对路径搜索、路径/大小排序和分页；每页最多 200 条，深分页 offset 上限 50000，以限制 Node 内存。浏览器只保存当前页并在离开页面时停止轮询。

## 报告

报告直接写入现有 `DATA_DIR/logs`。正式 Runtime 的 junction/配置使其对应 `D:\GalleryRuntime\logs`，不创建新的报告根目录或 `media-cleanup` 子目录。文件前缀为 `media-cleanup-<jobId>`，包括 summary JSON、非媒体/目录/0字节/可疑媒体/错误/删除 CSV、内部分页 NDJSON、进度 JSON 和日志。UTF-8 BOM 用于 PowerShell/Excel 中文路径兼容；报告不得包含密码、Token、Cookie 或无关环境变量。

## 删除安全边界

扫描完成后不会自动删除。网页必须打开自定义对话框并准确输入 `DELETE` 或“删除”。请求只能提交当前 `jobId` 和确认文本；真实路径由服务端报告解析。中止、失败、过期或非当前任务不能删除。

当 `ALLOW_REMOTE_DELETE=0` 时，扫描和查看可从网络访问，但删除只接受服务端 localhost；本功能不自行开启远程删除。worker 对每个候选重新验证规范化绝对路径位于 `PHOTOS_DIR` 内、不是根目录且不是 ReparsePoint，再逐项精确删除。单项失败写入删除报告，不中止整批。之后重新安全枚举目录、跳过 ReparsePoint、自底向上删除真正空目录，绝不删除 `PHOTOS_DIR` 本身。

## 测试、使用与回滚

隔离测试只允许 `$env:TEMP\Codex-PhotogalleryV1-MediaCleanup-<GUID>`，使用独立 `PHOTOS_DIR`、`DATA_DIR`、端口和 `ALLOW_REMOTE_DELETE=0`；在 `finally` 中停止精确 Node PID、删除整个目录并验证 `Test-Path=False`。禁止用正式媒体测试删除。

使用流程：打开设置页 → 开始扫描 → 等待 completed → 按标签/分类/搜索核查报告 → 如获明确授权且在服务器 localhost，输入确认文本后删除。第一阶段正式验收只扫描、查看和生成报告，不执行删除。

回滚代码只需恢复 `server.js`、`app.js`、`styles.css`、`index.html` 并移除 worker；已生成报告可保留审计。风险包括正式全库扫描的持续磁盘读取、报告文件增长、权限/长路径导致的错误，以及无鉴权环境下不应开启远程删除。

## 2026-07-14 正式只读扫描记录

jobId `20260714-201722-880b3aae` 从现有 Runtime 配置读取 `PHOTOS_DIR`，顺序扫描 482450 个文件和 7288 个目录，耗时约 201 秒。结果为图片 472490、视频 2109、非媒体 7851（4204588435 bytes）、空目录 269、叶非媒体目录 132、无媒体目录树 5、0 字节媒体 0、可疑小媒体 2、ReparsePoint 0、错误 0。11 个报告直接写入 `D:\GalleryRuntime\logs`。删除文件和目录均为 0；未调用正式删除 API。

正式部署`v86`后再次从设置页运行jobId `20260714-232613-22183b82`，同一配置根完成482450文件、7288目录的顺序扫描，耗时102.126秒；统计与前次一致，`incomplete=false`、错误0、删除文件0、删除目录0，worker完成后自动退出。结果分类为Unknown 24、Archive 4、MetadataOrSidecar 3318、Document 4309；服务端分页上限200，浏览器默认每页50条。正式删除仍未授权。
