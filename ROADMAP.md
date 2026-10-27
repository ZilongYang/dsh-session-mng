# Roadmap

> 当前：`0.1.1` 已发布（npm latest / tag `v0.1.1` / Release）。市场 PR [#9672](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/9672) 的 `check` 已过，只差仓库 1 天年龄 gate（约 2026-10-28 00:44 Asia/Shanghai 自动重跑）。下一项主任务是 0.2.0 的 Host 分页；详细接手任务见 [docs/HANDOVER-2026-10-27.md](docs/HANDOVER-2026-10-27.md)。

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

## 0.1.2 — in progress

- 空会话默认隐藏 + 「显示空会话」开关；tab 计数与可见列表一致。
- 「清理空会话（N）」批量清理已归档空会话，复用删除范围预览/确认。
- 删除范围确认改为模态框，内容独立滚动、底部确认区固定，支持遮罩/Esc 取消。

## 0.2.0 — next (planned)

首要目标：真正支撑 1000–10000 条会话，不再首屏拉全量 `state`。实施前先写 `docs/PLAN-2026-10-28.md` 并获批准。

- `GET /session-mng/api/overview`：只返回工作区计数/大小/归档数、totals、capabilities、orphans；不读全部标题/日志。
- `GET /session-mng/api/sessions`：按 `workspaceId/tab/offset/limit/query/sort` 分页；只对当前页 id 读标题/大小；返回 `hasMore`。
- 未分组会话懒加载 + 短 TTL 缓存；全局搜索先只读验证宿主 search 是否覆盖标题。
- Client：overview 首屏 → 工作区展开时取第一页 → 加载更多；保留 sticky、选择裁剪、搜索自动展开。
- 兼容：保留 `/state` 给 0.1.x 客户端；Host 同时提供新旧接口。
- 验收：合成 10k 数据首屏不返回 session rows；单页 ≤50 行；不触发全量 `sessionController.list`；现有 26 测试 + 新增分页/overview/search 测试。
- 详细接口建议、验收与坑：[docs/HANDOVER-2026-10-27.md](docs/HANDOVER-2026-10-27.md)。

## Later candidates

- 侧栏会话「...」菜单快捷入口（生成标题 / 会话管理详情），复用同一套 Host 操作。
- 内容全文搜索（复用 `sessionQuery.searchSessions` / `searchEvents`），不只按标题/路径/id。
- 导出所选会话为 Markdown / JSON（删除前的安全网；批量）。
- 置顶 / 取消置顶（`workspaceRegistry.pinSession` / `unpinSession`）。
- 整枝移动（父会话 + 子代理后代一起迁移）。
- 会话体检 / 修复：重复目录、幽灵归档、workspace 账本与 header cwd 不一致、损坏日志报告。
- 可选回收站（与「彻底删除」并存，默认关闭）。
- 移动的增量实现（rename 而不是整目录复制），大日志更快。

## Non-goals

- 自动标题 provider / 自动归档规则。
- 修改其他插件的标题、归档或工作区行为。
- 远程 / SSH 会话根目录的跨主机迁移。
- 非 JSONL 后端的移动 / 删除。
