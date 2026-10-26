# dsh-session-mng 设计与实现说明

> 对应版本 0.1.0，实测宿主 DSH 0.2.1-rc.2（Desktop `desktop` profile）。本文面向代码评审与二次开发，记录可观察行为、事务边界、版本敏感点和已知限制。

## 1. 设计约束

1. **会话日志是唯一真源**。插件不维护自己的会话数据库；标题、归档、工作区归属都从日志 / 宿主服务推导。
2. **不注册模型可见工具、不注册 title provider、不注入提示词**。正常对话的提示词与工具开销为 0；所有操作由用户在设置页显式触发。
3. **不修改官方包**。只使用 `ctx` 暴露的服务；移动所需的 workspace 内存缓存对账是唯一内部 seam，已做特性检测与回滚。
4. **零 runtime 依赖**。只用 Node 内置模块与浏览器 React；无 build step。
5. **破坏性操作必须有预览与回滚**。移动/删除先把目录移出 sessions root，失败可恢复；标题提案阶段零写入。

## 2. 宿主事实（决定实现）

| 事实 | 影响 |
|---|---|
| 工作区归属 = 会话 header 的 `cwd` realpath 等于 workspace path | 移动必须改写 header，只改账本无效 |
| `workspaceRegistry.archivedSessionIds` 是全局归档集合 | 归档/恢复用官方 API；恢复保留原位置 |
| JSONL 后端每会话一目录，首个 zstd frame 是 header | 移动只重写第一个 frame，后续事件字节不动 |
| `sessionPersistence.locate({id,cwd})` 是 duck-typed 方法 | 用它推导源/目标目录；缺失则移动/删除降级 |
| 删除无官方 API | 删除 = 文件系统事务 + 归档/workspace 账本清理 |
| `session/title` 是日志事件 | 冷会话可直接 append 官方形状事件；live 会话用 `sessionTitle.rename` |
| `workspaceRegistry` 缓存 header / canonical path | 移动后必须更新缓存再走公开 `attachSession`/`detachSession` |
| `sessionController.list` 读完整语料（含已归档） | 总览主来源；失败回退 `sessionQuery.listSessions` |

## 3. 模块地图

| 文件 | 职责 |
|---|---|
| `index.js` | Host 入口：inject、配置归一化、幂等挂载 `/session-mng/api` |
| `lib/api.js` | HTTP 路由、64 KiB body 上限、错误信封、读请求关闭时取消模型调用 |
| `lib/fence.js` | loopback / `webRuntime.trustedHosts` / Origin / cross-site 围栏 |
| `lib/service.js` | 操作层：state、preview、title propose/apply、archive、unarchive、delete preview/remove、move |
| `lib/state.js` | 总览组装：摘要 + 持久化快照 + workspace 账本 + 标题回退 + capabilities + orphans |
| `lib/title.js` | transcript 抽取/预算、路由解析、`llm.stream`、标题清洗与截断 |
| `lib/store-jsonl.js` | locate/找目录/找当前 generation/header 解析与重写/目录复制/事务/删除 |
| `lib/workspace-sync.js` | 移动后的 registry 缓存对账与回滚；删除后的账本清理 |
| `client.js` | 单文件 Client bundle：设置页、列表/详情、标题/移动/删除表单、i18n、CSS |

## 4. HTTP API

前缀 `/session-mng/api`。除 state 外全部 POST；成功 `{ok:true,value}`，失败 `{ok:false,error:{code,message,details?}}`。

| 路由 | 说明 |
|---|---|
| `GET /state?subagents=0\|1` | 总览；默认过滤子会话 |
| `POST /preview` | 最近消息（最多 10 条） |
| `POST /title/propose` | 整段会话标题提案（只读） |
| `POST /title/apply` | 确认写入标题；live 或 cold |
| `POST /archive` | `{sessionIds, stopActivity?}` |
| `POST /unarchive` | `{sessionIds}` |
| `POST /delete/preview` | 删除范围预览（根 + 子代理后代） |
| `POST /delete` | `{sessionIds, confirm:true}` |
| `POST /move` | `{sessionIds, workspaceId}` |

所有 id 必须是 host 当前已知的会话 id；workspaceId 必须来自 `workspaceRegistry.list()`。批量上限：`maxBatch`（默认 50）/ `maxMoveBatch`（默认 20）；级联删除总上限 500。

## 5. 总览（state）

数据来源：

