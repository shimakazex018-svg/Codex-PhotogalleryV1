# TESTING.md

## Full-branch convergence and v103 release gate

多分支正式收敛必须先在唯一隔离Runtime运行，不得引用正式`PHOTOS_DIR`、`TRASH_DIR`或`gallery.db`。门禁包括：全部JS语法、全部PowerShell解析、`git diff --check`、冲突标记扫描、release notes、统一管理授权、04:00调度、图集回收、访问日志、8种排序、SHA/pHash、FTS5能力/迁移/查询/60条上限/性能日志、视频兼容，以及媒体清理recycle/restore安全测试。

浏览器至少验证1440x900、1024x768、768x1024、390x844无页面级横向溢出；检查搜索、排序、设置导航、pHash、视频兼容、版本记录、功能badge、灯箱和`video preload=none`，并确认控制台warning/error为0。结束后精确停止隔离PID，删除唯一TEMP根并确认PID、worker、lock、partial、数据库、媒体和日志均不残留。

正式验收只允许读操作：三个48102入口HTTP 200、版本/资源参数一致、能力和维护状态正确、队列未增加；不得触发正式扫描、索引、回收、restore或兼容处理。

## Timestamped release identity and web release notes v102+

每次正式发布在同一分钟内同步`APP_VERSION`、`index.html`的`styles.css`/`gallery-sort.js`/`app.js`缓存参数和`release-notes.json`第一项，然后执行：

```powershell
node --check app.js
node --check test-release-notes.js
node test-release-notes.js
```

自动门禁验证：第一项与页面版本一致、全部静态资源缓存版本一致、记录按日期倒序、每版1至3条、每条不超过30字符、公开文案不含Windows绝对路径或Git/PID/数据库内部信息，并保留友好加载失败提示。

浏览器验证设置入口、页脚键盘/点击入口、最新项、中文时间和失败重试态；至少测1280×720、820×1180、390×844的页面级横向溢出。iPad/iPhone为视口模拟，不替代实体设备验收。详细发布规则见`docs/RELEASE_VERSIONING.md`。

## Perceptual image lookup v101

```powershell
node --check perceptual-hash.js
node --check perceptual-limits.js
node --check perceptual-index-worker.js
node --check perceptual-query-worker.js
node --check perceptual-manager.js
node scripts/test-perceptual-hash.js
```

自动测试验证64位稳定序列化、BLOB往返、符号位汉明距离、相似度换算、缩略/重压缩距离、不同图片距离，以及480 MiB暂停和512 MiB硬停止边界。`scripts/benchmark-perceptual-hash.js`必须显式指定数据库副本、媒体根、FFmpeg和输出文件；它只读真实媒体，变体逐个写入TEMP并立即删除。

本轮副本10,000条空间实测：净增868,352字节、WAL峰值906,432字节、SHM32,768字节、integrity ok；线性预测486,028条约40.2 MiB。真实样本为100张原图、20组连拍、750个变体；阈值4/6/8/10/12正确命中571/590/598/600/607，错误候选均0，连拍距离≤6/10各1组。25%/10%缩略、JPEG质量90/70/40、PNG转JPEG、JPEG转WebP、亮度/对比度/锐化、边框和5%裁剪在距离≤10下50/50命中；20%裁剪、镜像、90°旋转不作为支持范围。

48112隔离验收使用数据库副本：原图精确命中，25%缩略图仅pHash命中；PNG与`application/octet-stream`均200，伪装JPG为415；五次连续查询459/398/421/480/524ms，平均456.4ms，Node工作集下降397,312字节，临时文件0，stderr 0。浏览器设置页和上传入口可访问，控制台日志0。

正式v101：发布备份2,060,144,640字节且quick_check ok；幂等迁移净增8,192字节，启动后索引为`not_started`且没有自动worker。首批1,000张为1,000成功/0失败，净增94,208字节、完成后WAL/SHM为0；运行中首页约30-33ms且Node工作集未持续增长。正式25%缩略图在10,000张受限批次运行时返回距离2的高度相似原图，响应无盘符，临时文件0。

