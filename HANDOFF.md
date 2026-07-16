# HANDOFF.md

本文件保持最新交接状态，不记录完整历史。历史见 `CHANGELOG.md`。

## Last Completed Task

已完成FTS5 Integration V96最小正式部署：时间戳一致性备份、474470行迁移、verify/optimize/full、`auto`配置、48102重启和六类API验收均通过；正式媒体未扫描或修改。

## Current State

- 源码及正式运行站均为`v96`；正式Node PID为22196，监听`0.0.0.0:48102`。
- 候选`/api/search`默认50/最大60总结果，图集流程不变；2字符只搜媒体title精确/前缀，3字符以上ready时使用mapped trigram FTS。auto不可用时安全降级，不自动`SCAN media`；legacy-like只能显式启用。
- 正式库已包含`media_search_documents`、`media_search_fts`和最小`search_fts_state`，三表状态ready；正式配置为`SEARCH_BACKEND_MODE=auto`，实际模式fts5。
- 前端搜索为250ms防抖、旧请求Abort、请求序号防乱序、30秒同词缓存和2字符下限；搜索卡片继续只用懒加载WebP预览。
- 正式配置为`PHOTOS_DIR=E:\A_秀人`、`TRASH_DIR=E:\回收站`，来自`D:\GalleryRuntime\config\gallery.env`，两者同盘；正式回收将使用`File.Move`，跨盘copy-verify-delete仍仅作为不同卷配置的安全后备。
- 批准回收job仅为`20260714-232613-22183b82`。旧`/api/media-cleanup/delete`返回410；`/recycle`和`/restore`只允许localhost，不接受客户端路径。
- 回收产物位于`TRASH_DIR\media-cleanup\<jobId>`：`files`保留原相对结构，另有`manifest.ndjson`、`summary.json`、`recycle.log`。
- 设置导航顺序为收藏图册、观看历史、显示设置、图片查重、媒体库清理、访问日志；新增路由为`#/__settings/favorites`和`#/__settings/history`。
- 首页只保留轮播和正常图册列表，不再渲染收藏/最近观看，也不在启动时请求`/api/favorites`或`/api/recent`。收藏和最近写入API、SQLite`user_marks`及localStorage兜底保持不变。
- `gallery.db`新增幂等`access_logs`表和`idx_access_logs_time_id`索引；GET分页默认50、最大100，按`time DESC, id DESC`稳定排序。
- 启动时流式、每250条一批导入旧`access-YYYY-MM-DD.log`，内容哈希防重复，原文件保留。新访问只写SQLite。
- 访问日志按UTC ISO时间保留365天：启动时检查一次，之后每24小时检查；仅删除`time < cutoff`，失败记录诊断且不阻止服务，不执行`VACUUM`。
- 正式Runtime只读统计基线：4个旧访问日志文件、374条、151354字节，最早`2026-07-12T05:39:19.159Z`；近4日日均93.5条/37838.5字节，估算180天约6.8MB、365天约13.8MB。

## Validation

- 正式迁移前备份为`D:\GalleryRuntime\backups\gallery-pre-fts5-v96-20260716-162140.db`，1169928192字节、integrity ok、media 474470、collections 7287；正式库迁移后1461190656字节。
- 正式apply 98.847秒；media/mapping/FTS均474470，缺失、孤立、重复和title/path mismatch为0。独立verify 76.227秒、full 75.688秒，SQLite与FTS integrity通过。
- 正式六类API均HTTP 200、模式fts5、状态ready；三次中位为完整图集38.453ms、两字36.189ms、三字52.238ms、英文57.865ms、稀疏文件名31.420ms、无结果32.450ms。实际计划无`SCAN media`。
- 首页、v96静态资源、设置相关API、根图集、图集详情、60条媒体分页和搜索缩略图均HTTP 200；scan状态idle，stderr为空。

