# DECISIONS.md

## DEC-029：分叉正式功能线采用可追溯合并后快进main

### Decision
以包含v99至v102功能的`codex/fts5-integration-v96`为集成基线，在独立Worktree用`--no-ff`合入`origin/main`的v96新增功能；逐文件解决冲突并补齐统一管理授权、维护任务互斥和组合回归测试。发布前为两侧HEAD建立annotated archive标签，正式main只通过`--ff-only`接收已验证集成提交，不重写已发布历史。

### Reason
两条线各自包含不能丢失的正式功能，任何单边覆盖、rebase或强推都会破坏已发布历史或造成回退。独立集成Worktree、archive引用和祖先检查同时提供可审计性、回滚锚点与安全清理依据。

### Impact
集成提交保留双亲历史；所有管理型API统一受`adminAuthorizer`和维护任务互斥约束。正式媒体、回收目录和数据库不参与隔离测试，部署只执行幂等schema初始化。

### Status
有效；用于2026-07-22的v103收敛发布及后续同类多分支正式收敛。

## DEC-025：视频兼容性采用只读分层扫描与报告驱动播放

### Decision
只从SQLite `media.type='video'`枚举视频，先以最多2路FFprobe读取元数据，再只对设备依赖或需回退候选以1路FFmpeg在10%/50%/90%各解码1秒。分类规则集中为`direct_safe`、`device_dependent`、`fallback_required`、`invalid`并保存结构化原因码。增量扫描以媒体ID、大小和mtime fingerprint复用结果；报告原子写入Runtime，支持暂停、继续、停止和重启后只读恢复。兼容播放只接受数据库媒体ID，且仅允许报告标记`fallback_required`的项目进入单路无落盘H.264/AAC流。

### Reason
容器扩展名或图集名称不能可靠代表浏览器解码能力；逐个完整解码会长时间占用CPU和磁盘带宽。分层扫描在覆盖旧mp4v、HEVC、高位深、异常文件的同时限制并发和采样时长，媒体ID反查也避免客户端提交文件路径。

### Impact
正式2,096条视频的首次扫描约34.9分钟；元数据阶段最多2个FFprobe，采样阶段最多1个FFmpeg，不生成转码文件。扫描报告约3.35MB并随视频数量增长；当前分页API不会一次发送完整报告。设备依赖分类仍需实体设备验证，且兼容流不提供持久缓存或完整seek语义。

### Status
有效，取代DEC-024的路径特例。v98正式全量结果为1432/267/395/2，随后增量扫描跳过全部2096条；源视频抽样哈希、大小和mtime均未变化。

## DEC-024：旧mp4v视频采用路径限定的单路无落盘兼容流

### Decision
`利世/.../看球`中浏览器不支持的MPEG-4 Part 2视频仅在用户点击后由FFmpeg输出H.264/AAC fragmented MP4。服务端严格限定源目录、同时只保留最新一条流、最大边960且30fps；暂停、切换、离页或连接关闭时终止子进程。不修改原媒体、不批量转码、不写兼容缓存。

### Reason
Range、MP4容器和AAC均正常，但Chrome无法解码`mpeg4/mp4v`视频轨。批量转码或持久缓存会增加约447MiB源集合对应的CPU、磁盘和生命周期风险；HLS还需要额外播放器与缓存管理。

### Impact
该图集播放时会占用服务器CPU和实时带宽，暂停后重新播放从头开始且不保证拖动定位；其他图集继续使用原始Range。若旧编码视频范围扩大，应另行设计有容量上限的后台转码队列，而不是扩大路径特例。

### Status
已由DEC-025取代；保留为v97历史。兼容流的单路、无落盘、边长限制和显式停止边界继续沿用，但触发条件已从图集路径改为扫描报告中的媒体ID分类。

## DEC-023：FTS5使用显式迁移、严格模式与安全降级

### Decision
v96通过`SEARCH_BACKEND_MODE=auto|fts5|legacy-like`选择后端。auto只有索引ready才用FTS，其他状态仅允许图集与两字符媒体标题精确/前缀；fts5不可用时明确返回unavailable；legacy必须人工显式启用。正式结构、规范化和查询复用DEC-022；迁移默认2000条事务批次并维护`not_created/building/ready/stale/error`状态，启动不自动build。

### Reason
完整媒体LIKE在稀疏和无结果词仍约2.3至2.6秒，不能作为索引故障的静默回退。mapping和独立FTS可以稳定增删改；最小状态记录使服务在部分迁移或文件系统不确定时安全降级。

