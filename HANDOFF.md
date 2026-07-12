# HANDOFF.md

本文件保持最新交接状态，不记录完整历史。历史见 `CHANGELOG.md`。

## Last Completed Task

完成V1.5.0运行接管基础：站点以正式Runtime保持运行，新增状态脚本、自动启动方案、操作手册和HTTP/API/网络地址验收记录。

## Current State

- 业务基线：`v1.3-release` 已发布到 GitHub。
- 当前分支：`main`。
- 本次V1.5.0提交后，本地 `main` 预计比 `origin/main` 领先 9 个提交；均未push。
- 工作区不包含生产数据库、媒体、缩略图、HLS、日志或 cache。
- `D:\GalleryRuntime` 已创建，数据库副本 SHA256 已验证，真实配置位于 runtime 外部配置目录。
- V1 Runtime缓存路径已独立；当前PID `56500`运行中，48102本机TCP探测通过，stdout正常、stderr为空。
- 图片thumbnail缺失时返回原图且不落盘；HLS仍为空，7天策略尚未执行自动清理。

## Recently Changed Files

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

## Validation

- 仓库根目录、tracked files、启动脚本和 `.gitignore`：已审计。
- 前后端入口、主要 API、SQLite 表/index：已从源码核对。
- 运行数据忽略矩阵：数据库、媒体、日志、cache、runtime、缩略图、poster、HLS 和 `.env` 均命中忽略规则。
- 业务代码/HTML/CSS/JavaScript diff：本次为零；仅新增运维脚本和更新文档。
- 网站启动：未执行，符合文档任务限制。
- 数据库文件：只进行字节复制和 SHA256；未通过 SQLite 或应用打开。媒体未修改。

## Known Issues

- 项目没有登录、角色权限或 API 鉴权。
- 项目没有自动化测试、lint、typecheck 或 build pipeline。
- 正式 Node 24.x 托管方式：待确认；预检支持显式 Node 路径。
- V1.4.3 首页、四个指定 API、目录、图片、缩略图和视频 Range 已通过。
- poster新进程SQLite回查和3个生成样本已通过。
- 当前小批量脚本不是47万图片的全量调度器。
- HLS按需后台生成、访问manifest和定时dry-run清理尚未实现。
- PC受控浏览器权限阻断；实体手机未由Codex实际操作。
- 48102防火墙规则尚未创建，管理员脚本因当前令牌不足安全退出。

## Risks

- 旧项目未来需要删除，但在 V1 runtime 独立验证、备份和回滚演练前不能删除。
- 顶层 runtime `trash` 与媒体不同盘，未来移动媒体前必须隔离验证；当前远程删除固定关闭。
- 缩略图/poster/HLS 重新生成可能造成 CPU、磁盘 I/O 和容量增长，必须分阶段执行。
- 无鉴权环境下不能开启远程删除。

## Recommended Next Task

用户以管理员PowerShell创建Private 48102防火墙规则并完成PC/手机人工浏览器验收；之后再决定是否注册登录后自动启动任务。

## Notes for Next Codex Session

1. 严格按 `AGENTS.md` 顺序阅读 7 份上下文文档。
2. 继续阅读 `docs/V1.4_RUNTIME_MIGRATION_PLAN.md` 和 `docs/V1.4.1_RUNTIME_IMPLEMENTATION_PLAN.md`。
3. 区分代码默认端口 `48101` 与新启动器注入端口 `48102`。
4. V1 runtime 已有独立数据库副本；不要再指向或覆盖旧项目 `DATA_DIR`。
5. 站点当前为日常运行候选，不要擅自停止；全量缓存、扫描、查重、删除、HLS和自动启动仍需单独授权。
6. 不要 push 当前本地文档提交，除非用户明确授权。