1. `sessionController.list({}, signal)`：摘要、`updatedAt`、`running`、`blank`、projections（含 title）。
2. `sessionPersistence.list()`：header、当前 generation `sizeBytes`、`formatStatus`。
3. `workspaceRegistry.list()`：工作区顺序、path、`status()`、`sessionIds`（权威归属）。
4. `sessionQuery.readTitleSnapshots(ids)`：只为缺失标题的行补读。
5. `archivedSessionIds` / `pinnedSessionIds`。

每个会话行带 `can`：

- `title`：有 `llm`；
- `archive`：未归档；
- `restore`：已归档；
- `move`：JSONL + zstd + workspace 缓存 seam 可用 + 非 live/running/子会话/有 parent；
- `delete`：JSONL + 已归档 + 非 live；
- `open`：总是 true（客户端再判断 `uiWorkspace` 是否存在）。

`orphans` = 归档集合中 persistence 已无 header 的 id。UI 提供批量 `unarchive` 清理。

## 6. 标题

### 6.1 提案（零写入）

1. `sessionQuery.readSurface(id)` → 抽取 `user/message` 与 `assistant/message` 的 text block。
2. 每条 user ≤2000 字符、assistant ≤3000 字符；整体 JSON ≤32 KiB；超预算先删中间 turn，保留头尾；标记 `truncated`。
3. 路由候选（新→旧）：live `requestHeader()?.config` → 日志中 `request/header` 倒序 → `agentDefaultModel.currentSelection()`；用 `llm.listProviders()` 过滤无 adapter 的 provider。
4. `ctx.llm.stream({purpose:'session-title', sessionId, maxTokens:256, signal})`；无 `stream` 时 `prepareCall` 回退。
5. 清洗：去 OSC/CSI/ESC/控制字符/方向控制符，压缩空白，取首个非空行，UTF-8 截断到 120 字节。

### 6.2 写入

- **live**：`ctx.sessionTitle.rename(liveSession, title)`。这是官方路径，自动 normalize/pin/supersede。
- **cold**：
  1. `sessionPersistence.open(id,'write')` 拿内核写锁；被占用 → `session-writer-held`。
  2. `read()` 取全量事件；若最新 `session/title` 已是目标标题 → no-op。
  3. `append([{type:'session/title', seq:maxSeq+1, time, data:{title, messageSeqs:[], source:{kind:'user'}}}])`。
  4. `flush()` → `close()`。
  5. `readTitleSnapshots([id])` 复核；不一致 → `title-verify-failed`。
- 历史 generation 的写 open 会由后端迁移到当前 generation（官方行为）。

## 7. 归档 / 恢复

- 归档：`workspaceRegistry.archiveSession(id)`；若返回 `WorkspaceActiveSessionError`/activity → `session-active`，UI 提供「停止并归档」重试 `{stopActivity:true}`。
- 恢复：`workspaceRegistry.unarchiveSession(id)`；不改变账本，因此回到原位置。
- 批量顺序执行，逐 id 返回 `{sessionId, ok, error?}`。

## 8. 跨工作区移动（核心事务）

### 8.1 前置校验（写盘前全部完成）

1. `capabilities.move`：JSONL + zstd + `canReconcileMove(registry)`。
2. `stat(id)` 存在，header `cwd` 非空。
3. 非 live（`ctx.sessions.get(id) === undefined`）；非 running。
4. `header.origin !== 'subagent'` 且无 `parentSession`。
5. `traceSession(id)` 无 descendants。
6. 目标 workspace 存在且 `status() === 'ok'`；目标目录不存在。
7. 源目录唯一；目标目录由 `locate({id,cwd:target.path})` 推导。
8. `open(id,'write')` 成功后再 close，证明没有其他进程正在写。
9. `readSession(id)` 可完整 replay；记录事件数。
10. `canReconcileMove`：`registry.headers` 是 Map，`registry.host.rememberSessionPath` 是函数，`target` 有 `attachSession`/`detachSession`。

### 8.2 事务步骤