### Impact
所有搜索字段变更需要同步media/mapping/FTS事务；文件移动与SQLite不能成为同一ACID事务，失败记录错误、标记stale并依赖手工重新扫描恢复。迁移必须显式路径、SQLite backup、integrity和一致性校验；不提供自动rebuild、DROP、影子切换或补偿事务。

### Status
已于2026-07-16完成正式一致性备份、474470行迁移、完整校验并以`auto`部署；生产级扩展和Chrome自动验收不再作为项目待办或部署门槛。

## DEC-022：FTS5正式候选使用稳定映射与独立trigram索引

### Decision
第二阶段B如获授权，媒体三字以上搜索使用`media_search_documents(fts_rowid INTEGER PRIMARY KEY, media_id TEXT UNIQUE)`加独立内部内容FTS5表，FTS字段仅为`title`和去固定`/photos/`、统一分隔符并安全URL解码的`relative_src`。查询按标题MATCH、路径MATCH共享最多61个rowid，再经mapping和`media.id`主键回表。1字不搜媒体；2字由新增`idx_media_title_nocase`做标题精确/前缀；3字以上才启用trigram。阶段A只定型，不创建正式表。

### Reason
完整474470行副本显示`file_name`100%为空、`src`100%带`/photos/`且使用URL编码。直接外部内容表需要依赖不稳定的隐藏`media.rowid`且难以可信审计；把TEXT media_id只存为FTS UNINDEXED列又无法高效更新/删除。稳定mapping只比无映射解码表增加约25.2MiB，却提供O(log n)定位和三层一致性检查。最终FTS候选增量约271.1MiB；两字NOCASE索引逻辑大小约6.8MiB；稀疏/无结果最新原型总时间约34/27ms。

### Impact
第二阶段B必须先备份和实现显式迁移、三表一致性命令、扫描/删除/移动事务同步及LIKE回滚，再切正式API。用户输入只作为双引号phrase组成固定列MATCH并整体参数化；不得用FTS LIKE短词后备。网站启动不得自动全量rebuild，bigram仍不进入正式结构。

### Status
阶段A定型有效；仅完整副本和隔离脚本验证，正式数据库、API、扫描器、前端版本和部署均未修改。
## DEC-029：Windows图集回收采用Node流登记与有界持久重试

### Decision
所有由`sendFile()`提供的图片、原图、poster、HLS和视频Range响应统一登记进程内媒体流，并在HTTP响应`finish/close/error`时幂等销毁和移除。图集rename遇到`EPERM/EBUSY`进入`retry-waiting`，每5分钟重试，最多12次；计数、下次时间和最近错误写入SQLite，完整尝试详情追加到运行日志。管理员强制重试只销毁目标图集下由当前Node登记的流，并在rename完成前短暂阻止该目录新流，不调用外部句柄工具、不终止进程。

### Reason
Windows不允许移动仍含开放文件句柄的目录；浏览器断网或取消请求时只依赖pipe默认行为可能延迟释放句柄。内存登记足以诊断和释放本服务自身流，持久有界重试可跨重启恢复且不会无限占用CPU或磁盘。

### Status
有效；隔离测试通过，正式Runtime尚未重启，正式数据库尚未执行三列幂等迁移。

## DEC-028：末级图集使用持久延迟回收队列

### Decision
仅服务端复核为非根、无ReparsePoint、无子目录、至少一个文件且全部为标准媒体的图集可标记；`eligibleAt=markedAt+60分钟`，`scheduledAt`为其后的第一个整点。执行时再次复核，同盘目录rename到`TRASH_DIR`相同相对路径，冲突追加短ID且绝不覆盖。

### Status
有效，v96实施；没有自动标记或移动正式图集。

## DEC-027：每日04:00由Node协调回收后异步扫描

### Decision
复用`startScanTask()`子进程，每日按本地时间重新计算触发；`maintenance_state`保证已完成日期不重复，繁忙时记录并10分钟后重试。04:00与整点重合时先完成到期回收批次，再启动一次索引扫描。

### Status
有效，v96实施。

## DEC-026：管理写权限统一为socket CIDR加Origin

### Decision
localhost始终是`local`；启用远程管理后，只有`request.socket.remoteAddress`命中显式标记的LAN/ZeroTier CIDR且Origin允许时才获得管理写能力。`X-Forwarded-For`仅可用于旧日志显示，绝不参与授权；Explorer保持local-only。

