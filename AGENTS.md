# AGENTS.md

## 开始工作前

1. 阅读 `README.md`、`网页.md`、`docs/MIGRATION_SOURCE.md` 和 `docs/MIGRATION_MANIFEST.md`。
2. 查看 Git 状态，保留用户已有修改。
3. 修改前说明需求理解、现状、风险、方案、文件范围和验证方法。
4. 每次变更前检查任务额度；额度不足时不要修改代码。

## 当前版本门禁

- `migration-functional-baseline`：首次功能镜像。
- `v1.0-migration`：迁移冻结基线。
- 未经用户明确进入下一阶段，不得提前执行工程标准化、代码清理、性能优化或 UI 优化。
- 文档与仓库审计任务不得启动网站；需要运行验证时必须由任务明确授权。

## 当前生效入口

- 前端：`index.html`、`app.js`、`styles.css`
- 后端：`server.js`
- 数据库：`gallery-db.js`
- 查重后台：`duplicates-worker.js`
- 启动：`node server.js` 或 `start-server-48101.cmd`

不要从旧目录、`Codex-Photogallery-git`、`data/gallery.json` 或旧 Git 历史恢复当前实现。旧项目仅供只读追溯。

## 数据和媒体规则

- 不提交 `data`、`photos`、数据库、日志、缩略图、HLS 或用户媒体。
- 大视频不得默认预加载；保留 poster 和 `preload="none"`/`metadata`。
- 列表优先显示缩略图并懒加载，避免一次性挂载全部播放器。
- 扫描、查重、转码和删除属于重任务；保持单并发并说明 CPU、磁盘和时间影响。
- 删除测试只能操作隔离测试文件；必须检查文件和数据库一致性。
- 不默认开启 `ALLOW_REMOTE_DELETE`。
- 不修改数据库 schema、认证、数据格式或部署结构，除非用户明确确认。

## 修改与验证

- 不为了整理外观进行大规模重写或全项目格式化。
- 删除代码前必须证明入口、路由、动态导入、配置、测试和部署均无引用。
- 前端变更检查监听器、计时器、请求、视频和大列表的释放与资源占用。
- 媒体变更检查懒加载、Range、poster、缓存、路径穿越和磁盘增长。
- 完成代码修改后至少执行四个核心 JS 文件的 `node --check`。
- 根据改动执行相关 HTTP/API、浏览器、图片、视频和 SQLite 验证。
- 查看完整 diff，检查无关修改、敏感信息和大文件。
- 明确报告已验证和未验证内容。

## Git

- Git 根目录只能是 `D:\A8 Codex\Codex-PhotogalleryV1`。
- 禁止包含旧项目、旧 `.git`、生产数据或用户媒体。
- 禁止强制推送或覆盖远程历史。
- 功能镜像、代码清理、性能和 UI 必须分阶段提交。
- 创建版本标签前必须确认工作区干净、标签指向预期提交，并检查所有跟踪对象中不存在运行数据或敏感信息。
- `data/.gitkeep` 和 `photos/.gitkeep` 是允许提交的空目录占位文件；其他同目录内容必须保持忽略。
