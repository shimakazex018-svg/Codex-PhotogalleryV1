# V1.2.5 Code Cleanup Report

## Scope

本阶段仅检查 `server.js`、`app.js`、`styles.css`、`gallery-db.js` 和 `duplicates-worker.js`。不拆分文件，不改变架构、API、数据库、端口、数据路径、页面逻辑或技术栈。

判断方法包括：

- 全项目精确标识符搜索；
- 函数声明和词法引用计数；
- `module.exports`、全局对象、字符串动态调用、`eval`/`new Function` 检查；
- 服务入口、路由、定时任务、扫描子进程、SQLite 和视频处理链路检查；
- 删除后的语法、路由/API 静态对比和隔离运行冒烟。

## Decisions

| 代码 | 判断 | 依据 | 操作 |
|---|---|---|---|
| `server.js: toRootUrl()` | 确认死代码 | 全项目只有函数声明；未导出、无路由、无动态调用、无配置引用 | 删除 |
| `server.js: ensureHighlightCarousel()` | 确认旧轮播死代码 | 只有声明；首页 `/api/highlights` 和小时任务均调用 `ensureHighlightCarouselFromDb()` | 删除 |
| `server.js: collectHighlightCandidates()` | 确认级联死代码 | 唯一调用者是已删除的 `ensureHighlightCarousel()` | 删除 |
| `server.js: collectHighlightCandidatesFromWork()` | 确认级联死代码 | 只被 `collectHighlightCandidates()` 调用并自递归 | 删除 |
| `server.js: registerKnownMediaUrlsFromCollections()` | 确认死代码 | 只有声明和自身递归；扫描、SQLite、视频、启动及 API 链路均无调用 | 删除 |
| `server.js: registerKnownMediaUrls()` | 确认级联死代码 | 唯一调用者是已删除的 `registerKnownMediaUrlsFromCollections()` | 删除 |
| `server.js: ensureHighlightCarouselFromDb()` | 当前生效 | `/api/highlights` 和 `scheduleHourlyGalleryRefresh()` 明确调用 | 保留 |
| `server.js: bestHighlightGroup()`、`shuffleItems()`、`clearHighlightFolder()` | 当前生效共享逻辑 | SQLite 轮播继续调用 | 保留 |
| `server.js: photoUrlToPath()` | 当前生效共享逻辑 | SQLite 轮播、查重回收和打开路径等链路调用 | 保留 |
| `server.js: modelToCollection()` | 当前生效 | `scanGallery()` 返回结构仍调用 | 保留 |
| `server.js: /api/gallery`、`/api/refresh` 410 分支 | 兼容行为 | 明确注册并向旧客户端返回迁移提示；删除会改变 API 行为 | 保留 |
| `server.js` 的 `console.log/error` | 运维输出 | 服务启动、扫描子进程、轮播刷新和错误诊断使用 | 保留 |
| `app.js` 全部函数 | 未发现确认死代码 | 函数均有调用、事件绑定或 hash 路由用途；动态 HTML 使激进删除风险高 | 保留 |
| `styles.css` 全部规则 | 无法 100% 确认未使用 | 选择器来自静态 HTML 与 `app.js` 动态模板；本阶段不做 UI 清理 | 保留 |
| `gallery-db.js` 全部导出 | 当前数据层 | `module.exports` 被 `server.js` 或 worker 调用 | 保留 |
| `duplicates-worker.js` 全部函数 | 当前后台任务 | 主流程、进度和错误处理均使用 | 保留 |

## Debug and commented-code review

- 未发现 `debugger`。
- 未发现 TODO/FIXME 型临时实现。
- 未发现大段被注释掉的可执行代码。
- 日志输出均有运行或故障诊断用途，没有按“调试垃圾”删除。

## Behavior statement

删除的函数均为 `server.js` 私有、未导出、不可达代码。当前 SQLite 轮播、媒体扫描、缩略图、视频、查重、API 和页面调用链保持不变。

## Validation result

静态验证：

- `server.js`、`app.js`、`gallery-db.js`、`duplicates-worker.js` 均通过 `node --check`。
- 删除前后静态识别的 API 路径集合均为 25 项，无新增或减少。
- 六个删除符号在核心 JavaScript 中不再出现。
- `app.js`、`styles.css`、`gallery-db.js`、`duplicates-worker.js` 相对 `v1.2-clean` 零差异。

隔离运行验证使用临时端口、独立 `PHOTOS_DIR`、独立 `DATA_DIR`、一张生成图片和一个生成视频：

| 检查 | 结果 |
|---|---|
| 首页 | HTTP 200 |
| SQLite 配置 | `useSqliteApi=true` |
| 目录扫描 | `completed` |
| 根目录 | 1 个隔离集合 |
| SQLite 首页轮播 | 1 项 |
| 搜索 | 返回隔离集合 |
| 目录详情 | 正确返回测试图集 |
| 媒体类型 | 图片和视频 |
| 图片缩略图 | HTTP 200 |
| 视频 Range | HTTP 206 |

验证后已停止隔离服务并清理测试媒体、SQLite、日志、缩略图和轮播缓存。没有连接或修改生产数据。