正式读写并发回归：旧实现于并发上传查询时在460条后发生SQLite写锁退出，已完成记录保留。改为只读查询连接、10条短事务并持久错误后，10张批次与相似上传并发执行仍10/10成功、worker正常退出、查询HTTP 200/1.823秒、stderr 0；剩余9,530张恢复运行。

## Gallery sorting and image hash lookup v100

静态与自动测试：

```powershell
node --check gallery-sort.js
node --check server.js
node --check app.js
node --check gallery-db.js
node --check duplicates-worker.js
node scripts/test-gallery-sort.js
node scripts/test-image-hash-lookup.js
git diff --check
```

`test-gallery-sort.js`使用TEMP SQLite覆盖8种枚举、`图册2/图册10`自然排序、大小写、中文、0值、空值、相同主值稳定次序、旧配置映射及先排序后分页。`test-image-hash-lookup.js`只在TEMP创建真实PNG字节和SQLite，绑定`127.0.0.1:48112`，覆盖同哈希多路径、本地/上传SHA-256一致、空MIME、`application/octet-stream`、无扩展名、扩展名/MIME冲突、损坏PNG头、带参数MIME、`filename*`中文长文件名、JPEG/PNG/WebP/GIF/AVIF签名、HEIC准确拒绝、无法识别签名、空文件、413、上传中断、并发429及槽位释放、零上传临时目录和`idx_media_hashes_sha256`查询计划；测试结束精确停止子PID并删除TEMP根。

响应式浏览器检查使用隔离端口和可丢弃DATA_DIR/PHOTOS_DIR，至少核对1440×900、820×1180、390×844：无页面级横向溢出，8项下拉可键盘操作并刷新保留，搜索态含`relevance`，上传入口可见且`accept=image/*`，控制台无新增持续错误。正式数据库只允许`DatabaseSync(...,{readOnly:true})`加`PRAGMA query_only=ON`进行计数和`EXPLAIN QUERY PLAN`；不得为本测试补全哈希或扫描媒体。

## Search FTS5 Integration V96

只允许显式副本路径；以下命令不得指向正式`D:\GalleryRuntime\data\gallery.db`：

```powershell
node scripts/migrate-search-fts5.js --db <copy.db> --dry-run
node scripts/migrate-search-fts5.js --db <copy.db> --backup --output <versioned-backup.db>
node scripts/migrate-search-fts5.js --db <copy.db> --apply --batch-size 2000
node scripts/migrate-search-fts5.js --db <copy.db> --verify
node scripts/migrate-search-fts5.js --db <copy.db> --optimize
node scripts/check-search-index.js --db <copy.db> --quick
node scripts/check-search-index.js --db <copy.db> --full
node scripts/test-search-fts-integration.js
```

通过标准：三表计数一致；缺失/孤立/重复/title/path mismatch为0；FTS和SQLite integrity通过；两字符计划只用`idx_media_title_nocase`；三字符计划为FTS虚拟索引、mapping整数主键和media主键，不出现`SCAN media`或临时排序树；auto stale不执行legacy。完整结果见`docs/SEARCH_FTS5_INTEGRATION_V96.md`。

FTS5最小方案不再附加生产级压力框架或浏览器自动化部署门槛。

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

## v96 trusted admin and scheduled collection recycle

使用bundled/正式Node执行：

```powershell
node scripts/test-admin-auth.js
node scripts/test-daily-index-scheduler.js
node scripts/test-collection-recycle.js
```

通过标准：三项均`PASS`，TEMP根均为`false`。权限覆盖local/LAN/ZeroTier/拒绝/XFF/Origin；调度覆盖03:59、04:00、04:30、busy重试资格和同日completed幂等；回收覆盖父目录、TXT、HEIC、标记/取消、重启恢复、到期批次、目标冲突不覆盖和单次索引。

隔离浏览器覆盖1440×900、1024×768、768×1024、390×844：末级显示收藏/回收，按钮至少44px且无横向溢出；父目录不显示回收；`.badge`名称覆盖为0，下方标题保留。正式验收禁止标记或移动真实图集。

