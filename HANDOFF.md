# HANDOFF.md

本文件保持最新交接状态，不记录完整历史。历史见 `CHANGELOG.md`。

## Last Completed Task

已完成此前分叉的v102功能线和main v96功能线收敛，正式版本为`v103-20260722-1209`。集成期间和正式验收均未启动正式媒体写任务，本次正式媒体移动、删除均为0。

## Current State

- 集成基线为`codex/fts5-integration-v96@2ce51e2`，已用`--no-ff`合入`origin/main@eb3d3d8`；发布前归档标签已推送。
- v103候选由旧Node PID 28744精确重启到PID 23852完成只读验收；最终时间戳版本精确重启为Node PID 29836、Host PID 29764。loopback、LAN和ZeroTier均HTTP 200，唯一监听为`0.0.0.0:48102`。
- 本地main、`origin/main`和远程main的发布SHA曾一致为`5a3ffef74a7ff9ef83174f85c8e4e83135aaa2ad`；随后仅追加本次清理/交接文档提交。正式代码标签`v103-20260722-1209`保持指向发布提交。
- 已删除Worktree `7c4a`、`940a`和`a103`；已删除四个已合并本地临时分支及三个远程`codex/*`分支。`8dbe`因活动Codex控制内核PID 8648占用而按安全规则暂留，本地分支HEAD已进入main且远程已删除。
- 保留`archive/pre-integration-main-20260722`和`archive/pre-integration-v102-20260722`。隔离TEMP Runtime已删除，49481无监听；正式图集回收队列为0，本次正式移动/删除文件均为0。
- 部署前备份位于`D:\GalleryRuntime\backups\v103-predeploy-20260722-115638`；SQLite在线一致性副本为2,030,444,544字节，SHA-256 `A0E910BB8C8724E92174B116864A8FFF1C40993E1DA48BCBD14E72E4F843F959`，`PRAGMA quick_check=ok`。
- pHash任务未运行，但保留了此前`database is locked`的失败状态（3,201/486,028）；这是既有运行状态，不在本次发布中自动重启或改写。
- 正式版本自v102起使用`v<版本>-YYYYMMDD-HHmm`，时区为`Asia/Shanghai`；`APP_VERSION`、全部静态资源缓存参数和`release-notes.json`第一项保持一致。
- 设置路由`#/__settings/release-notes`只在进入页面时读取静态JSON，默认20条、支持加载更多和失败重试；页脚完整版本号是同一路由的可访问链接。
- 公共排序枚举为`name_asc/name_desc/image_count_asc/image_count_desc/video_count_asc/video_count_desc/updated_asc/updated_desc`；根目录先对完整集合排序再分页，子目录先排序再返回，收藏复用同一比较器，观看历史仍按`visitedAt`倒序。
- “更新时间”使用`collections.mtime`（epoch毫秒），来自目录/媒体/子图册内容mtime的最大值并随增量扫描更新；0或非法时间视为空值。名称使用`zh-CN`数字自然排序，平局固定名称正序、相对路径正序。
- 搜索仍以`relevance`为专用默认值；显式选择8种模式时只接受白名单，图册候选在截取前排序，媒体候选保留有界FTS集合后使用同一稳定比较器。
- `POST /api/image-hash-lookup`单次只接收一张JPEG/PNG/WebP/GIF/AVIF，默认上限200 MiB；文件签名为主判据。上传流计算完整SHA-256，同时写入随机短期文件供FFmpeg解码pHash，所有完成/失败路径清理，不写图库、历史或缩略图。
- SHA-256精确覆盖仍为470347/486028；pHash使用`media_perceptual_hashes`的8字节BLOB。相似查询在独立进程顺序读取紧凑哈希，距离0-6为高度相似、7-10为可能相似、最多50条，并排除已精确命中的媒体。
- pHash后台索引只手工启动，默认1 worker，可暂停/继续/停止，按size/mtime增量重算；480 MiB自动暂停、512 MiB硬停止，不在网站启动时自动全量处理。
- 正式只读扫描共2096条视频：`direct_safe=1432`、`device_dependent=267`、`fallback_required=395`、`invalid=2`。视频编码分布为H.264 1488、MPEG-4 Part 2 388、HEVC 217、ProRes 1、无有效轨2。
- 扫描报告为Runtime文件`DATA_DIR/video-compatibility-report.json`，不进入Git。元数据最多2路FFprobe；只对疑似项在10%/50%/90%各解码1秒，最多1路FFmpeg；不生成永久转码或兼容缓存。
- 设置路由`#/__settings/video-compatibility`提供状态、控制、统计、分类筛选、搜索和50条服务端分页。扫描完成会清除图集内存缓存，使重新访问时取得最新分类。
- `direct_safe`与`device_dependent`使用原始懒加载Range URL；只有报告标记`fallback_required`的媒体ID进入兼容流，`invalid`显示不可用。兼容接口不接受客户端文件路径，同时只保留一条FFmpeg。
- 候选`/api/search`默认50/最大60总结果，图集流程不变；2字符只搜媒体title精确/前缀，3字符以上ready时使用mapped trigram FTS。auto不可用时安全降级，不自动`SCAN media`；legacy-like只能显式启用。
- 正式库已包含`media_search_documents`、`media_search_fts`和最小`search_fts_state`，三表状态ready；正式配置为`SEARCH_BACKEND_MODE=auto`，实际模式fts5。
- 正式配置启用`REMOTE_ADMIN_ENABLED=1`、LAN `192.168.31.0/24`、ZeroTier `192.168.192.0/24`和每日本地时间04:00扫描。
- v96部署前离线备份为`D:\GalleryRuntime\backups\v96-20260722-093842`，数据库SHA-256为`8318A3BD30A7F6C22EC2F786519F74911D812F7C6A3571843B8F141721BF0011`。
- 前端搜索为250ms防抖、旧请求Abort、请求序号防乱序、30秒同词缓存和2字符下限；搜索卡片继续只用懒加载WebP预览。
- 正式配置为`PHOTOS_DIR=E:\A_秀人`、`TRASH_DIR=E:\回收站`，来自`D:\GalleryRuntime\config\gallery.env`，两者同盘；正式回收将使用`File.Move`，跨盘copy-verify-delete仍仅作为不同卷配置的安全后备。
- 批准回收job仅为`20260714-232613-22183b82`。旧`/api/media-cleanup/delete`返回410；`/recycle`和`/restore`只允许localhost，不接受客户端路径。
- 回收产物位于`TRASH_DIR\media-cleanup\<jobId>`：`files`保留原相对结构，另有`manifest.ndjson`、`summary.json`、`recycle.log`。
- 设置导航包含收藏图册、观看历史、显示设置、图片查重、相似图片索引、媒体库清理、视频兼容性、访问日志和版本更新记录；视频兼容性路由为`#/__settings/video-compatibility`。
- 首页只保留轮播和正常图册列表，不再渲染收藏/最近观看，也不在启动时请求`/api/favorites`或`/api/recent`。收藏和最近写入API、SQLite`user_marks`及localStorage兜底保持不变。
- `gallery.db`新增幂等`access_logs`表和`idx_access_logs_time_id`索引；GET分页默认50、最大100，按`time DESC, id DESC`稳定排序。
- 启动时流式、每250条一批导入旧`access-YYYY-MM-DD.log`，内容哈希防重复，原文件保留。新访问只写SQLite。
- 访问日志按UTC ISO时间保留365天：启动时检查一次，之后每24小时检查；仅删除`time < cutoff`，失败记录诊断且不阻止服务，不执行`VACUUM`。
- 正式Runtime只读统计基线：4个旧访问日志文件、374条、151354字节，最早`2026-07-12T05:39:19.159Z`；近4日日均93.5条/37838.5字节，估算180天约6.8MB、365天约13.8MB。

