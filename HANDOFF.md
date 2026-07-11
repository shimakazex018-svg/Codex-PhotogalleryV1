# HANDOFF.md

本文件保持最新交接状态，不记录完整历史。历史见 `CHANGELOG.md`。

## Last Completed Task

建立 Codex 长期上下文管理体系：规范 `AGENTS.md`，新增当前事实、架构、长期决策、任务池、测试方法和本交接文档，并追加 `CHANGELOG.md`。

## Current State

- 业务基线：`v1.3-release` 已发布到 GitHub。
- 当前分支：`main`。
- 本次任务结束后，本地 `main` 预计比 `origin/main` 领先 3 个纯文档提交：V1.4 审计、V1.4.1 实施设计、上下文文档体系。
- 工作区不包含生产数据库、媒体、缩略图、HLS、日志或 cache。
- V1 正式 runtime 尚未创建，网站未以新 runtime 启动。
- 当前代码默认端口仍为 `48101`；目标 `48102` 尚未实施。

## Recently Changed Files

- `AGENTS.md`
- `PROJECT_CONTEXT.md`
- `ARCHITECTURE.md`
- `DECISIONS.md`
- `TODO.md`
- `TESTING.md`
- `CHANGELOG.md`
- `HANDOFF.md`

## Validation

- 仓库根目录、tracked files、启动脚本和 `.gitignore`：已审计。
- 前后端入口、主要 API、SQLite 表/index：已从源码核对。
- 运行数据忽略矩阵：数据库、媒体、日志、cache、runtime、缩略图、poster、HLS 和 `.env` 均命中忽略规则。
- 业务代码/HTML/CSS/JavaScript/脚本 diff：本次应为零。
- 网站启动：未执行，符合文档任务限制。
- 数据库或媒体读取/写入：未执行。

## Known Issues

- 新进程可能无法恢复视频 poster 源路径映射，poster 请求可能 404。
- 项目没有登录、角色权限或 API 鉴权。
- 项目没有自动化测试、lint、typecheck 或 build pipeline。
- 正式 Node 24.x 路径/托管方式：待确认。
- V1.4 runtime、外部 env、参数化启动器和数据库迁移：待实施。

## Risks

- 旧项目未来需要删除，但在 V1 runtime 独立验证、备份和回滚演练前不能删除。
- 当前主启动脚本固定旧端口并覆盖项目内 `DATA_DIR`，不能作为 V1.4 独立 runtime 的最终入口。
- 缩略图/poster/HLS 重新生成可能造成 CPU、磁盘 I/O 和容量增长，必须分阶段执行。
- 无鉴权环境下不能开启远程删除。

## Recommended Next Task

在用户明确授权后实施 TODO High Priority 的第一项：创建安全的参数化 runtime 启动器和预检模式。该任务应先修改模板/脚本并使用空 runtime 做 `-PreflightOnly`，不要立即复制生产数据库或启动正式网站。

## Notes for Next Codex Session

1. 严格按 `AGENTS.md` 顺序阅读 7 份上下文文档。
2. 继续阅读 `docs/V1.4_RUNTIME_MIGRATION_PLAN.md` 和 `docs/V1.4.1_RUNTIME_IMPLEMENTATION_PLAN.md`。
3. 不要把 V1.4 目标端口 `48102` 误认为当前代码已经实现。
4. 不要直接把 V1 指向旧项目 `DATA_DIR`。
5. 不要创建、复制或打开生产数据库，除非用户明确进入数据迁移步骤。
6. 不要 push 当前本地文档提交，除非用户明确授权。
