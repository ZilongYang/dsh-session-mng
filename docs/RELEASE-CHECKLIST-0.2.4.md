# dsh-session-mng 0.2.4 发布检查清单

> 记录时间：2026-11-15。0.2.4 = **消息口径修复**（标题/最近消息只认真实对话）+ **归档 × 工作树安全网**（DSH 0.2.2-rc.2 起的检出目录回收）。
> 本清单随实施回填；发版前需子龙本机验收。

## A. 实现

### Host

- [x] `lib/title.js`：新增 `isConversationalUserMessage(event)`（白名单 `user` / `agent-message` / 无 `source`）；`collectTurns(events, limits, {fallbackOnEmpty})` 过滤注入并支持标题侧兜底；`proposeTitle()` 传 `fallbackOnEmpty: true`。
- [x] `lib/service.js`：
  - [x] `preview()` 复用同一判定，响应新增 `skipped`（本次窗口内被隐藏的注入条数）。
  - [x] 新增 `worktrees(sessionIds)`（≤`maxBatch`），返回 `{supported, rows, totals}`。
  - [x] `unarchive()` 成功后附加 `worktrees`（仅 `supported` 时；检测失败不影响恢复）。
  - [x] 新配置 `worktreeScanMaxBytes`（默认 8 MB，clamp 64 KB–512 MB）。
- [x] `lib/worktrees.js`（新）：`creationOfEvent` / `creationsOfEvents` / `creationsOfProjection` / `detectWorktrees` / `worktreesSupported`；三层检测（live 投影 → 持久投影 → 日志扫描）；只统计 `owned: true`；超限与 fork 继承边界不可知均返回 `unknown`。
- [x] `lib/api.js`：新增 `POST /worktrees`。

### Client（`client.js`）

- [x] 预览面板：`skipped > 0` 时显示「已隐藏 {n} 条系统注入」。
- [x] `archiveRows()`：归档前拉一次 `/worktrees`（按 `maxBatch` 分批合并）；**仅当命中工作树或无法确认时**弹 `ArchiveScope` 确认框（列路径 + 分支 + `retainOnArchive` 指路 + 「仍然归档」）；其余情况保持一键归档；预览失败不阻断归档。
- [x] `restoreRows()`：恢复成功 toast 追加「曾创建 {n} 个工作树，检出目录已在归档时删除（分支保留）……恢复工作树」。
- [x] `WorktreeNote`：已归档会话详情页常驻同义提示（不支持/失败时不渲染）。
- [x] 中英文案全部补齐（10 个新 key；`zh` / `en` 同步）。

### 元数据与文档

- [x] `package.json` 0.2.4；`dsh.compatibility.dshReleases` 补 `0.2.2-rc.2` / `0.2.2-rc.3`。
- [x] CHANGELOG 0.2.4、README（功能/配置/兼容性/当前状态/文档索引）、ROADMAP、`docs/01-design.md`（模块与路由表）。
- [x] `docs/COMPAT-2026-11-15-dsh-0.2.2-rc.3.md`、`docs/PLAN-2026-11-15.md`、本清单。

## B. 验证

- [x] `npm test`：**164 / 164 全绿**（新增 20 条：注入过滤、空则兜底、老日志无 source、`agent-message` 保留、预览 `skipped`、工作树记录解析、投影 `owned` 过滤、live/冷/扫描三层、超限 unknown、fork 继承 unknown、无工作树服务、`/worktrees` 路由、`unarchive` 附带工作树）。
- [x] `node --check index.js client.js lib/*.js test/*.js`。
- [x] `npm pack --dry-run`：51 个文件 / 674.3 kB（unpacked 1.1 MB）。
- [x] 本机构建并安装到 profile（备份旧目录 `/tmp/dsh-session-mng-backup-0.2.3-20261115-160503`）；profile `package.json` 依赖已改为 `0.2.4`。
- [x] **实机验证（重启后，2026-11-15）**：
  - [x] 重启 App（16:28:35 启动 > 16:05 安装 → 加载新代码）。
  - [x] `POST /preview`：`skipped=7`，返回的 5 条全是真实对话（无一条 `<system-reminder>`）。
  - [ ] 生成标题：提案基于真实对话（未单独验证，口径与预览同源、已有单测覆盖）。
  - [x] `POST /worktrees`（0.2.4 新路由）：200，`supported:true`，`count:0`，`unknown:false` —— 日志扫描层正常，未命中时不弹框（代码路径由 164 测试覆盖）。
  - [ ] 归档一个**创建过**工作树的会话：弹出确认框并列出路径；取消 → 不归档。
  - [ ] （可选，需要真实工作树）确认归档后检出目录被删除、分支仍在；恢复后 toast 与详情页出现工作树提示。

## C. 发布（子龙验收通过后）

- [x] Git：commit `926875c`，push main（`2551279..926875c`），tag `v0.2.4`，GitHub Release <https://github.com/ZilongYang/dsh-session-mng/releases/tag/v0.2.4>
- [x] `npm publish`：+ dsh-session-mng@0.2.4，51 文件 / shasum `f3a3ef8654ef092f017734ee9698b41611355dd5`；registry 回读 `latest = 0.2.4`。
- [ ] 站点 `dsh.zlmix.com/session-mng/` 更新到 0.2.4（站点仓库已 commit `bd59ffb`、`check-site` 0 error，等子龙批准后 `publish.sh`）。
- [x] README「当前状态」与 ROADMAP 标记已发布。

## D. 已知口径

- **预览侧不兜底**：全是注入的会话会显示空态 + 「已隐藏 N 条」。**标题侧兜底**：过滤后无用户轮时退回旧口径，保证仍能出标题。
- `skipped` 只统计「为填满本次窗口而跳过」的注入条数，不是全会话的注入总量。
- 工作树检测**只读**：不删除、不恢复、不改 `retainOnArchive`；`owned: false`（fork 继承）不计入。
- `unknown` 出现于三种情况：日志超过 `worktreeScanMaxBytes`、fork 的继承边界不可知、宿主没有对应 seam——UI 明确写「未能确认」，不写「没有」。
- 宿主未挂工作树服务时 `supported: false`，客户端完全不弹框（与 0.2.3 行为一致）。
