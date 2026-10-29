# Roadmap

> 当前：`0.2.0` 已在 `main` 实现并测试通过（Host overview + 分页 sessions + 客户端两段式），等待实机验收与发布；线上 npm `latest` 仍为 `0.1.4`。0.2.0 计划与验收见 [docs/PLAN-2026-10-29.md](docs/PLAN-2026-10-29.md) 与 [docs/RELEASE-CHECKLIST-0.2.0.md](docs/RELEASE-CHECKLIST-0.2.0.md)。下一任接手见 [docs/HANDOVER-2026-10-29.md](docs/HANDOVER-2026-10-29.md)。

## 0.1.0 — delivered

- 统一会话总览（活跃 + 已归档，工作区分组，搜索/筛选/排序，日志大小）。
- 整段会话标题生成（活跃 + 已归档冷会话，确认后写入）。
- 归档 / 恢复（含运行中会话的停止确认）。
- 跨工作区移动（冷会话；header 重写 + 目录迁移 + workspace 对账 + 回滚）。
- 彻底删除已归档会话（范围预览 + 子代理级联 + 事务 + 账本清理）。
- 最近消息预览、失效归档标记清理、中英双语。

## 0.1.1 — delivered

- 工作区优先：会话数 >100 默认折叠，点击展开；每个工作区 50 条分页 + 加载更多。
- 搜索命中自动展开，搜索期间禁止折叠；展开全部 / 收起全部。
- 过滤工具栏 + 批量条合并为 sticky 头部。
- 选择集裁剪到当前筛选与展开可见集；批量操作不触碰隐藏会话。
- 批量移动提示区分 live 与一般不可移动项。

## 0.1.2 — delivered

- 空会话默认隐藏 + 「显示空会话」开关；tab 计数与可见列表一致。
- 「清理空会话（N）」批量清理已归档空会话，复用删除范围预览/确认。
- 删除范围确认改为模态框，内容独立滚动、底部确认区固定，支持遮罩/Esc 取消。

## 0.1.3 — delivered (published)

- 三态会话模型：根 / 分支（fork）/ 子代理；分支不再因 `parentSession` 被误判成子会话隐藏。
- 分支会话默认显示，缩进挂在父行下，父行「N 分支」、分支行「↳ 来自：父标题」；搜索父标题命中分支。
- 子代理仍默认隐藏，总览行提示「已隐藏 N 个子代理会话」；开关改名「显示子代理会话」。
- 删除只级联子代理：历史分支保留（预览提示会失去来源标识），不再静默删除；父会话有历史分支时也能移动。
- 分支的来源父会话被删除后显示「来源父会话已不存在」；移动有分支的会话时提示分支留在原工作区。

## 0.1.4 — delivered (published)

- 详情页标题/操作行吸顶（返回列表、标题、徽标、打开/归档始终可见）。
- 操作结果改为浮动 toast：成功提示 5 秒自动消失，失败/带操作提示保留。
- 头部三个按钮移到会话管理标题右侧；副标题与统计信息独占下方整行。
- 空会话：「归档空会话（N）」一键分批归档；「清理空会话（N）」只要有已归档空会话就显示；删除范围预览与删除按 `maxBatch` 分批，超过 50 条也能一次确认完成。

## 0.2.0 — implemented (awaiting publication)

首要目标：真正支撑 1000–10000 条会话，不再首屏拉全量 `state`。计划与实施记录见 [docs/PLAN-2026-10-29.md](docs/PLAN-2026-10-29.md)。

- **零 IO catalog**：`lib/catalog.js` 从 `workspaceRegistry.headers` + `sessionProjectionCache` 组装行；两个内部 seam 特性检测，缺失回退 `buildState` 慢路径。
- `GET /overview`：工作区计数/归档数/空会话/totals/capabilities/orphans，无会话行；10k 合成约 9.5 ms / 1.3 KB。
- `GET /sessions`：按 `workspaceId/tab/query/sort/offset/limit` 分页（≤50 行），branch-aware 排序 + `id` tie-break + `parentStub`；10k 单页约 8.8 ms / 25 KB，不触发全量扫描。
- `GET /search` / `/session` / `/blanks` / `/sizes`：跨工作区标题搜索、详情单行、空会话 id、按工作区/全局大小（一次 `persistence.list()` + 60 s TTL，只聚合可见行）。
- Client 两段式加载：overview → 展开取页 → 加载更多；搜索防抖走宿主；选择只作用于已加载行；详情独立取数；老 Host 回退 `/state` 并保留每组 50 条本地分页。
- 兼容：`GET /state` 保留；0.1.x 客户端不受影响。
- 验收：129 测试全绿（Host 72 + 客户端 vm 57）；10k 基准不调用 `persistence.list` / `sessionController.list` / 批量 `readTitleSnapshots`。实机验收与发版待执行，见 [docs/RELEASE-CHECKLIST-0.2.0.md](docs/RELEASE-CHECKLIST-0.2.0.md)。

## Later candidates

- 侧栏会话「...」菜单快捷入口（生成标题 / 会话管理详情），复用同一套 Host 操作。
- 内容全文搜索（本部署宿主 FTS 默认关闭且索引不含标题；接入前先确认 composition 与结果模型）。
- `(sortValue,id)` keyset 游标，替换 0.2.0 的裸 offset 分页，进一步抗数据变化。
- 导出所选会话为 Markdown / JSON（删除前的安全网；批量）。
- 置顶 / 取消置顶（`workspaceRegistry.pinSession` / `unpinSession`）。
- 整枝移动（父会话 + 分支会话 + 子代理后代一起迁移），或在移动时保留父链接。
- 会话体检 / 修复：重复目录、幽灵归档、workspace 账本与 header cwd 不一致、损坏日志报告。
- 可选回收站（与「彻底删除」并存，默认关闭）。
- 移动的增量实现（rename 而不是整目录复制），大日志更快。

## Non-goals

- 自动标题 provider / 自动归档规则。
- 修改其他插件的标题、归档或工作区行为。
- 远程 / SSH 会话根目录的跨主机迁移。
- 非 JSONL 后端的移动 / 删除。
