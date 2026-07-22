# AGENTS.md

本文件只记录 Codex / AI Agent 的长期工作规则。项目当前事实见 `PROJECT_CONTEXT.md`，系统结构见 `ARCHITECTURE.md`，最新交接见 `HANDOFF.md`。

## 1. New-task reading order

每次新任务开始时，必须按顺序阅读：

1. `AGENTS.md`
2. `PROJECT_CONTEXT.md`
3. `ARCHITECTURE.md`
4. `DECISIONS.md`
5. `TODO.md`
6. `TESTING.md`
7. `HANDOFF.md`

如果任务涉及具体模块，必须继续阅读对应源码、`网页.md` 和相关 `docs/` 文档。不能只读上下文文档就直接修改代码。

## 2. Role and priorities

Codex 同时承担 Web 架构、性能、资源安全和代码实现职责。默认优先级：

1. 正确性
2. 数据安全
3. 磁盘、内存、CPU 和网络资源可控
4. 用户体验
5. 可维护性
6. 性能优化
7. 高级方案

不要机械执行存在架构、资源、安全或维护风险的需求；必须先指出风险并给出分级建议。不要过度设计简单任务。

## 3. Before any change

每次变更前必须：

1. 检查当前任务 token / 额度是否足以完成修改和验证；不足则不要修改。
2. 执行 `git status --short`，确认并保护用户已有修改。
3. 确认 Git 根目录：`git rev-parse --show-toplevel`。
4. 阅读与任务相关的入口、路由、导入、配置、数据流、测试和部署文件。
5. 明确区分源代码、配置模板和运行数据。
6. 先输出技术评审：
   - 【需求理解】
   - 【现状判断】
   - 【风险点】
   - 【推荐方案】（本次必须做 / 建议现在做 / 以后规模变大再做）
   - 【可选增强】
   - 【需要确认】
   - 【执行计划】
7. 只有用户目标明确、风险边界清楚且权限充分时才修改。

## 4. Prohibited actions

未经用户明确授权，禁止：

- 修改生产数据库、真实媒体或运行数据；
- 删除、移动或覆盖用户图片、视频及回收目录内容；
- 修改数据库 schema、认证方式、API 格式或核心业务语义；
- 改变生产端口、路径、部署结构或技术栈；
- 大规模重写、无意义拆分、全项目格式化；
- 删除未知用途、动态引用或兼容性代码；
- 把真实 `.env`、密码、Token、Cookie、私钥或机器专属配置提交到 Git；
- force push、覆盖远程历史或删除远程分支/tag；
- 在文档/仓库审计任务中启动网站；
- 使用生产数据执行扫描、查重、转码、HLS 或删除测试。

## 5. Runtime-data protection

数据库、媒体、日志、cache、缩略图、video poster、HLS、轮播缓存和临时测试数据均属于运行数据，不进入 Git。

允许提交：

- 源代码；
- 非敏感配置模板；
- 启动/维护脚本；
- 文档；
- `data/.gitkeep`、`photos/.gitkeep`。

媒体任务必须考虑：

- 视频默认 `preload="none"` 或 `metadata`，优先 poster，用户触发后再加载；
- 列表懒加载，不一次性挂载大量播放器或 DOM；
- 缩略图/poster/HLS 可增长，必须有容量统计和清理策略；
- 扫描、查重、缩略图和转码保持有界并发，不阻塞 HTTP；
- 删除时保持文件、数据库和衍生文件一致；
- 测试只使用隔离、可丢弃数据；
- 事件监听、定时器、请求、视频播放和 object URL 必须适时释放。

## 6. Coding and maintenance constraints

- 以当前入口、路由、导入和运行结果判断代码是否生效，不凭文件名猜测。
- 不删除兼容接口，除非有完整引用证据和用户确认。
- 不改变 API 请求/响应、数据库字段或用户操作流程来“简化”代码。
- 服务端变更检查路径穿越、文件类型、资源限额、后台任务、日志轮转和磁盘增长。
- 数据库变更检查分页、索引、N+1、事务/一致性和备份回滚。
- 前端变更检查大量列表、重复请求、内存泄漏、移动端发热和 `prefers-reduced-motion`。
- 不引入新依赖、框架或构建系统，除非单独评审并获批。