2026-07-22正式v96验收：Node从PID 20976切换为28744，监听PID与Host PID 29872匹配。loopback/LAN/ZeroTier均HTTP 200并加载v96，能力scope分别为local/trusted-lan/trusted-zerotier；伪造XFF不改变sourceAddress。三个入口用错误确认得到400、用不存在collectionId得到409而不是403；恶意Origin为403，LAN Explorer为403。04:00后启动补扫描用97.120秒完成，目录签名未变并跳过完整重建；正式队列总数0，正式媒体移动0。

PowerShell worker 还必须通过解析器检查：

```powershell
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile(
  (Resolve-Path '.\scripts\media-library-cleanup-worker.ps1'),
  [ref]$null,
  [ref]$errors
) | Out-Null
if ($errors) { $errors; exit 1 }
```

## Media library cleanup isolated validation

- 只在 `$env:TEMP\Codex-PhotogalleryV1-MediaCleanup-<GUID>` 创建媒体、Runtime 和报告。
- 覆盖图片、视频、TXT/PDF/JSON/ZIP/7Z/TAR、0字节非媒体、只读文件、中文与空格路径、目标冲突、扫描后修改、扫描后新增、缺失文件；ReparsePoint仅在可安全创建时验证。
- 验证第二个 start 返回 409，stop 进入 `stopping` 后到 `stopped`，`incomplete=true`，取消标记和 `.tmp` 为 0。
- API验证旧delete为410、错误确认400、LAN recycle/restore为403、localhost仅处理批准报告；图片/视频和报告外新增文件保留。
- 回收验证同盘rename与强制copy-verify-delete；复制失败和源删除失败均保留源，`.partial`最终为0，重复job不制造副本，真空目录自底向上清理。
- 恢复验证原相对路径重建、恢复冲突不覆盖、manifest保留。
- 浏览器验证 `#/__settings/media-cleanup` 的状态、容量、回收路径、进度、按钮互斥、自定义确认对话框、控制台和 390×844 布局；不得加载完整manifest。
- `finally` 精确停止测试 Node，删除整个 GUID 目录，并要求 `Test-Path -LiteralPath $root` 为 `False`；否则测试失败。
- 正式媒体部署验收只允许扫描/查看/报告；Codex禁止调用recycle/restore，正式回收由用户在localhost手工确认。

