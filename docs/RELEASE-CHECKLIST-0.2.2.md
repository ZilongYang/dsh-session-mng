# dsh-session-mng 0.2.2 发布检查清单

> 记录时间：2026-11-05。0.2.2 = DSH 0.2.2 兼容适配（独立 fork）+ 投影读取迁移 + 移除「刷新页面」按钮。
> 相关计划：[PLAN-2026-11-05-dsh-0.2.2-compat.md](PLAN-2026-11-05-dsh-0.2.2-compat.md)；核查：[COMPAT-2026-11-05-dsh-0.2.2-rc.1.md](COMPAT-2026-11-05-dsh-0.2.2-rc.1.md)。本清单随实施回填；发版前需子龙确认。

## A. 实现

### Host（`lib/state.js` / `lib/catalog.js`）

- [x] `classifySession` 改为「父 id 或 `isSeeded`」双判据：非子代理时 `isSeeded:true` 也算普通 fork（DSH 0.2.2 不再写 `parentSession`）；子代理仍按 `origin:'subagent'` / `delegationDepth>=1` 优先判定。
- [x] `classifyKind(header, summary)` 透传 `header.isSeeded`（`SessionSummary` 无该字段）。
- [x] 行新增 wire 字段 `forkLineage: 'recorded' | 'none' | null`（纯加法）。
- [x] `canOf` 移动条件：`root`，或 `fork && forkLineage==='none'`（无来源 fork 是独立会话，与 `moveOne` 的放行口径一致）。
- [x] `catalog.js`：`rowFromHeader` 输出 `forkLineage`；`publicRow` 输出该字段；`liveBlock` 优先 `sessionProjections.snapshot()`（0.2.2 已废弃 `cachedSnapshot()`），旧宿主回退。
- [x] 子代理判定、`partitionDescendants`、整枝移动、级联删除、`forkCount` 统计不动。

### Client（`client.js`）

- [x] i18n 新增 `branchSourceUnknown` / `branchSourceUnknownHint`（中英）。
- [x] `annotateBranchRows` 增加无来源分支：`branchSourceUnknown`，不再误判「来源父会话已不存在」。
- [x] 列表行副行、详情「父会话」行、徽标 tooltip 按「有父 / 父缺失 / 无来源记录」三分支渲染。
- [x] 移动提示与批量移动提示对无来源分支不再声称「必须留父工作区」。
- [x] 移除头部「刷新页面」按钮（`reloadPage` helper、中英 i18n、1 条客户端用例）；一键刷新挪到自用 `dsh-zl-tools`（zTools）设置页。

### 元数据与文档

- [x] `package.json` 0.2.2；`dsh.compatibility.dshReleases` 增加 `0.2.1-rc.5` / `0.2.2-rc.1` = compatible；`dsh.compatibility.dsh` 维持 `>=0.2.0-rc.1 <0.3.0-0`。
- [x] CHANGELOG 0.2.2（Changed / Removed / Compatibility）；README 功能、兼容表、状态、文档索引；`docs/01-design.md` 三态模型与移动口径；ROADMAP 0.2.2/0.2.1 记录。
- [x] 兼容性核查文档按事实修正：桌面 App 即 0.2.2-rc.1（CLI 仍 0.2.1-rc.5）、Node 已满足 `>=24.9`、package.json 片段、fork 遗漏项、`cachedSnapshot` 废弃提醒、验证清单补 fork 场景。
- [x] 计划存档含「实施后补记」（验收阶段追加的按钮移除）。

## B. 验证

- [x] `npm test`：**136 / 136 全绿**（新增 6 条：分类器、移动口径、`forkLineage`、投影读取面优先 `snapshot`、客户端「来源未记录」渲染；移除 1 条刷新按钮用例）。
- [x] `node --check index.js client.js lib/*.js test/*.js` 全过。
- [x] `npm --cache /tmp/dsh-npm-cache pack --dry-run`：45 个文件 / unpacked 1.0 MB / package 649.3 kB。
- [x] 实机验收（子龙，2026-11-05，桌面 App = DSH 0.2.2-rc.1）：
  - [x] 0.2.2 里新建 fork（含「fork 再 fork」）→ 会话管理显示「分支」+「来源未记录」、不缩进；`can.move=true`。
  - [x] 删除来源会话（a）与另一个分支（b1）后：剩下的 b2 正常保留、无幽灵归档标记（`orphans: []`）；符合 0.2.2「独立 fork」语义。
  - [x] 历史 fork（4 条，含 1 条父已删除）表现不变：缩进/父标题/「来源父会话已不存在」/不可单独移动。
  - [x] 子代理默认隐藏、`hiddenSubagents` 正常；常规列表/分页/搜索/标题/归档/恢复/删除回归通过。
  - [x] 移除「刷新页面」按钮后头部正常；zTools 页「刷新 DSH 页面」工具点击后整页重载（子龙 2026-11-05 确认）。

## C. 发布

- [x] `package.json` 0.2.2。
- [x] `npm publish`：+ dsh-session-mng@0.2.2，46 个文件 / 650.9 kB（unpacked 1.0 MB），shasum `3ac2cb744021fd20eeccbdac674231decbb4e849`。
- [x] Git：commit `e2f3cc9`，main push（`7d80b5e..e2f3cc9`），tag `v0.2.2`，GitHub Release https://github.com/ZilongYang/dsh-session-mng/releases/tag/v0.2.2
- [x] README「当前状态」与 ROADMAP 标记已发布；市场卡片版本随 npm 自动更新（待确认变为 0.2.2）。
- [ ] 站点 `dsh.zlmix.com/session-mng/` 文案/版本更新（如需）：待定。

## D. 已知口径

- DSH 0.2.2 起普通 fork **不记录来源**（官方：无替代字段），插件只能标注「来源未记录」；删除来源会话不影响已分出的 fork（日志是独立复制）。
- 父会话行不会出现「N 分支」计数（无记录关系）；删除预览也不会提示未记录来源的分支——均为上游数据决定的限制。
- 跨工作区移动后侧栏分组仍需整页刷新（⌘R 或 zTools 的「刷新 DSH 页面」）。
- `/plugins` 路由与客户端产物在宿主启动时组装：改了 `client.js` 之后要重启应用，只刷新页面会让 boot 审计判定该插件条目未激活。