## Validation

- 版本记录自动门禁通过；受控浏览器确认设置入口、最新项、页脚入口和中文无乱码，1280×720、820×1180、390×844均无页面级横向溢出。历史v99/v100/v101只显示已确认日期和“时分未记录”。

- pHash自动测试通过：`phash64-v1`固定8字节，缩略图距离2、重压缩距离0、不同图片距离30，BLOB往返和480/512 MiB阈值通过。
- 数据库副本10,000条净增868,352字节、WAL峰值906,432字节、integrity ok；全量486,028张预测约40.2 MiB，低于150 MiB目标。
- 真实只读样本100张、20组连拍、750个变体：目标能力到5%裁剪在距离≤10下600/750命中（未命中的150项为20%裁剪、镜像、旋转三类）；阈值≤10错误候选0，连拍≤10为1组。
- 48112原图精确命中、25%缩略图pHash命中距离0；PNG和通用MIME为200，伪装JPG为415；5次端到端平均456.4ms、最慢524ms，Node工作集未增长，临时残留0、stderr 0、浏览器控制台0。
- 正式迁移备份：`D:\GalleryRuntime\backups\phash-v101-formal-20260718-204822\gallery-before-v101.db`，2,060,144,640字节，SHA-256 `05D9877570927893028DE9EF3C4DE37274203A7681856907FB590EE9F42EA24D`，quick_check ok。建表净增8,192字节，未自动启动索引。
- 正式首批1,000张全部成功、0失败；完成后净增94,208字节、WAL/SHM为0，外推全量约43.7 MiB。随后手工启动受限10,000张批次，单worker继续后台运行；正式25%缩略图返回距离2的高度相似结果且绝对路径泄露0，上传临时残留0。
- 10,000张阶段曾在并发上传查询时于460条后因旧读路径争抢SQLite写锁退出，460条有效记录保留。修复为只读查询连接、10条短事务和持久错误后，正式并发查询+10条批次10/10通过；已按460+10+9,530恢复，阶段目标仍为10,000张且不会扩展为全库。

