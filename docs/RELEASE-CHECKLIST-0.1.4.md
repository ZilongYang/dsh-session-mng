# dsh-session-mng 0.1.4 发布检查清单

> 记录时间：2026-10-28。0.1.4 是详情页吸顶 + 操作提示与空会话入口三个交互修复，Host API 未变。

## A. 实现

- [x] `client.js`：`.dsm-detail-head` 改为 `position: sticky`（不透明背景 + 底部分隔线），返回列表/标题/徽标/打开归档始终可见。
- [x] `client.js`：操作结果提示改为右下角浮层 toast（`position: fixed`），不随滚动消失。
- [x] `client.js`：纯成功提示 5 秒后自动隐藏；失败与带 action 的提示保留到手动关闭。
- [x] `client.js`：新增「归档空会话（N）」按钮（有未归档空会话时显示），按 `maxBatch` 分批归档并刷新。
- [x] `client.js`：「清理空会话（N）」改为只要有已归档空会话就显示；数量按全部已归档空会话计；存在已打开（不可删）项时禁用并提示「重启后才能清理」。
- [x] 中英双语文案（`archiveBlank` / `archiveBlankHint` / `cleanupBlankLockedHint`，移除 `blankActiveHint`）。
- [x] 页面头部重排：标题与三个操作按钮同一行（按钮右对齐），副标题/统计行在下方独占整行（`.dsm-head-row` + `margin-left:auto`）。
- [x] 删除范围预览与删除请求按 `maxBatch` 分批（空会话快捷清理可超过 50 条），结果合并成一个确认/一条提示。

## B. 验证

- [x] `node --check client.js`；i18n 键覆盖检查（zh/en 各 164 项，引用键全部存在）。
- [x] `npm test`：29 个测试全绿（Host 未改）。
- [x] 客户端无头渲染冒烟（假 state：2 条未归档空会话 + 2 条已归档空会话，其中 1 条已打开）：
  - 头部出现「归档空会话（2）」与「清理空会话（2）」，清理按钮可用、悬停提示含「重启后才能清理」。
  - 点击归档 → 发出 `POST /archive`（2 条），出现 toast「已归档 2 个会话。」。
  - 等待 5.3 秒后 toast 自动消失。
  - 头部结构为「标题行（标题 + 按钮）→ 副标题 → 统计行」；「归档空会话」「刷新」等按钮都在标题行内。
  - 80 条已归档空会话：点「清理空会话（80）」→ 预览分 2 批（50+30）请求并合并显示「根会话: 80」；勾选确认后删除也分 2 批，toast 汇总「成功 80，失败 0」。
- [ ] 子龙实机：滚动详情页时标题行保持可见；操作后提示在右下角且自动消失；空会话按钮行为符合预期。

## C. 发布（未开始）

- [ ] `npm --cache /tmp/dsh-npm-cache --logs-dir /tmp/dsh-npm-logs pack --dry-run`。
- [ ] `npm publish` 0.1.4；确认 `latest` = 0.1.4。
- [ ] Git commit / push / tag `v0.1.4` / GitHub Release。
- [ ] 更新 README 当前状态、ROADMAP、`docs/02-open-source-and-marketplace.md`。
