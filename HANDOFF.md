# HANDOFF.md

本文件保持最新交接状态，不记录完整历史。历史见 `CHANGELOG.md`。

## Last Completed Task

修复 `start-gallery.ps1` 的 Windows 空格路径参数并完成 V1.4.3 全套真实只读验收；首页、API、图片、缩略图和视频 Range 通过，poster 404 被记录，服务已停止。

## Current State

- 业务基线：`v1.3-release` 已发布到 GitHub。
- 当前分支：`main`。
- 本次修复提交后，本地 `main` 预计比 `origin/main` 领先 6 个提交；均未 push。
- 工作区不包含生产数据库、媒体、缩略图、HLS、日志或 cache。
- `D:\GalleryRuntime` 已创建，数据库副本 SHA256 已验证，真实配置位于 runtime 外部配置目录。
- V1 已在 48102 成功完成一次真实只读运行验收；当前服务已停止，48102 未监听。

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

## Validation

- 仓库根目录、tracked files、启动脚本和 `.gitignore`：已审计。
- 前后端入口、主要 API、SQLite 表/index：已从源码核对。
- 运行数据忽略矩阵：数据库、媒体、日志、cache、runtime、缩略图、poster、HLS 和 `.env` 均命中忽略规则。
- 业务代码/HTML/CSS/JavaScript diff：本次为零；仅新增运维脚本和更新文档。
- 网站启动：未执行，符合文档任务限制。
- 数据库文件：只进行字节复制和 SHA256；未通过 SQLite 或应用打开。媒体未修改。

## Known Issues

- 新进程可能无法恢复视频 poster 源路径映射，poster 请求可能 404。
- 项目没有登录、角色权限或 API 鉴权。
- 项目没有自动化测试、lint、typecheck 或 build pipeline。
- 正式 Node 24.x 托管方式：待确认；预检支持显式 Node 路径。
- V1.4.3 首页、四个指定 API、目录、图片、缩略图和视频 Range 已通过。
- poster 抽样仍返回 404，是当前主要功能已知问题。

## Risks

- 旧项目未来需要删除，但在 V1 runtime 独立验证、备份和回滚演练前不能删除。
- 顶层 runtime `trash` 与媒体不同盘，未来移动媒体前必须隔离验证；当前远程删除固定关闭。
- 缩略图/poster/HLS 重新生成可能造成 CPU、磁盘 I/O 和容量增长，必须分阶段执行。
- 无鉴权环境下不能开启远程删除。

## Recommended Next Task

建立 Runtime 数据库离线备份和恢复演练，再进入稳定观察或 poster 404 的独立修复阶段。不要提前删除旧项目。

## Notes for Next Codex Session

1. 严格按 `AGENTS.md` 顺序阅读 7 份上下文文档。
2. 继续阅读 `docs/V1.4_RUNTIME_MIGRATION_PLAN.md` 和 `docs/V1.4.1_RUNTIME_IMPLEMENTATION_PLAN.md`。
3. 区分代码默认端口 `48101` 与新启动器注入端口 `48102`。
4. V1 runtime 已有独立数据库副本；不要再指向或覆盖旧项目 `DATA_DIR`。
5. V1.4.3 只读验收已通过；扫描、查重、删除和 HLS 仍需单独授权。
6. 不要 push 当前本地文档提交，除非用户明确授权。