- B1完整干净副本apply 142.979秒（含逐条对照、FTS维护），迁移后1,461,190,656字节，增量291,262,464字节；峰值RSS143,560,704、WAL14,691,952。media/mapping/FTS均474470，所有缺失/孤立/重复/title/path mismatch为0，SQLite integrity ok。
- 隔离API稀疏词冷/热中位37.020/32.007ms，无结果37.992/30.069ms；legacy对照约2.38至2.61秒。最终计划没有`SCAN media`或临时排序树。
- 完整副本增量新增/更新/删除29.122/3.852/4.825ms，rowid稳定；同步失败media回滚。文件操作与数据库不同步时只记录错误、标记stale并由手工重新扫描恢复。
- auto stale三字符media SQL为0且不触发legacy，两字符title仍返回；状态API保留基本状态与按需实时计数。

- 实际Node v24.14.0/SQLite 3.51.2支持FTS5、trigram中文、MATCH、trigram LIKE、`integrity-check`和`optimize`；trigram MATCH少于3个code point返回0。
- 最终mapped完整副本：media/documents/FTS均474470，缺失、孤立、字段不一致、构建失败均0；SQLite完整性为ok。DB增量284315648字节，2000条批次构建89.052秒，FTS维护9.943秒，峰值RSS141426688字节、WAL14893832字节，结束后WAL/SHM/journal均0。
- 计划从原`SCAN media`变为`VIRTUAL TABLE INDEX 0:M2`，回表使用documents INTEGER PRIMARY KEY和`sqlite_autoindex_media_1(id=?)`；图集精确/前缀使用`idx_collections_title_nocase`，两字标题前缀使用新增候选`idx_media_title_nocase`（逻辑7127040字节、构建2.486秒）。最新稀疏文件名冷/热中位34.320/24.346ms，无结果26.717/22.015ms；重复索引对齐跑稀疏冷最高80.311ms、`jpg`冷最高114.228ms，OS缓存未强制清空。
- 两字媒体专属词`扫码`为图集0、media LIKE 4、title前缀4、trigram 0；候选`idx_media_title_nocase`范围计划生效。50k汉字bigram小样本为4/4、0误差、约3.23MB，但未纳入正式推荐结构。
- 隔离`test-fts5-prototype.js`通过正式目标拒绝、mapped构建、中文标题、解码路径、两字前缀、计划和三层一致性；完整报告见`docs/SEARCH_FTS5_PROTOTYPE_V96.md`。
- 补v95图集索引后的合并全套参考重跑在600秒上限被终止且未覆盖旧结果；`--skip-reference --skip-consistency`隔离性能重跑4秒通过。完整正确性/一致性来自同schema/同源的前一完整跑，最终重建`integrity_check=ok`。
- 正式库只读确认7287个collections、474470条media；原计划为`SCAN c`/`SCAN media`和两个ORDER BY临时B-tree，正式v91十二词API为6.0-16.7秒。
- 一致性副本运行`PRAGMA optimize`后，精确/前缀图集约37-39ms，高频/路径/数字等约12-85ms，稀疏文件名和无结果约2.3秒；修改后无ORDER BY/DISTINCT临时B-tree。
- 隔离浏览器精确图集收到/首批渲染35.1/36.3ms，Maleah 60卡片18.2/25.9ms；60/60懒加载、0原图卡片URL、0video、快速旧词未覆盖新词、单字符不查询、控制台0 warning/error。
- `scripts/benchmark-search.js`和`scripts/test-search-api.js`覆盖查询计划、索引、12类关键词、60上限、短词和结构化日志；完整结果见`docs/SEARCH_PERFORMANCE_BASELINE_V95.md`。
- `scripts/test-media-cleanup-recycle.ps1`通过：同盘rename、强制copy-verify-delete、中文/空格/只读/0字节、冲突改名、ChangedSinceScan、Missing、复制失败、源删除失败、幂等和恢复冲突。
- 隔离API通过：旧delete 410、错误确认400、LAN recycle/restore 403、localhost回收/恢复成功；`.partial`残留0，TEMP根最终不存在。
- `server.js`、`app.js`、`gallery-db.js`、`duplicates-worker.js`语法检查通过；PowerShell worker解析通过。
- 回收根切换后正式Node PID为2064、Host PID为14552，任务/监听/父子PID一致，loopback与LAN HTTP 200并加载v91。媒体清理页显示新路径、同盘rename、批准job、7851候选；回收按钮启用、恢复按钮禁用，无全局溢出，控制台0 warning/error。
- 正式只读回归job `20260715-133504-77ec5bd2`在246.612秒完成：482450文件、7288目录、472490图片、2109视频、7851非媒体、0错误、`incomplete=false`；worker退出，移动/恢复/空目录清理均为0。
- `E:\回收站`为空，批准job回收根和manifest均不存在，worker为0；本次未发送任何正式recycle/restore请求，媒体移动和恢复均为0。

