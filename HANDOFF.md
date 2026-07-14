# HANDOFF.md

本文件保持最新交接状态，不记录完整历史。历史见 `CHANGELOG.md`。

## Last Completed Task

将`codex/media-library-cleanup`以`--ff-only`快进到正式`main`，通过现有任务托管脚本精确重启正式网站并部署前端`v86`；随后从设置页对配置的`PHOTOS_DIR`完成一次正式只读扫描和结果页验收，全程未执行正式删除。

## Current State

- 正式`main`已部署并普通推送`v86`；功能Worktree和远程`codex/media-library-cleanup`继续保留，功能分支历史已完全进入`main`。
- 正式网站由任务计划程序Host托管，Node PID为`18852`，监听IPv4 `0.0.0.0:48102`；loopback和LAN均HTTP 200。
- 灯箱保留规范化URL任务键、P0当前原图独立通道、P1下一张提前decode、P3预测图延后、普通并发2、缓存5、Save-Data/网络降级、WebP即时占位和generation/render token防竞态。
- 媒体清理保留单PowerShell子进程、单任务互斥、停止、状态轮询、有界分页/搜索/分类/排序、报告绑定删除、显式确认、localhost/`ALLOW_REMOTE_DELETE`限制、ReparsePoint拒绝和自底向上真空目录清理。
- `render()`进入任何新页面前停止媒体清理轮询；hash路由仍统一调用`beginPageNavigation()`取消页面请求，灯箱关闭和路由切换继续停止旧图片任务。
- 媒体清理报告写入Runtime logs且不进入Git；正式扫描报告保留，正式删除从未执行。
- 最新正式只读扫描jobId `20260714-232613-22183b82`：482450文件、7288目录、472490图片、2109视频、7851非媒体（4204588435 bytes）、269空目录、132叶非媒体目录、5无媒体树、0字节媒体0、可疑小媒体2、错误0，耗时102.126秒；`incomplete=false`，删除文件/目录均为0。

## Validation

- 合并前正式v85：loopback和LAN首页HTTP 200；真实Chrome加载`app.js?v=85`与`styles.css?v=85`，灯箱打开/关闭正常，显示原图`fetchPriority=high`，默认无调试数据，控制台无warning/error。
- v86隔离媒体清理/API回归通过：重复启动409，停止为`stopped`且`incomplete=true`，错误确认400，LAN删除403，localhost只删除6个报告候选并清理3个真空目录；迟到文件与ReparsePoint目标保留，唯一TEMP测试目录最终`Test-Path=False`。
- v86真实Chrome隔离回归通过：12张测试图集先显示WebP占位再替换原图，当前图`fetchPriority=high`；连续前进到第8张、末张回首张、关闭清空src、重开第5张均无错图，控制台无warning/error。390x844灯箱和媒体清理页`scrollWidth<=innerWidth`。
- 正式v86部署验收：浏览器实际加载`app.js?v=86`和`styles.css?v=86`；首页、搜索、收藏/最近区、目录、灯箱当前原图高优先级与下一张、回顶和Back锚点恢复可用，控制台warning/error为0。视频保持poster和`preload="none"`，交互后才绑定源并完成解码准备。
- 正式设置页显示服务端根`E:\A_秀人`；390x844无页面级横向溢出。正式只读扫描期间首页200、图片Range 206、仅一个worker；完成后worker为0、删除为0。
- 正式结果页/API验证：7851条按50条分页，服务端pageSize上限200；Unknown 24、Archive 4、MetadataOrSidecar 3318、Document 4309；文件名/相对路径搜索、路径/大小排序、MediaFreeTree 5和错误0均通过。
- 语法、PowerShell解析、完整diff和Git同步状态在提交前完成最终复核。

## Known Issues

- Disable cache/HAR、Save-Data/慢网、亚秒级快速连点、长期内存和实体iPhone/iPad仍属于补充验收。
- 媒体清理报告尚无自动保留和容量告警策略；当前禁止自动删除报告。
- 结果深分页offset有50000条安全上限；更大集合应先使用分类或搜索缩小范围。
- 项目没有登录、角色权限或完整API鉴权；正式远程删除必须继续关闭。

## Recommended Next Task

人工审阅Unknown、Archive、最大体积候选、MetadataOrSidecar、Document、MediaFreeTree和SuspiciousTinyMedia；未取得下一轮单独授权前，不执行正式删除，也不清理正式报告或功能Worktree。

## Notes for Next Codex Session

1. 严格按`AGENTS.md`顺序读取项目上下文。
2. 正式代码和Runtime数据分离；测试根目录只能放在唯一TEMP目录。
3. 正式媒体只允许只读扫描；DELETE测试只能针对隔离报告和TEMP根目录。
4. 功能分支已完全进入正式main，但Worktree和远程分支仍保留；删除它们必须另行确认。
