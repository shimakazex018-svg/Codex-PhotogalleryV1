# 媒体库清理设置

## 页面入口与范围

- 入口：设置 → 媒体库清理，hash路由`#/__settings/media-cleanup`。
- 扫描根只来自服务端启动时解析的`PHOTOS_DIR`；客户端不能提交root、源绝对路径、目标绝对路径或manifest路径。
- 扫描只读取路径、扩展名、大小、时间、属性和目录结构，不解码媒体、不调用FFmpeg/FFprobe、不计算哈希。
- 同时只运行一个扫描、回收或恢复worker。浏览器轮询聚合状态和分页扫描结果，不读取完整manifest。

## 扫描报告

PowerShell顺序枚举并把扫描报告流式写入现有`DATA_DIR/logs`，文件前缀为`media-cleanup-<jobId>`。非媒体记录为`kind=non-media`；0字节媒体、可疑小媒体、目录、ReparsePoint和错误只报告，不是回收候选。停止任务会得到`incomplete=true`，不能执行回收。

正式批准报告为`20260714-232613-22183b82`：482450文件、7288目录、472490图片、2109视频、7851非媒体（4204588435 bytes）、0错误、`incomplete=false`。v91只允许该job进入正式回收/恢复接口；测试可通过进程级`MEDIA_CLEANUP_ALLOWED_JOB_ID`指定隔离job。

## v86永久删除的废弃

v86 worker的Delete模式曾对候选直接调用`[System.IO.File]::Delete($candidate)`，无法恢复。v91删除该模式和前端DELETE确认：

- `POST /api/media-cleanup/delete`固定返回HTTP 410；
- 新接口为`POST /api/media-cleanup/recycle`，确认文本`MOVE`或“移入回收站”；
- 恢复接口为`POST /api/media-cleanup/restore`，确认文本`RESTORE`或“恢复”；
- 两个写接口都只允许localhost，`ALLOW_REMOTE_DELETE=0`继续保持，LAN/ZeroTier只能扫描和查看。

## 回收目录与manifest

回收功能复用`server.js`已经解析的`trashDir`，不创建新的磁盘根目录。每个job使用：

```text
<TRASH_DIR>\media-cleanup\<jobId>\
  files\<原相对路径>
  manifest.ndjson
  summary.json
  recycle.log
```

正式配置来自`D:\GalleryRuntime\config\gallery.env`：`PHOTOS_DIR=E:\A_秀人`，`TRASH_DIR=E:\回收站`，两者同盘，因此正式回收与恢复使用`File.Move`。目录已完成安全/权限检查，但正式MOVE尚未执行，也没有创建批准job的manifest；Git不跟踪其中内容。

manifest每次状态变化追加一行，至少包含jobId、recordId、原完整/相对路径、计划/实际回收路径、分类、大小、扫描/实际mtime、原属性、status、错误、冲突原因、移动/恢复时间。状态包括`Pending`、`Moved`、`Missing`、`ChangedSinceScan`、`ConflictRenamed`、`CopiedButSourceRetained`、`Failed`、`Restored`和`RestoreConflict`。

同一job重试先按recordId读取最新状态。已经成功移入且源不存在的记录不会再次复制；`CopiedButSourceRetained`会只重试安全删除源；失败或扫描后变化保持可审计。

## 执行前和逐项安全检查

开始前统计报告中全部`kind=non-media`候选数量与字节数，并读取目标卷实时可用空间。要求：

```text
available >= max(candidateBytes + 2 GiB, candidateBytes * 1.1)
```

空间不足时整个任务在移动任何候选前失败。即使同盘rename也执行该低空间保护。

每个候选再次验证：规范化路径仍在`PHOTOS_DIR`内部且不是根；文件和父链不是ReparsePoint；文件仍存在；大小和LastWriteTime与扫描一致；当前扩展名仍不在图片/视频白名单。变化记录`ChangedSinceScan`并跳过；缺失记录`Missing`；报告后新出现且不在records中的文件永不处理。

目标由`files\<原相对路径>`派生并再次验证在`TRASH_DIR`内。已有目标绝不覆盖，改用`.__recycle_<shortID>`后缀，并在manifest记录计划/实际路径和`DestinationExists`。

## 同盘和跨盘流程

同盘使用`File.Move`：先创建父目录，不覆盖，失败时源保留，单项失败不终止全任务。

跨盘固定并发1：

1. 在目标目录创建`<destination>.partial-<GUID>`；
2. 顺序复制并关闭句柄；
3. 确认源和partial存在、大小相等，源大小/mtime仍等于扫描记录；
4. 在目标目录内原子改名为正式目标；
5. 再次确认正式目标存在且大小正确；
6. 仅此后删除源；
7. 源删除失败保留目标副本并记录`CopiedButSourceRetained`；
8. 复制/校验失败删除partial并保留源。

完成后重新安全枚举`PHOTOS_DIR`，跳过ReparsePoint并自最深层向上删除真正为空的目录，永不删除`PHOTOS_DIR`根。目录删除只整理空容器，不删除文件，结果写入recycle.log和summary。

## 恢复

恢复只读取服务端`TRASH_DIR/media-cleanup/<jobId>/manifest.ndjson`的最新记录。原位置不存在时创建父目录并执行同盘rename或跨盘copy-verify-finalize-delete；原位置已有任意文件/目录时记录`RestoreConflict`，绝不覆盖。恢复后保留manifest与摘要，不提供“永久清空回收站”。

## 页面状态

状态包括`recycling`、`recycle-completed`、`recycle-partial`、`restoring`、`restore-completed`和`restore-partial`。设置页显示实际媒体根、项目回收目录、同/跨盘、批准job、候选数/容量、目标盘可用/最低要求、当前文件、移动/跳过/变化/失败/空目录/可恢复/恢复冲突计数，以及回收与manifest路径。

## 隔离验证

唯一测试入口：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-media-cleanup-recycle.ps1 -NodePath <node-exe>
```

测试只使用`$env:TEMP\Codex-PhotogalleryV1-MediaCleanup-<GUID>`和随机HTTP端口，覆盖同盘、强制copy、TXT/PDF/JSON/ZIP/7Z/TAR、中文/空格、0字节非媒体、只读、目标冲突、ChangedSinceScan、扫描后新增、Missing、复制失败、源删除失败、幂等、空目录、恢复冲突、legacy 410、LAN 403与localhost成功。通过时`.partial=0`且最终`TEMP_ROOT_EXISTS=False`。

正式`E:\A_秀人`在v91开发、隔离验证和部署验收期间零移动。部署后的正式扫描仍只读；Codex不得触发正式recycle/restore，用户必须在localhost核对路径和容量后手工输入确认文本。

## 2026-07-15 v91正式只读回归

jobId`20260715-133504-77ec5bd2`在246.612秒完成：482450文件、7288目录、472490图片、2109视频、7851非媒体（4204588435 bytes）、空目录269、叶非媒体目录132、无媒体树5、可疑小媒体2、ReparsePoint 0、错误0、`incomplete=false`。新版本只生成9个扫描报告，不再生成旧deletion报告；worker完成后退出。该job只用于扫描回归，不替换正式批准回收job。回归后批准job回收目录不存在、trash内`.partial=0`、移动/恢复/目录清理计数均为0。