- `scripts/test-access-log.js`隔离测试通过：0/1/49/50/51/100/101条边界，旧NDJSON迁移，50条分页，100条上限，非法/越界页，稳定倒序无重复，POST写入，保留边界和时间索引。
- 测试只使用唯一TEMP目录和隔离HTTP端口，按子进程句柄停止服务，最终TEMP根目录不存在；未连接正式数据库或媒体。
- 隔离浏览器在最终仅追加`v88`缓存标记前通过：首页无收藏/历史区域；设置菜单6项顺序正确；收藏取消即时空状态；历史显示最近时间；访问日志第1/2页均为50条且页码状态正确；控制台无warning/error。
- 响应式实测1440×900、1024×768、768×1024、390×844均无页面级横向溢出或菜单文字截断；768竖屏设置内容区为712px，390窄屏收藏卡片使用完整网格宽度且无video节点。
- `server.js`、`app.js`、`gallery-db.js`、`duplicates-worker.js`、访问日志测试脚本语法及`git diff --check`通过；完整diff/status在提交前复核。
- 正式Node已从PID 18704精确重启为PID 3468；loopback/LAN均HTTP 200并加载`app.js?v=89`和`styles.css?v=89`。访问日志默认50条、最大100条、跨页无重复；历史清理报告恢复为只读且删除按钮禁用。实体iPad/iPhone尚未验证。

## Known Issues

- FTS5额外生产级扩展和浏览器自动化验收已停止，不再是项目待办或部署门槛。
- trigram不支持两字中间包含；当前推荐只允许两字`title`精确/前缀。URL解码相对路径会有意移除`photos`固定根和编码字节串的偶然LIKE语义，同时新增自然中文路径命中。
- v91正式部署验收没有创建正式manifest，也没有移动`E:\A_秀人`任何文件。实际回收仍必须由用户在localhost输入`MOVE`或“移入回收站”。
- 跨盘复制按附件要求校验文件大小和扫描mtime，不计算全文件哈希；未来若需要更强证明可增加可选SHA-256，但会增加约一轮磁盘读取。

- 实体iPad/iPhone、Disable cache/HAR、长期内存等仍需人工补测；本次iPad/iPhone结果为对应浏览器视口模拟。
- 旧NDJSON原文件为升级安全而保留；它们已冻结、不再增长，但未来如需删除必须先确认备份/审计策略。
- 页码分页使用OFFSET；当前一年约3.4万条规模可接受，达到百万级或出现深页性能问题后再评估游标分页。
- 项目没有登录、角色权限或完整API鉴权；访问日志可能含IP和User-Agent，部署范围必须继续受控。

## Recommended Next Task

用户在`http://192.168.31.153:48102/`完成人工Chrome搜索与页面验收；不需要修复或自动控制Chrome Extension。

## Notes for Next Codex Session

1. 严格按`AGENTS.md`顺序读取项目上下文。
2. 正式部署前不要用应用代码“只读打开”正式数据库；隔离测试继续使用唯一TEMP目录。
3. 正式旧NDJSON文件不得在本次升级时删除；迁移依靠`source_key`保持重复启动幂等。
4. 视频poster、`preload="none"`、按需加载和现有媒体清理边界均未改变。
5. FTS阶段A原始副本和JSON位于Git忽略的`tmp/fts5-prototype`；它们可重建且不应提交。正式Node PID/端口未被本任务操作。
