# 开源、发 npm 与市场收录记录

> 状态：本地开发、安装、Host API、UI 验收已完成；**公开发布步骤待执行**。执行后把每节的「结果」补上，并更新 `docs/RELEASE-CHECKLIST-0.1.0.md`。

## 0. 已核实的事实

| 事实 | 证据 |
|---|---|
| npm `dsh-session-mng` 未被占用 | `registry.npmjs.org/dsh-session-mng` → 404 |
| GitHub `ZilongYang/dsh-session-mng` 未被占用 | `gh repo view` → Could not resolve |
| 发布账号 | `gh` 已登录 `ZilongYang`；npm 已登录 `<npm-account>` |
| 提交邮箱 | 使用 `8017854+ZilongYang@users.noreply.github.com`，不使用全局 Gmail |
| 市场数据源 | awesome-dsh-plugin 一个插件一个 YAML；dshmarket 直接消费，不需要二次提交 |
| 分类 | `session`（同类插件常用分类） |
| 仓库门槛 | 仓库满 1 天；CI 每 6 小时自动重跑，红灯会自己变绿 |
| npm 映射 | 由 `package.json` 的 `repository` 自动关联，条目里不要手写 `npm:` |
| 截图 | 放自己仓库的 `screenshots.json`（1–8 张相对路径），PR 里不加文件 |
| 市场 icon | 可选，GitHub 托管的位图；已生成 `assets/icon-180.png` |

## 1. 本地验收（已完成）

- `plugin_manager install_bundle` 安装到 `desktop` profile：`application: applied`。
- `settings.section` 出现 `session-mng-section`（order 82）。
- 设置页「会话管理」列表/详情/标题/删除范围/批量条实机通过；截图见 `assets/`。
- Host API：`state` / `title propose+apply`（冷会话）/ `archive` / `unarchive` / `move` / `delete preview` / `delete` 全部用一次性测试会话走通；测试会话已彻底删除。
- `node --test` 26 个测试全绿；`npm pack --dry-run` 28 个文件、419.9 kB。

## 2. Git / GitHub

```sh
cd <workspace>
git config user.name "ZilongYang"
git config user.email "8017854+ZilongYang@users.noreply.github.com"
git init -b main
git add -A
git diff --cached --stat
git commit -m "feat: DSH session manager — unified list, titles, archive/restore, move, delete"
git add -A && git commit -m "chore: docs, screenshots and release checklist"
gh repo create ZilongYang/dsh-session-mng --public --source=. --remote=origin --push \
  --description "Session management for DeepSeek Harness: unified list, titles, archive/restore, cross-workspace move, permanent delete."
gh repo edit ZilongYang/dsh-session-mng \
  --add-topic dsh-plugin --add-topic deepseek-harness --add-topic dsh --add-topic session
```

结果：待执行。

## 3. npm

```sh
npm --cache /tmp/dsh-npm-cache pack --dry-run
npm --cache /tmp/dsh-npm-cache publish
npm view dsh-session-mng version repository dist.fileCount
curl -s https://registry.npmjs.org/dsh-session-mng/0.1.0 | head -c 300   # 以版本端点为准
```

注意：

- npm 默认缓存会被 DSH 文件沙箱挡住，必须 `--cache /tmp/dsh-npm-cache`。
- 若 2FA `E403`：`npm publish --otp=<六位码>` 或修 token；不要反复探测包名。
- 发布后 packument 可能有约 10 分钟负缓存；以版本端点 / tarball 直链为准。
- tarball 应包含 28 个文件：`index.js`、`lib/*`、`client.js`、`cordis.patch.yml`、`locale/*.json`、`icon.svg`、`screenshots.json`、`assets/*`、`README.md`、`CHANGELOG.md`、`ROADMAP.md`、`LICENSE`、`docs/*`；不含 `test/`。

结果：待执行。

## 4. awesome-dsh-plugin / dshmarket

只新增一个文件 `data/plugins/ZilongYang__dsh-session-mng.yml`：

```yaml
url: https://github.com/ZilongYang/dsh-session-mng
name: ZilongYang/dsh-session-mng
category: session
description:
  en: 'One Settings page for every DeepSeek Harness session: browse active and archived sessions by workspace, generate a title from the whole conversation for live or archived sessions, archive or restore, move a cold session to another workspace, and permanently delete an archived session (with its subagent descendants after confirmation).'
  zh: '在设置里管理全部 DeepSeek Harness 会话：按工作区分组浏览活跃与已归档会话，为活跃或已归档会话按整段对话生成标题，归档/恢复，把冷会话移动到其他工作区，并在确认后彻底删除已归档会话（含其子代理会话）。'
icon: https://raw.githubusercontent.com/ZilongYang/dsh-session-mng/main/assets/icon-180.png
```

PR 描述建议包含：

- 只新增一个文件；`dsh.bundle` 已声明；分类 `session`；
- 与现有插件差异：**一个控制台覆盖完整生命周期**；**已归档冷会话也能生成标题（不需要恢复）**；**批量 + 日志大小 + 消息预览 + 删除范围确认**；**无 agent 工具、零提示词开销**；不注册侧栏菜单/头部按钮/title provider，避免与 titler、archive-manager 冲突；
- 实测版本 `0.2.1-rc.2`，测试与截图步骤。

时间：仓库创建满 24h 后再提 PR（或先提，CI 自动重跑变绿）。

结果：待执行。

## 5. 市场验证

```sh
curl -s https://awesome-dsh-plugin.com/plugins.json | grep -i session-mng
# dshmarket 内搜索 dsh-session-mng，确认标题、描述、截图、icon
# 可选：dsh-plugin-catalog index（npm 包）在同一份目录生成后可见
```

结果：待执行。

## 6. 发版后回填

- [ ] GitHub 仓库 URL / commit / tag
- [ ] npm 版本端点与 tarball 文件数
- [ ] PR 编号 / 合并状态 / CI 结果
- [ ] dshmarket 卡片截图或文本记录
- [ ] `docs/PLAN-2026-10-26.md` 末尾追加「事后差异（补记）」