### Status
有效，v96实施。

## DEC-021：搜索先做有界分段查询并保留FTS5为独立阶段

### Decision
`/api/search`使用图集精确、前缀、包含和媒体包含的分段查询，共享默认50/最大60条预算，以`LIMIT 61`判断更多结果；精确或前缀图集命中时优先返回图集且不扫描媒体。新增`idx_collections_title_nocase`，不为`LIKE '%query%'`盲目增加媒体B-tree索引。前端使用250ms防抖、AbortController、请求序号、30秒同词缓存和2字符下限。

### Reason
正式7287个图集、474470条媒体的原查询实测同时出现`SCAN media`和排序临时B-tree，API约6至16.7秒。B-tree能稳定加速图集精确/前缀，但不能加速任意中间子串；先限制结果、字段和排序可大幅降低常见搜索成本而不引入新搜索系统。

### Impact
精确/前缀图集和高频早停媒体搜索显著加快；稀疏文件名和无结果搜索仍可能完整扫描媒体，隔离副本约2.3秒。开发态结构化计时默认关闭。FTS5只有在剩余瓶颈必须继续优化时才进入独立评审和迁移阶段。

### Status
有效，前端`v95`实施；正式数据库未修改或重启部署，真实数据副本SQL/API与隔离浏览器验证通过。

## DEC-020：媒体清理只进入项目回收站并以manifest恢复

### Decision
媒体清理不再永久删除非媒体候选。写操作只接受localhost与服务端批准的完整零错误job；同盘使用不覆盖rename，跨盘使用单并发copy到`.partial`、关闭并校验大小、原子改名、复核后才删除源文件。每项结果追加到`TRASH_DIR/media-cleanup/<jobId>/manifest.ndjson`，并支持不覆盖原位置的恢复。旧`/api/media-cleanup/delete`固定返回410。

### Reason
v86的`File.Delete`无法恢复，且正式`PHOTOS_DIR`与`TRASH_DIR`跨盘，简单rename会失败。扫描后文件变化、复制中断、目标冲突和重复提交都需要可审计、可续跑的状态模型。

### Impact
回收前实时检查目标盘容量并逐项复核路径、ReparsePoint、大小、mtime和媒体扩展名。目标冲突使用`.__recycle_<shortID>`，不覆盖；恢复冲突记录`RestoreConflict`。浏览器只读取聚合状态和分页扫描结果，不加载完整manifest。`ALLOW_REMOTE_DELETE=0`保持不变；v96起recycle/restore由DEC-022统一管理写权限替代localhost特判。

### Status
有效，前端`v91`实施；隔离同盘、强制跨盘、故障注入、幂等、API边界和恢复测试通过，正式媒体尚未移动。

## DEC-019：访问日志迁入现有SQLite并保留365天

### Decision
新访问记录写入`gallery.db`的`access_logs`表，GET接口使用`COUNT + LIMIT/OFFSET`页码分页并以`time DESC, id DESC`稳定排序。旧`access-YYYY-MM-DD.log`按内容哈希流式幂等导入且保留原文件。清理统一按UTC ISO时间，启动时执行一次、之后每24小时执行一次，默认保留365天且不自动`VACUUM`。

### Reason
正式Runtime现有374条、151354字节，近4日日均约93.5条/37838字节；按当前速度一年约34128条/13.8MB，365天对SQLite很小。继续对NDJSON整文件读取无法提供真正服务端分页，且旧14天通用`.log`清理会混用不同日志语义。

### Impact
新增幂等`access_logs`表和`idx_access_logs_time_id`索引；`/api/access-log`默认50条、最大100条并返回`items/page/pageSize/total/totalPages`。历史文件不删除，新访问日志不再追加NDJSON。

### Status
有效，前端`v88`实施；隔离边界、迁移、分页、索引、POST和保留清理测试通过，正式Node后端尚未重启部署。

## DEC-018：媒体库清理使用独立单线程报告 worker

### Decision
媒体清理不复用 SQLite 索引扫描，也不修改数据库 schema。Node 只负责单任务生命周期、API 和有界分页；PowerShell 单线程枚举 `PHOTOS_DIR` 元数据并把报告直接写入现有 `DATA_DIR/logs`。原v86删除只接受当前 completed `jobId` 和确认文本；该永久删除语义已由DEC-020替代。

