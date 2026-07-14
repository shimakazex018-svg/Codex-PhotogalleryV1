# HANDOFF.md

本文件保持最新交接状态，不记录完整历史。历史见 `CHANGELOG.md`。

## Last Completed Task

首页亮点轮播初始化时加载全部20张有界WebP预览，并恢复原来的每10秒向左自动推进一张；其他页面和媒体加载策略保持不变，前端版本为`v75`。

## Current State

- 业务基线：`v1.3-release` 已发布到 GitHub。
- 当前分支：`main`。
- 前端版本`v75`；列表使用独立按需WebP预览，首页/媒体limit为40，图片DOM首批24，视频始终preload=none。页面新增支持安全区、空闲弱化、可中断S曲线动画和减少动态效果回退的全局回顶按钮。
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
- 正式 Node 24.x 托管方式：待确认；预检支持显式 Node 路径。
- V1.4.3 首页、四个指定 API、目录、图片、缩略图和视频 Range 已通过。
- poster新进程SQLite回查和3个生成样本已通过。
- 当前小批量脚本不是47万图片的全量调度器。
- HLS按需后台生成、访问manifest和定时dry-run清理尚未实现。
- PC受控浏览器权限阻断；实体手机未由Codex实际操作。
- 实体桌面仍建议由用户目视确认没有长期Gallery控制台窗口；自动化已确认Host和Node的MainWindowHandle均为0。

## Risks

- 旧项目未来需要删除，但在 V1 runtime 独立验证、备份和回滚演练前不能删除。
- 顶层 runtime `trash` 与媒体不同盘，未来移动媒体前必须隔离验证；当前远程删除固定关闭。
- 缩略图/poster/HLS 重新生成可能造成 CPU、磁盘 I/O 和容量增长，必须分阶段执行。
- 无鉴权环境下不能开启远程删除。

## Recommended Next Task

日常使用继续通过Start/Stop/Status入口；如桌面仍出现长期Gallery控制台，记录窗口标题和PID后单独诊断，不要关闭任务Host来代替Stop。

## Notes for Next Codex Session

1. 严格按 `AGENTS.md` 顺序阅读 7 份上下文文档。
2. 继续阅读 `docs/V1.4_RUNTIME_MIGRATION_PLAN.md` 和 `docs/V1.4.1_RUNTIME_IMPLEMENTATION_PLAN.md`。
3. 区分代码默认端口 `48101` 与新启动器注入端口 `48102`。
4. V1 runtime 已有独立数据库副本；不要再指向或覆盖旧项目 `DATA_DIR`。
5. 站点当前为日常运行候选，不要擅自停止；全量缓存、扫描、查重、删除、HLS和自动启动仍需单独授权。
6. 不要 push 当前本地文档提交，除非用户明确授权。
