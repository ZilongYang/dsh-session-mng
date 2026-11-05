# dsh-session-mng 0.2.3 发布检查清单

> 记录时间：2026-11-06。0.2.3 = **工作区归属自检 + 一键归位**：左侧栏只渲染工作区账本（`workspaceRegistry.sessionIds`）里的会话，账本漏登记时（症状：会话管理能看到、左侧栏看不到）点一个按钮把会话挂回 `cwd` 对应的账本。
> 本清单随实施回填；发版前需子龙确认。

## A. 实现

### Host（`lib/state.js` / `lib/catalog.js` / `lib/service.js` / `lib/api.js`）

- [x] `state.js`：`capabilitiesOf` 增加 `repair`（registry 有 `list`/`get` 即可，与 JSONL 后端解耦）；`canOf` 增加 `row.can.repair`（`membership === 'cwd'` 且 `kind !== 'subagent'`）；`pushRow` 产出 `membership: 'ledger' | 'cwd' | 'none'`。
- [x] `catalog.js`：`rowFromHeader` 接 `membership` 并在行上输出；`publicRow` 透传；`buildOverview` 增加 `totals.misplaced`；新增 `misplacedRows(catalog, limit)`（按 `maxBatch` 截断并标注 `truncated`）；`fromState` 慢路径透传。
- [x] `service.js`：
  - [x] `misplaced()`（`GET /misplaced`）：候选行（id/标题/cwd/所属工作区/归档/live/running/can），`count` 为全部候选数、`rows` 为 ≤`maxBatch` 的批次。
  - [x] `repair()`（`POST /repair`）：`normalizeIds` 限流 → 逐 id 校验（存在、非子代理、账本未登记、`cwd` 匹配工作区、目录 `status() === 'ok'`）→ `workspace.attachSession(id)` → 复核账本已登记 → `listedInHostList()` 检查宿主 `session.list` 是否已返回该会话；整批走 `withLock`，成功后失效读缓存；逐条返回 `{sessionId, ok, workspaceId, workspaceTitle, already?, listed?, error?}`。
  - [x] 错误码：`not-found` / `session-subagent` / `no-workspace-match` / `workspace-missing` / `repair-unverified` / `unsupported-host`。
- [x] `api.js`：新增 `POST /repair`、`GET /misplaced`（沿用既有围栏、body 上限与错误信封）。

### Client（`client.js`）

- [x] 数据层：`loadMisplaced()` 随 `/overview` 一起拉取；旧宿主无该路由时静默（横幅不出现，不影响原有功能）。
- [x] 页面：候选 > 0 时显示黄色横幅「发现 N 个会话的工作目录属于某个工作区…」+「一键归位」；按 `maxBatch` 分批提交；成功/部分失败/`listed === false` 三种提示分别呈现（`listed === false` 明确提示需要重启后再试）。
- [x] 行与详情：`membership === 'cwd'` 的行显示「未归位」徽标（含 tooltip 说明）；详情页同样徽标 + 「一键归位」按钮。
- [x] 错误码映射（`session-subagent` / `no-workspace-match` / `repair-unverified`）、中英 i18n 全部补齐。

### 元数据与文档

- [x] `package.json` 0.2.3；`dsh.compatibility` 不变（`>=0.2.0-rc.1 <0.3.0-0`）。
- [x] CHANGELOG 0.2.3（Added / Compatibility）；README 功能列表、请求流程图、当前状态、文档索引；ROADMAP；`docs/01-design.md` 宿主事实表 + 模块地图 + 路由表。
- [x] 本发布检查清单。

## B. 验证

- [x] `npm test`：**144 / 144 全绿**（新增 8 条：membership 分类、`overview.totals.misplaced`、repair 幂等、宿主列表缺失诚实上报、无匹配工作区、子代理拒绝、工作区目录缺失、未知 id；`/misplaced` 与 `POST /repair` 两条路由）。
- [x] `node --check index.js client.js lib/*.js test/*.js` 全过。
- [x] `npm --cache /tmp/dsh-npm-cache pack --dry-run`：47 个文件 / unpacked 1.1 MB / package 658.4 kB（含本清单）。
- [x] 实机验收（子龙，2026-11-06，桌面 App 重启后加载新宿主代码）：
  - [x] 根因复核：pi-web-desktop 账本 10 条，缺 `session-b62dc227-…`（红框那条 1022 KiB 的 bug 会话）与 `session-483113d7-…`（空会话）；左侧栏只按账本渲染，插件页按 `cwd` 兜底，故「右边有、左边没有」。
  - [x] 重启 App → 会话管理出现「发现 N 个会话…」横幅 + 「一键归位」按钮。
  - [x] 点「一键归位」→ 提示成功；**左侧栏当场出现该会话，即时生效、无需重启**（`attachSession` 写账本 → workspace feed 推送 → 侧栏按新 `sessionIds` 重新分组）。
  - [x] 账本核对（`~/.dsh/storages/workspace.json`）：pi-web-desktop `sessionIds` 10 → **12**（新增两条，`updatedAt` = 2026-11-05T18:39:28Z），空会话也一并归位。
  - [x] 「未归位」徽标复核：临时把空会话从账本摘掉（改前备份 `/tmp/workspace.json.bak-demo2-*`）→ 重启后横幅「发现 1 个」、勾选「显示空会话」可见徽标 → 子龙确认「看到了，可以」→ 点「一键归位」复原 12 条。

## C. 发布

- [x] Git：commit `8872297`，main push（`90aba6a..8872297`），tag `v0.2.3`（annotated），GitHub Release <https://github.com/ZilongYang/dsh-session-mng/releases/tag/v0.2.3>
- [x] `npm publish`：+ dsh-session-mng@0.2.3，47 个文件 / 658.4 kB（unpacked 1.1 MB），shasum `5dd0a79529ca0c61264f96e8d513adaf118582c5`；`npm view` 已确认 `latest = 0.2.3`（registry 异步处理，约 2 分钟后可读）。
- [x] 站点 `dsh.zlmix.com/session-mng/` 已更新到 0.2.3（站点仓库 commit `0f37da7`，发布备份 `/opt/1panel/www/sites/dsh.zlmix.com/backups/20261106-030011`；线上 `/`、`/session-mng/` 等 7 条路由 200，线上 `index.html` sha256 与本地一致 `b6c62f55…`，首页/session-mng 页面 `data-version` 均为 0.2.3；服务器自检 0 error / 3 warning（服务器无同级插件仓库，按设计跳过跨仓库核对））
- [x] README「当前状态」与 ROADMAP 标记已发布

## D. 已知口径

- 归位是**纯账本写**：`attachSession` 先校验 header `cwd`（realpath）与工作区目录一致、目录存在，再更新 `sessionIds`；**不改会话日志一个字节**，对 live / archived 会话都安全。
- 归位后若宿主自己的 `session.list` 仍不返回该会话，左侧栏要等**重启 DSH** 才会出现（UI 会明确提示，不假装成功）。
- 子代理会话由父会话的 catalog 管辖，永远不作为归位候选。
- 左侧栏「未分组」桶理论上会兜住「不在任何工作区」的会话；本次现象说明该会话在宿主列表里的呈现也受账本影响，最终以「账本 + 宿主列表」两者都正常为准。
- 改了 `client.js` 之后必须重启应用（boot 审计按文件 `rev` 校验），只刷新页面会让插件条目判成未激活。
