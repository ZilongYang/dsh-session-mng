# dsh-session-mng 0.2.0 发布检查清单

> 记录时间：2026-10-29。0.2.0 = Host 侧 overview + 分页 sessions（1000–10000 条会话）+ 客户端两段式加载。
> 计划：[PLAN-2026-10-29.md](PLAN-2026-10-29.md)。本清单随实施回填；发版前需子龙确认。

## A. 实现

### Host（`lib/`）

- [x] 新 `lib/catalog.js`：零会话日志 IO 的 catalog（`workspaceRegistry.headers` ∪ `ctx.sessions.list()` + `sessionProjectionCache` / `sessionProjections` 的 title/blank/lastPromptAt + archived/pinned + workspace ledger；`classifySession` 复用；全域 parentTitle/parentPresent/forkCount；`deletedIds` / `titleOverrides`；慢路径 `createLegacyCatalogCache` 30 s TTL）。
- [x] `GET /overview?subagents=0|1`：只有工作区计数/归档/空会话、totals、orphans、capabilities、limits，无会话行。
- [x] `GET /sessions?workspaceId=&tab=&query=&sort=&offset=&limit=&subagents=&blank=&sizes=`：branch-aware 排序 + `id` tie-break + offset 分页（`limit ≤ pageLimitMax`）；`parentStub` / `branchDepth`；页内 size 用 locate 推目录 + readdir 选最高代 + stat（≤50 条，不触发全库扫描）。
- [x] `GET /search?query=&…&limitPerGroup=`：跨工作区标题/路径/id/父标题搜索，每命中组一页 + total。
- [x] `GET /session?id=`：详情单行（size/formatStatus/can/parentStub）。
- [x] `GET /blanks`：空会话三组 id 列表（unarchived/archived/deletable）。
- [x] `GET /sizes?workspaceId=all|ungrouped|<id>&subagents=0|1`：一次 `sessionPersistence.list()` + 60 s 进程内 TTL；**只聚合 catalog 可见行**（与 `buildState.totals.bytes` 对齐）；写操作与 `subagents` 开关切换失效。
- [x] `POST` 写操作的缓存失效与 `deletedIds` / `titleOverrides` 记账；`GET /state` 原样保留。
- [x] 配置项 `pageLimitMax` / `sizesTtlMs` / `sizeScanMax`（均 clamp）。

### Client（`client.js`）

- [x] 首屏 `/overview` → 展开工作区取第一页 → 加载更多 offset 追加；pages/rowCache；scopeKey 失效；并发上限 3；`/overview` 404 一次性回退 `/state`。
- [x] 计数/tabs/hiddenBlank/hiddenSubagents/orphan/空会话按钮改读 overview 与 `/blanks`；limits/workspaces 来自 overview。
- [x] 搜索：输入防抖 250 ms → `/search`；命中组自动展开；搜索期间锁定折叠。
- [x] 选择：只允许已加载且展开行；scope 变化清空；全选仅已加载可见集 + `partialSelection` 提示；批量提交前过滤 rowCache 外的 id。
- [x] 分支跨页：`branchDepth` 缩进 / `parentStub` 的「来自」/ `parentPresent:false` 的「已不存在」/ `parentNotLoaded` 兜底。
- [x] 详情：rowCache 秒开 + `/session` 补齐；不再因刷新清空；`DetailView` 入参 `{overview, limits, row}`。
- [x] 刷新：`refresh()` 只重取 overview + 已加载深度；focus 只静默刷 overview；老 Host 回退保留每组 50 条本地分页。
- [x] 排序 `id` tie-break 与 `sort` 依赖修复；中英 i18n 各新增文案。

## B. 验证

