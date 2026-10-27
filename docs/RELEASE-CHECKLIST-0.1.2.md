# dsh-session-mng 0.1.2 发布检查清单

> 记录时间：2026-10-27。0.1.2 是空会话清理 + 删除范围弹窗的客户端修复；Host API 未变。**当前未发布**，等子龙实机测试后再执行 npm/GitHub。

## A. 实现

- [x] 默认隐藏 `blank: true` 的空会话；新增「显示空会话」开关。
- [x] 全部/活跃/已归档 tab 计数与隐藏空会话后的可见列表一致。
- [x] 总览行显示「已隐藏 N 个空会话」；显示空会话时才显示“未归档空会话需先归档”提示。
- [x] 头部新增「清理空会话（N）」：只收集 `blank && archived && can.delete` 的会话，打开删除范围预览；未归档空会话不混入。
- [x] 删除范围确认改为模态：内容区独立滚动、底部勾选/确认/取消固定；支持遮罩点击与 Esc 取消。
- [x] 单条详情里的删除范围与批量删除共用同一模态。

## B. 验证

- [x] `node --check client.js`。
- [x] `node --test` 26 个测试全绿（Host/标题/移动/删除未改）。
- [x] React render smoke（4 条假会话、2 条空白归档）：
  - 默认只渲染 2 条非空会话；tab 全部/活跃/已归档 = 2/2/0；`清理空会话` 按钮存在。
  - 打开清理 → `.dsm-scope-overlay` / `.dsm-scope-dialog` / `.dsm-scope-foot` 存在；确认按钮 disabled；取消后弹窗消失。
  - 勾选「显示空会话」→ 行数 4；再取消。
- [x] 子龙实机测试通过：默认隐藏、显示空会话、清理空会话、删除范围弹窗滚动时底部按钮可见。
- [ ] 若确认文案/按钮位置需要微调，再改一轮。

## C. 发布（已完成）

- [x] `npm pack`：33 个文件 / 568.3 kB，unpacked 789.1 kB。
- [x] `npm publish` 0.1.2；版本端点 HTTP 200，`latest` = 0.1.2，`dist.fileCount` = 33（发布后约 3 分钟公开）。
- [x] Git commit / push / tag `v0.1.2` / GitHub Release（见仓库 Releases）。
- [x] 市场条目不需要改 YAML；版本随 npm 自动更新。
- [x] 更新 `CHANGELOG` 的 unreleased 标记、README 当前状态、ROADMAP、`docs/HANDOVER-2026-10-27.md`。
