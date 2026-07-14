# HANDOFF.md

本文件保持最新交接状态，不记录完整历史。历史见 `CHANGELOG.md`。

## Last Completed Task

实现设置页媒体库清理：单线程 PowerShell 子进程只读扫描 `PHOTOS_DIR` 元数据，网页显示进度、统计和有界分页报告；支持安全停止。删除必须绑定当前完成报告、在 localhost/允许边界内输入 `DELETE` 或“删除”，并逐项校验路径后自底向上清理真正空目录。前端版本为 `v80`。

## Current State

- 业务基线：`v1.3-release` 已发布到 GitHub。
- 当前开发分支：`codex/media-library-cleanup`；完成验证后按用户授权普通推送到 `origin/main`。
- 前端版本`v80`；列表使用独立按需WebP预览，首页/媒体limit为40，图片DOM首批24，视频始终preload=none。页面支持安全区、空闲弱化、可中断S曲线回顶动画、有界滚动恢复和媒体库清理设置页。
- 媒体清理报告直接写现有 `DATA_DIR/logs/media-cleanup-<jobId>-*`；不创建新磁盘根目录或报告子目录，不修改 SQLite schema。
- 同时只运行一个清理 worker；扫描不解码、不哈希、不调用 FFmpeg，约每 5000 对象更新进度。结果查询 pageSize 最大 200、offset 最大 50000，浏览器只持有当前页。
- 本轮隔离测试执行了测试数据删除；正式媒体未删除。正式只读扫描 jobId `20260714-201722-880b3aae` 已完成：482450 文件、7288 目录、472490 图片、2109 视频、7851 非媒体（4204588435 bytes）、269 空目录、132 叶非媒体目录、5 无媒体树、2 可疑小媒体、0 错误。
- 正式项目目录的 `main` 位于 `0a985de`，并有 9 个与本功能重叠的未提交修改；媒体清理分支基于较早的 `2a7b2c6`。因此没有合并、拉取、部署或重启正式网站。
- 滚动状态按hash、搜索、媒体筛选和排序隔离，最多保留75条；保存稳定锚点、相对偏移、scrollY、已渲染数量和分页游标，损坏的sessionStorage会安全降级。
- 浏览器原生滚动恢复设为manual；新导航回到顶部，历史/父级返回和刷新恢复。搜索词保存在对应history entry，进入详情时不再被搜索结果分支拦截。
- 轮播初始化加载全部20张有界WebP预览，每10秒自动向左推进一张；手动左右切换后重新计算下一次10秒周期。
- 隔离preview smoke通过；正式Runtime已配置并重启，最小样本生成1个33,926-byte WebP。真实Chrome HAR尚未完成。
- V2.0.1 审计确认目录 API 不递归深层媒体；主要风险是 thumbnail 缺失回退原图、20项轮播全带src、fetch不可取消和视频可退化为metadata预载。
- 只读统计显示 Runtime 20个轮播文件共150.15 MiB；现有40个image thumbnail共2.04 MiB。
- 本任务完成提交和普通push后，本地`main`应与`origin/main`同步。
- 工作区不包含生产数据库、媒体、缩略图、HLS、日志或 cache。
- `D:\GalleryRuntime` 已创建，数据库副本 SHA256 已验证，真实配置位于 runtime 外部配置目录。
- V1 Runtime缓存路径已独立；网站当前由正式入口运行，监听IPv4 `0.0.0.0:48102`，stdout/stderr位于Runtime日志目录。
- 当前最终运行：任务Running；Host PID与Node PID独立记录；Host/Node主窗口句柄为0；status核对Node父PID和监听PID。
- ZeroTier地址为`192.168.192.1/24`，专用规则目标为LocalAddress=`192.168.192.1`、RemoteAddress=`192.168.192.0/24`、TCP 48102；不修改现有LAN规则。
- 用户已批准UAC；`Codex-PhotogalleryV1-48102-ZeroTier`已启用，Profile=`Private`，最终规则范围和现有LAN规则均已读取核对。
- 图片thumbnail缺失时返回原图且不落盘；HLS仍为空，7天策略尚未执行自动清理。

## Recently Changed Files

