# HANDOFF.md

本文件保持最新交接状态，不记录完整历史。历史见 `CHANGELOG.md`。

## Last Completed Task

已完成`v90`媒体清理安全改造：v86永久删除链被项目回收站取代，新增manifest幂等、跨盘copy-verify-delete、恢复和localhost写边界。隔离执行/API测试通过；正式部署、重启和只读回归尚待完成。

## Current State

- 源码前端版本为`v90`，正式运行站点仍是`v89`，提交/推送/重启前不得把源码状态误报为已部署。
- 正式配置为`PHOTOS_DIR=E:\A_秀人`、`TRASH_DIR=D:\GalleryRuntime\trash`，来自`D:\GalleryRuntime\config\gallery.env`，两者跨盘；v90复用该目录，不创建新磁盘根目录。
- 批准回收job仅为`20260714-232613-22183b82`。旧`/api/media-cleanup/delete`返回410；`/recycle`和`/restore`只允许localhost，不接受客户端路径。
- 回收产物位于`TRASH_DIR\media-cleanup\<jobId>`：`files`保留原相对结构，另有`manifest.ndjson`、`summary.json`、`recycle.log`。
- 设置导航顺序为收藏图册、观看历史、显示设置、图片查重、媒体库清理、访问日志；新增路由为`#/__settings/favorites`和`#/__settings/history`。
- 首页只保留轮播和正常图册列表，不再渲染收藏/最近观看，也不在启动时请求`/api/favorites`或`/api/recent`。收藏和最近写入API、SQLite`user_marks`及localStorage兜底保持不变。
- `gallery.db`新增幂等`access_logs`表和`idx_access_logs_time_id`索引；GET分页默认50、最大100，按`time DESC, id DESC`稳定排序。
- 启动时流式、每250条一批导入旧`access-YYYY-MM-DD.log`，内容哈希防重复，原文件保留。新访问只写SQLite。
- 访问日志按UTC ISO时间保留365天：启动时检查一次，之后每24小时检查；仅删除`time < cutoff`，失败记录诊断且不阻止服务，不执行`VACUUM`。
- 正式Runtime只读统计基线：4个旧访问日志文件、374条、151354字节，最早`2026-07-12T05:39:19.159Z`；近4日日均93.5条/37838.5字节，估算180天约6.8MB、365天约13.8MB。

## Validation

- `scripts/test-media-cleanup-recycle.ps1`通过：同盘rename、强制copy-verify-delete、中文/空格/只读/0字节、冲突改名、ChangedSinceScan、Missing、复制失败、源删除失败、幂等和恢复冲突。
- 隔离API通过：旧delete 410、错误确认400、LAN recycle/restore 403、localhost回收/恢复成功；`.partial`残留0，TEMP根最终不存在。
- `server.js`、`app.js`、`gallery-db.js`、`duplicates-worker.js`语法检查通过；PowerShell worker解析通过。

- `scripts/test-access-log.js`隔离测试通过：0/1/49/50/51/100/101条边界，旧NDJSON迁移，50条分页，100条上限，非法/越界页，稳定倒序无重复，POST写入，保留边界和时间索引。
- 测试只使用唯一TEMP目录和隔离HTTP端口，按子进程句柄停止服务，最终TEMP根目录不存在；未连接正式数据库或媒体。
- 隔离浏览器在最终仅追加`v88`缓存标记前通过：首页无收藏/历史区域；设置菜单6项顺序正确；收藏取消即时空状态；历史显示最近时间；访问日志第1/2页均为50条且页码状态正确；控制台无warning/error。
- 响应式实测1440×900、1024×768、768×1024、390×844均无页面级横向溢出或菜单文字截断；768竖屏设置内容区为712px，390窄屏收藏卡片使用完整网格宽度且无video节点。
- `server.js`、`app.js`、`gallery-db.js`、`duplicates-worker.js`、访问日志测试脚本语法及`git diff --check`通过；完整diff/status在提交前复核。
- 正式Node已从PID 18704精确重启为PID 3468；loopback/LAN均HTTP 200并加载`app.js?v=89`和`styles.css?v=89`。访问日志默认50条、最大100条、跨页无重复；历史清理报告恢复为只读且删除按钮禁用。实体iPad/iPhone尚未验证。

## Known Issues

- v90正式部署前没有创建正式manifest，也没有移动`E:\A_秀人`任何文件。部署后仍必须由用户在localhost输入`MOVE`或“移入回收站”。
- 跨盘复制按附件要求校验文件大小和扫描mtime，不计算全文件哈希；未来若需要更强证明可增加可选SHA-256，但会增加约一轮磁盘读取。

- 实体iPad/iPhone、Disable cache/HAR、长期内存等仍需人工补测；本次iPad/iPhone结果为对应浏览器视口模拟。
- 旧NDJSON原文件为升级安全而保留；它们已冻结、不再增长，但未来如需删除必须先确认备份/审计策略。
- 页码分页使用OFFSET；当前一年约3.4万条规模可接受，达到百万级或出现深页性能问题后再评估游标分页。
- 项目没有登录、角色权限或完整API鉴权；访问日志可能含IP和User-Agent，部署范围必须继续受控。

## Recommended Next Task

完成v90提交、普通push、按现有脚本精确重启和浏览器验收；之后执行一次正式只读扫描，但不要由Codex触发正式回收。用户在localhost核对容量/路径后再手工确认。

## Notes for Next Codex Session

1. 严格按`AGENTS.md`顺序读取项目上下文。
2. 正式部署前不要用应用代码“只读打开”正式数据库；隔离测试继续使用唯一TEMP目录。
3. 正式旧NDJSON文件不得在本次升级时删除；迁移依靠`source_key`保持重复启动幂等。
4. 视频poster、`preload="none"`、按需加载和现有媒体清理边界均未改变。
