# 计划：历史分支（legacy fork）的删除与移动安全

> 提出：2026-10-28 · 批准：2026-10-28 · 归入 0.1.3（未发布）
> 本文按批准内容原样归档；实施完成后差异另起一节补记。

## 1. 背景

0.1.3 修复了「分支默认可见」，但删除/移动仍按宿主的 `sessionQuery.traceSession` 收集后代。宿主 0.2.1-rc.3 已把**新建** fork 改为独立会话（不写 `parentSession`），而**历史 fork**（rc.2 及更早创建，header 保留 `parentSession`）在 `traceSession` 里仍算父会话的 descendant。

实测（宿主同版本代码）：

```text
traceSession([p, fork1(parent=p), sub1(parent=p), grand(parent=fork1)], 'p')
→ descendants: [fork1 → [grand], sub1]
```

插件现有行为因此有两个问题：

1. `POST /delete` 会**级联删除历史分支**，且不要求分支已归档，也不单独确认；`POST /delete/preview` 把它标成「子代理会话」。
2. `POST /move` 只要父会话有历史分支就 `has-descendants` 拒绝，属于误拦。

当前库里有 4 条历史分支（1 条 v4 + 3 条 v0 老格式，内容都是真实用户对话）。

## 2. 决策

- **删除：不级联历史分支。** 只级联 `origin:'subagent'` / `delegationDepth≥1` 的后代；历史分支保留，预览单独提示「不会被删除，但会失去来源标识；如需一起删请勾选」。
- **移动：解除误拦。** 只有子代理后代阻止移动；历史分支不再阻止，并在详情页提示「分支会留在原工作区」。
- 历史分支的父 id 悬空可以接受：rc.3 宿主把这类会话当独立根会话，打开/改名/归档不受影响；插件面板对这类行显示「来源父会话已不存在」。

## 3. 实现

| 文件 | 改动 |
|---|---|
| `lib/state.js` | 抽出并导出 `classifySession(fields)`；行上增加 `parentPresent`（父行是否在本列表） |
| `lib/service.js` | `descendantsOf()` 改为返回 `{ subagents, forks }`（遇到 fork 停止下钻）；`delete/preview` 只列出根 + 子代理，`forkChildren` 由谱系直接得出（排除同批被选中的分支）；`remove()` 只删根 + 子代理；`moveOne()` 只按子代理后代判断 |
| `client.js` | 删除预览：分支保留提示 + 子代理计数；分支行/详情：父会话缺失提示；移动详情：有分支时的说明 |
| 测试 | `test/service.test.js` 覆盖「预览不列分支」「删除不删分支目录」「移动不被分支阻止」；`test/state.test.js` 覆盖 `parentPresent` |
| 文档 | CHANGELOG 0.1.3、README、ROADMAP、`docs/01-design.md`、`docs/RELEASE-CHECKLIST-0.1.3.md` |

## 4. 验收

1. `npm test` 全绿。
2. 用假 ctx：`delete/preview` 返回的 `sessions` 不含历史分支、`forkChildren` 含它；`remove` 只删根 + 子代理目录，分支目录仍在。
3. 真实数据只读核对：4 条历史分支仍出现在列表，`parentPresent` 正确。
4. GUI 删除预览里出现「历史分支不会被删除」提示；父会话有分支时移动不再报 `has-descendants`。

## 5. 不在本次范围

- 给历史分支补写/清理 `parentSession`（不在插件侧改 header）。
- 「父 + 分支」整枝迁移（ROADMAP Later）。
- 宿主 `traceSession` 的谱系语义（属于 DSH，不在插件范围）。

## 6. 实施差异（事后补记，2026-10-28）

- `lib/state.js` 导出 `classifySession(fields)`，listing / delete / move 共用同一分类，避免三处各写一套 `origin/parentSession` 判断。
- 删除预览的 `forkChildren` 改为从同一次谱系遍历得到（原计划写的是沿用语料扫描），同批被勾选的分支不会重复出现在「保留」提示里。
- 行字段新增 `parentPresent`（父行是否还在本列表），客户端据此显示「来源父会话已不存在」；这是原计划「显示父缺失」的具体落点。
- 移动详情在 `movable && forkCount>0` 时多一条提示，说明分支留在原工作区；原计划只写了「解除误拦」。
- 测试从 26 个增加到 29 个；另跑了客户端无头渲染冒烟覆盖列表缩进、父缺失、移动提示与删除预览文案。
- 真实数据核对：当前库 4 条历史分支（`a9fdeaf7…`、`675ca5a4…`、`b9b7923d…`、`session-1`），第 2～4 条是 v0 老格式（`seedLength`、无 `isSeeded`），分类仍正确。
- 更正（2026-10-28 晚）：本文第 1 节称「rc.3 已把新建 fork 改为独立会话」**不适用于当前安装的 0.2.1-rc.3 构建**。实测该构建的 app.asar 仍含 `parentSession: source.header.id` 写入路径，今天 17:42 新建的 fork 也带 `parentSession`；「独立 fork」变更只在 DSH 源码（master）里。因此「历史分支」形态仍会继续产生，本计划的保留/移动策略是长期需要，而非一次性兼容。
- 兼容声明按批准更新为 `0.2.1-rc.2` + `0.2.1-rc.3` 均 compatible。