## 7. Fixed validation workflow

代码修改后至少执行：

```powershell
git diff --check
node --check server.js
node --check app.js
node --check gallery-db.js
node --check duplicates-worker.js
```

还必须：

1. 查看完整 `git diff` 和 `git status --short`。
2. 确认无关文件、敏感信息、大文件和运行数据未进入变更。
3. 根据修改范围执行 `TESTING.md` 中相关验证。
4. 运行型验证必须使用隔离环境；生产数据验证需单独授权。
5. 明确报告已验证和未验证内容。

项目没有 npm build/lint/typecheck/test 命令。不要虚构命令；如工具链变化，先更新 `TESTING.md`。

## 8. Documentation lifecycle

每次任务结束时，必须更新：

1. `CHANGELOG.md`
2. `HANDOFF.md`

如果任务完成、取消、拆分或延期，必须更新：

1. `TODO.md`

如果项目事实变化，必须更新：

1. `PROJECT_CONTEXT.md`

如果架构、目录、接口、模块关系或数据流变化，必须更新：

1. `ARCHITECTURE.md`

如果做出新的长期技术选择，必须更新：

1. `DECISIONS.md`

如果启动、测试、编译或验证方式变化，必须更新：

1. `TESTING.md`

如果 Codex 工作规则、禁止事项或固定流程变化，必须更新：

1. `AGENTS.md`

文档边界：

- `CHANGELOG.md` 使用追加记录，记录实际历史改动。
- `HANDOFF.md` 保持最新状态，可以重写，不无限堆积历史。
- `PROJECT_CONTEXT.md` 只记录当前项目事实，不记录过程。
- `ARCHITECTURE.md` 只记录当前架构，不记录历史争论。
- `TODO.md` 只记录未完成、完成、延期或取消状态，不记录长篇实现过程。
- `DECISIONS.md` 记录长期有效或已废弃的关键决策，并标记状态。
- `TESTING.md` 只保留当前有效验证方法；旧方法如保留必须标记已废弃。

## 9. Git workflow

- 一个 commit 只承担一个清晰职责。
- 多分支正式收敛前必须审计全部分支、标签、Worktree、独有提交和运行进程；删除已合并分支或Worktree前，先建立必要的archive引用，并以`merge-base --is-ancestor`、干净状态和无进程占用为门禁。
- 提交前检查 diff、语法、文档、敏感信息和运行数据。
- 保留现有 release tag 作为不可变回滚点。
- 不提交旧项目、旧 `.git`、生产数据或用户媒体。
- push 前先读取远程 refs；远程有不兼容历史时停止。
- 除非用户明确要求，不擅自 push、建 tag、开 PR 或发布 Release。

## 10. End-of-task report

最终至少说明：

1. 修改了哪些文件；
2. 每个文件改了什么；
3. 解决了什么问题；
4. 已执行与未执行的验证；
5. 是否有遗留风险；
6. 下一步建议；
7. 是否需要测试、构建或数据库迁移；
8. Git diff/status 和是否 push。

## 11. Search FTS5 maintenance

- FTS5迁移、备份、校验和optimize必须显式指定数据库路径；疑似正式数据库默认拒绝写入。
- 服务启动只读索引状态，禁止自动全量构建或自动回退到完整媒体LIKE扫描。
- `media`、`media_search_documents`和`media_search_fts`的搜索字段变更必须保持同一SQLite事务；文件系统失败只能标记`stale`并由扫描修复，不能宣称跨文件系统ACID。
- 迁移前必须完成SQLite一致性备份及integrity校验；回滚通过显式`legacy-like`模式完成，不提供自动DROP或数据库替换编排。
- B1命令和当前限制以`docs/SEARCH_FTS5_INTEGRATION_V96.md`为准。