```
root       = dirname(dirname(sourceDir))
tempRoot   = join(dirname(root), '.dsh-session-mng-tmp')   // 必须在 sessions root 外
backupDir  = join(tempRoot, `move-${id}-${time}-${rand}`)
targetDir  = dirname(locate({id, cwd: target.path}))

1. rename(sourceDir, backupDir)          // 源目录原子移出 root；EXDEV 则 cp+rm
2. cp(backupDir, targetDir, recursive)
3. 读 targetDir 当前 generation 日志，扫描 zstd frame magic + 解压验证找到 header 帧；
   header.cwd = target.path；用 checksumFlag 重新压缩该帧；拼回其余原始字节；
   写临时文件 → fsync → rename（mode 0600）
4. 复核 header == {...oldHeader, cwd: target.path}；readSession 成功且事件数 == 原始数
5. registry.headers.set(id, newHeader)
   registry.host.rememberSessionPath(id, target.path)
   registry.invalidSessionPaths.delete(id)
   await target.attachSession(id)         // 公开 API
   await source?.detachSession(id)        // 公开 API
6. rm(backupDir)
```

### 8.3 回滚

步骤 2–5 任一失败：

1. 若 `target.attachSession` 已成功，`target.detachSession(id)`。
2. 恢复 registry 缓存：`headers.set(oldHeader)`、`rememberSessionPath(source.path)`。
3. `rm(targetDir)`。
4. `rename(backupDir, sourceDir)`（EXDEV 则 cp+rm）。
5. 回滚本身失败 → `manual-recovery`，details 给出 source/target/backup 三个路径。

### 8.4 为什么只移动冷会话

`workspaceRegistry.readSessionHeader` 优先返回 live Session 的内存 header；live Session 的 header 是不可变的。改写磁盘后，进程内 Session 仍是旧 cwd，继续对话/写日志都会与磁盘不一致。因此 0.1.0 直接拒绝 live 会话，提示重启 DSH 后重试。0.2.0 再评估「重启后生效」的排队方案。

## 9. 彻底删除

### 9.1 预览

- 每个 root 必须已归档。
- `traceSession(root)` 递归收集 descendants；后代不要求已归档。
- 每个 id：找目录、递归算字节、尝试 `readSession` 标记可读/损坏。
- 返回 roots、descendantCount、sessions、totalBytes、errors。

### 9.2 执行

1. `confirm === true`；重新校验 root 仍已归档（防 TOCTOU）。
2. 重算 roots + descendants；总 id 数 > 500 拒绝。
3. 任一会话 live 或 running → 拒绝（live 会在内存留下幽灵行）。
4. 每个存在的目录 `rename` 到 `tempRoot/delete-<batch>-<id>-<rand>`；记录映射。
5. 清理 registry：`unarchiveSession`、所属 workspace `detachSession`、可选删除 headers/sessionPaths 缓存。
6. 成功 → `rm` 所有 trash 目录并验证；失败 → 把 trash 移回原位，并尽力 `attachSession` + `archiveSession` 恢复账本，返回错误。
7. 若最终 rm 失败 → `leftover-trash`，details 给出残留路径；不谎报成功。

## 10. 安全

- 路由只接受 loopback / `webRuntime.trustedHosts`；拒绝 cross-site 与不匹配 Origin；`allowRemote` 默认 false。
- body 上限 64 KiB；不接受路径或命令参数。
- 不使用 shell；文件操作只针对 `locate` 与受控扫描得到的会话目录。
- 日志只写 action/id/结果码，不写标题、消息、路径全文。
- 不复制用户 cookie/凭据；开发验收用的临时认证 URL 只写 `/tmp` 并在使用后删除。

## 11. 测试

| 文件 | 覆盖 |
|---|---|
| `test/title.test.js` | 清洗、UTF-8 截断、turn 抽取、预算收缩 |
| `test/store-jsonl.test.js` | header 解析、cwd 重写、后续字节不变、generation 选择、stage/rollback、删除 round-trip |
| `test/state.test.js` | 工作区归属、归档/置顶、子会话过滤、orphans、capabilities |
| `test/service.test.js` | 移动成功、workspace seam 失败回滚、删除成功/拒绝、冷标题事件形状 |
| `test/api.test.js` | fence、state 信封、未知 action、方法、坏 JSON、超大 body、错误码 |

`node --test` 26 个测试全绿。

## 12. 已知限制与 0.2.0 方向

- live 会话不能移动/删除（重启后重试）。
- 有子代理后代的会话不能单独移动（0.2.0 整枝移动）。
- 移动是整目录复制，大日志会慢；0.2.0 评估 rename/增量。
- 非 JSONL 后端不支持移动/删除。
- workspace 缓存 seam 是版本敏感点；升级 DSH 后先跑测试与实机验收。
- 侧栏标题在冷会话重命名后可能要刷新页面才更新（与宿主投影缓存有关）。
- 0.2.0 候选：侧栏菜单、内容搜索、导出、pin、整枝移动、体检/修复。
