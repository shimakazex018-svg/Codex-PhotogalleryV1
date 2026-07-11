# DECISIONS.md

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

有效，V1.4 runtime 待实施

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

有效，V1.4 runtime 待实施

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

有效，V1.4.2 已实施但尚未首次启动验收

## DEC-009：V1 不依赖旧项目 data

### Decision

V1 不直接挂载旧项目 `DATA_DIR`；数据库先复制、校验并提升到独立 runtime，旧项目保持只读回滚来源。

### Reason

直接写旧 data 会破坏备份边界，并使未来删除旧项目不可控。

### Impact

实施前必须停旧服务、检查 WAL/SHM、校验 SHA-256，并只对目标副本验证。

### Status

有效，待实施

## DEC-010：Git 历史与发布标签不可覆盖

### Decision

保持线性、职责清晰的提交；release tag 作为不可变回滚点；禁止 force push 和覆盖远程历史。

### Reason

项目迁移和清理阶段需要可追溯、可回滚。

### Impact

远程有未知历史时必须暂停；每个阶段独立提交并验证。

### Status

有效
