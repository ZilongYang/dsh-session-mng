# dsh-session-mng 0.1.0 发布检查清单

> 记录时间：2026-10-27（Asia/Shanghai）。发版完成后回填发布结果；未完成项保持 `[ ]`。

## A. 代码与测试

- [x] `node --test` 全绿（26 个测试：title / store-jsonl / state / service / api）。
- [x] `node --check index.js client.js lib/*.js` 通过。
- [x] `npm --cache /tmp/dsh-npm-cache pack --dry-run`：28 个文件，package 419.9 kB，unpacked 606.5 kB；包含 `lib/`、`client.js`、locale、icon、assets、docs；不含 `test/`、`private/`、`.npm-cache/`。
- [x] 用真实 202 条会话的 state 做过 React 渲染测试：列表、归档详情、删除范围面板均正常。
- [x] 移动/删除事务单测覆盖 happy path 与回滚。
- [x] 冷标题单测验证写出的 `session/title` 事件形状（`seq`、`source:{kind:'user'}`、`messageSeqs:[]`）。

## B. 本地安装与槽位

- [x] `plugin_manager install_bundle` 安装到 `desktop` profile，返回 `application: applied`。
- [x] 安装目录是 symlink，指向本仓库，开发改动可直接生效。
- [x] `cordis_inspect_query` 的 `settings.section` 出现 `session-mng-section`（order 82）。
- [x] 设置页左下导航出现「会话管理」，页面可打开。
- [x] locale `meta.title` / `meta.description` 与 icon 在插件管理页显示（页面内确认）。

## C. Host API 实机验证（一次性测试会话）

- [x] `GET /session-mng/api/state?subagents=0` → HTTP 200，真实 202 条会话、19 条已归档；capabilities `{title:true,move:true,delete:true,backend:'jsonl'}`。
- [x] `POST /title/propose` → 200，返回 provider/model/messages/truncated。
- [x] `POST /title/apply`（冷会话）→ 200，`mode:'cold'`，`seq:19`；日志出现 `source:{kind:'user'}` 的 `session/title`；state 标题持久。
- [x] `POST /archive` → 200，state `archived:true`，`can.restore/delete` 正确。
- [x] `POST /unarchive` → 200，state 恢复。
- [x] `POST /move`（冷会话，跨工作区）→ 200；header `cwd` 改写；目录迁到目标 project key；事件数 21 不变；源/目标 workspace 计数正确；侧栏分组无需重启更新。
- [x] `POST /delete/preview` → 200，返回根会话、子会话数、目录、字节数。
- [x] `POST /delete`（已归档）→ 200；目录消失；归档集合、workspace 账本清理；state 无该行。
- [x] 未归档会话删除被拒绝（`archived-required`）。
- [x] live 会话的 move/delete 在 state 中 `can=false`，服务端有 `session-live` 拒绝路径。
- [x] 测试会话 `session-<redacted>` 已彻底删除；未触碰真实用户会话。

## D. 真实 UI 验证

- [x] 设置 → 会话管理：列表、分组、统计、tab、筛选、排序、批量条渲染正常。
- [x] 归档筛选、详情页、返回列表、滚动位置复位。
- [x] 标题提案：显示模型、已总结条数、可编辑输入、确认/重新生成/取消；未点确认，未写入真实会话。
- [x] 删除范围预览：根/子会话、字节数、不可恢复勾选、确认按钮禁用逻辑。
- [x] 批量选择：归档/恢复/移动/彻底删除按钮状态、sticky 批量条。
- [x] 浅色/深色（当前深色主题）可读；中英文字典键完整（脚本检查 128 个使用键全部有定义）。
- [x] 截图：`assets/screenshot-1-overview.png`、`-2-title.png`、`-3-delete.png` 使用 demo 数据，已折叠侧栏，不含真实会话标题/路径。
- [x] 浏览器验收后恢复页面真实 fetch 与侧栏状态，没有留下 demo 数据或测试会话。

## E. 仓库与隐私

- [x] `.gitignore` 忽略 `private/`、`.npm-cache/`、`node_modules/`、`.DS_Store`。
- [x] 仓库内没有真实会话 id、用户路径、token、Gmail 提交邮箱。
- [x] 截图使用 `/Users/demo/...`、`session-demo-*` 假数据。
- [x] 本地 `git init -b main` + commit `df3730a`（34 个文件，6406 行）；`private/` 已被忽略、未入库。
- [x] 公开仓库 `ZilongYang/dsh-session-mng` + topics（`dsh-plugin` / `deepseek-harness` / `dsh` / `session`）；tag `v0.1.0` 已推送。
- [x] npm `dsh-session-mng@0.1.0` 发布并验证版本端点（200；28 files）。`npm publish` 返回 202，npm 先创建 `0.0.0-stage` 占位版本，数分钟后 `0.1.0` 公开可见。
- [x] awesome-dsh-plugin PR：[#9672](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/9672)（一个文件；CI pending）。
- [ ] 市场 `plugins.json` / dshmarket 搜索可见（等待 PR 合并；CI site build 进行中）。
- [x] GitHub tag `v0.1.0` 已推送；Release 可选（市场优先 npm）。

## F. 发版后回填

- [ ] npm 版本端点：`curl -s https://registry.npmjs.org/dsh-session-mng/0.1.0` → 200。
- [ ] tarball 文件数/内容与本地 `pack` 一致。
- [ ] awesome-dsh-plugin PR 编号与合并状态。
- [ ] dshmarket 版本/标题/描述/截图/icon 显示正确。
- [ ] 在 `docs/02-open-source-and-marketplace.md` 记录实际命令、结果与踩坑。
