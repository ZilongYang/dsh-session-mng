# dsh-session-mng 0.1.1 发布检查清单

> 记录时间：2026-10-27。0.1.1 是客户端可用性修复；Host API 未变。发布完成后回填 npm/GitHub 结果。

## A. 代码

- [x] `package.json` 版本 `0.1.1`。
- [x] `node --check index.js client.js lib/*.js` 通过。
- [x] `node --test` 26 个测试全绿（Host/标题/移动/删除未改）。
- [x] 新增纯函数 `computeView`：过滤、排序、分组、折叠、每组分页、可见集计算集中在一处。
- [x] 行选择与工作区折叠事件分开绑定（`onSelect` / `onToggle`），避免勾选行时折叠工作区。
- [x] 选择裁剪 effect 使用 `viewKey`，覆盖 tab / 工作区 / 搜索 / 展开集合 / 刷新。
- [x] 批量移动提示区分 live 与一般不可移动项（新增 `moveUnavailableHint`）。

## B. 实机 UI（真实 202 条数据只读）

- [x] 202 条会话：12 个工作区默认全部折叠，行数 0，批量条隐藏。
- [x] 展开 `dsh-session-mng`：2 行，批量条出现；勾选行 → `已选 1 个` + “选择仅作用于当前筛选与展开结果”。
- [x] 切到「已归档」tab：选择裁剪到 0，批量条隐藏。
- [x] 切回「全部」并展开、勾选一行后切换工作区筛选：选择裁剪到 0，批量条隐藏。
- [x] 展开 `zilong`（81 条）：先渲染 50 行，显示“加载更多（剩余 31 条）”；点击后 81 行。
- [x] 搜索“DSH 会话管理”：命中工作区自动展开，`aria-expanded=true`，工作区头 `disabled=true`，展开/收起按钮 disabled，显示搜索提示。
- [x] 搜索无匹配：空态“没有匹配的会话”，选择清空，批量条隐藏。
- [x] 折叠已选中的工作区：选择裁剪到 0，批量条隐藏。
- [x] 滚动到 700px：sticky 头仍在 top≈157px（设置弹窗内容区顶部），过滤区与批量条均可见。
- [x] 详情打开/返回滚动位置仍正常（0.1.0 修复未回归）。

## C. 截图

- [x] `screenshot-1-overview.png`：120 条 demo 会话、3 个工作区默认折叠（工作区优先）。
- [x] `screenshot-4-expanded.png`：展开 Atlas，选中 2 条活跃会话，sticky 过滤 + 批量条。
- [x] `screenshot-2-title.png` / `screenshot-3-delete.png` 保留 0.1.0 的 demo 截图。
- [x] 所有截图使用 `/Users/demo/...` + `session-demo-*` 假数据，侧栏折叠，不含真实会话。
- [x] `screenshots.json` 更新为 4 张。

## D. 发布

- [x] `npm --cache /tmp/dsh-npm-cache pack --dry-run`：31 个文件 / 560.8 kB；npm 发布实际 tarball 560.7 kB / unpacked 767.4 kB；包含 4 张截图。
- [x] `npm publish` 0.1.1（`+ dsh-session-mng@0.1.1`）；版本端点 HTTP 200，`latest` = 0.1.1，`dist.fileCount` = 31。发布后约 90 秒 packument 才出现 0.1.1（与 0.1.0 相同的 staged 处理）。
- [x] Git commit `cea99f9` + push main + tag `v0.1.1` + GitHub Release（https://github.com/ZilongYang/dsh-session-mng/releases/tag/v0.1.1）。
- [x] 确认 npm `latest` = 0.1.1；marketplace 条目无需改 YAML，市场卡片版本随 npm 自动更新。
- [x] 在 `docs/02-open-source-and-marketplace.md` 记录 0.1.1 发布结果。

## E. 市场收录（进行中）

- [x] PR [#9672](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/9672) 已提交，只新增 1 个 YAML；条目不需要随 0.1.1 改。
- [x] `check` 已通过。
- [ ] `Submission gate`：当前仅因仓库 0.0 天（需要 1 天）失败；约 2026-10-28 00:44 Asia/Shanghai 自动重跑，不要重新提交/关闭重开。
- [ ] gate 转绿后等待维护者合并。
- [ ] 合并后验证 `plugins.json` / dshmarket 搜索、卡片版本 `0.1.1`、4 张截图、icon。
- [ ] 结果回填 `docs/02-open-source-and-marketplace.md` 与本节。

## F. 接手

完整接手说明、0.2.0 任务、环境坑见 [HANDOVER-2026-10-27.md](HANDOVER-2026-10-27.md)。