- `index.html`、`styles.css`、`app.js`
- `CHANGELOG.md`、`TESTING.md`、`TODO.md`、`HANDOFF.md`
- `docs/V2.0.1_MOBILE_BANDWIDTH_AUDIT.md`
- `TODO.md`、`CHANGELOG.md`、`HANDOFF.md`

- `PROJECT_CONTEXT.md`
- `ARCHITECTURE.md`
- `DECISIONS.md`
- `TODO.md`
- `TESTING.md`
- `CHANGELOG.md`
- `HANDOFF.md`
- `scripts/gallery-runtime-common.ps1`
- `scripts/check-environment.ps1`
- `scripts/start-gallery.ps1`
- `scripts/stop-gallery.ps1`
- `scripts/configure-firewall-48102.ps1`
- `docs/V1.4.2_RUNTIME_IMPLEMENTATION.md`
- `docs/V1.4.3_RUNTIME_VALIDATION_REPORT.md`
- `docs/V1.4.4_CACHE_REBUILD_PLAN.md`
- `scripts/rebuild-gallery-cache.ps1`
- `scripts/pause-cache-rebuild.ps1`
- `server.js`、`gallery-db.js`、`make-hls.ps1`
- `scripts/check-runtime-capacity.ps1`
- `docs/V1.4.5_RUNTIME_FINAL_CHECK.md`
- `scripts/status-gallery.ps1`
- `V1.5_AUTOSTART_PLAN.md`
- `docs/V1.5_OPERATION_MANUAL.md`
- `docs/V1.5_ACCEPTANCE_REPORT.md`
- `docs/V1.5_BROWSER_ACCESS_DIAGNOSIS.md`
- `Start Gallery.cmd`、`Stop Gallery.cmd`、`Gallery Status.cmd`
- `Install Autostart.cmd`、`Uninstall Autostart.cmd`
- `scripts/install-gallery-autostart.ps1`、`scripts/uninstall-gallery-autostart.ps1`
- `scripts/run-gallery-host.ps1`
- `Configure LAN Access.cmd`、`scripts/configure-firewall-48102.ps1`
- `Configure ZeroTier Access.cmd`、`scripts/configure-firewall-48102-zerotier.ps1`
- `docs/V1.5_WINDOWS_STARTUP_FIX.md`

## Validation

- 清理 worker 分类测试：9 文件，3 图片、2 视频、4 非媒体、1 空目录、1 叶非媒体目录、1 无媒体树、1 零字节媒体；测试删除只移除 4 个非媒体并保留全部媒体。
- API 隔离测试：扫描期间首页 HTTP 200；结果分页/大小排序通过；错误确认返回 400；localhost 确认删除 2 个测试候选并清理 3 个空目录，媒体仍存在。
- 远程删除边界：隔离服务绑定 `0.0.0.0` 且 `ALLOW_REMOTE_DELETE=0`，通过本机 LAN 地址提交正确确认仍返回 HTTP 403，候选文件保留。
- 停止/互斥测试：重复 start 返回 409；`stopping -> stopped`，`incomplete=true`，取消标记和 `.tmp` 均为 0；停止后 HTTP 200。
- 浏览器测试：设置页状态/统计/候选显示正确，自定义确认按钮在输入前禁用、输入 `DELETE` 后启用且未点击；390×844 无横向溢出，控制台无 warning/error。
- 所有本任务隔离目录均在 `finally` 清理并验证 `Test-Path=False`。
- 正式扫描报告共 11 个，直接位于 `D:\GalleryRuntime\logs`；扫描耗时约 201 秒，删除文件/目录计数均为 0，worker 已退出。

