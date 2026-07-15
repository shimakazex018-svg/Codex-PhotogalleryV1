# HANDOFF.md

本文件保持最新交接状态，不记录完整历史。历史见 `CHANGELOG.md`。

## Last Completed Task

正式发布`v88`后发现Node重启会让磁盘上的媒体清理历史报告从设置页消失，已完成并正式发布`v89`最小修复：启动时恢复最新有效报告用于只读查看，并禁止恢复报告删除。

## Current State

- 源码和正式前端版本均为`v89`；正式访问日志SQLite迁移、分页和媒体清理历史恢复均已生效。
- 设置导航顺序为收藏图册、观看历史、显示设置、图片查重、媒体库清理、访问日志；新增路由为`#/__settings/favorites`和`#/__settings/history`。
- 首页只保留轮播和正常图册列表，不再渲染收藏/最近观看，也不在启动时请求`/api/favorites`或`/api/recent`。收藏和最近写入API、SQLite`user_marks`及localStorage兜底保持不变。
- `gallery.db`新增幂等`access_logs`表和`idx_access_logs_time_id`索引；GET分页默认50、最大100，按`time DESC, id DESC`稳定排序。
- 启动时流式、每250条一批导入旧`access-YYYY-MM-DD.log`，内容哈希防重复，原文件保留。新访问只写SQLite。
- 访问日志按UTC ISO时间保留365天：启动时检查一次，之后每24小时检查；仅删除`time < cutoff`，失败记录诊断且不阻止服务，不执行`VACUUM`。
- 正式Runtime只读统计基线：4个旧访问日志文件、374条、151354字节，最早`2026-07-12T05:39:19.159Z`；近4日日均93.5条/37838.5字节，估算180天约6.8MB、365天约13.8MB。

## Validation

- `scripts/test-access-log.js`隔离测试通过：0/1/49/50/51/100/101条边界，旧NDJSON迁移，50条分页，100条上限，非法/越界页，稳定倒序无重复，POST写入，保留边界和时间索引。
- 测试只使用唯一TEMP目录和隔离HTTP端口，按子进程句柄停止服务，最终TEMP根目录不存在；未连接正式数据库或媒体。
- 隔离浏览器在最终仅追加`v88`缓存标记前通过：首页无收藏/历史区域；设置菜单6项顺序正确；收藏取消即时空状态；历史显示最近时间；访问日志第1/2页均为50条且页码状态正确；控制台无warning/error。
- 响应式实测1440×900、1024×768、768×1024、390×844均无页面级横向溢出或菜单文字截断；768竖屏设置内容区为712px，390窄屏收藏卡片使用完整网格宽度且无video节点。
- `server.js`、`app.js`、`gallery-db.js`、`duplicates-worker.js`、访问日志测试脚本语法及`git diff --check`通过；完整diff/status在提交前复核。
- 正式Node已从PID 18704精确重启为PID 3468；loopback/LAN均HTTP 200并加载`app.js?v=89`和`styles.css?v=89`。访问日志默认50条、最大100条、跨页无重复；历史清理报告恢复为只读且删除按钮禁用。实体iPad/iPhone尚未验证。

## Known Issues

- 实体iPad/iPhone、Disable cache/HAR、长期内存等仍需人工补测；本次iPad/iPhone结果为对应浏览器视口模拟。
- 旧NDJSON原文件为升级安全而保留；它们已冻结、不再增长，但未来如需删除必须先确认备份/审计策略。
- 页码分页使用OFFSET；当前一年约3.4万条规模可接受，达到百万级或出现深页性能问题后再评估游标分页。
- 项目没有登录、角色权限或完整API鉴权；访问日志可能含IP和User-Agent，部署范围必须继续受控。

## Recommended Next Task

优先在实体iPad/iPhone上补做设置页与媒体清理报告的只读响应式验收；若访问日志规模未来达到百万级或深页出现性能问题，再评估游标分页。不要为补测触发正式媒体扫描或删除。

## Notes for Next Codex Session

1. 严格按`AGENTS.md`顺序读取项目上下文。
2. 正式部署前不要用应用代码“只读打开”正式数据库；隔离测试继续使用唯一TEMP目录。
3. 正式旧NDJSON文件不得在本次升级时删除；迁移依靠`source_key`保持重复启动幂等。
4. 视频poster、`preload="none"`、按需加载和现有媒体清理边界均未改变。