- [x] `npm test`：**129 / 129 全绿**（Host 72：api 13、catalog 9、overview 4、sessions-page 16、search-blanks-sizes 9、service 8、state 2、store-jsonl 5、title 6；客户端 vm 57）。
- [x] `node --check index.js client.js lib/*.js test/*.js` 全部通过。
- [x] 10k 合成基准（fake ctx，10k 会话 / 6 工作区，5 次均值）：`/overview` **9.5 ms / 1338 B**、`/sessions` 单页 **8.8 ms / 50 行 / 25.3 KB**；`persistence.list`、`sessionController.list`、批量 `readTitleSnapshots` 调用数均为 **0**。
- [x] `npm --cache /tmp/dsh-npm-cache pack --dry-run`：41 个文件 / 628.2 kB（unpacked 978.2 kB）。
- [x] 老 Host 回退、`sizes-pending` 降级、搜索组级过滤、legacy 分页均有单测/harness 覆盖。
- [x] **真实数据离线校验（用本机 241 条 header / 13 工作区 / 409 条投影缓存构造 fake host，调用真实 service）**：
  - `overview.source=catalog`，`totals.all=108` + `hiddenSubagents=133` = 241 条 header；无 `rows/sessions` 字段；`persistence.list` / `sessionController.list` / 批量 `readTitleSnapshots` 调用 **0**。
  - 最大工作区页：`total=54`、本页 50 行、`hasMore=true`、50/50 行有大小、44 行有标题（6 行走 pending，真机由 2s 兜底补齐）；全程 0 次 O(n) 调用。
  - `/search`：14 个命中组（13 工作区 + ungrouped）、total 81；`/blanks` 与投影缓存真值一致。
  - `/sizes`：`subagents=0` → 66,169,650 B / 108 行；`subagents=1` → 83,384,681 B / 241 行，均与独立计算的 Σ 完全一致，仅 1 次 `persistence.list()`。
  - 脚本在 `/tmp/verify-real-catalog.mjs`（只读，不落仓库）。
- [x] **HTTP 级真实数据验收（真实 `createApiHandler` + fake host(241 header/13 工作区/409 投影缓存) + 真实 HTTP 请求）**：
  - `GET /overview?subagents=0`：200 / 3.9 ms / 3.2 KB，`totals.all=108`、`hiddenSubagents=133`，无 `sessions/rows` 字段。
  - `GET /sessions?workspaceId=<最大>&limit=50&sizes=1`：200 / 4.4 ms / 31.5 KB，50 行、`total=54`、`hasMore=true`、`titlesPending=6`；`offset=50` 返回剩余 4 行、`hasMore=false`。
  - `GET /sessions?workspaceId=all` → 404 `workspace-not-found`；缺 `workspaceId` → 400 `bad-request`（与客户端「按组取页」契约一致）。
  - `GET /search?query=session`：200 / 53 KB / 14 组 / total 81；空 query → 400；`query=x y` → 0 组。
  - `GET /session?id=…`：200 / 2.8 ms / 850 B；未知 id → 404 `not-found`；缺 id、`../etc/passwd` → 400。
  - `GET /sizes?subagents=0|1`：200 / ~1.8 ms，`{bytes:66,252,083,count:108}` / `{bytes:83,467,114,count:241}`，与 `/state` totals.bytes 同口径；未知 workspace → 404。
  - `GET /blanks`、`POST /overview`（405）、未知路由（404）、cross-site（403）全部符合契约。
  - `sort=size` 页按「大小排序 + 分支挂父行」返回（父行后紧跟其分支，因此数值不严格单调），与 0.1.x 客户端语义一致。
  - 全部读路由过程中 `sessionController.list` / 批量 `readTitleSnapshots` 调用数为 **0**；`persistence.list` 只由 `/sizes`（一次）与旧 `/state` 触发。