### Reason
47 万对象不能同步阻塞 Node、一次性进入 Node/浏览器内存或触发媒体解码/哈希；独立进程能在完成、停止和失败后释放 CPU/句柄，同时把误删边界固定在服务端。

### Impact
新增正式 PowerShell worker、设置页和 `/api/media-cleanup/*`。报告会占用 Runtime logs 容量，后续需要根据真实扫描体积确定保留策略；第一阶段正式验收只读扫描，不删除。

### Status
部分被DEC-020替代；独立单线程扫描与有界报告架构继续有效，永久删除语义废弃。

## DEC-017：灯箱使用有界预加载和独立P0当前图通道

### Decision
以规范化原图URL作为任务唯一键，记录完整加载/解码状态并复用网络与解码Promise。当前原图通过独立P0立即通道以`fetchPriority=high`加载，不受普通预加载并发占用；下一张为P1且预先解码，第二/第三张为P3并延后调度。卡片WebP预览立即显示，视口外缩略图保持低优先级懒加载。

### Reason
旧实现把当前图与后向预测图放在同一FIFO并发队列，显示元素也没有明确高优先级；加载状态样式还会隐藏占位预览，导致大量缩略图或预测任务存在时出现空白和等待。

### Impact
默认向后准备3张；下一张为P1并提前解码，第二/第三张为P3延后调度。普通预加载最大并发2、缓存最多5项，并保留Save-Data/2G/3G降级；关闭或跨图集停止旧任务。调试日志默认关闭且有界。服务端缓存、API、数据库、视频/HLS和视觉布局不变。

### Status
有效；前端`v85`实施并集成到`v86`功能分支。真实Chrome已完成请求顺序、复用、连续切换和关闭任务专项验收；Disable cache/HAR、亚秒级快速连点、节流和长期内存趋势仍待补。

## DEC-016：SPA滚动恢复采用有界锚点快照

### Decision
使用`history.scrollRestoration=manual`，在内存和`sessionStorage`中最多保存75条路由快照。优先按稳定元素锚点与相对视口偏移恢复；深层媒体只补齐已保存的现有分页/DOM批次，并限制加载预算为2.5秒。

### Reason
单独保存scrollY无法抵抗异步图片高度和分批DOM变化；一次性加载整个图集又会放大网络、DOM和内存压力。

### Impact
目录、搜索、收藏、最近观看和媒体节点提供稳定`data-scroll-anchor`。搜索词随History entry保存，使详情返回和刷新能够恢复搜索上下文；损坏或不可用的sessionStorage安全降级为内存或scrollY恢复。

### Status
有效，前端`v79`实施并通过真实Chrome桌面/移动回归。

## DEC-015：列表图片使用独立按需预览

### Decision
保持旧thumbnail生成关闭；列表统一请求版本化WebP预览。预览只按访问生成，单进程并发1，失败不回退原图，不自动删除缓存。

### Reason
避免全库任务和thumbnail URL静默传输原图，同时保持原媒体与SQLite schema不变。

### Impact
新增`IMAGE_PREVIEW_DIR`和预览API；未来需补容量门限、dry-run和多进程锁。

### Status
有效，V2.0.1实施。

本文件记录长期有效或明确废弃的技术决策，不记录普通修复过程。

## DEC-001：代码与运行数据分离

### Decision

Git 只管理源代码、非敏感配置模板、脚本和文档；数据库、媒体、缩略图、poster、HLS、日志和 cache 全部作为外部运行数据。

### Reason

运行数据体积大、持续变化、可能含隐私并与机器路径绑定。

### Impact

迁移、备份、恢复和部署必须单独处理代码与数据；`.gitignore` 必须持续覆盖运行数据。

### Status

有效

## DEC-002：原始媒体保持外部路径

### Decision

原始照片/视频不复制到代码仓库；V1.4 接管时保持现有媒体物理位置，通过 `PHOTOS_DIR` 挂载。

### Reason

避免复制大型媒体、路径变化、重复存储和缓存/索引失配。

### Impact

运行账户必须具备媒体读取权限；删除类操作默认关闭；媒体盘需要独立备份。

### Status

有效，V1.4.3已验证现有媒体路径只读挂载

## DEC-003：SQLite 是当前唯一主索引

### Decision

使用 Node 内置 `node:sqlite` 和 `gallery.db` 作为主数据源；旧 `gallery.json` 不用于正常浏览或恢复。

