# HANDOFF.md

本文件保持最新交接状态，不记录完整历史。历史见 `CHANGELOG.md`。

## Last Completed Task

在`codex/media-library-cleanup`功能分支以普通merge集成已发布的`origin/main` v85灯箱加载实现；同时保留媒体清理worker、API、设置页和安全删除边界，集成前端版本为`v86`。功能分支未合并回正式`main`。

## Current State

- 正式`main`已普通推送，本地与`origin/main`均为`d18a2f2`；正式网站继续运行`v85`。
- 当前开发分支为`codex/media-library-cleanup`，基于已推送的媒体清理提交并合并最新`origin/main`；目标版本`v86`。
- 灯箱保留规范化URL任务键、P0当前原图独立通道、P1下一张提前decode、P3预测图延后、普通并发2、缓存5、Save-Data/网络降级、WebP即时占位和generation/render token防竞态。
- 媒体清理保留单PowerShell子进程、单任务互斥、停止、状态轮询、有界分页/搜索/分类/排序、报告绑定删除、显式确认、localhost/`ALLOW_REMOTE_DELETE`限制、ReparsePoint拒绝和自底向上真空目录清理。
- `render()`进入任何新页面前停止媒体清理轮询；hash路由仍统一调用`beginPageNavigation()`取消页面请求，灯箱关闭和路由切换继续停止旧图片任务。
- 媒体清理报告写入Runtime logs且不进入Git；正式扫描报告保留，正式删除从未执行。
- 最新正式只读扫描jobId `20260714-224723-b04c608d`：482450文件、7288目录、472490图片、2109视频、7851非媒体（4204588435 bytes）、269空目录、5无媒体树、2可疑小媒体、0错误，耗时173.388秒；`incomplete=false`，删除文件/目录均为0。

## Validation

- 合并前正式v85：loopback和LAN首页HTTP 200；真实Chrome加载`app.js?v=85`与`styles.css?v=85`，灯箱打开/关闭正常，显示原图`fetchPriority=high`，默认无调试数据，控制台无warning/error。
- v86隔离媒体清理/API回归通过：重复启动409，停止为`stopped`且`incomplete=true`，错误确认400，LAN删除403，localhost只删除6个报告候选并清理3个真空目录；迟到文件与ReparsePoint目标保留，唯一TEMP测试目录最终`Test-Path=False`。
- v86真实Chrome隔离回归通过：12张测试图集先显示WebP占位再替换原图，当前图`fetchPriority=high`；连续前进到第8张、末张回首张、关闭清空src、重开第5张均无错图，控制台无warning/error。390x844灯箱和媒体清理页`scrollWidth<=innerWidth`。
- 正式只读扫描回归完成且零删除。正式站点仍是v85，因此没有在正式设置页加载v86扫描界面；隔离v86设置页与API已验证可显示状态、统计、筛选和分页结构。
- 语法、PowerShell解析、完整diff和Git同步状态在提交前完成最终复核。

## Known Issues

- Disable cache/HAR、Save-Data/慢网、亚秒级快速连点、长期内存和实体iPhone/iPad仍属于补充验收。
- 媒体清理报告尚无自动保留和容量告警策略；当前禁止自动删除报告。
- 结果深分页offset有50000条安全上限；更大集合应先使用分类或搜索缩小范围。
- 项目没有登录、角色权限或完整API鉴权；正式远程删除必须继续关闭。

## Recommended Next Task

先审阅正式只读扫描报告并补充v86人工验收；未取得单独授权前，不把功能分支合回`main`，不执行正式删除，不清理正式报告。

## Notes for Next Codex Session

1. 严格按`AGENTS.md`顺序读取项目上下文。
2. 正式代码和Runtime数据分离；测试根目录只能放在唯一TEMP目录。
3. 正式媒体只允许只读扫描；DELETE测试只能针对隔离报告和TEMP根目录。
4. 功能分支已推送，后续继续使用普通merge，禁止rebase/force push。