- 真实Chrome正式LAN站点`v79`通过：1440x900桌面与390x844移动视口的后退/前进、面包屑、收藏、最近观看和搜索结果均恢复到原锚点，常规偏差0px。
- 86张媒体详情刷新后按既有批次恢复86个节点，锚点偏差约0.125px；没有一次性挂载全库。搜索词、80条搜索结果和scrollY=2600刷新后恢复。
- 回顶动画最终到达scrollY=0，滚轮中断后保持用户位置；Chrome控制台无warning/error。
- 轮播修改前正式页面实测20张中仅2张完成、18张仍为`data-carousel-src`；修改后正式页面`v75`实测20/20加载完成、0待加载、0失败。手动切换重置后transform在9秒保持`-3664px`，超过10秒变为`-3983px`并继续出现下一周期左移，进度条运行且控制台无错误。
- 回顶按钮源码检查通过；正式LAN站点返回HTTP 200并加载`v73`。受控浏览器确认语义、固定定位、窄屏无横向溢出、灯箱层级、最终回到顶部和滚轮中断。浏览器视口覆盖未实际切换全部六组尺寸，因此六设备视觉复验保留为人工项，未虚构通过。
- 仓库根目录、tracked files、启动脚本和 `.gitignore`：已审计。
- 前后端入口、主要 API、SQLite 表/index：已从源码核对。
- 运行数据忽略矩阵：数据库、媒体、日志、cache、runtime、缩略图、poster、HLS 和 `.env` 均命中忽略规则。
- 业务代码/HTML/CSS/JavaScript diff：本次为零；仅新增运维脚本和更新文档。
- 隐藏启动验收：启动CMD自动退出和手工关闭后各等待30秒，Host/Node保持、PID不变、HTTP 200、stderr为空。
- 重复启动：没有第二个Gallery Host或Node；精确停止未影响其他Node；最终网站已重新启动并保持运行。
- 数据库文件：只进行字节复制和 SHA256；未通过 SQLite 或应用打开。媒体未修改。
- ZeroTier验收：接口connected、实际地址`192.168.192.1/24`，规则精确限定TCP 48102和`192.168.192.0/24`，loopback/LAN/ZeroTier三条本机URL均HTTP 200；外部实体设备尚未验证。

## Known Issues

- 项目没有登录、角色权限或 API 鉴权。
- 项目没有自动化测试、lint、typecheck 或 build pipeline。
- 媒体清理报告尚未根据正式扫描体积制定自动保留/容量告警策略；当前不自动删除审计报告。
- 结果深分页 offset 有 50000 条安全上限；更大结果集应先用分类/搜索缩小范围，未来若高频需要再增加独立报告索引。
- 正式 Node 24.x 托管方式：待确认；预检支持显式 Node 路径。
- V1.4.3 首页、四个指定 API、目录、图片、缩略图和视频 Range 已通过。
- poster新进程SQLite回查和3个生成样本已通过。
- 当前小批量脚本不是47万图片的全量调度器。
- HLS按需后台生成、访问manifest和定时dry-run清理尚未实现。
- ChatGPT Chrome Extension与本机通信组件已验证可用；实体手机仍未由Codex实际操作。
- 实体桌面仍建议由用户目视确认没有长期Gallery控制台窗口；自动化已确认Host和Node的MainWindowHandle均为0。

## Risks

- 旧项目未来需要删除，但在 V1 runtime 独立验证、备份和回滚演练前不能删除。
- 顶层 runtime `trash` 与媒体不同盘，未来移动媒体前必须隔离验证；当前远程删除固定关闭。
- 缩略图/poster/HLS 重新生成可能造成 CPU、磁盘 I/O 和容量增长，必须分阶段执行。
- 无鉴权环境下不能开启远程删除。

## Recommended Next Task

先审阅正式只读扫描报告，重点核对 Unknown/sidecar、无媒体目录树、0 字节媒体和错误；未取得下一次明确授权前不要执行正式删除。随后根据报告体积确定保留和容量告警策略。

## Notes for Next Codex Session

1. 严格按 `AGENTS.md` 顺序阅读 7 份上下文文档。
2. 继续阅读 `docs/V1.4_RUNTIME_MIGRATION_PLAN.md` 和 `docs/V1.4.1_RUNTIME_IMPLEMENTATION_PLAN.md`。
3. 区分代码默认端口 `48101` 与新启动器注入端口 `48102`。
4. V1 runtime 已有独立数据库副本；不要再指向或覆盖旧项目 `DATA_DIR`。
5. 站点当前为日常运行候选，不要擅自停止；全量缓存、扫描、查重、删除、HLS和自动启动仍需单独授权。
6. 不要 push 当前本地文档提交，除非用户明确授权。
7. 媒体清理正式删除本轮未授权；只允许查看已有报告。删除 API 永远不能接收客户端路径或绕过 localhost/`ALLOW_REMOTE_DELETE`。