当前隔离执行/API测试：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-media-cleanup-recycle.ps1 -NodePath <node-exe>
```

通过标准：`MEDIA_CLEANUP_RECYCLE_TEST=PASS`、`TEMP_ROOT_EXISTS=False`，同盘与强制copy路径均通过，`.partial`残留0，legacy delete 410，LAN写操作403，localhost回收/恢复成功。

2026-07-15 v91正式同盘回收根验收：配置来自`D:\GalleryRuntime\config\gallery.env`，`PHOTOS_DIR=E:\A_秀人`、`TRASH_DIR=E:\回收站`。目标为真实空目录、非ReparsePoint、互不嵌套且写入/改名/删除权限通过；Node PID 2064由Host PID 14552托管，监听PID一致，loopback/LAN HTTP 200并加载v91。设置页显示同盘rename、批准job、7851候选、3.9GiB、5.1TiB可用和5.9GiB门槛；回收按钮启用、恢复按钮禁用，无全局横向溢出，控制台0 warning/error。正式MOVE/RESTORE均未发送，批准job目录、manifest和worker均不存在，媒体移动/恢复计数为0。

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

ZeroTier防火墙验收：先用`Get-NetIPAddress`、`Get-NetAdapter`和`Get-NetConnectionProfile`确认地址、实际PrefixLength、Preferred、Up和NetworkCategory。规则`Codex-PhotogalleryV1-48102-ZeroTier`必须只允许TCP 48102，LocalAddress等于当前ZeroTier IPv4，RemoteAddress等于从实际前缀计算的ZeroTier子网，Profile等于该接口当前类别且Enabled=True。服务器本机ZeroTier URL HTTP 200只证明监听和本地路由正常，不等于实体外部设备通过；外部设备必须使用HTTP而非HTTPS。

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

## Search performance validation

正式库只允许使用`DatabaseSync(..., {readOnly:true})`执行索引清单、计数和`EXPLAIN QUERY PLAN`；任何index创建、`PRAGMA optimize`或修改后基准必须使用SQLite在线备份的一致性副本。

```powershell
<node-exe> .\scripts\benchmark-search.js --db <isolated-gallery.db> --optimize
<node-exe> .\scripts\test-search-api.js --db <isolated-gallery.db> --port <isolated-port>
```

通过标准：精确与前缀计划使用`idx_collections_title_nocase`，修改后无`USE TEMP B-TREE FOR ORDER BY/DISTINCT`；总结果不超过60，单字符返回0，结构化性能日志数量与请求数一致。允许媒体包含fallback显示`SCAN media`，但必须明确记录。浏览器用`?searchPerf=1`验证250ms防抖、旧请求取消/乱序保护、最多60卡片、全部懒加载WebP预览、0原图卡片URL、0video节点和0控制台warning/error。

完整基线、SQL、计划和对比见`docs/SEARCH_PERFORMANCE_BASELINE_V95.md`。

### FTS5 Prototype V96 isolated validation

所有写入目标必须显式位于Git忽略的`tmp/fts5-prototype`，正式源库只允许`readOnly + query_only + node:sqlite backup()`。禁止把正式库传给`--db`。

```powershell
<node-exe> .\scripts\detect-fts5.js
<node-exe> .\scripts\build-fts5-prototype.js --source <formal-gallery.db> --db <repo>\tmp\fts5-prototype\mapped\gallery.db --variant mapped --batch-size 2000 --replace --output <repo>\tmp\fts5-prototype\mapped\build.json
<node-exe> .\scripts\benchmark-fts5.js --db <repo>\tmp\fts5-prototype\mapped\gallery.db --variant mapped --output <repo>\tmp\fts5-prototype\mapped\benchmark.json
<node-exe> .\scripts\check-fts5-query-semantics.js --db <repo>\tmp\fts5-prototype\mapped\gallery.db --table media_search_fts_mapped
<node-exe> .\scripts\prototype-media-bigram.js --source <repo>\tmp\fts5-prototype\mapped\gallery.db --db <repo>\tmp\fts5-prototype\bigram\bigram.db --sample-size 50000 --query 扫码
<node-exe> .\scripts\inspect-fts5-short-index.js --db <repo>\tmp\fts5-prototype\mapped\gallery.db
<node-exe> .\scripts\test-fts5-prototype.js
```

若完整LIKE正确性和一致性已单独完成，只复测索引对齐后的原型时间可使用`--skip-reference --skip-consistency`；该模式不能替代首次完整验收。

通过标准：FTS5/trigram/中文与维护命令实测通过；完整副本media/documents/FTS均474470，缺失、孤立、字段不一致和失败均0；原LIKE为`SCAN media`，FTS为虚拟表MATCH约束，回表使用mapping整数主键和media文本主键；稀疏/无结果原型总时间低于100ms；WAL有界且最终截断；误指正式目标被拒绝。完整结果见`docs/SEARCH_FTS5_PROTOTYPE_V96.md`。

## Access log isolated validation

访问日志schema、旧NDJSON迁移、分页和保留清理只使用脚本创建的唯一TEMP Runtime：

```powershell
<node-exe> .\scripts\test-access-log.js
```

脚本覆盖0、1、49、50、51、100、101条边界；默认50条分页、最大100条、非法参数、越界页回落、`time DESC, id DESC`无重复稳定顺序、旧文件幂等导入且原文件保留、POST写入、时间索引，以及`time < cutoff`只删除边界前记录。脚本按精确子进程句柄停止隔离服务并删除整个TEMP根目录；不得把`DATA_DIR`或`PHOTOS_DIR`指向正式Runtime。

同一隔离脚本还预置一组已完成媒体清理报告，验证重启恢复`recoveredFromDisk=true`、结果可分页读取、`canDelete=false`，并确认恢复报告即使收到正确确认文本也返回409且不执行删除。

2026-07-15正式v89只读验收：PID匹配的48102 Node从18704重启为3468；loopback/LAN均HTTP 200并加载v89资源。报告`20260714-232613-22183b82`在重启后恢复，结果首屏50/7851且`canDelete=false`；访问日志SQLite为374条迁移记录加12条重启前实时记录，默认50、最大100、前两页无重复。浏览器390×844无横向溢出，未触发扫描、删除、回收或移动。

## Browser checks

### Back-to-top control

For changes to the floating back-to-top control, verify:

- desktop targets `1920x1080` and `1366x768`;
- tablet targets `768x1024` and `1024x768`;
- mobile targets `390x844` and `844x390`;
- fixed positioning, no horizontal overflow, 44-50 px hit target, and lightbox z-index above the control;
- idle opacity, scrolling/hover/focus opacity, approximately 1000 ms return to `scrollY=0`, user wheel/touch/key interruption, and reduced-motion direct return.

2026-07-13 validation: the formal LAN site returned HTTP 200 and loaded frontend `v73`. The controlled browser confirmed a unique accessible button, fixed positioning, zero horizontal overflow in the available narrow viewport, z-index `20` below lightbox `30`, visual placement, final `scrollY=0`, and wheel interruption at user-controlled `scrollY=420`. The browser viewport override remained at one narrow inner viewport instead of applying all six requested outer sizes; all six target geometries and both CSS breakpoints were therefore also checked statically, while six-device visual confirmation remains manual.

运行型前端修改至少检查：

- 首页和 hash 导航；
- 多级目录和媒体详情；
- 搜索；
- 设置页、查重页、访问日志页；
- 设置页收藏图册和观看历史；
- 图片灯箱和键盘操作；
- 视频只在交互后加载；
- 控制台无新增错误；
- 移动端/窄屏没有明显布局破坏；
- 大列表没有一次性加载全部视频或图片 DOM。

前端`v88`检查清单：首页不显示收藏/最近观看且不请求`/api/recent`或`/api/favorites`；`#/__settings/favorites`可取消收藏并即时更新；`#/__settings/history`按最近时间倒序；访问日志首/上/附近页码/下/末状态与加载提示正确；1440×900、1024×768、768×1024、390×844没有页面级横向溢出。收藏/历史卡片必须继续使用懒加载预览，不得创建`video`播放器。

