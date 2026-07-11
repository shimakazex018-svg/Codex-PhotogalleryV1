# Migration Manifest

| Source path | Destination path | Class | Status | Modified | Reason |
|---|---|---|---|---|---|
| `app.js` | `app.js` | A | migrated | no | 当前前端逻辑 |
| `index.html` | `index.html` | A | migrated | no | 当前页面入口 |
| `styles.css` | `styles.css` | A | migrated | no | 当前样式 |
| `server.js` | `server.js` | A | migrated | no | 当前服务/API/媒体入口 |
| `gallery-db.js` | `gallery-db.js` | A | migrated | no | SQLite schema 和访问层 |
| `duplicates-worker.js` | `duplicates-worker.js` | A | migrated | no | 查重后台入口 |
| `start-server-48101.cmd` | same | A | migrated | yes | 移除机器专属路径，安全默认值 |
| `start-site.cmd` | same | B | migrated | yes | 移除 Codex runtime 绝对路径 |
| `start-site.ps1` | same | B | migrated | yes | 移除 Codex runtime 绝对路径 |
| `fix-network-access-48101.cmd` | same | B | migrated | no | Windows 网络配置入口 |
| `fix-network-access-48101.ps1` | same | B | migrated | no | Windows 防火墙配置 |
| `make-hls.ps1` | same | B | migrated | no | HLS 生成工具 |
| `HLS-PREVIEW-NOTES.md` | same | B | migrated | no | HLS 说明 |
| `README-SERVER-WINDOWS.md` | same | B | migrated | no | 历史部署参考，可能过时 |
| `ROADMAP-GALLERY-UPGRADE.md` | same | C | migrated | no | 历史规划参考，不作为运行依据 |
| `SQLITE-INDEX-NOTES.md` | same | B | migrated | no | SQLite 迁移说明 |
| root `网页.md` | `网页.md` | A | migrated | yes | 保留旧审计并增加新项目基线说明 |
| source `.gitignore` | `.gitignore` | A | replaced | yes | 加强生产数据和缓存排除 |
| source `.git` | none | D | excluded | n/a | 不继承旧仓库历史 |
| source `data/` | empty `data/.gitkeep` | D | runtime excluded | n/a | 生产数据库、缓存、日志不入 Git |
| source `photos/` | empty `photos/.gitkeep` | D | runtime excluded | n/a | 用户媒体不入 Git |
| `server.out.log`, `server.err.log` | none | D | excluded | n/a | 运行日志 |
| `Codex-Photogallery-git` | none | D | excluded | n/a | 非当前运行来源 |
| `backups` | none | D | excluded | n/a | 历史备份 |

## Destination additions

- `.env.example`
- `.editorconfig`
- `.gitattributes`
- `README.md`
- `AGENTS.md`
- `docs/MIGRATION_SOURCE.md`
- `docs/MIGRATION_MANIFEST.md`
- empty `data/.gitkeep` and `photos/.gitkeep`

## V1.0.1 freeze audit

- 核心运行文件保持功能镜像提交内容不变。
- `data` 和 `photos` 只跟踪 `.gitkeep`。
- Git 不跟踪数据库、日志、缓存、缩略图、HLS、测试运行目录或用户媒体。
- `.env.example` 只记录非敏感示例，不会被应用自动加载。
- README、AGENTS、网页和本迁移记录共同定义迁移冻结基线。
- `v1.0-migration` 标签在 V1.0.1 文档提交后创建。
