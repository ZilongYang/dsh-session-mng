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
- [ ] **实机只读验收（待重启 Desktop 后执行）**：
  - [ ] `GET /session-mng/api/overview` 无 `sessions`/`rows` 字段；`GET /sessions?workspaceId=<真实 id>&limit=50` 返回 50 行、`hasMore` 正确。
  - [ ] 首屏网络面板只发 `/overview`（+ `/blanks` + `/sizes`），不发 `/state`；展开工作区才发 `/sessions`。
  - [ ] 分支跨页：父未加载显示「↳ 来自：父标题」，父已删除才显示「来源父会话已不存在」。
  - [ ] 空会话「归档空会话 / 清理空会话」按钮仍在；orphan 清理可用。
  - [ ] 详情进入/刷新/返回列表不闪退；刷新保持已加载深度与滚动。
  - [ ] 写操作只用一次性测试会话验证标题/归档/恢复/移动/删除，完成后清理。
- [ ] 截图更新（`assets/screenshot-*.png`，重启后按 0.2.0 列表/分页/搜索状态重拍）。

## C. 发布（待执行，需子龙确认）

- [ ] `package.json` 0.2.0（已完成版本号）。
- [ ] `npm publish`（`npm --cache /tmp/dsh-npm-cache publish`），验证版本端点 200、`latest` = 0.2.0、`dist.fileCount` = 39。
- [ ] Git：main push；tag `v0.2.0`；GitHub Release。
- [ ] 更新 README 当前状态、ROADMAP、`docs/02-open-source-and-marketplace.md`（0.2.0 发布记录）、marketplace 卡片版本（随 npm 自动更新，无需改 YAML）。
- [ ] 在 `docs/PLAN-2026-10-29.md` 末尾补「事后差异（补记）」。

## D. 已知口径与差异（写入文档）

- [x] `/sizes` 的 `count/total` 是**可见行**口径（随 `subagents` 开关变化），与 `overview.totals` 一致；不再统计隐藏子代理与幽灵行。
- [x] 页内 size 用 `persistence.locate()` 推目录 + readdir 选最高代 + stat，**不用** `findSessionDirs`（miss 时全库扫描）。
- [x] 页内 stat 失败的行不剔除（保持 total/offset 稳定），由 `/sizes` 对账与下一次请求收敛。
- [x] `capabilities.search` 0.2.0 恒为 `false`（本部署宿主 FTS 默认关闭且不含标题）。
- [x] `/search` 的 size 只读已热大小缓存（不逐行 stat，避免跨组请求风暴）。
- [x] 展开前组头计数用 overview bucket 兜底，页响应到达后以 `page.total` 为最终口径；focus 不做 stale 视觉标记。