2026-07-15隔离验证（最终仅追加`v88`缓存标记）：受控浏览器确认首页无收藏/历史区域，设置导航6项顺序正确，取消收藏即时显示空状态，观看历史显示访问时间；访问日志第一页和第二页均50条、活动页和首/上按钮状态正确。1440×900、1024×768、768×1024、390×844均无页面级横向溢出或菜单文字截断，768竖屏设置内容区712px，390窄屏收藏卡片未被取消按钮挤压且页面无`video`节点，控制台warning/error为0。实体设备仍未验证。

### Scroll restoration regression

滚动恢复修改必须在真实Chrome同时覆盖桌面与移动视口：

1. 首页/目录滚动到浅、中、深位置，点击可见卡片；确认新页`scrollY=0`，Back和Forward恢复原锚点相对视口偏移。
2. 从多作品父目录进入详情，再点击父级面包屑；确认回到原目录位置，不先闪到顶部。
3. 分别从收藏、最近观看和搜索结果进入详情后Back；搜索结果还必须恢复搜索词和结果列表。
4. 在超过首批24个DOM和首个40条API页的位置刷新；确认只按现有批次补齐到保存的renderedCount/cursor，不加载整个媒体库。
5. 回顶按钮完成后应为`scrollY=0`，用户滚轮/触摸/按键或路由变化必须取消旧动画/恢复任务。
6. 检查控制台无新增warning/error，损坏或不可用的sessionStorage不得阻断页面。

2026-07-14验证：正式LAN站点前端`v79`在1440x900与390x844视口通过。目录、面包屑、收藏、最近观看和80条搜索结果的锚点偏差为0px；86张媒体详情刷新后恢复86个节点，锚点偏差约0.125px；回顶完成与滚轮中断通过，控制台无warning/error。

### Lightbox preload regression

灯箱预加载修改必须使用至少10张图片的图集，在真实Chrome分别做禁用缓存观察和正常缓存复用测试：

