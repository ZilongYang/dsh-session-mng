# 整枝移动（父会话 + 子代理后代）实施计划

> 批准时间：2026-11-02（子龙在对话里选择「A」）
> 状态：已实施（见文末事后补记）

## 背景

实机反馈：`Tauri 封装 pi-web 项目`（`session-0aaf8279-…`，`zilong` 工作区）移动到 `pi-web-desktop`
时一直返回「成功 0，失败 1」，重启 DSH 两次无效。

排查结论：

- 会话 header 正常（`cwd` 存在、非分支、非子代理、未归档）；
- 目标工作区已注册且目录存在；
- 真实原因：它有 **5 个 `origin: subagent` 子会话**（`parentSession` 指向它），
  当时的 `moveOne` 对 `has-descendants` 直接拒绝。

「有子代理后代的会话不能单独移动」在 0.1.x 是为了避免父会话搬走、子代理会话留在旧项目目录
而立的规则。逻辑上子代理会话只服务于根会话，应当跟随根会话一起迁移。

## 方案（批准时的内容）

1. **整枝语义**
   - 根会话的子代理后代（递归，`partitionDescendants` 已按 `kind` 拆分）随根会话一起迁移。
   - 普通分支（fork）是独立用户会话，**不跟随**，留在原工作区（维持 0.1.3 的结论）。
   - 子代理会话仍然不能单独移动（`subagent-session`），只能通过其根会话整枝移动。

2. **先整体校验，再动字节**
   - 逐成员检查：有存储、header 有 `cwd`、非 live、非 running、能定位源目录、目标目录不冲突。
   - 任一成员不满足 → 整个请求在**没有移动任何字节**前失败，并在 `details.sessionId`
     指出是哪一个成员（例如某个子代理会话已打开）。

3. **逐个迁移 + 逆序回滚**
   - 每个成员复用现有 `stageMove`（移动→复制→改写 header `cwd`→回读校验）与
     `reconcileMove`（header 缓存、`rememberSessionPath`、`attachSession`/`detachSession`）。
   - 根会话先移，子代理按 trace 顺序跟随。
   - 任一成员失败：已完成的成员按逆序 `rollbackMoveReconcile` + `rollbackMove`；
     回滚自身失败时返回 `manual-recovery` 并列出失败清单。

4. **结果与提示**
   - 返回值新增 `family`（本次迁移的会话数）与 `sessions`（id 列表）；`bytes` 为各成员之和。
   - 客户端成功提示追加「连同 N 个子代理会话一起移动」。

5. **顺带修复的 UX 坑**
   - 批量接口可能返回 200 但每条都失败（本次就是），此前 toast 只说「成功 0，失败 1」。
     现在把每个失败条目的 `code` 与 message 列进 toast 的 details。

## 测试

- `a root moves together with its subagent descendants`：根 + 子代理都到新目录、header `cwd`
  与 `parentSession` 正确、普通分支留下、两个工作区账本正确。
- `a live subagent refuses the whole family before any byte moves`：子代理 live 时整个请求失败，
  `details.sessionId` 指向该子代理，根会话一个字节都没动。

## 风险

- 整枝移动会移动比用户勾选更多的会话（用户勾 1 条，实际搬 1+N 条）；已通过提示与文档说明。
- 子代理会话的状态/归档标记保持不变，与父会话一致性由既有规则保证（整枝只改 `cwd`）。
- 大日志整枝复制耗时随成员数增加；回滚路径已在单成员上验证过，整枝回滚为逆序复用。

---

## 事后补记（实施后回填，非批准时内容）

- 实施位置：`lib/service.js` 新增 `planMember` / `relocateMember` / `undoMember`，`moveOne` 改为
  「校验整族 → 逐个迁移 → 失败逆序回滚」；`client.js` 的 `run()` 增加批量失败 details、
  `resultText()` 增加 `movedWithFamily`。
- 与计划差异：无功能差异；计划中的「回滚自身失败时列出清单」实现为 `manual-recovery` 的
  `details.rollback` 数组。
- 测试：服务端 2 条新用例替换原来的 `subagent descendants still block moving their source`；
  全套 131 个测试通过。
- 未做（留到 0.2.1 发版）：实机验收整枝移动、README/CHANGELOG 发版记录、版本号提升。