- [x] **实机只读验收（隔离实例，真实 DSH 0.2.1-rc.2 + 本仓库 symlink 插件 + 真实会话数据副本）**：用 `DSH_HOME=/tmp/dsh-020-verify` 复制 web profile / sessions / storages，`--patch` 注入 `dsh-session-mng` 后启动独立 web 实例（127.0.0.1:58873），插件 Host 与 Client 均加载（`/overview` 返回 `source: "catalog"`；设置页出现「会话管理」）。
  - [x] 真机 API：`overview` 200 / 3.9 ms；`sessions` 50 行、total 54、hasMore；`search` 14 组 / 81 条；`sizes` 与 `/state` 的 `totals.bytes` 完全一致（66,385,772 B）；per-workspace count 与 `/state` 逐项相等；`overview.totals`（all/hiddenSubagents/forks）与 `/state` 相等；`/sessions?workspaceId=all` 404、缺参 400、POST 405。
  - [x] 真机 UI（ego-browser）：首屏只发 `overview + blanks + sizes`（**无 `/state`**）；展开最大工作区只发一次 `/sessions?...offset=0&limit=50&sizes=1`，渲染 50 行，组头「54 个会话 · 约 14 MiB · 已加载 50/54」；「加载更多」追加到 54 行；全库搜索只发一次 `/search`，14 个工作区自动展开、81 行；点行进详情只发一次 `/session?id=…`（另有既有 `preview`），返回按钮正常；`显示空会话` 切换后 tabs 108→109、隐藏空会话提示消失，`归档空会话（1）` 按钮保持；分支行显示「↳ 来自：父标题」并缩进 18px，无「来源父会话已不存在」误报。
  - [x] 真机 `/state` 仍 200（旧客户端兼容）；运行全程无前端报错、无重复请求风暴。
  - [x] Desktop 应用重启后的最终确认（2026-10-29 17:44 子龙重启并确认 UI 正常）：新 GUI `http://127.0.0.1:62203` 上 `GET /overview` 200 / `source: "catalog"`、`GET /state` 200。
- [ ] 截图更新（`assets/screenshot-*.png`，重启后按 0.2.0 列表/分页/搜索状态重拍）。

## C. 发布（已完成，2026-10-29）

- [x] `package.json` 0.2.0。
- [x] `npm --cache /tmp/dsh-npm-cache --logs-dir /tmp/dsh-npm-logs publish`：+ dsh-session-mng@0.2.0，41 个文件 / 629.8 kB（unpacked 982.4 kB），shasum `ef3d3fac8467b8fa4e47642ed7c837bad5107ce9`。
- [x] Git：main push（`63fa300..514f139`）；tag `v0.2.0`；GitHub Release https://github.com/ZilongYang/dsh-session-mng/releases/tag/v0.2.0
- [x] 更新 README 当前状态、ROADMAP（delivered）、`docs/02-open-source-and-marketplace.md`（0.2.0 发布记录）。
- [x] 在 `docs/PLAN-2026-10-29.md` 末尾补「事后差异（补记）」。
- [x] 站点 `dsh.zlmix.com/session-mng/` 更新并部署（0.2.0 版本/功能文案/数据流/JSON-LD/sitemap；自检 PASS，线上验证 8 路径 200）。
- [ ] 市场卡片版本确认：发布后 awesome-dsh-plugin `plugins.json` 仍为 0.1.4（其同步/构建缓存），待刷新后确认变为 0.2.0；条目 YAML 无需修改。
- [ ] 截图更新（`assets/screenshot-*.png` 仍为 0.1.x；站点 `assets/shots/mng-*.png` 亦为旧图，可在需要时重拍）。

## D. 已知口径与差异（写入文档）

- [x] `/sizes` 的 `count/total` 是**可见行**口径（随 `subagents` 开关变化），与 `overview.totals` 一致；不再统计隐藏子代理与幽灵行。
- [x] 页内 size 用 `persistence.locate()` 推目录 + readdir 选最高代 + stat，**不用** `findSessionDirs`（miss 时全库扫描）。
- [x] 页内 stat 失败的行不剔除（保持 total/offset 稳定），由 `/sizes` 对账与下一次请求收敛。
- [x] `capabilities.search` 0.2.0 恒为 `false`（本部署宿主 FTS 默认关闭且不含标题）。
- [x] `/search` 的 size 只读已热大小缓存（不逐行 stat，避免跨组请求风暴）。
- [x] 展开前组头计数用 overview bucket 兜底，页响应到达后以 `page.total` 为最终口径；focus 不做 stale 视觉标记。
