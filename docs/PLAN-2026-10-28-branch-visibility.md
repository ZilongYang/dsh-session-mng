# 计划：分支会话（fork）默认可见 + 三态会话模型

> 提出：2026-10-28 · 批准：2026-10-28 · 对应版本：0.1.3
> 本文按批准内容原样归档；实施完成后差异另起一节补记（见文末）。

## 1. 问题

截图（2026-10-28，DSH 0.2.1-rc.2）：

- 左侧工作区 `dsh-ml-input` 下有 2 条会话：`DSH 多行输入插件开发`（父，14 小时）和 `DSH 多行输入插件开发 (1)`（分支，2 小时）。
- 设置页「会话管理」的同一工作区只有 **1 个会话**，分支被隐藏；页面上「显示子会话」默认未勾选。

## 2. 根因

`lib/state.js` 只有一条二元判断：

```js
function isSubagent(header, summary) {
  if (header?.origin === 'subagent' || summary?.origin === 'subagent') return true
  return Boolean(header?.parentSession ?? summary?.parentSessionId)   // 有父就算子会话
}
```

`buildState` 在 `includeSubagents=false`（默认）时直接丢弃这些行。

扫描 `~/.dsh/sessions` 全部 304 个会话 header：

| header 特征 | 数量 | 语义 |
|---|---|---|
| 无 origin / 无 parent / `isSeeded:false` | 165 | 普通根会话 |
| `origin:'subagent'` / `delegationDepth:1` / 有 parent | 137 | 子代理（委派，内部） |
| `isSeeded:true` / `delegationDepth:0` / 有 parent / 无 origin | 1 | **用户分支会话** |
| `isSeeded:true` / 无 parent | 1 | 无父种子会话 |

实测落盘的分支是 `session-a9fdeaf7…`（2026-10-28 14:04 从 `session-aa896e13…` 分出）。线上 API 返回 `{"origin":null,"parentSessionId":"session-aa896e13…","isSubagent":true}` —— 即只要挂 parent 就被当成子代理。

DSH 自身的语义：分支是挂在父会话下、标题带 `(1)` 后缀的**一等用户会话**（可继续对话、改标题、归档）；子代理不进入侧栏。插件把两者混为一类，属于判错。

## 3. 决策

- **方案 B（三态 + 树形缩进 + 隐藏提示）**：修分类 + 分支默认显示并缩进挂在父行下 + 子代理仍默认隐藏但给出「已隐藏 N 个」提示。
- **分支会话暂不允许移动**：父会话留在原工作区时，分支跨区会让侧栏层级散架。

## 4. 设计

### 4.1 三态模型

| kind | 判定 | 默认可见 | 徽标 | 可管理动作 |
|---|---|---|---|---|
| `root` | 无 parent | 是 | — | 标题 / 归档 / 恢复 / 删除 / 移动 |
| `fork` | 非子代理且有 parent（`isSeeded:true` 为辅证） | **是** | 「分支」+ 父行「N 分支」计数 | 标题 / 归档 / 恢复 / 删除；**不可移动** |
| `subagent` | `origin:'subagent'` 或 `delegationDepth≥1` | 否（开关 + 「已隐藏 N 个子代理会话」提示） | 「子代理」 | 查看为主；删除随父级联 |

向后兼容：保留 `isSubagent` 字段（= kind==='subagent'），新增 `isFork`、`kind`、`parentTitle`、`totals.hiddenSubagents`、`totals.forks`。

### 4.2 列表呈现

- 同一工作区内，分支行**缩进**（每层 18px）紧跟父行；父行徽标区显示「N 分支」。
- 分支行标题前加 `↳`，副行显示「↳ 来自：父标题 · cwd · id」。
- 搜索命中父标题时，对应分支也命中。
- 详情页：分支徽标 + 「父会话」元数据行。
- 工具栏开关改名「显示子代理会话」；总览行在隐藏时提示「已隐藏 N 个子代理会话」。
- 移动不可用提示按原因区分：live / 子代理 / 分支 / 有后代。

### 4.3 删除

删除预览已列出根 + 子代理后代；本计划附带提示：若被删会话存在分支子项，预览里单独提示「分支会话不会随父删除，但会失去来源标识」。

## 5. 改动清单

| 文件 | 改动 |
|---|---|
| `lib/state.js` | `classifyKind` 三态、`parentTitle` 回填、`totals.hiddenSubagents/forks`、`can.move` 仅 root |
| `lib/service.js` | 删除预览附带分支引用（可选）；移动前置校验保持 |
| `client.js` | 块内父子排序、缩进 + 分支徽标、搜索含父标题、开关文案、隐藏提示、移动提示、详情页父会话行 |
| `test/state.test.js` | fork 用例：默认可见 / 可管理 / parentTitle / 不可移动；子代理隐藏计数 |
| `README.md` | 功能列表、已知限制 |
| `CHANGELOG.md` | 0.1.3 |
| `ROADMAP.md` | 0.1.3 delivered、后续候选整理 |
| `package.json` | 0.1.3 |
| `docs/RELEASE-CHECKLIST-0.1.3.md` | 发布检查清单 |

## 6. 验收

1. `npm test` 全绿（含新增 fork 用例）。
2. 用 `~/.dsh` 真实数据构建 state：`dsh-ml-input` 分组从 1 条变 2 条，分支默认出现且 `isFork:true`、`parentTitle:'DSH 多行输入插件开发'`。
3. GUI 刷新后：分支缩进显示、父行显示「1 分支」、总览行出现「已隐藏 N 个子代理会话」、勾选开关后子代理出现。
4. 搜索父标题能找到分支；分支行 `can.move=false` 且提示为分支原因。
5. 存量数据不需要迁移。

## 7. 不在本次范围

- 子树折叠三角、只看主会话视图（方案 C，后续版本）。
- 分支会话移动、「父 + 分支」整枝移动。
- 0.2.0 的 Host 分页（另有计划）。

## 8. 实施差异（事后补记，2026-10-28）

计划外的实现细节：

1. 状态行新增 `forkCount`（父行徽标「N 分支」），原计划打算只在客户端算。
2. 删除预览实际实现了 `forkChildren`（原计划里标为「可选」）。
3. `can.move` 直接写成 `row.kind === 'root'`（与「非子代理且无 parent」等价，读起来更直白）。
4. 分支缩进深度由客户端 `orderBranchRows()` 计算（`branchDepth`），分支徽标用 `brand` 色调，`↳` 字形放在标题前。

与原计划的差异：

- 计划文件名加了 `-branch-visibility` 后缀：ROADMAP 里已把 `docs/PLAN-2026-10-28.md` 预留给 0.2.0 的 Host 分页计划，避免撞名。
- 方案 C 的子树折叠、只看主会话视图按约定未做。

验证记录：

- `npm test` 26/26 通过；`node --check index.js client.js lib/*.js test/*.js` 全部通过。
- 真实数据冒烟（`~/.dsh/sessions` 304 个日志 header + 临时 ctx 调 `buildState`）：`totals {all:167, hiddenSubagents:137, forks:1}`；`dsh-ml-input` 的分支 `session-a9fdeaf7…` 判定为 `kind:'fork'`、`parentTitle:'DSH 多行输入插件开发'`，父行 `forkCount:1`。
- GUI 实机验收待重载 Desktop 后进行（见 `docs/RELEASE-CHECKLIST-0.1.3.md` B 节）。
- 版本 0.1.3，未发布。