### Reason

按需查询避免前端一次加载完整大型 JSON，并支持索引、用户标记和查重数据。

### Impact

必须保护/备份 `gallery.db`；旧 `/api/gallery`、`/api/refresh` 保持 410 兼容响应。

### Status

有效

## DEC-004：保持原生 Web/Node 技术栈

### Decision

当前继续使用原生 HTML、CSS、JavaScript、Node HTTP 和直接 SQLite，不引入前端框架、ORM 或构建系统。

### Reason

现有功能成熟、无第三方运行依赖，替换技术栈会扩大迁移和回归风险。

### Impact

维护应优先局部修改；引入新依赖或框架必须单独决策。

### Status

有效

## DEC-005：媒体采用按需加载

### Decision

列表优先缩略图和懒加载；视频保留 poster，默认 `preload="none"` 或 `metadata`，用户触发后才加载大视频。

### Reason

控制首屏时间、带宽、浏览器内存、DOM 数量、移动端发热和耗电。

### Impact

任何 UI/媒体修改都必须保留按需加载和播放器数量控制。

### Status

有效

## DEC-006：生成媒体可重建且不迁移到 Git

### Decision

缩略图、video poster、轮播和 HLS 属于衍生数据，可按需重建，不进入 Git。V1.4 新 runtime 不迁移旧缩略图/poster/HLS。

### Reason

减少历史垃圾、路径绑定和仓库体积，建立新 runtime 自己的缓存生命周期。

### Impact

重建必须分阶段、有界并发并监控磁盘/CPU；不能启动后无控制全量生成。

### Status

有效，V1.4.4已建立Runtime小批量缓存生命周期

## DEC-007：远程删除默认关闭

### Decision

`ALLOW_REMOTE_DELETE` 默认并在首次 runtime 恢复阶段保持 `0`。

### Reason

项目没有完整鉴权，远程删除会直接移动真实媒体。

### Impact

删除测试只能使用隔离文件；未来启用必须有独立安全评审。

### Status

有效

## DEC-008：V1.4 使用独立 runtime 和配置化端口

### Decision

正式 V1 runtime 位于代码仓库外；端口和所有路径由外部配置提供；目标端口为 `48102`。

### Reason

让 V1 完全独立于旧项目，支持未来删除旧项目，并消除脚本中的机器绑定。

### Impact

安全 env 加载启动器、数据库副本和 48102 网络脚本已经实现。当前代码的无配置默认端口仍为 `48101`；只有新启动器注入配置时才使用 `48102`。

### Status

有效，V1.4.3 首次真实只读启动验收已通过

## DEC-009：V1 不依赖旧项目 data

### Decision

V1 不直接挂载旧项目 `DATA_DIR`；数据库先复制、校验并提升到独立 runtime，旧项目保持只读回滚来源。

### Reason

直接写旧 data 会破坏备份边界，并使未来删除旧项目不可控。

### Impact

实施前必须停旧服务、检查 WAL/SHM、校验 SHA-256，并只对目标副本验证。

### Status

有效，V1.4.2已完成数据库复制和哈希校验

## DEC-010：Git 历史与发布标签不可覆盖

### Decision

保持线性、职责清晰的提交；release tag 作为不可变回滚点；禁止 force push 和覆盖远程历史。

### Reason

项目迁移和清理阶段需要可追溯、可回滚。

### Impact

远程有未知历史时必须暂停；每个阶段独立提交并验证。

### Status

有效

## DEC-011：Runtime是唯一衍生缓存来源

### Decision

图片缩略图、视频poster和HLS只写入独立Runtime；不迁移或回退到旧项目缓存。缓存生成必须有界、可暂停、可恢复并记录日志。

### Reason

避免新项目对旧目录形成隐式依赖，并控制FFmpeg任务的CPU、磁盘I/O和容量增长。

### Impact

当前只允许小批量样本和按需生成。全量图片清单、分页游标、容量门限和HLS预算必须另行实现并授权。

### Status

有效；V1.4.4小批量工具已验证，全量任务未授权

## DEC-012：短期使用原图并延后HLS自动化

### Decision

短期不主动生成图片缩略图，缺失缓存时直接返回原图；poster保持按需生成。HLS自动生成和清理只形成设计，现有视频继续使用Range播放。

### Reason

照片仍在整理，提前生成47万图片缩略图浪费CPU、I/O和空间；同步HLS生成会阻塞播放且浏览器兼容性未评审。