- 静态检查、`git diff --check`、8种排序/TEMP SQLite分页测试和TEMP哈希API测试通过；哈希测试覆盖双路径、改名、无命中、完整SHA-256、空/通用/冲突MIME、无扩展名、`filename*`、PNG/JPEG/WebP扩展名冲突、损坏PNG头、JPEG/PNG/WebP/GIF/AVIF、HEIC准确拒绝、伪装文件、空文件、413、上传中断、并发429与槽位释放和零临时目录。
- 正式7189图册完整内存排序耗时7.422–41.506ms；正式根目录API 8种模式为7.951–68.455ms，675个子目录的8种顺序均验证正确。`maleah`搜索相关性返回60条、模式FTS5/index ready，显式名称倒序60条顺序正确。
- 正式SHA索引单次SQL命中0.181ms；4,586字节真实图片改名上传后313ms返回1条正确路由且绝对路径泄露0。20次连续合成查询0失败，平均276.2ms，Node工作集由43,094,016降至41,152,512字节，未创建upload临时目录。
- 隔离浏览器在功能完成、版本标记递增前验证（当时页脚仍为v98）：1440×900、820×1180、390×844均无横向溢出；8项下拉可切换并刷新保留，搜索态显示`relevance`，上传入口和`accept=image/*`正确，控制台0 warning/error。随后前端只递增v99静态标记；iPad/iPhone为视口模拟，不代表实体设备。
- 正式原视频Range仍为206、`Accept-Ranges: bytes`且返回0–1023/221716；关键状态API均200，FTS5 ready。正式stderr为0字节，媒体根mtime未变化，数据库schema/媒体路径均未修改。
- v100通过正式脚本从Node PID 12052重启为26268，任务Host PID 13252、任务Running、唯一48102监听、loopback/LAN 200，`app.js?v=100`与`styles.css?v=100`一致。正式PNG、`application/octet-stream`、JPEG、WebP查询和扩展名冲突分类通过；数据库/WAL/SHM大小与媒体根mtime不变，上传临时目录不存在，浏览器控制台0 warning/error，未回滚。stop/start脚本总耗时22.181秒，不作为精确不可用时长。