1. 打开第1张后必须先显示WebP预览；原图窗口只包含当前及第2-4张，不请求第5张、其他目录、视频或HLS。
2. 第2-4张完成后切到第2张，应直接使用已准备资源并只补第5张；同一原图URL不重复创建会话任务。
3. 连续和快速前进至少6次，确认无错图、旧回调覆盖、控制台错误或无界Map增长；缓存最多5项，并发最多2。
4. 最后一张向后索引必须循环到第1-3张；1/2/3张小图集分别得到0/1/2个不重复且不含自身的预加载索引。
5. 前进后返回上一张，刚查看的图片仍在缓存窗口；关闭灯箱等待30秒，不再追加原图请求。
6. 检查Save-Data为0张后向原图、slow-2g/2g为1张、3g为2张、4g或Connection API缺失为3张；只有下一张设置decode请求。
7. 至少覆盖1440x900、768x1024、390x844，确认按钮/键盘/缩放拖动、路径按钮、WebP预览、目录懒加载和视频`preload="none"`未退化。

只记录实测等待时间、请求数、重复URL、关闭后新增请求和内存趋势；无法可靠测量的项目明确标记未验证，不得估算。

2026-07-14验证：正式LAN首页HTTP 200并加载`app.js?v=81`与`styles.css?v=81`；抽样原图返回`Cache-Control: public, max-age=604800`、ETag、Last-Modified，条件请求返回304。隔离Image队列模拟确认初始只请求当前和后3张，前进一张只补1张，5个请求URL全部唯一；最大并发2、Map最大5，stop后等待不再新增请求。循环、小图集和Save-Data/2G/3G/4G策略通过纯逻辑检查。真实Chrome Network、等待时间、内存趋势以及1440x900、768x1024、390x844交互未验证：当前Chrome插件环境缺少Native Host manifest/注册表项和Chrome用户数据目录。

2026-07-14 v85真实Chrome专项验收：正式LAN 114张`剧照`图集加载`app.js?v=85`与`styles.css?v=85`。页面初始资源观察为16个按需WebP预览、0个`/photos/`原图；DOM有40个图片按钮但24个远端预览仍未请求。点击第5张时，点击到P0请求开始8.6ms、占位图显示117.1ms、原图网络完成124.6ms、decode完成140.0ms、最终显示142.7ms；P0先于P1开始，P3在当前图显示后才创建。下一张已为`ready`并发生优先级升级，点击到显示68.9ms，调度日志没有第二次同URL`request-start`。资源观察窗口共5个唯一原图URL，最大普通预加载并发2、最大缓存5；连续前进7次最终索引/图片一致，旧窗口任务被标记`outside-window`，控制台无error，但受Chrome控制动作时延影响，该结果不代表亚秒级快速连点。关闭后队列、缓存和活动请求均为0，等待3秒新增原图URL为0。该Chrome接口不提供DevTools Disable cache、HAR/请求实例明细、网络节流或可靠堆内存趋势，因此冷缓存、浏览器层重复传输、亚秒级快速连点、Save-Data/慢网及长期内存仍标记未验证。

### v86 merge validation (2026-07-14)

- Isolated media-cleanup/API test: duplicate start 409; stop reached `stopped` with `incomplete=true`; bad confirmation 400; LAN delete 403; localhost deleted only 6 reported non-media candidates and 3 true-empty directories. The late file and reparse target were preserved, and the GUID TEMP root ended with `Test-Path=False`.
- Controlled Chrome against an isolated v86 runtime with 12 generated test images: WebP preview appeared before the original, current image fetch priority was high, navigation reached image 8 without stale replacement, image 12 wrapped to image 1, close cleared the image source, and reopen replaced the preview with image 5 original. Console warning/error count was zero.
- At 390x844, both the open lightbox and media-cleanup settings page had no horizontal overflow. The settings page exposed scan/stop/delete controls, statistics, categories, search, sort and pagination.
- Authorized formal read-only scan job `20260714-224723-b04c608d` completed in 173.388 seconds: 482450 files, 7288 directories, 472490 images, 2109 videos, 7851 non-media files, 269 empty directories, 5 media-free trees, 2 suspicious tiny media files and 0 errors. Deleted file/directory counts were both zero.
- Formal v86 deployment validation: `main` fast-forwarded without conflict, the PID-matched task-hosted Node restarted from 20124 to 18852, and both loopback/LAN returned HTTP 200 with `app.js?v=86` and `styles.css?v=86`.
- Controlled-browser formal checks covered home, search, favorites/recent sections, a 114-image gallery, high-priority current lightbox original, next-image navigation, back-to-top, Back anchor restoration, poster-based `preload="none"` videos, and the media-cleanup page. At 390x844 the page had no global horizontal overflow and browser warning/error count was zero.
- Formal read-only scan job `20260714-232613-22183b82` completed in 102.126 seconds with the same 482450 files, 7288 directories, 472490 images, 2109 videos and 7851 non-media records; errors, deleted files and deleted directories were zero and the single worker exited automatically.
- Formal result checks: 50-row browser pages, server pageSize cap 200, page 2 navigation, category and file-name/relative-path search, path/size sort, Unknown 24, Archive 4, MetadataOrSidecar 3318, Document 4309, MediaFreeTree 5 and errors 0. iPad, Save-Data/slow network, Disable-cache HAR, sub-second rapid clicking and long-term memory remain supplemental/unverified.

