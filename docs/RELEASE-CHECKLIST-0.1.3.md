# dsh-session-mng 0.1.3 发布检查清单

> 记录时间：2026-10-28。0.1.3 修复「分支会话被误判成子会话并默认隐藏」，并修正历史分支在删除/移动上的安全问题；Host 增加分类字段与计数，Client 增加缩进/徽标/提示。

## A. 实现

- [x] `lib/state.js`：三态分类 `root` / `fork` / `subagent`；分支不再因 `parentSession` 被隐藏。
- [x] `lib/state.js`：行新增 `kind` / `isFork` / `parentTitle` / `forkCount`；`totals` 新增 `forks` / `hiddenSubagents`；`isSubagent` 保留兼容。
- [x] `lib/state.js`：`can.move` 改为仅 `root` 可移动。
- [x] `lib/service.js`：`descendantsOf()` 拆成子代理 / 普通分支；`delete` 只级联子代理，普通分支保留；`move` 只被子代理阻止。
- [x] `lib/service.js`：`delete/preview` 的 `forkChildren` 改由谱系直接得出（同批勾选的分支不重复提示）。
- [x] `lib/state.js`：导出 `classifySession()` 供 service 复用；行新增 `parentPresent`。
- [x] `client.js`：同一工作区内分支缩进挂在父行下方，父行显示「N 分支」，分支行显示「↳ 来自：父标题」。
- [x] `client.js`：搜索命中父标题时返回分支；总览行显示「已隐藏 N 个子代理会话」；开关改名「显示子代理会话」。
- [x] `client.js`：移动不可用提示区分 live / 分支 / 子代理 / 有后代；移动有分支的父会话时提示「分支留在原工作区」。
- [x] `client.js`：详情页显示分支徽标与「父会话」元数据行；来源父会话已删除时显示「来源父会话已不存在」。
- [x] `package.json` 兼容声明：`0.2.1-rc.2` + `0.2.1-rc.3` 均 `compatible`。
- [x] 中英双语文案同步。

## B. 验证

- [x] `node --check index.js client.js lib/*.js test/*.js` 全部通过。
- [x] `npm test`：29 个测试全绿（fork 默认可见/`parentTitle`/`parentPresent`/`forkCount`/隐藏计数；删除级联子代理但保留普通分支；普通分支不阻止移动；子代理仍阻止移动）。
- [x] 真实数据冒烟（当时 `~/.dsh/sessions` 全量 420 个日志 header + 临时 ctx）：库中 4 条历史分支（1 条 v4、3 条 v0 老格式）；`dsh-ml-input` 的分支 `session-a9fdeaf7…` 判定 `kind:'fork'`、`parentTitle` 正确、父行 `forkCount:1`。（该分支随后在实机测试中被删除，见下条。）
- [x] 客户端无头渲染冒烟（最小 React shim + 假 state）：
  - 列表：分支缩进 18px、徽标「分支」、副行「↳ 来自：父标题」；父行「1 分支」；空会话默认隐藏；总览「已隐藏 N 个子代理会话」；勾选开关后以 `subagents=1` 重拉并显示子代理行。
  - 详情：分支行显示「父会话」；来源父会话被删时行内显示「来源父会话已不存在」；父会话移动卡片提示「移动只迁移本会话，分支留在原工作区」。
  - 删除预览：弹窗出现「N 个历史分支会话不会被删除…如需一起删除，请把它们也勾选进来」。
- [x] 现场旁证（应用已重载新 Host 代码，API 返回 `parentPresent`）：`dsh-ml-input` 里父分支 `session-a9fdeaf7…` 已从列表消失，其分支 `session-64daeaa4…`（17:42 fork 出，标题「DSH 多行输入插件开发 (3)」）仍在，`parentPresent:false`、`parentTitle:''` —— 父被删后分支没有跟着消失。具体是否走插件删除流程待子龙确认。
- [ ] 子龙实机复核完整流程（重启/重载 Desktop 后）：工作区从 1 条变 2 条，分支缩进在父会话下；勾选开关后子代理出现；搜索父标题命中分支；删除父会话的预览里出现分支保留提示；父会话移动不再报 `has-descendants`。
- [ ] 若缩进/徽标观感需要微调，再改一轮。

## C. 发布

- [ ] `npm --cache /tmp/dsh-npm-cache --logs-dir /tmp/dsh-npm-logs pack --dry-run` 检查文件清单。
- [ ] `npm publish` 0.1.3；确认版本端点 `latest` = 0.1.3。
- [ ] Git commit / push / tag `v0.1.3` / GitHub Release。
- [ ] 更新 CHANGELOG 的发布标记、README 当前状态、ROADMAP。