- 正式全量扫描耗时约2093.8秒：2096条均有源文件；元数据阶段实测最多2个FFprobe、0个FFmpeg，662条疑似项进入采样，602通过、60失败，采样阶段最多1个FFmpeg。probe超时1、probe失败1；结束后所有探测/转码子进程为0。
- 正式增量扫描随后处理2096条、实际重扫0、跳过2096、采样0；运行时无FFprobe/FFmpeg。报告可解析，大小约3.35MB，临时文件为0。
- 正式扫描前后5个源视频的大小、mtime和SHA-256逐项一致；扫描没有写媒体、数据库或永久转码。
- 直接播放样本Range返回206并包含`Accept-Ranges`和正确`Content-Range`；直接/异常媒体请求兼容接口均返回409。fallback样本输出H.264/yuv420p 720×960与AAC，显式停止使FFmpeg从1降至0。
- v98目标图集在最终重启前的浏览器DOM确认40个可见视频保持按需加载，fallback卡片使用`/api/video-compatible?id=...`且显示结构化分类原因。最终重启后设置页状态/默认50条/筛选总数已由正式API验证；浏览器控制通道连接本机地址超时，未虚报重启后的设置页视觉验收。实体iPhone/iPad及不同设备对`device_dependent`项目仍未验证。
- `看球`页面41段视频共468942824字节；抽样前两段均为MP4+AAC、视频轨`mpeg4/mp4v`。首段Range为206，但Chrome为`readyState=4`且视频尺寸0×0。
- 隔离旧编码样本经兼容API输出H.264/AAC、320×240；目录外URL为400、无兼容缓存文件。正式兼容API输出H.264/yuv420p、720×960；显式停止后FFmpeg进程数由1降至0。

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
- v96启动补扫描从`2026-07-22T01:40:44.043Z`到`01:42:21.163Z`完成，`changed=false`、`skippedFullScan=true`，子进程退出且网站持续响应。
- 三个正式入口能力scope分别为local/trusted-lan/trusted-zerotier；错误确认400、不存在collectionId 409、恶意Origin 403、LAN Explorer 403。伪造`X-Forwarded-For`没有改变socket来源判定。
- 正式`collection_recycle_queue` API总数为0；没有标记、回收或移动任何真实图集。

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
- v96部署前必须备份正式`gallery.db`和`gallery.env`；首次打开会幂等创建维护状态与图集回收队列表，部署验收必须确认队列为空。
- v91正式部署验收没有创建正式manifest，也没有移动`E:\A_秀人`任何文件。实际回收仍必须由用户在localhost输入`MOVE`或“移入回收站”。
- 跨盘复制按附件要求校验文件大小和扫描mtime，不计算全文件哈希；未来若需要更强证明可增加可选SHA-256，但会增加约一轮磁盘读取。

- 实体iPad/iPhone、Disable cache/HAR和更长期内存趋势仍需人工补测；本次iPad/iPhone结果为对应浏览器视口模拟，20次小图查询只证明没有短期持续增长。
- 旧NDJSON原文件为升级安全而保留；它们已冻结、不再增长，但未来如需删除必须先确认备份/审计策略。
- 页码分页使用OFFSET；当前一年约3.4万条规模可接受，达到百万级或出现深页性能问题后再评估游标分页。
- 项目没有登录、角色权限或完整API鉴权；访问日志可能含IP和User-Agent，部署范围必须继续受控。

## Recommended Next Task

完成集成代码、唯一TEMP Runtime和四视口浏览器验收；仅在全部门禁通过后备份并正式发布，且不代替用户标记或移动真实图集。

## Notes for Next Codex Session

1. 严格按`AGENTS.md`顺序读取项目上下文。
2. 正式部署前不要用应用代码“只读打开”正式数据库；隔离测试继续使用唯一TEMP目录。
3. 正式旧NDJSON文件不得在本次升级时删除；迁移依靠`source_key`保持重复启动幂等。
4. 视频poster、`preload="none"`、按需加载和现有媒体清理边界均未改变。
5. FTS阶段A原始副本和JSON位于Git忽略的`tmp/fts5-prototype`；它们可重建且不应提交。正式Node PID为20976，端口仍为48102；pHash剩余9,530张受限批次可从设置页暂停或停止。
