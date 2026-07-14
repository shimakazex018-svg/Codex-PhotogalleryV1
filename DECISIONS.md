# DECISIONS.md

## DEC-017：灯箱使用有界、网络自适应的后向原图预加载

### Decision
灯箱先显示现有WebP预览，再加载当前原图；默认向后预加载3张图片，最大并发2，只有下一张尝试提前解码。缓存窗口固定为前一张、当前和后三张，最多5项；Save-Data禁用后向原图预加载，2G/3G分别降为1/2张。

### Reason
消除逐张点击后才开始下载原图的等待，同时控制超大图片解码内存、移动网络带宽和长会话Map增长。

### Impact
预加载只在灯箱打开期间作用于当前图片数组，不触发远程分页，不加载视频/HLS/其他目录。关闭或路由变化会停止新增任务并使generation失效；原图路径按钮和服务端缓存语义保持不变。

### Status
有效，前端`v81`实施。

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