### Impact

Runtime设置`ENABLE_IMAGE_THUMBNAIL_GENERATION=0`和`HLS_CACHE_EXPIRE_DAYS=7`。HLS删除必须等待显式访问manifest和dry-run定时任务。

### Status

有效，V1.4.5图片策略已实施；HLS自动化待V1.5以后单独授权

## DEC-013：Windows自动启动先设计后启用

### Decision

V1.5优先使用维护用户登录后延迟30秒的任务计划程序方案，但未完成备份演练、管理员防火墙和人工浏览器验收前不创建任务。

### Reason

Node位于用户目录，SYSTEM上下文和系统启动阶段可能无法访问Node、媒体盘或ZeroTier；先手工稳定运行更容易回滚。

### Impact

自动启动计划记录于`V1.5_AUTOSTART_PLAN.md`。创建、禁用或删除计划任务均需用户单独授权。

### Status

有效，当前用户登录任务已安装并完成手工触发验证

## DEC-014：任务计划程序是Windows唯一运行宿主

### Decision

手工CMD和登录启动都只触发`Codex-PhotogalleryV1-Autostart`；任务使用`-NonInteractive -WindowStyle Hidden`执行`run-gallery-host.ps1`，并在Node存活期间保持Running。Node子进程也显式隐藏窗口。

### Reason

临时CMD/PowerShell派生Node缺少稳定生命周期边界，关闭控制台或用户会话清理可能导致网站退出。

### Impact

stop/status必须同时核对任务、host、Node PID、Node父PID和48102监听PID；任务ExecutionTimeLimit为0，重复实例策略为IgnoreNew。

### Status

有效，启动CMD自动退出、手工关闭启动CMD、重复启动和精确停止验收均已通过

## DEC-015：统一自然排序并复用原始字节SHA-256查找

### Decision

图册只使用`name_asc/name_desc/image_count_asc/image_count_desc/video_count_asc/video_count_desc/updated_asc/updated_desc`八种公共枚举；名称使用中文数字自然排序，空值末尾，名称与相对路径作为稳定次级条件。搜索结果保留`relevance`专用默认值。上传查找复用`media_hashes.sha256`的原始文件字节算法和既有索引，不引入感知哈希。

### Reason

旧实现按页面分成两套枚举且在首页分页后排序，搜索和收藏部分路径并未真正执行所选模式。现有查重数据库已提供兼容的SHA-256和索引，无需第二套算法、全库逐条比较或数据库迁移。

### Impact

`gallery-sort.js`成为前后端唯一排序规则源。上传API单并发、200 MiB、流式哈希、不落盘；文件签名是格式主判据，浏览器MIME仅作辅助，MIME冲突但签名明确属于支持格式时按真实格式查询，扩展名冲突则返回声明格式与真实格式。精确字节变化（含元数据变化、重新压缩、改格式）不会命中。哈希覆盖不足时UI必须限定为“已建立哈希的图片”。

### Status

有效，自v99起实施

## DEC-016：SHA-256与紧凑64位pHash双层图片查找

**状态：** 有效，自v101起实施。

SHA-256继续作为“文件字节完全相同”的唯一依据；pHash仅表示视觉相似。pHash v1固定为FFmpeg首帧解码、Lanczos 32x32灰度、二维DCT低频8x8、除DC外中位数阈值和大端8字节BLOB。高度相似为距离0-6，可能相似为7-10；展示百分比`(1-distance/64)*100`不代表统计置信度。

为满足512 MiB硬限制，不建立无法保证召回的4x16桶，也不建立至少11段所需的数百万桶行。v101在独立查询进程中顺序读取`media_id+hash64`，主线程不遍历48万行；若未来实测查询规模成为瓶颈，再用受空间测量约束的多索引方案替换。索引不随启动自动执行，默认单worker且支持暂停、继续、停止和size/mtime增量更新。
## 2026-07-18：正式网页版本使用发布完成时分和单一更新记录源

**状态：** 有效，自 v102 起实施。

正式版本统一为`v<递增版本号>-YYYYMMDD-HHmm`，时间使用正式发布完成时的`Asia/Shanghai`时分。`app.js`版本常量、`index.html`全部静态资源缓存参数和`release-notes.json`第一项必须一致；网页更新记录只从该JSON读取，历史未知时分不得补造。具体发布门禁见`docs/RELEASE_VERSIONING.md`。