## Database checks

- 禁止用当前应用代码“只读打开”生产源库；数据库打开逻辑会启用 WAL 并保证 schema/index。
- 迁移检查默认只对显式数据库副本执行；已获正式维护授权时必须停服务、先备份，并为相同命令显式增加`--allow-formal-db`。
- 迁移前记录源/目标大小、mtime 和 SHA-256。
- SQLite 完整性检查工具/命令：待确认正式环境可用的只读工具后补充。
- 运行后可用 `/api/index/stats` 核对 collection/media/image/video 数量。

## Thumbnail checks

V2.0.1图片预览隔离smoke：

```powershell
.\scripts\test-v201-preview.ps1 -NodePath <node-exe> -FfmpegPath <ffmpeg-exe> -Port <isolated-port>
```

验证路径边界、非图片/缺失/失败、同key并发去重、缓存命中、mtime新key、root limit和失败后进程存活，最后按精确PID停止并清理临时目录。不得指向生产媒体或正式端口。

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

视频兼容性扫描的首选回归使用唯一TEMP目录：

```powershell
node scripts/test-video-compatibility.js
```

脚本生成短H.264/AAC、MPEG-4 Part 2/AAC、静音H.264、损坏和缺失样本，覆盖首次分类、第二次全跳过、mtime变化重扫、暂停/继续、停止及外部进程超时。测试数据库和媒体必须位于TEMP；结束时FFprobe/FFmpeg为0且TEMP根删除。不得把该脚本指向正式数据库或媒体。

正式扫描只允许用户明确授权后执行。验收要求：

1. 扫描只读查询`media.type='video'`，正式媒体、SQLite行数、5个抽样文件的大小/mtime/SHA-256前后相同。
2. 元数据阶段FFprobe并发不超过2且FFmpeg为0；采样阶段只处理疑似项，FFmpeg并发不超过1。
3. 报告能被JSON解析，无残留temp文件；结果API默认50条分页，筛选总数与summary一致。
4. 完成后的增量扫描应跳过所有未变化fingerprint，且不启动FFprobe/FFmpeg。
5. 暂停、停止、超时和连接关闭后精确子进程归零；网站全程继续HTTP 200。

报告驱动兼容流检查：

1. `GET /api/video-compatible?id=<mediaId>`只允许报告中的`fallback_required`；direct/invalid返回409，缺失ID返回404，客户端URL/路径不作为源选择依据。
2. 输出必须为H.264/yuv420p与AAC、最大边不超过960、保持比例、不放大且无兼容缓存文件。
3. 同时只保留最新一条FFmpeg流；暂停、换视频、换路由和关闭连接后子进程必须退出。
4. 正式浏览器只允许抽样点击，不批量播放；确认兼容URL来自媒体ID，直接播放项仍为原始`/photos/...` Range。
5. video保持`preload="none"`，无首屏视频批量请求；播放事件日志按媒体ID/事件去重且不写本地绝对路径。

2026-07-16正式结果：全量2096条为1432 direct、267 device、395 fallback、2 invalid；662条采样候选中602通过、60失败，probe timeout/failure各1。随后增量扫描在6.867秒内跳过全部2096条且未启动探测/解码进程。最终重启后状态、默认50条、fallback筛选395、invalid筛选2及播放接口409/404边界通过；浏览器控制通道未能在重启后重新连接本机地址，因此设置页视觉复验仍标记未完成。

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
