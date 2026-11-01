# dsh-session-mng 0.2.1 发布检查清单

> 记录时间：2026-11-02。0.2.1 = 整枝移动（父会话 + 子代理后代）+ 批量失败原因 + 刷新页面按钮 + toast 自动消失。
> 相关计划：[PLAN-2026-11-02-family-move.md](PLAN-2026-11-02-family-move.md)。本清单随实施回填；发版前需子龙确认。

## A. 实现

### Host（`lib/service.js`）

- [x] `moveOne` 拆成「整族校验 → 逐个迁移 → 失败逆序回滚」：
  - [x] `planMember()`：逐成员检查有存储、header 有 `cwd`、非 live、非 running、源目录可定位、目标目录可定位；任一失败整体拒绝（`details.sessionId` 指出成员）。
  - [x] `relocateMember()`：复用 `stageMove`（移动 → 复制 → 改写 header `cwd` → 回读校验）与 `reconcileMove`（header 缓存、`rememberSessionPath`、`attachSession`/`detachSession`）；单成员失败先自行回滚。
  - [x] `undoMember()`：逆序回滚已完成成员（`rollbackMoveReconcile` + `rollbackMove`）；回滚自身失败返回 `manual-recovery`（`details.rollback`）。
  - [x] 子代理后代随根会话迁移（`partitionDescendants` 的 `subagents`，递归）；普通分支（fork）不跟随；子代理会话仍不能单独移动。
  - [x] 结果新增 `family`（迁移会话数）与 `sessions`（id 列表）；`bytes` 为各成员之和。
  - [x] 移除 `has-descendants` 拒绝（该错误码保留在客户端映射里，兼容旧 Host）。

### Client（`client.js`）

- [x] `run()`：批量接口返回 200 但有条目失败时，toast 改为 `error` 并附 `details`（每条 `sessionId` / `code` / `message`，最多 20 条）。
- [x] `resultText()`：移动结果带 `family > 1` 时追加「连同 N 个子代理会话一起移动」。
- [x] 头部「刷新页面」按钮：`location.reload()` 整页重载（与插件市场同一调用）。
- [x] `Notice`：带操作按钮的成功提示也会自动消失（带按钮 8 s、不带 5 s）；错误/警告仍保留。
- [x] 新增 i18n：`reloadPage` / `reloadPageHint` / `movedWithFamily`（中英各一条）。

## B. 验证

- [x] `npm test`：**131 / 131 全绿**（新增 2 条 Host 用例：整枝移动、子代理 live 时整体拒绝；客户端 1 条：刷新页面按钮）。
- [x] `node --check index.js client.js lib/*.js test/*.js` 全部通过。
- [x] `npm --cache /tmp/dsh-npm-cache pack --dry-run`：42 个文件 / unpacked 997.1 kB。
- [x] 实机验收（子龙，2026-11-02）：把 `Tauri 封装 pi-web 项目`（1 父 + 5 子代理，`zilong`）整枝移动到 `pi-web-desktop`，移动成功；侧栏用「刷新页面」重新分组正常。

## C. 发布

- [x] `package.json` 0.2.1。
- [x] `CHANGELOG.md` 0.2.1 段落。
- [ ] `npm publish`：待执行。
- [ ] Git：commit + push + tag `v0.2.1` + GitHub Release：待执行。
- [ ] README「当前状态」、ROADMAP、市场卡片版本确认：随发布回填。
- [ ] 站点 `dsh.zlmix.com/session-mng/` 文案/版本更新（如需）：待定。

## D. 已知口径

- 整枝移动移动的会话数可能多于用户勾选数（勾 1 条 = 根 + 其全部子代理后代）；提示与 README 均写明。
- 普通分支（fork）仍是独立会话，不跟随；删除父会话也不级联分支（0.1.3 起的口径不变）。
- `/plugins` 路由与客户端产物在宿主启动时组装：**改了 `client.js` 之后要重启应用**，只刷新页面会让 boot 审计判定该插件条目未激活（README 开发章节已记录）。
