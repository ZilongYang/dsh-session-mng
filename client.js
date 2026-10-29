/**
 * Client half of dsh-session-mng.
 *
 * One Settings page, no modal and no global overlay: the list and the detail
 * view swap in place inside the settings content column. All data comes from
 * the Host's `/session-mng/api` route; the browser holds no session state of
 * its own and writes only after an explicit click.
 *
 * Hand-written bundle: the module loader materializes `factory(require)` and
 * takes its return value as the module exports. React comes from the browser
 * module table; no Harness Client package is imported.
 */
window.__ModuleLoader__.load({
  id: 'dsh-session-mng',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace and slot id of this plugin. */
    const NS = 'dsh-session-mng'
    const API = '/session-mng/api'
    const STYLE_ID = 'dsh-session-mng-style'
    const GROUP_PAGE_SIZE = 50
    const DEFAULT_COLLAPSE_AFTER = 100
    /** Debounce between typing in the search box and applying the query. */
    const SEARCH_DEBOUNCE_MS = 250
    /** Ceiling on concurrent workspace-page requests (expand-all / focus). */
    const MAX_CONCURRENT_PAGES = 3

    const DICT = {
      zh: {
        navLabel: '会话管理',
        pageTitle: '会话管理',
        pageSubtitle: '管理当前 profile 的全部会话：标题、归档、移动与彻底删除。',
        refresh: '刷新',
        loading: '正在读取会话…',
        loadFailed: '读取会话失败：{message}',
        retry: '重试',
        tabAll: '全部',
        tabActive: '活跃',
        tabArchived: '已归档',
        workspaceAll: '全部工作区',
        workspaceUngrouped: '未分组',
        workspaceMissing: '工作区目录不存在',
        searchPlaceholder: '搜索标题、路径或会话 id',
        sortUpdated: '最近活动',
        sortCreated: '创建时间',
        sortSize: '大小',
        sortTitle: '标题',
        showSubagents: '显示子代理会话',
        showSubagentsHint: '子代理会话由委派产生，默认隐藏；分支会话始终显示。',
        showBlank: '显示空会话',
        cleanupBlank: '清理空会话（{n}）',
        cleanupBlankHint: '批量删除已归档的空会话；未归档的空会话需先归档。',
        cleanupBlankLockedHint: '有 {n} 个已归档空会话已在 DSH 中打开，重启后才能清理。',
        archiveBlank: '归档空会话（{n}）',
        archiveBlankHint: '把未归档的空会话批量归档；归档后即可用「清理空会话」彻底删除。',
        hiddenBlankCount: '已隐藏 {n} 个空会话',
        selectAll: '全选当前列表',
        expandAll: '展开全部',
        collapseAll: '收起全部',
        loadMore: '加载更多（剩余 {n} 条）',
        selectionScopeHint: '选择仅作用于当前筛选与展开结果。',
        searchAutoExpand: '搜索时自动展开命中工作区。',
        groupLoading: '正在加载会话…',
        groupLoadFailed: '加载失败：{message}',
        groupRetry: '重试',
        loadedOf: '已加载 {loaded}/{total}',
        partialSelection: '另有 {n} 条未加载，未纳入全选',
        parentNotLoaded: '来源父会话未加载',
        overviewLoadFailed: '读取总览失败：{message}',
        sizesPending: '正在统计大小…',
        sizesUnavailable: '大小统计暂不可用，请稍后重试。',
        selectRow: '选择会话 {name}',
        justNow: '刚刚',
        titleApplied: '标题已写入。',
        tooMany: '单次最多处理 {max} 个会话。',
        selectedCount: '已选 {n} 个',
        clearSelection: '清除选择',
        archiveSelected: '归档',
        restoreSelected: '恢复',
        moveSelected: '移动',
        deleteSelected: '彻底删除',
        emptyNoSessions: '当前 profile 还没有会话。',
        emptyFiltered: '没有匹配的会话。',
        untitled: '（未命名）',
        running: '运行中',
        archived: '已归档',
        subagent: '子代理',
        branch: '分支',
        fromParent: '↳ 来自：{title}',
        hiddenSubagentCount: '已隐藏 {n} 个子代理会话',
        forkCount: '{n} 分支',
        forkCountHint: '该会话有 {n} 个分支会话',
        parentSession: '父会话',
        parentMissing: '来源父会话已不存在',
        pinned: '已置顶',
        liveBadge: '已打开',
        noCwd: '无工作目录',
        sizeApprox: '约 {size}',
        createdAt: '创建',
        updatedAt: '更新',
        workspace: '工作区',
        path: '路径',
        id: '会话 id',
        copyId: '复制 id',
        copied: '已复制',
        copyFailed: '复制失败',
        formatStatus: '格式',
        open: '打开',
        details: '详情',
        back: '返回列表',
        actions: '操作',
        totalLine: '共 {all} 个会话 · 已归档 {archived} · 约 {size}',
        groupLine: '{n} 个会话 · 约 {size}',
        generateTitle: '生成标题',
        generating: '正在总结整段会话…',
        titleHint: '标题由整段对话总结得出，可以直接修改；确认前不会写入任何内容。',
        titlePlaceholder: '输入或修改标题',
        apply: '确认修改',
        applying: '正在应用…',
        regenerate: '重新生成',
        cancel: '取消',
        usedModel: '模型：{model}',
        usedModelFallback: '模型：{model}（会话记录的模型不可用，已回退到默认模型）',
        titleMessages: '已总结 {n} 条对话',
        titleTruncated: '内容过长，已截取头尾',
        currentTitle: '当前标题',
        preview: '最近消息',
        previewLoading: '正在读取最近消息…',
        previewEmpty: '没有可预览的用户或助手消息。',
        previewFailed: '预览失败：{message}',
        moveTo: '移动到工作区',
        moveHint: '移动会改写会话日志 header 的 cwd，并把日志目录迁到目标工作区；SessionId 与归档状态不变。',
        moveConfirm: '确认移动',
        moving: '正在移动…',
        moveNoTarget: '没有可移动到的目标工作区。',
        moveLiveHint: '该会话已在当前 DSH 进程中打开，重启 DSH 后再移动。',
        moveSubagentHint: '子代理会话不能单独移动。',
        moveForkHint: '分支会话必须和父会话留在同一工作区，暂不支持单独移动。',
        moveForkChildrenHint: '该会话有 {n} 个分支会话；移动只迁移本会话，分支会留在原工作区并继续独立使用。',
        moveDescendantsHint: '该会话包含子代理会话，暂时不能单独移动。',
        deleteAction: '彻底删除',
        deleteHint: '只允许删除已归档会话；删除后日志目录与工作区记录都会被移除，无法恢复。',
        deletePreviewAction: '预览删除范围',
        deletePreviewLoading: '正在计算删除范围…',
        deleteScope: '删除范围',
        deleteRoots: '根会话',
        deleteDescendants: '子代理会话',
        deleteTotalSize: '总计约 {size}',
        deleteConfirmCheck: '我已了解该操作不可恢复',
        deleteConfirm: '确认彻底删除',
        deleting: '正在删除…',
        deleteIrreversible: '不可恢复',
        deleteNotArchived: '只有已归档会话可以彻底删除。',
        deleteLiveHint: '该会话已在当前 DSH 进程中打开，重启 DSH 后再删除。',
        deleteCascadeNote: '如果该会话有子代理会话，会一并删除。',
        deleteForkNote: '另有 {n} 个历史分支会话不会被删除，但会失去「来自父会话」的来源标识；如需一起删除，请把它们也勾选进来。',
        archiveAction: '归档',
        archiving: '正在归档…',
        archiveDone: '已归档 {n} 个会话。',
        restoreAction: '恢复',
        restoring: '正在恢复…',
        restoreDone: '已恢复 {n} 个会话。',
        restoreAndOpen: '恢复并打开',
        stopAndArchive: '停止并归档',
        sessionActive: '会话仍在运行，无法直接归档。',
        sessionRunning: '会话正在运行，请先停止后再操作。',
        writerHeld: '会话正在被其他进程写入，请稍后重试。',
        unsupportedBackend: '当前会话存储后端不支持该操作（仅支持本地 JSONL）。',
        unsupportedRegistry: '当前 DSH 版本的工作区缓存接口已变化，无法在重启前完成移动。',
        unsupportedNode: '当前 Node 版本缺少 Zstandard 支持，无法移动会话（需要 Node ≥22.15）。',
        workspaceMissingErr: '目标工作区目录不存在。',
        notFound: '会话或工作区不存在。',
        batchDone: '已处理：成功 {ok}，失败 {failed}。',
        batchFailed: '有 {failed} 个操作失败。',
        failures: '失败详情',
        detailsToggle: '展开详情',
        orphanBanner: '有 {n} 条归档记录对应的日志已经不存在。',
        cleanupOrphans: '清理失效归档记录',
        cleaningOrphans: '正在清理…',
        cleanedOrphans: '已清理 {n} 条失效归档记录。',
        forbidden: '本机未授权该请求（插件路由需要 loopback 或受信任主机）。',
        unavailable: '插件 Host 侧不可用，请确认已安装并在当前 profile 中启用。',
        failedGeneric: '操作失败：{message}',
        titleInvalid: '标题不能为空。',
        noContent: '该会话还没有可总结的内容。',
        noAdapter: '会话记录的模型路由「{route}」在当前 profile 没有已注册的适配器，默认模型也不可用。',
        noAdapterUnknown: '当前 profile 没有可用的模型路由。',
        timeout: '模型调用超时。',
        llmError: '模型调用失败：{message}',
        liveHint: '已打开的会话不能移动或彻底删除；重启 DSH 后重试。',
        moveUnavailableHint: '所选会话中存在不可移动项（如跨工作区、分支/子代理会话或状态未就绪）。',
        archiveHint: '归档后会话会从活跃列表移到已归档，可在本页恢复。',
        moveArchivedHint: '移动不会改变归档状态，会话仍会留在已归档。',
        working: '处理中…',
        noAction: '当前状态下没有可用操作。',
        scopeRoot: '根',
        scopeChild: '子',
        unreadable: '日志不可读',
        missingDir: '目录缺失',
        openFailed: '打开会话失败：{message}',
        close: '关闭',
        summary: '摘要',
      },
      en: {
        navLabel: 'Session Manager',
        pageTitle: 'Session Manager',
        pageSubtitle: 'Manage every session in this profile: titles, archive, move, and permanent deletion.',
        refresh: 'Refresh',
        loading: 'Loading sessions…',
        loadFailed: 'Could not load sessions: {message}',
        retry: 'Retry',
        tabAll: 'All',
        tabActive: 'Active',
        tabArchived: 'Archived',
        workspaceAll: 'All workspaces',
        workspaceUngrouped: 'Ungrouped',
        workspaceMissing: 'Workspace directory is missing',
        searchPlaceholder: 'Search title, path or session id',
        sortUpdated: 'Recently active',
        sortCreated: 'Created',
        sortSize: 'Size',
        sortTitle: 'Title',
        showSubagents: 'Show subagent sessions',
        showSubagentsHint: 'Subagent sessions are produced by delegation and stay hidden by default; branch sessions are always listed.',
        showBlank: 'Show empty sessions',
        cleanupBlank: 'Clean up empty sessions ({n})',
        cleanupBlankHint: 'Permanently delete archived empty sessions; unarchived empty sessions must be archived first.',
        cleanupBlankLockedHint: '{n} archived empty sessions are open in this DSH process; restart DSH before cleaning them up.',
        archiveBlank: 'Archive empty sessions ({n})',
        archiveBlankHint: 'Archive every unarchived empty session in one batch; they can then be cleaned up with "Clean up empty sessions".',
        hiddenBlankCount: '{n} empty sessions hidden',
        selectAll: 'Select all shown',
        expandAll: 'Expand all',
        collapseAll: 'Collapse all',
        loadMore: 'Load {n} more',
        selectionScopeHint: 'Selection applies to the current filter and expanded workspaces.',
        searchAutoExpand: 'Matching workspaces expand automatically while searching.',
        groupLoading: 'Loading sessions…',
        groupLoadFailed: 'Could not load: {message}',
        groupRetry: 'Retry',
        loadedOf: '{loaded}/{total} loaded',
        partialSelection: '{n} more not loaded; not included in Select all',
        parentNotLoaded: 'Source session not loaded',
        overviewLoadFailed: 'Could not load the overview: {message}',
        sizesPending: 'Measuring sizes…',
        sizesUnavailable: 'Size totals are not ready; try again in a moment.',
        selectRow: 'Select session {name}',
        justNow: 'just now',
        titleApplied: 'Title applied.',
        tooMany: 'At most {max} sessions are allowed in one action.',
        selectedCount: '{n} selected',
        clearSelection: 'Clear selection',
        archiveSelected: 'Archive',
        restoreSelected: 'Restore',
        moveSelected: 'Move',
        deleteSelected: 'Delete permanently',
        emptyNoSessions: 'This profile has no sessions yet.',
        emptyFiltered: 'No sessions match these filters.',
        untitled: '(untitled)',
        running: 'Running',
        archived: 'Archived',
        subagent: 'Subagent',
        branch: 'Branch',
        fromParent: '↳ from: {title}',
        hiddenSubagentCount: '{n} subagent sessions hidden',
        forkCount: '{n} branch',
        forkCountHint: 'This session has {n} branch sessions',
        parentSession: 'Parent session',
        parentMissing: 'Source session no longer exists',
        pinned: 'Pinned',
        liveBadge: 'Open',
        noCwd: 'No working directory',
        sizeApprox: '~{size}',
        createdAt: 'Created',
        updatedAt: 'Updated',
        workspace: 'Workspace',
        path: 'Path',
        id: 'Session id',
        copyId: 'Copy id',
        copied: 'Copied',
        copyFailed: 'Copy failed',
        formatStatus: 'Format',
        open: 'Open',
        details: 'Details',
        back: 'Back to list',
        actions: 'Actions',
        totalLine: '{all} sessions · {archived} archived · ~{size}',
        groupLine: '{n} sessions · ~{size}',
        generateTitle: 'Generate title',
        generating: 'Summarizing the whole session…',
        titleHint: 'The title summarizes the whole conversation. Edit it before confirming; nothing is written until you do.',
        titlePlaceholder: 'Type a title',
        apply: 'Apply',
        applying: 'Applying…',
        regenerate: 'Regenerate',
        cancel: 'Cancel',
        usedModel: 'Model: {model}',
        usedModelFallback: 'Model: {model} (the recorded model is unavailable, so this is a fallback)',
        titleMessages: 'Summarized {n} turns',
        titleTruncated: 'Content was long, so head and tail were kept',
        currentTitle: 'Current title',
        preview: 'Recent messages',
        previewLoading: 'Loading recent messages…',
        previewEmpty: 'No user or assistant text to preview.',
        previewFailed: 'Preview failed: {message}',
        moveTo: 'Move to workspace',
        moveHint: 'Moving rewrites the session log header cwd and re-homes its directory under the target workspace; the SessionId and archive state stay the same.',
        moveConfirm: 'Move',
        moving: 'Moving…',
        moveNoTarget: 'No target workspace is available.',
        moveLiveHint: 'This session is open in this DSH process; restart DSH and retry.',
        moveSubagentHint: 'Subagent sessions cannot be moved on their own.',
        moveForkHint: 'A branch session must stay in its parent\'s workspace, so it cannot be moved on its own.',
        moveForkChildrenHint: 'This session has {n} branch sessions; moving migrates only this session, and the branches stay in the original workspace and keep working independently.',
        moveDescendantsHint: 'This session has subagent descendants and cannot move alone yet.',
        deleteAction: 'Delete permanently',
        deleteHint: 'Only archived sessions can be deleted. The log directory and workspace record are removed; this cannot be undone.',
        deletePreviewAction: 'Preview deletion scope',
        deletePreviewLoading: 'Computing deletion scope…',
        deleteScope: 'Deletion scope',
        deleteRoots: 'Root sessions',
        deleteDescendants: 'Subagent sessions',
        deleteTotalSize: '~{size} total',
        deleteConfirmCheck: 'I understand this cannot be undone',
        deleteConfirm: 'Delete permanently',
        deleting: 'Deleting…',
        deleteIrreversible: 'Irreversible',
        deleteNotArchived: 'Only archived sessions can be permanently deleted.',
        deleteLiveHint: 'This session is open in this DSH process; restart DSH and retry.',
        deleteCascadeNote: 'Any subagent descendants are deleted too.',
        deleteForkNote: '{n} branch sessions are not deleted, but they lose their "from parent" label. Select them too if they should be deleted as well.',
        archiveAction: 'Archive',
        archiving: 'Archiving…',
        archiveDone: 'Archived {n} sessions.',
        restoreAction: 'Restore',
        restoring: 'Restoring…',
        restoreDone: 'Restored {n} sessions.',
        restoreAndOpen: 'Restore & open',
        stopAndArchive: 'Stop and archive',
        sessionActive: 'This session is still running and cannot be archived directly.',
        sessionRunning: 'This session is running; stop it before this operation.',
        writerHeld: 'Another process is writing this session; try again later.',
        unsupportedBackend: 'This operation needs the local JSONL session backend.',
        unsupportedRegistry: 'This DSH version changed the workspace cache; a restart-free move is unavailable.',
        unsupportedNode: 'This Node build lacks Zstandard support, so sessions cannot be moved (Node ≥22.15 is required).',
        workspaceMissingErr: 'The target workspace directory is missing.',
        notFound: 'The session or workspace was not found.',
        batchDone: 'Processed: {ok} succeeded, {failed} failed.',
        batchFailed: '{failed} operations failed.',
        failures: 'Failure details',
        detailsToggle: 'Show details',
        orphanBanner: '{n} archived ids no longer have a stored log.',
        cleanupOrphans: 'Clean stale archive markers',
        cleaningOrphans: 'Cleaning…',
        cleanedOrphans: 'Cleaned {n} stale archive markers.',
        forbidden: 'This request is not authorized (the plugin route needs a loopback or trusted host).',
        unavailable: 'The plugin Host half is unavailable; make sure it is installed and enabled in this profile.',
        failedGeneric: 'Operation failed: {message}',
        titleInvalid: 'The title must contain visible characters.',
        noContent: 'This session has nothing to summarize yet.',
        noAdapter: 'The model route this session recorded ("{route}") has no registered adapter in this profile, and neither has the default model.',
        noAdapterUnknown: 'No usable model route is available in this profile.',
        timeout: 'The model call timed out.',
        llmError: 'The model call failed: {message}',
        liveHint: 'An open session cannot be moved or deleted; restart DSH and retry.',
        moveUnavailableHint: 'Some selected sessions cannot be moved (cross-workspace, branch or subagent sessions, or not ready).',
        archiveHint: 'Archiving moves the session from the active list to the archived list; restore it here.',
        moveArchivedHint: 'Moving does not change the archive state; the session stays archived.',
        working: 'Working…',
        noAction: 'No action is available in this state.',
        scopeRoot: 'Root',
        scopeChild: 'Child',
        unreadable: 'Log is unreadable',
        missingDir: 'Directory missing',
        openFailed: 'Could not open the session: {message}',
        close: 'Close',
        summary: 'Summary',
      },
    }

    const CSS = `
.dsm-page{display:flex;flex-direction:column;gap:12px;font:inherit;color:var(--dsw-alias-label-primary);min-width:0}
/* Page head: title and its actions share the first row; the subtitles use the
   full width below, so the buttons sit in the top-right corner. */
.dsm-head{display:flex;flex-direction:column;gap:2px;min-width:0}
.dsm-head-row{display:flex;align-items:center;justify-content:flex-start;gap:12px;flex-wrap:wrap;min-width:0}
.dsm-title{margin:0;font-size:17px;font-weight:600;line-height:24px}
.dsm-sub{margin:2px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dsm-head-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-left:auto}
.dsm-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:28px;padding:0 10px;
 border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);
 font:inherit;font-size:12px;line-height:18px;cursor:pointer;white-space:nowrap}
.dsm-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.dsm-btn:disabled{opacity:.45;cursor:not-allowed}
.dsm-btn.primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base)}
.dsm-btn.primary:hover:not(:disabled){background:var(--dsw-alias-brand-primary);filter:brightness(.94)}
.dsm-btn.danger{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.dsm-btn.danger:hover:not(:disabled){background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-bg-base)}
.dsm-btn.ghost{border-color:transparent;padding:0 6px}
.dsm-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dsm-input,.dsm-select{height:30px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;
 background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;min-width:0}
.dsm-input{flex:1 1 180px;min-width:140px}
.dsm-select{max-width:220px}
.dsm-check{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsm-tabs{display:inline-flex;align-items:center;gap:2px;padding:2px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-layer-1)}
.dsm-tab{border:none;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;
 padding:4px 9px;border-radius:5px;cursor:pointer}
.dsm-tab[aria-pressed="true"]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600}
.dsm-note{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:8px 10px;border-radius:7px;
 border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);font-size:12px;line-height:18px}
.dsm-note.ok{border-color:var(--dsw-alias-state-success-primary)}
.dsm-note.error{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.dsm-note.warn{border-color:var(--dsw-alias-state-warn-primary)}
.dsm-note-actions{display:flex;gap:6px;flex-wrap:wrap;flex:0 0 auto}
.dsm-note detail{flex:1 1 100%}
/* Operation-result toast: floats above the pane so scrolling never hides it. */
.dsm-toast{position:fixed;bottom:18px;right:18px;z-index:1200;width:max-content;
 max-width:min(460px,calc(100vw - 36px));padding:10px 12px;border-radius:8px;
 background:var(--dsw-alias-bg-layer-2);box-shadow:0 14px 40px rgba(0,0,0,.45);
 animation:dsm-toast-in .16s ease-out}
@keyframes dsm-toast-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.dsm-sticky{position:sticky;top:0;z-index:3;display:flex;flex-direction:column;gap:8px;
 padding:6px 0 8px;background:var(--dsw-alias-bg-layer-2);border-bottom:1px solid var(--dsw-alias-border-l1)}
.dsm-batch{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;border-radius:7px;
 border:1px dashed var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1)}
.dsm-list-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:0 2px}
.dsm-group{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:hidden;background:var(--dsw-alias-bg-layer-1)}
.dsm-group-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;width:100%;
 background:var(--dsw-alias-bg-layer-2);border:none;font:inherit;color:inherit;text-align:left;cursor:pointer}
.dsm-group-head:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1)}
.dsm-group-head:disabled{cursor:default;opacity:.85}
.dsm-chev{flex:0 0 18px;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;
 color:var(--dsw-alias-label-secondary)}
.dsm-row input[type="checkbox"],.dsm-check input[type="checkbox"]{
 appearance:none;-webkit-appearance:none;width:18px;height:18px;margin:0;flex:0 0 auto;
 border:1.5px solid var(--dsw-alias-border-l2);border-radius:4px;background:transparent;
 display:inline-grid;place-content:center;cursor:pointer;transition:background .12s,border-color .12s}
.dsm-row input[type="checkbox"]::before,.dsm-check input[type="checkbox"]::before{
 content:'';width:9px;height:5px;border-left:2px solid #fff;border-bottom:2px solid #fff;
 transform:rotate(-45deg) scale(0);transition:transform .12s}
.dsm-row input[type="checkbox"]:checked,.dsm-check input[type="checkbox"]:checked{
 background:#0f766e;border-color:#0f766e}
.dsm-row input[type="checkbox"]:checked::before,.dsm-check input[type="checkbox"]:checked::before{
 transform:rotate(-45deg) scale(1)}
.dsm-row input[type="checkbox"]:focus-visible,.dsm-check input[type="checkbox"]:focus-visible{
 outline:2px solid #14b8a6;outline-offset:2px}
.dsm-more{width:100%;justify-content:center;border-radius:0;border-left:none;border-right:none;
 border-bottom:none;border-top:1px solid var(--dsw-alias-border-l1);min-height:30px}
.dsm-group-title{font-size:12px;font-weight:600;line-height:18px}
.dsm-group-path{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);word-break:break-all}
.dsm-group-meta{margin-left:auto;font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dsm-group-loaded{padding:7px 10px;border-top:1px solid var(--dsw-alias-border-l1);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dsm-warn{color:var(--dsw-alias-state-warn-primary);font-size:11px}
.dsm-row{display:grid;grid-template-columns:18px minmax(0,1fr) auto auto;align-items:center;gap:8px;
 padding:7px 10px;border-top:1px solid var(--dsw-alias-border-l1);min-width:0}
.dsm-row:first-of-type{border-top:none}
.dsm-row:hover,.dsm-row.selected{background:var(--dsw-alias-bg-layer-2)}
.dsm-row-main{display:flex;flex-direction:column;align-items:flex-start;gap:1px;min-width:0;
 border:none;background:transparent;color:inherit;font:inherit;text-align:left;padding:0;cursor:pointer}
.dsm-row-title{max-width:100%;font-size:13px;line-height:19px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsm-branch-glyph{margin-right:4px;font-size:12px;line-height:1;color:var(--dsw-alias-label-secondary);opacity:.85}
.dsm-row-meta{max-width:100%;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsm-badges{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.dsm-badge{display:inline-flex;align-items:center;height:17px;padding:0 5px;border-radius:4px;font-size:10px;line-height:17px;
 background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dsm-badge.run{color:var(--dsw-alias-state-success-primary)}
.dsm-badge.err{color:var(--dsw-alias-state-error-primary)}
.dsm-badge.warn{color:var(--dsw-alias-state-warn-primary)}
.dsm-badge.brand{color:var(--dsw-alias-brand-primary)}
.dsm-row-side{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dsm-empty{padding:22px 10px;text-align:center;font-size:12px;color:var(--dsw-alias-label-secondary);
 border:1px dashed var(--dsw-alias-border-l2);border-radius:8px}
.dsm-detail{display:flex;flex-direction:column;gap:12px}
/* The title row and its actions stay in view while the detail page scrolls. */
.dsm-detail-head{position:sticky;top:0;z-index:2;display:flex;align-items:flex-start;justify-content:space-between;
 gap:10px;flex-wrap:wrap;padding:6px 0 8px;background:var(--dsw-alias-bg-layer-2);
 border-bottom:1px solid var(--dsw-alias-border-l1)}
.dsm-detail-title{margin:0;font-size:16px;line-height:23px;font-weight:600;word-break:break-word}
.dsm-card{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);padding:10px}
.dsm-card h3{margin:0 0 8px;font-size:12px;line-height:18px;font-weight:600}
.dsm-meta{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 12px;font-size:12px;line-height:18px}
.dsm-meta dt{color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dsm-meta dd{margin:0;min-width:0;word-break:break-all}
.dsm-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px}
.dsm-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.dsm-title-box{display:flex;flex-direction:column;gap:8px}
.dsm-title-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dsm-title-row .dsm-input{flex:1 1 260px}
.dsm-hint{font-size:11px;line-height:17px;color:var(--dsw-alias-label-secondary)}
.dsm-error{font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary)}
.dsm-ok{font-size:12px;line-height:18px;color:var(--dsw-alias-state-success-primary)}
.dsm-msgs{display:flex;flex-direction:column;gap:8px;max-height:320px;overflow:auto}
.dsm-msg{border-left:2px solid var(--dsw-alias-border-l2);padding-left:8px}
.dsm-msg.user{border-left-color:var(--dsw-alias-brand-primary)}
.dsm-msg-role{font-size:10px;line-height:15px;color:var(--dsw-alias-label-secondary);text-transform:uppercase;letter-spacing:.04em}
.dsm-msg-text{font-size:12px;line-height:18px;white-space:pre-wrap;word-break:break-word}
.dsm-scope-list{display:flex;flex-direction:column;gap:6px;margin:8px 0;max-height:220px;overflow:auto}
.dsm-scope-row{display:flex;align-items:center;gap:8px;font-size:11px;line-height:17px;min-width:0}
.dsm-scope-row .dsm-mono{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsm-danger-box{border:1px solid var(--dsw-alias-state-error-primary);border-radius:8px;padding:10px;background:var(--dsw-alias-bg-layer-1)}
.dsm-danger-box h3{color:var(--dsw-alias-state-error-primary)}
.dsm-scope-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;
 padding:20px;background:rgba(0,0,0,.58)}
.dsm-scope-dialog{display:flex;flex-direction:column;width:min(660px,100%);max-height:min(82vh,760px);
 border:1px solid var(--dsw-alias-state-error-primary);border-radius:10px;overflow:hidden;
 background:var(--dsw-alias-bg-layer-2);box-shadow:0 24px 70px rgba(0,0,0,.5)}
.dsm-scope-head{display:flex;align-items:center;justify-content:space-between;gap:10px;
 padding:11px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
.dsm-scope-head h3{margin:0;font-size:13px;line-height:18px;color:var(--dsw-alias-state-error-primary)}
.dsm-scope-body{flex:1 1 auto;min-height:0;overflow:auto;padding:12px 14px}
.dsm-scope-foot{display:flex;flex-direction:column;gap:8px;padding:10px 14px;
 border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
.dsm-scope-dialog .dsm-scope-list{max-height:none;overflow:visible;margin:8px 0}
@media (max-width:640px){
 .dsm-scope-overlay{padding:10px}
 .dsm-scope-dialog{max-height:92vh}
}
.dsm-footer{font-size:11px;line-height:17px;color:var(--dsw-alias-label-secondary)}
.dsm-spin{display:inline-block;width:12px;height:12px;border:2px solid var(--dsw-alias-border-l2);
 border-top-color:var(--dsw-alias-brand-primary);border-radius:50%;animation:dsm-spin .8s linear infinite;vertical-align:-2px}
@keyframes dsm-spin{to{transform:rotate(360deg)}}
@media (max-width:640px){
 .dsm-row{grid-template-columns:18px minmax(0,1fr) auto;gap:6px}
 .dsm-row-side{grid-column:2 / -1;justify-content:flex-start}
 .dsm-meta{grid-template-columns:1fr;gap:1px}
 .dsm-meta dt{margin-top:4px}
}
`

    // ---------------------------------------------------------------------
    // Small utilities
    // ---------------------------------------------------------------------

    class ApiError extends Error {
      constructor(code, message, details, status) {
        super(message)
        this.name = 'ApiError'
        this.code = code
        this.details = details
        this.status = status
      }
    }

    function messageOf(error) {
      if (error instanceof Error) return error.message
      return String(error)
    }

    function formatBytes(bytes) {
      const value = Number(bytes)
      if (!Number.isFinite(value) || value <= 0) return '0 B'
      const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
      let index = 0
      let size = value
      while (size >= 1024 && index < units.length - 1) {
        size /= 1024
        index += 1
      }
      const digits = size >= 10 || index === 0 ? 0 : 1
      return `${size.toFixed(digits)} ${units[index]}`
    }

    function formatDate(ts) {
      if (typeof ts !== 'number' || ts <= 0) return '—'
      try {
        return new Date(ts).toLocaleString()
      } catch {
        return '—'
      }
    }

    function relativeTime(ts, t) {
      if (typeof ts !== 'number' || ts <= 0) return '—'
      const delta = Date.now() - ts
      if (delta < 60_000) return t('justNow')
      if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m`
      if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h`
      return formatDate(ts)
    }

    /** Nearest vertically scrollable ancestor of one element. */
    function scrollParentOf(element) {
      let node = element?.parentElement
      while (node !== null && node !== undefined) {
        try {
          const style = getComputedStyle(node)
          if (/(auto|scroll)/u.test(style.overflowY) && node.scrollHeight > node.clientHeight + 20) return node
        } catch {
          // Cross-realm/style failures just keep walking.
        }
        node = node.parentElement
      }
      return document.scrollingElement ?? null
    }

    function errorText(t, error) {
      const code = typeof error?.code === 'string' ? error.code : ''
      const details = error?.details
      if (code === 'forbidden') return t('forbidden')
      if (code === 'unavailable' || code === 'http-404') return t('unavailable')
      if (code === 'session-live') return t('liveHint')
      if (code === 'session-running') return t('sessionRunning')
      if (code === 'session-writer-held') return t('writerHeld')
      if (code === 'has-descendants') return t('moveDescendantsHint')
      if (code === 'branch-session') return t('moveForkHint')
      if (code === 'archived-required') return t('deleteNotArchived')
      if (code === 'unsupported-backend') return t('unsupportedBackend')
      if (code === 'unsupported-registry') return t('unsupportedRegistry')
      if (code === 'unsupported-node') return t('unsupportedNode')
      if (code === 'workspace-missing') return t('workspaceMissingErr')
      if (code === 'workspace-not-found') return t('notFound')
      if (code === 'not-found') return t('notFound')
      if (code === 'no-content') return t('noContent')
      if (code === 'no-adapter') {
        return typeof details?.route === 'string' && details.route !== ''
          ? t('noAdapter', { route: details.route })
          : t('noAdapterUnknown')
      }
      if (code === 'title-invalid') return t('titleInvalid')
      if (code === 'sizes-pending') return t('sizesUnavailable')
      if (code === 'timeout') return t('timeout')
      if (code === 'llm-error') return t('llmError', { message: error?.message ?? '' })
      if (code === 'session-active') return t('sessionActive')
      return error?.message || t('failedGeneric', { message: '' })
    }

    async function request(method, path, body, signal) {
      let response
      try {
        response = await fetch(`${API}${path}`, {
          method,
          headers: body === undefined ? undefined : { 'content-type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
          cache: 'no-store',
          ...(signal === undefined ? {} : { signal }),
        })
      } catch (error) {
        if (error?.name === 'AbortError') throw error
        throw new ApiError('unavailable', messageOf(error), undefined, 0)
      }
      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      if (!response.ok || payload === null || payload.ok !== true) {
        const failure = payload !== null && payload.error ? payload.error : null
        throw new ApiError(
          failure?.code ?? (response.status === 403 ? 'forbidden' : `http-${response.status}`),
          failure?.message ?? `HTTP ${response.status}`,
          failure?.details,
          response.status,
        )
      }
      return payload.value
    }

    const getState = (includeSubagents, signal) =>
      request('GET', `/state?subagents=${includeSubagents ? '1' : '0'}`, undefined, signal)

    const getOverview = (includeSubagents, signal) =>
      request('GET', `/overview?subagents=${includeSubagents ? '1' : '0'}`, undefined, signal)

    const getBlanks = (includeSubagents, signal) =>
      request('GET', `/blanks?subagents=${includeSubagents ? '1' : '0'}`, undefined, signal)

    const getSizes = (workspaceId, includeSubagents, signal) =>
      request(
        'GET',
        `/sizes?workspaceId=${encodeURIComponent(workspaceId)}&subagents=${includeSubagents ? '1' : '0'}`,
        undefined,
        signal,
      )

    const getSessions = (params, signal) => request('GET', `/sessions?${queryOf(params)}`, undefined, signal)

    const getSearch = (params, signal) => request('GET', `/search?${queryOf(params)}`, undefined, signal)

    const getSession = (id, signal) => request('GET', `/session?id=${encodeURIComponent(id)}`, undefined, signal)

    const post = (action, body, signal) => request('POST', `/${action}`, body, signal)

    function useLocaleTick(ctx) {
      const [, setTick] = React.useState(0)
      React.useEffect(() => {
        let off
        try {
          off = ctx.locale?.subscribe?.(() => setTick((value) => value + 1))
        } catch {
          off = undefined
        }
        return () => {
          try {
            off?.()
          } catch {
            // The locale service is allowed to be absent during teardown.
          }
        }
      }, [ctx])
    }

    // ---------------------------------------------------------------------
    // Presentational helpers
    // ---------------------------------------------------------------------

    function Badge({ tone, children }) {
      return h('span', { className: `dsm-badge${tone === undefined ? '' : ` ${tone}`}` }, children)
    }

    function Spinner({ t, label }) {
      return h('span', null, h('span', { className: 'dsm-spin', 'aria-hidden': 'true' }), ' ', label ?? t('working'))
    }

    /** How long a plain success toast stays before hiding itself. */
    const NOTICE_HIDE_MS = 5000

    /**
     * Operation-result toast.
     *
     * It floats above the settings pane (instead of sitting in the scroll flow),
     * so a result is visible no matter where the list is scrolled. A plain
     * success toast hides itself after a few seconds; failures and notices with
     * an action stay until the user dismisses them, because they carry details
     * worth reading.
     */
    function Notice({ notice, t, onDismiss }) {
      const dismiss = React.useRef(onDismiss)
      dismiss.current = onDismiss
      const transient = notice !== null && notice !== undefined
        && notice.tone !== 'error' && notice.tone !== 'warn'
        && notice.details === undefined && notice.action === undefined
      React.useEffect(() => {
        if (!transient) return undefined
        const timer = setTimeout(() => dismiss.current?.(), NOTICE_HIDE_MS)
        return () => clearTimeout(timer)
      }, [notice, transient])
      if (notice === null || notice === undefined) return null
      return h(
        'div',
        { className: `dsm-note dsm-toast ${notice.tone ?? ''}`, role: 'status' },
        h('div', { style: { flex: '1 1 auto', minWidth: 0 } },
          h('div', null, notice.text),
          notice.detail ? h('div', { className: 'dsm-hint', style: { marginTop: 3 } }, notice.detail) : null,
          notice.details
            ? h('details', { style: { marginTop: 4 } },
                h('summary', { className: 'dsm-hint' }, t('detailsToggle')),
                h('pre', { className: 'dsm-mono', style: { whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: '6px 0 0' } },
                  JSON.stringify(notice.details, null, 2)),
              )
            : null,
        ),
        h('div', { className: 'dsm-note-actions' },
          notice.action
            ? h('button', { type: 'button', className: 'dsm-btn', onClick: notice.action.run }, notice.action.label)
            : null,
          onDismiss
            ? h('button', { type: 'button', className: 'dsm-btn ghost', title: t('close'), 'aria-label': t('close'), onClick: onDismiss }, '×')
            : null,
        ),
      )
    }

    function Row({ row, selected, onToggle, onOpen, t }) {
      const depth = row.branchDepth ?? 0
      const branch = row.kind === 'fork'
      const glyph = depth > 0 || row.branchOrphan === true
      const forkCount = row.forkCount ?? 0
      // A branch whose parent is not among the loaded rows keeps the glyph but
      // must not claim the parent is gone: the three cases read differently.
      const parentNote = branch !== true
        ? ''
        : row.branchParentTitle
          ? `${t('fromParent', { title: row.branchParentTitle })} · `
          : row.branchParentMissing
            ? `${t('parentMissing')} · `
            : row.branchParentNotLoaded
              ? `${t('parentNotLoaded')} · `
              : row.branchDepth === undefined && row.parentPresent === false
                ? `${t('parentMissing')} · `
                : ''
      const badges = []
      if (row.running) badges.push(h(Badge, { key: 'run', tone: 'run' }, t('running')))
      if (row.archived) badges.push(h(Badge, { key: 'arch' }, t('archived')))
      if (row.live) badges.push(h(Badge, { key: 'live', tone: 'brand' }, t('liveBadge')))
      if (row.pinned) badges.push(h(Badge, { key: 'pin' }, t('pinned')))
      if (branch) badges.push(h(Badge, { key: 'fork', tone: 'brand' }, t('branch')))
      if (row.isSubagent) badges.push(h(Badge, { key: 'sub', tone: 'warn' }, t('subagent')))
      if (forkCount > 0) {
        badges.push(
          h('span', { key: 'children', title: t('forkCountHint', { n: forkCount }) },
            h(Badge, null, t('forkCount', { n: forkCount }))),
        )
      }
      return h(
        'div',
        {
          className: `dsm-row${selected === true ? ' selected' : ''}${depth > 0 ? ' dsm-row-branch' : ''}`,
          style: depth > 0 ? { paddingLeft: `${depth * 18}px` } : undefined,
        },
        h('input', {
          type: 'checkbox',
          checked: selected === true,
          onChange: onToggle,
          'aria-label': t('selectRow', { name: row.title || row.id }),
        }),
        h(
          'button',
          { type: 'button', className: 'dsm-row-main', onClick: onOpen, title: row.cwd || row.id },
          h(
            'span',
            { className: 'dsm-row-title' },
            glyph ? h('span', { className: 'dsm-branch-glyph', 'aria-hidden': 'true' }, '↳') : null,
            row.title === '' ? t('untitled') : row.title,
          ),
          h(
            'span',
            { className: 'dsm-row-meta' },
            parentNote,
            row.cwd === '' ? t('noCwd') : row.cwd,
            ' · ',
            row.id,
          ),
        ),
        h('div', { className: 'dsm-badges' }, badges),
        h(
          'div',
          { className: 'dsm-row-side' },
          h('span', { title: t('sizeApprox', { size: formatBytes(row.sizeBytes) }) }, formatBytes(row.sizeBytes)),
          h('span', { title: formatDate(row.updatedAt) }, relativeTime(row.updatedAt, t)),
        ),
      )
    }

    function Group({ group, selected, onToggle, onSelect, onOpen, onMore, onRetry, t, locked }) {
      const total = Number.isFinite(group.total) ? group.total : group.rows.length
      // Paged groups render everything they have loaded; the legacy fallback
      // renders a 0.1.x-style 50-row window per group.
      const rendered = Array.isArray(group.renderedRows) ? group.renderedRows : group.rows
      const remaining = Math.max(0, total - rendered.length)
      const size = formatBytesOrDash(group.bytes)
      const meta = `${t('groupLine', { n: total, size })}${group.expanded === true && remaining > 0 ? ` · ${t('loadedOf', { loaded: rendered.length, total })}` : ''}`
      const empty = rendered.length === 0
      return h(
        'section',
        { className: 'dsm-group' },
        h(
          'button',
          {
            type: 'button',
            className: 'dsm-group-head',
            'aria-expanded': group.expanded === true ? 'true' : 'false',
            disabled: locked === true,
            title: locked === true ? t('searchAutoExpand') : undefined,
            onClick: onToggle,
          },
          h('span', { className: 'dsm-chev', 'aria-hidden': 'true' },
            h('svg', {
              viewBox: '0 0 16 16',
              width: 16,
              height: 16,
              fill: 'none',
              stroke: 'currentColor',
              'stroke-width': 1.6,
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
            }, h('path', { d: group.expanded === true ? 'M4 6l4 4 4-4' : 'M6 4l4 4-4 4' })),
          ),
          h('div', { style: { minWidth: 0, flex: '1 1 auto' } },
            h('div', { className: 'dsm-group-title' }, group.title || t('workspaceUngrouped')),
            group.path ? h('div', { className: 'dsm-group-path' }, group.path) : null,
            group.status !== undefined && group.status !== 'ok'
              ? h('div', { className: 'dsm-warn' }, t('workspaceMissing'))
              : null,
          ),
          h('div', { className: 'dsm-group-meta' }, meta),
        ),
        group.expanded === true && empty && (group.phase === 'loading' || group.phase === 'idle')
          ? h('p', { className: 'dsm-group-loaded dsm-hint' }, t('groupLoading'))
          : null,
        group.expanded === true && group.phase === 'error'
          ? h('div', { className: 'dsm-group-loaded' },
              h('span', { className: 'dsm-error' }, t('groupLoadFailed', { message: errorText(t, group.error) })),
              h('button', { type: 'button', className: 'dsm-btn', onClick: onRetry }, t('groupRetry')),
            )
          : null,
        group.expanded === true
          ? rendered.map((row) =>
              h(Row, {
                key: row.id,
                row,
                selected: selected.has(row.id),
                onToggle: () => onSelect(row.id),
                onOpen: () => onOpen(row.id),
                t,
              }),
            )
          : null,
        group.expanded === true && remaining > 0 && group.phase === 'ready'
          ? h(
              'button',
              { type: 'button', className: 'dsm-btn ghost dsm-more', onClick: onMore },
              t('loadMore', { n: remaining }),
            )
          : null,
      )
    }

    // ---------------------------------------------------------------------
    // Title editor
    // ---------------------------------------------------------------------

    function TitleEditor({ ctx, t, session, onChanged }) {
      const [proposal, setProposal] = React.useState(null)
      const [value, setValue] = React.useState('')
      const [phase, setPhase] = React.useState('idle')
      const [error, setError] = React.useState(null)
      const controllerRef = React.useRef(null)

      React.useEffect(
        () => () => {
          controllerRef.current?.abort()
        },
        [],
      )

      const generate = async () => {
        controllerRef.current?.abort()
        const controller = new AbortController()
        controllerRef.current = controller
        setPhase('loading')
        setError(null)
        try {
          const result = await post('title/propose', { sessionId: session.id }, controller.signal)
          if (controller.signal.aborted) return
          setProposal(result)
          setValue(result.title)
          setPhase('ready')
        } catch (failure) {
          if (failure?.name === 'AbortError') return
          setError(errorText(t, failure))
          setPhase('error')
        }
      }

      const apply = async () => {
        const title = value.trim()
        if (title === '') return
        setPhase('applying')
        setError(null)
        try {
          await post('title/apply', { sessionId: session.id, title })
          setPhase('done')
          onChanged(t('titleApplied'))
        } catch (failure) {
          setError(errorText(t, failure))
          setPhase('ready')
        }
      }

      if (phase === 'idle') {
        return h(
          'section',
          { className: 'dsm-card' },
          h('h3', null, t('generateTitle')),
          h('p', { className: 'dsm-hint', style: { margin: '0 0 8px' } }, t('titleHint')),
          h('button', { type: 'button', className: 'dsm-btn', onClick: () => void generate() }, t('generateTitle')),
        )
      }

      if (phase === 'loading') {
        return h(
          'section',
          { className: 'dsm-card' },
          h('h3', null, t('generateTitle')),
          h('p', { className: 'dsm-hint' }, h(Spinner, { t, label: t('generating') })),
        )
      }

      return h(
        'section',
        { className: 'dsm-card' },
        h('h3', null, t('generateTitle')),
        h('p', { className: 'dsm-hint', style: { margin: '0 0 8px' } }, t('titleHint')),
        proposal !== null
          ? h(
              'div',
              { style: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 } },
              h('div', { className: 'dsm-hint' },
                proposal.fallback === true
                  ? t('usedModelFallback', { model: `${proposal.provider}/${proposal.model}` })
                  : t('usedModel', { model: `${proposal.provider}/${proposal.model}` }),
              ),
              h('div', { className: 'dsm-hint' },
                t('titleMessages', { n: proposal.messages }),
                proposal.truncated === true ? ` · ${t('titleTruncated')}` : '',
              ),
            )
          : null,
        h(
          'div',
          { className: 'dsm-title-row' },
          h('input', {
            className: 'dsm-input',
            type: 'text',
            value,
            placeholder: t('titlePlaceholder'),
            onChange: (event) => setValue(event.target.value),
            'aria-label': t('titlePlaceholder'),
            disabled: phase === 'applying',
          }),
          h('button', {
            type: 'button',
            className: 'dsm-btn primary',
            disabled: phase === 'applying' || value.trim() === '',
            onClick: () => void apply(),
          }, phase === 'applying' ? t('applying') : t('apply')),
          h('button', {
            type: 'button',
            className: 'dsm-btn',
            disabled: phase === 'applying',
            onClick: () => void generate(),
          }, t('regenerate')),
          h('button', {
            type: 'button',
            className: 'dsm-btn ghost',
            disabled: phase === 'applying',
            onClick: () => {
              setPhase('idle')
              setProposal(null)
              setError(null)
            },
          }, t('cancel')),
        ),
        error ? h('p', { className: 'dsm-error', style: { margin: '6px 0 0' } }, error) : null,
        phase === 'done' ? h('p', { className: 'dsm-ok', style: { margin: '6px 0 0' } }, t('titleApplied')) : null,
      )
    }

    // ---------------------------------------------------------------------
    // Preview
    // ---------------------------------------------------------------------

    function PreviewList({ t, sessionId }) {
      const [phase, setPhase] = React.useState('loading')
      const [messages, setMessages] = React.useState([])
      const [error, setError] = React.useState(null)
      React.useEffect(() => {
        const controller = new AbortController()
        setPhase('loading')
        setError(null)
        post('preview', { sessionId, count: 10 }, controller.signal)
          .then((value) => {
            if (controller.signal.aborted) return
            setMessages(Array.isArray(value?.messages) ? value.messages : [])
            setPhase('ready')
          })
          .catch((failure) => {
            if (failure?.name === 'AbortError') return
            setError(errorText(t, failure))
            setPhase('error')
          })
        return () => controller.abort()
      }, [sessionId, t])
      return h(
        'section',
        { className: 'dsm-card' },
        h('h3', null, t('preview')),
        phase === 'loading'
          ? h('p', { className: 'dsm-hint' }, t('previewLoading'))
          : phase === 'error'
            ? h('p', { className: 'dsm-error' }, error)
            : messages.length === 0
              ? h('p', { className: 'dsm-hint' }, t('previewEmpty'))
              : h('div', { className: 'dsm-msgs' },
                  messages.map((message, index) =>
                    h(
                      'div',
                      { key: `${index}-${message.time}`, className: `dsm-msg ${message.role}` },
                      h('div', { className: 'dsm-msg-role' }, message.role === 'user' ? 'user' : 'assistant'),
                      h('div', { className: 'dsm-msg-text' }, message.text),
                    ),
                  ),
                ),
      )
    }

    // ---------------------------------------------------------------------
    // Delete scope (shared by single and batch)
    // ---------------------------------------------------------------------

    function DeleteScope({ ctx, t, ids, maxBatch, onConfirmed, onCancel, busy }) {
      const [phase, setPhase] = React.useState('loading')
      const [preview, setPreview] = React.useState(null)
      const [error, setError] = React.useState(null)
      const [checked, setChecked] = React.useState(false)
      const idsKey = ids.join('\u0000')

      // One confirmation may name more sessions than a single request admits
      // (the empty-session shortcut does). Preview in batches and merge the
      // scopes so the dialog still shows one combined result.
      React.useEffect(() => {
        const controller = new AbortController()
        setPhase('loading')
        setChecked(false)
        const size = Number.isFinite(maxBatch) && maxBatch > 0 ? maxBatch : 50
        const merge = async () => {
          const merged = { roots: [], errors: [], sessions: [], descendantCount: 0, forkChildren: [], totalBytes: 0 }
          for (let index = 0; index < ids.length; index += size) {
            const value = await post('delete/preview', { sessionIds: ids.slice(index, index + size) }, controller.signal)
            if (controller.signal.aborted) return
            merged.roots.push(...(value?.roots ?? []))
            merged.errors.push(...(value?.errors ?? []))
            merged.sessions.push(...(value?.sessions ?? []))
            merged.descendantCount += value?.descendantCount ?? 0
            merged.forkChildren.push(...(value?.forkChildren ?? []))
            merged.totalBytes += value?.totalBytes ?? 0
          }
          if (controller.signal.aborted) return
          setPreview(merged)
          setPhase('ready')
        }
        merge().catch((failure) => {
          if (failure?.name === 'AbortError') return
          setError(errorText(t, failure))
          setPhase('error')
        })
        return () => controller.abort()
      }, [idsKey, maxBatch, t])

      React.useEffect(() => {
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          if (busy !== true) onCancel()
        }
        document.addEventListener('keydown', onKeyDown, true)
        return () => document.removeEventListener('keydown', onKeyDown, true)
      }, [busy, onCancel])

      const rows = preview?.sessions ?? []
      const blocked = rows.some((row) => row.live || row.running)
      const ready = phase === 'ready' && preview !== null
      return h(
        'div',
        {
          className: 'dsm-scope-overlay',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget && busy !== true) onCancel()
          },
        },
        h(
          'div',
          {
            className: 'dsm-scope-dialog',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': t('deleteScope'),
          },
          h(
            'div',
            { className: 'dsm-scope-head' },
            h('h3', null, t('deleteScope')),
            h('button', {
              type: 'button',
              className: 'dsm-btn ghost',
              'aria-label': t('close'),
              disabled: busy,
              onClick: onCancel,
            }, '×'),
          ),
          h(
            'div',
            { className: 'dsm-scope-body' },
            h('p', { className: 'dsm-hint', style: { margin: '0 0 8px' } }, t('deleteHint')),
            phase === 'loading'
              ? h('p', { className: 'dsm-hint' }, t('deletePreviewLoading'))
              : phase === 'error'
                ? h('p', { className: 'dsm-error' }, error)
                : h(
                    React.Fragment,
                    null,
                    h('div', { className: 'dsm-hint' },
                      `${t('deleteRoots')}: ${preview?.roots?.length ?? 0} · ${t('deleteDescendants')}: ${preview?.descendantCount ?? 0} · ${t('deleteTotalSize', { size: formatBytes(preview?.totalBytes ?? 0) })}`,
                    ),
                    (preview?.forkChildren?.length ?? 0) > 0
                      ? h('p', { className: 'dsm-hint' }, t('deleteForkNote', { n: preview.forkChildren.length }))
                      : null,
                    h('div', { className: 'dsm-scope-list' },
                      rows.map((row) =>
                        h(
                          'div',
                          { key: row.id, className: 'dsm-scope-row' },
                          h('span', { className: 'dsm-badge' }, row.descendant ? t('scopeChild') : t('scopeRoot')),
                          h('span', { className: 'dsm-mono', title: row.dir ?? row.id }, row.id),
                          row.live ? h(Badge, { tone: 'brand' }, t('liveBadge')) : null,
                          row.running ? h(Badge, { tone: 'run' }, t('running')) : null,
                          row.missing ? h(Badge, { tone: 'warn' }, t('missingDir')) : null,
                          row.readable === false ? h(Badge, { tone: 'warn' }, t('unreadable')) : null,
                          h('span', { style: { marginLeft: 'auto' } }, formatBytes(row.bytes)),
                        ),
                      ),
                    ),
                    h('p', { className: 'dsm-hint', style: { margin: '0 0 6px' } }, t('deleteCascadeNote')),
                    blocked ? h('p', { className: 'dsm-error' }, t('deleteLiveHint')) : null,
                  ),
          ),
          h(
            'div',
            { className: 'dsm-scope-foot' },
            ready
              ? h('label', { className: 'dsm-check' },
                  h('input', {
                    type: 'checkbox',
                    checked,
                    disabled: blocked,
                    onChange: (event) => setChecked(event.target.checked),
                  }),
                  t('deleteConfirmCheck'),
                )
              : null,
            h(
              'div',
              { className: 'dsm-actions' },
              h('button', {
                type: 'button',
                className: 'dsm-btn danger',
                disabled: busy || ready !== true || blocked || checked !== true,
                onClick: () => onConfirmed(ids),
              }, busy ? t('deleting') : t('deleteConfirm')),
              h('button', { type: 'button', className: 'dsm-btn ghost', disabled: busy, onClick: onCancel }, t('cancel')),
              blocked ? h('span', { className: 'dsm-hint' }, t('liveHint')) : null,
            ),
          ),
        ),
      )
    }

    // ---------------------------------------------------------------------
    // Detail view
    // ---------------------------------------------------------------------

    function DetailView({ ctx, t, overview, limits, row, busy, onBack, onChanged, onOpen, onArchive, onRestore, onMove, onDelete }) {
      const [copied, setCopied] = React.useState(false)
      const [showDelete, setShowDelete] = React.useState(false)
      const deleteIds = React.useMemo(() => [row.id], [row.id])
      const [target, setTarget] = React.useState('')
      const targets = (overview?.workspaces ?? []).filter((workspace) => workspace.id !== row.workspaceId && workspace.status === 'ok')
      const movable = row.can?.move === true && targets.length > 0
      const uiWorkspace = (() => {
        try {
          return ctx.get?.('uiWorkspace')
        } catch {
          return undefined
        }
      })()
      const canOpen = typeof uiWorkspace?.openSession === 'function'

      const copyId = async () => {
        try {
          await navigator.clipboard.writeText(row.id)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          setCopied(false)
        }
      }

      React.useEffect(() => {
        setCopied(false)
        setShowDelete(false)
        setTarget(targets[0]?.id ?? '')
      }, [row.id])

      return h(
        'div',
        { className: 'dsm-detail' },
        h(
          'div',
          { className: 'dsm-detail-head' },
          h('div', { style: { minWidth: 0 } },
            h('div', { className: 'dsm-actions', style: { marginBottom: 4 } },
              h('button', { type: 'button', className: 'dsm-btn ghost', onClick: onBack }, `← ${t('back')}`),
            ),
            h('h2', { className: 'dsm-detail-title' }, row.title === '' ? t('untitled') : row.title),
            h('div', { className: 'dsm-badges', style: { marginTop: 5 } },
              row.running ? h(Badge, { tone: 'run' }, t('running')) : null,
              row.archived ? h(Badge, null, t('archived')) : null,
              row.live ? h(Badge, { tone: 'brand' }, t('liveBadge')) : null,
              row.pinned ? h(Badge, null, t('pinned')) : null,
              row.kind === 'fork' ? h(Badge, { tone: 'brand' }, t('branch')) : null,
              row.isSubagent ? h(Badge, { tone: 'warn' }, t('subagent')) : null,
            ),
          ),
          h('div', { className: 'dsm-actions' },
            canOpen && !row.archived
              ? h('button', { type: 'button', className: 'dsm-btn', onClick: () => onOpen(row.id) }, t('open'))
              : null,
            row.archived
              ? h('button', { type: 'button', className: 'dsm-btn primary', disabled: busy, onClick: () => onRestore(row.id) }, t(canOpen ? 'restoreAndOpen' : 'restoreAction'))
              : h('button', { type: 'button', className: 'dsm-btn', disabled: busy, onClick: () => onArchive(row.id) }, t('archiveAction')),
          ),
        ),
        h(
          'section',
          { className: 'dsm-card' },
          h('h3', null, t('summary')),
          h(
            'dl',
            { className: 'dsm-meta' },
            h('dt', null, t('workspace')),
            h('dd', null, row.workspaceTitle || t('workspaceUngrouped')),
            row.kind === 'fork'
              ? h(React.Fragment, null,
                  h('dt', null, t('parentSession')),
                  h('dd', null,
                    row.parentTitle !== ''
                      ? row.parentTitle
                      : row.parentPresent === false
                        ? t('parentMissing')
                        : (row.parentSessionId || '')))
              : null,
            h('dt', null, t('path')),
            h('dd', { title: row.cwd }, h('span', { className: 'dsm-mono' }, row.cwd || t('noCwd'))),
            h('dt', null, t('id')),
            h('dd', null,
              h('span', { className: 'dsm-mono' }, row.id),
              ' ',
              h('button', { type: 'button', className: 'dsm-btn ghost', onClick: () => void copyId() }, copied ? t('copied') : t('copyId')),
            ),
            h('dt', null, t('createdAt')),
            h('dd', null, formatDate(row.createdAt)),
            h('dt', null, t('updatedAt')),
            h('dd', null, formatDate(row.updatedAt)),
            h('dt', null, t('sizeApprox')),
            h('dd', null, formatBytes(row.sizeBytes)),
            row.formatStatus
              ? h(React.Fragment, null, h('dt', null, t('formatStatus')), h('dd', null, row.formatStatus))
              : null,
          ),
        ),
        row.can?.title === true
          ? h(TitleEditor, { ctx, t, session: row, onChanged: () => onChanged(t('apply')) })
          : null,
        h(PreviewList, { t, sessionId: row.id }),
        h(
          'section',
          { className: 'dsm-card' },
          h('h3', null, t('moveTo')),
          h('p', { className: 'dsm-hint', style: { margin: '0 0 8px' } }, t('moveHint')),
          row.archived ? h('p', { className: 'dsm-hint', style: { margin: '0 0 8px' } }, t('moveArchivedHint')) : null,
          movable && (row.forkCount ?? 0) > 0
            ? h('p', { className: 'dsm-hint', style: { margin: '0 0 8px' } }, t('moveForkChildrenHint', { n: row.forkCount }))
            : null,
          !movable
            ? h('p', { className: 'dsm-hint' },
                row.live ? t('moveLiveHint') : row.kind === 'fork' ? t('moveForkHint') : row.isSubagent ? t('moveSubagentHint') : row.can?.move === false ? t('moveDescendantsHint') : t('moveNoTarget'))
            : h(
                'div',
                { className: 'dsm-title-row' },
                h('select', {
                  className: 'dsm-select',
                  value: target,
                  onChange: (event) => setTarget(event.target.value),
                  'aria-label': t('moveTo'),
                },
                  targets.map((workspace) => h('option', { key: workspace.id, value: workspace.id }, workspace.title || workspace.path)),
                ),
                h('button', {
                  type: 'button',
                  className: 'dsm-btn primary',
                  disabled: busy || target === '',
                  onClick: () => onMove(row.id, target),
                }, busy ? t('moving') : t('moveConfirm')),
              ),
        ),
        row.archived
          ? h(
              'section',
              { className: 'dsm-card' },
              h('h3', null, t('deleteAction')),
              h('p', { className: 'dsm-hint', style: { margin: '0 0 8px' } }, t('deleteHint')),
              row.can?.delete !== true ? h('p', { className: 'dsm-hint' }, row.live ? t('deleteLiveHint') : t('deleteNotArchived')) : null,
              !showDelete
                ? h('button', {
                    type: 'button',
                    className: 'dsm-btn danger',
                    disabled: busy || row.can?.delete !== true,
                    onClick: () => setShowDelete(true),
                  }, t('deletePreviewAction'))
                : h(DeleteScope, {
                    ctx,
                    t,
                    ids: deleteIds,
                    maxBatch: limits?.maxBatch ?? 50,
                    busy,
                    onCancel: () => setShowDelete(false),
                    onConfirmed: (ids) => onDelete(ids),
                  }),
            )
          : null,
      )
    }

    // ---------------------------------------------------------------------
    // Page
    // ---------------------------------------------------------------------

    /**
     * Order one group's rows so a branch sits directly under its parent, the
     * way the sidebar nests it. A branch whose parent is filtered out of this
     * group stays at the top level and keeps its "from parent" meta line.
     */
    function orderBranchRows(rows) {
      const ids = new Set(rows.map((row) => row.id))
      const childrenOf = new Map()
      const tops = []
      for (const row of rows) {
        const parentId = row.kind === 'fork' ? row.parentSessionId : null
        if (parentId !== null && parentId !== row.id && ids.has(parentId)) {
          const list = childrenOf.get(parentId) ?? []
          list.push(row)
          childrenOf.set(parentId, list)
        } else {
          tops.push(row)
        }
      }
      const out = []
      const visited = new Set()
      const visit = (row, depth) => {
        if (visited.has(row.id)) return
        visited.add(row.id)
        out.push(depth === 0 ? row : { ...row, branchDepth: depth })
        for (const child of childrenOf.get(row.id) ?? []) visit(child, depth + 1)
      }
      for (const row of tops) visit(row, 0)
      // A corrupt parent cycle must not silently drop rows from the list.
      return out.length === rows.length ? out : rows
    }

    /** Tab / workspace / blank / text filter over one state's rows. */
    function filterRows(rows, { tab, workspaceFilter, query, showBlank }) {
      const text = (query ?? '').trim().toLowerCase()
      const filtering = text !== ''
      return rows.filter((row) => {
        if (tab === 'active' && row.archived) return false
        if (tab === 'archived' && !row.archived) return false
        if (workspaceFilter === 'ungrouped' && row.workspaceId !== null) return false
        if (workspaceFilter !== 'all' && workspaceFilter !== 'ungrouped' && row.workspaceId !== workspaceFilter) return false
        if (showBlank !== true && row.blank === true) return false
        if (filtering) {
          const haystack = `${row.title}\n${row.cwd}\n${row.id}\n${row.parentTitle ?? ''}`.toLowerCase()
          if (!haystack.includes(text)) return false
        }
        return true
      })
    }

    /** Id order used as the tie-break of every sort so paged slices stay stable. */
    function compareRowIds(left, right) {
      if (left.id === right.id) return 0
      return left.id < right.id ? -1 : 1
    }

    /** Sort a filtered row list; equal keys fall back to id ascending. */
    function sortRows(rows, sort) {
      return [...rows].sort((left, right) => {
        let order
        if (sort === 'created') order = right.createdAt - left.createdAt
        else if (sort === 'size') order = right.sizeBytes - left.sizeBytes
        else if (sort === 'title') order = (left.title || left.cwd).localeCompare(right.title || right.cwd)
        else order = right.updatedAt - left.updatedAt
        // `!order` also catches NaN from a missing numeric field.
        return !order ? compareRowIds(left, right) : order
      })
    }

    /** Group sorted rows in workspace order, keeping the ungrouped group last. */
    function groupRows(sorted, workspaceOrder) {
      const baseGroups = []
      for (const workspace of workspaceOrder) {
        const rows = orderBranchRows(sorted.filter((row) => row.workspaceId === workspace.id))
        if (rows.length === 0) continue
        baseGroups.push({
          ...workspace,
          rows,
          bytes: rows.reduce((sum, row) => sum + row.sizeBytes, 0),
        })
      }
      const ungroupedRows = orderBranchRows(sorted.filter((row) => row.workspaceId === null))
      if (ungroupedRows.length > 0) {
        baseGroups.push({
          id: 'ungrouped',
          title: '',
          path: '',
          rows: ungroupedRows,
          bytes: ungroupedRows.reduce((sum, row) => sum + row.sizeBytes, 0),
        })
      }
      return baseGroups
    }

    /** Attach expansion + page-limit state to each group; only expanded groups render rows. */
    function expandGroups(baseGroups, { expanded, defaultExpanded, limits, filtering }) {
      return baseGroups.map((group) => {
        const isExpanded = filtering ? true : (expanded === null ? defaultExpanded : expanded.has(group.id))
        const limit = limits[group.id] ?? GROUP_PAGE_SIZE
        return {
          ...group,
          expanded: isExpanded,
          limit,
          renderedRows: isExpanded ? group.rows.slice(0, limit) : [],
        }
      })
    }

    /**
     * Keep only the selected ids that are still visible. Returning the previous
     * Set when nothing is dropped keeps the React state identity stable.
     */
    function pruneSelection(selected, visibleIdSet) {
      if (selected.size === 0) return selected
      const next = new Set()
      for (const id of selected) if (visibleIdSet.has(id)) next.add(id)
      return next.size === selected.size ? selected : next
    }

    /**
     * Key of every scope-dependent client state (selection pruning, page
     * limits): it must change whenever a filter *or the sort* changes.
     */
    function scopeKey({ generatedAt, tab, workspaceFilter, query, sort, includeSubagents, showBlank, defaultExpanded, expanded }) {
      return [
        generatedAt ?? 0,
        tab,
        workspaceFilter,
        query,
        sort,
        includeSubagents ? 1 : 0,
        showBlank ? 1 : 0,
        defaultExpanded ? 1 : 0,
        expanded === null || expanded === undefined ? 'auto' : [...expanded].sort().join(','),
      ].join('|')
    }

    /**
     * Derive the filtered / grouped / rendered view for the list.
     * Pure so the selection-pruning effect can use it before the loading guard.
     */
    function computeView({ state, tab, workspaceFilter, query, sort, expanded, defaultExpanded, limits, showBlank }) {
      const rows = state?.sessions ?? []
      const workspaceOrder = state?.workspaces ?? []
      const filtering = query.trim() !== ''
      const sorted = sortRows(filterRows(rows, { tab, workspaceFilter, query, showBlank }), sort)
      const groups = expandGroups(groupRows(sorted, workspaceOrder), { expanded, defaultExpanded, limits, filtering })
      const visibleRows = groups.flatMap((group) => (group.expanded ? group.rows : []))
      return {
        filteredRows: sorted,
        groups,
        visibleRows,
        visibleIdSet: new Set(visibleRows.map((row) => row.id)),
      }
    }

    // ---------------------------------------------------------------------
    // Paged data layer helpers (pure; the page only schedules requests)
    // ---------------------------------------------------------------------

    /** True when a request failure means this Host build has no such route. */
    function isMissingRoute(failure) {
      return failure?.status === 404 || failure?.code === 'http-404' || failure?.code === 'not-found'
    }

    /** Encode a flat parameter object as a query string, skipping empty values. */
    function queryOf(params) {
      const parts = []
      for (const key of Object.keys(params ?? {})) {
        const value = params[key]
        if (value === undefined || value === null || value === '') continue
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      }
      return parts.join('&')
    }

    /** The six-field scope key that invalidates page caches and selection. */
    function dataScopeKey({ tab, workspaceFilter, query, sort, includeSubagents, showBlank }) {
      return [tab, workspaceFilter, query, sort, includeSubagents ? 1 : 0, showBlank ? 1 : 0].join('|')
    }

    /** Append one page to the loaded rows, skipping ids already on screen. */
    function mergePageRows(current, incoming) {
      if (!Array.isArray(incoming) || incoming.length === 0) return current
      const seen = new Set(current.map((row) => row.id))
      const out = [...current]
      for (const row of incoming) {
        if (seen.has(row.id)) continue
        seen.add(row.id)
        out.push(row)
      }
      return out
    }

    /** Merge rows into the id → row cache; later responses win. */
    function mergeRowCache(cache, rows) {
      if (!Array.isArray(rows) || rows.length === 0) return cache
      const next = new Map(cache)
      for (const row of rows) next.set(row.id, row)
      return next
    }

    /**
     * Nest one group's loaded rows and annotate branch rows whose parent is not
     * among them: such a row stays top level but keeps the "↳" glyph, and its
     * meta line distinguishes "not loaded", "no longer exists", and "from X".
     */
    function annotateBranchRows(rows) {
      const ordered = orderBranchRows(rows)
      const ids = new Set(rows.map((row) => row.id))
      return ordered.map((row) => {
        if (row.kind !== 'fork') return row
        const parentLoaded = row.parentSessionId !== null && ids.has(row.parentSessionId)
        if (parentLoaded) {
          return { ...row, branchParentTitle: row.parentTitle || '', branchParentMissing: false, branchParentNotLoaded: false }
        }
        const stub = row.parentStub
        const stubKnown = stub !== null && stub !== undefined
        const present = stubKnown ? stub.present === true : row.parentPresent !== false
        const stubTitle = stubKnown && typeof stub.title === 'string' ? stub.title : ''
        const title = stubTitle !== '' ? stubTitle : row.parentTitle || ''
        if (present !== true) {
          return { ...row, branchDepth: 0, branchOrphan: true, branchParentTitle: '', branchParentMissing: true, branchParentNotLoaded: false }
        }
        if (title !== '') {
          return { ...row, branchDepth: 0, branchOrphan: true, branchParentTitle: title, branchParentMissing: false, branchParentNotLoaded: false }
        }
        return { ...row, branchDepth: 0, branchOrphan: true, branchParentTitle: '', branchParentMissing: false, branchParentNotLoaded: true }
      })
    }

    /** A `/state` payload expressed in the `/overview` shape (old-Host fallback). */
    function overviewFromState(state) {
      const rows = Array.isArray(state?.sessions) ? state.sessions : []
      const workspaces = Array.isArray(state?.workspaces) ? state.workspaces : []
      const bucketOf = (subset) => ({
        count: subset.length,
        activeCount: subset.filter((row) => !row.archived).length,
        archivedCount: subset.filter((row) => row.archived).length,
        blankCount: subset.filter((row) => row.blank === true).length,
      })
      const totals = state?.totals ?? {}
      const ungroupedRows = rows.filter((row) => row.workspaceId === null)
      return {
        generatedAt: state?.generatedAt ?? 0,
        source: 'legacy',
        backend: state?.backend,
        capabilities: state?.capabilities ?? {},
        limits: state?.limits ?? {},
        workspaces: workspaces.map((workspace) => ({
          ...workspace,
          ...bucketOf(rows.filter((row) => row.workspaceId === workspace.id)),
          totalBytes: null,
        })),
        ungrouped: { ...bucketOf(ungroupedRows), totalBytes: null },
        totals: {
          all: totals.all ?? rows.length,
          active: totals.active ?? rows.filter((row) => !row.archived).length,
          archived: totals.archived ?? rows.filter((row) => row.archived).length,
          subagents: rows.filter((row) => row.isSubagent === true).length,
          hiddenSubagents: totals.hiddenSubagents ?? 0,
          forks: rows.filter((row) => row.kind === 'fork').length,
          blank: rows.filter((row) => row.blank === true).length,
          bytes: totals.bytes ?? null,
        },
        orphans: Array.isArray(state?.orphans) ? state.orphans : [],
      }
    }

    /** The three blank-session id lists, derived from one `/state` payload. */
    function blanksFromState(state) {
      const rows = Array.isArray(state?.sessions) ? state.sessions : []
      const blank = rows.filter((row) => row.blank === true)
      return {
        unarchivedIds: blank.filter((row) => !row.archived).map((row) => row.id),
        archivedIds: blank.filter((row) => row.archived).map((row) => row.id),
        deletableIds: blank.filter((row) => row.archived && row.can?.delete === true).map((row) => row.id),
      }
    }

    function bytesOf(value) {
      if (value === null || value === undefined) return null
      const number = Number(value)
      return Number.isFinite(number) ? number : null
    }

    /**
     * Normalize the `/sizes` payload:
     * `{total:{bytes,count}, workspaces:[{id,bytes,count}], ungrouped:{bytes,count}}`.
     * The short aliases keep a degraded or older payload usable.
     */
    function normalizeSizes(value) {
      const byWorkspace = new Map()
      const list = Array.isArray(value) ? value : Array.isArray(value?.workspaces) ? value.workspaces : []
      for (const item of list) {
        if (item === null || typeof item !== 'object') continue
        const id = typeof item.id === 'string' ? item.id : typeof item.workspaceId === 'string' ? item.workspaceId : ''
        if (id === '') continue
        const bytes = bytesOf(item.totalBytes ?? item.bytes ?? item.sizeBytes)
        if (bytes !== null) byWorkspace.set(id, bytes)
      }
      const ungroupedBytes = bytesOf(value?.ungrouped?.bytes ?? value?.ungrouped?.totalBytes)
      if (ungroupedBytes !== null) byWorkspace.set('ungrouped', ungroupedBytes)
      const totalSource = value?.totalBytes ?? value?.bytes ?? value?.total
      const totalBytes = totalSource !== null && typeof totalSource === 'object'
        ? bytesOf(totalSource.bytes ?? totalSource.totalBytes ?? totalSource.sizeBytes)
        : bytesOf(totalSource)
      return { totalBytes, byWorkspace }
    }

    function formatBytesOrDash(bytes) {
      return Number.isFinite(bytes) && bytes >= 0 ? formatBytes(bytes) : '—'
    }

    /** Count one overview bucket for a tab. */
    function countBucket(bucket, tab) {
      if (bucket === null || bucket === undefined) return 0
      if (tab === 'archived') return bucket.archivedCount ?? 0
      if (tab === 'active') return bucket.activeCount ?? 0
      return bucket.count ?? 0
    }

    /**
     * Compose the rendered groups from the overview plus the loaded page cache.
     * Pure: the page component only memoizes it. `searchMode` keeps only groups
     * the search answered for; `requirePage` does the same for the legacy
     * fallback, whose pages are built locally.
     */
    function composeGroups({ overview, pages, sizes, expanded, defaultExpanded, query, tab, workspaceFilter, showBlank, searchMode, requirePage, legacy, legacyLimits }) {
      const filtering = typeof query === 'string' && query.trim() !== ''
      const isExpanded = (id) => (filtering ? true : expanded === null ? defaultExpanded : expanded.has(id))
      const workspaces = Array.isArray(overview?.workspaces) ? overview.workspaces : []
      const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]))
      const ids = []
      for (const workspace of workspaces) {
        if (workspaceFilter !== 'all' && workspace.id !== workspaceFilter) continue
        ids.push(workspace.id)
      }
      const ungrouped = overview?.ungrouped
      if ((workspaceFilter === 'all' || workspaceFilter === 'ungrouped') && (ungrouped?.count ?? 0) > 0) ids.push('ungrouped')
      const groups = []
      for (const id of ids) {
        // Structural checks: these maps may come from another realm in tests.
        const page = pages !== null && pages !== undefined && typeof pages.get === 'function' ? pages.get(id) : undefined
        if ((searchMode === true || requirePage === true) && page === undefined) continue
        const meta = id === 'ungrouped'
          ? { title: '', path: '', status: 'ok' }
          : workspaceById.get(id) ?? { title: '', path: '', status: 'ok' }
        let fallbackCount = id === 'ungrouped' ? countBucket(ungrouped, tab) : countBucket(meta, tab)
        if (showBlank !== true && tab === 'all') {
          fallbackCount -= id === 'ungrouped' ? ungrouped?.blankCount ?? 0 : meta.blankCount ?? 0
        }
        if (fallbackCount < 0) fallbackCount = 0
        if (page === undefined && fallbackCount <= 0) continue
        if (page !== undefined && page.phase === 'ready' && (page.total ?? 0) === 0) continue
        const rows = annotateBranchRows(Array.isArray(page?.rows) ? page.rows : [])
        // The legacy fallback has every row in memory but keeps the 0.1.x
        // per-group window: expand to 50, "load more" grows it by 50.
        const windowSize = legacy === true ? legacyLimits?.[id] ?? GROUP_PAGE_SIZE : rows.length
        groups.push({
          id,
          title: meta.title ?? '',
          path: meta.path ?? '',
          status: meta.status,
          rows,
          renderedRows: isExpanded(id) ? rows.slice(0, windowSize) : [],
          expanded: isExpanded(id),
          total: page !== undefined && Number.isFinite(page.total) ? page.total : fallbackCount,
          hasMore: page?.hasMore === true,
          phase: page?.phase ?? 'idle',
          error: page?.error ?? null,
          bytes: sizes !== null && sizes !== undefined && typeof sizes.byWorkspace?.get === 'function' ? sizes.byWorkspace.get(id) ?? null : null,
        })
      }
      const visibleRows = groups.flatMap((group) => (group.expanded === true ? group.rows : []))
      let partialCount = 0
      for (const group of groups) {
        if (group.expanded !== true) continue
        partialCount += Math.max(0, (group.total ?? 0) - group.rows.length)
      }
      return {
        groups,
        visibleRows,
        visibleIdSet: new Set(visibleRows.map((row) => row.id)),
        partialCount,
      }
    }

    /** Run scheduled page loads with a small concurrency ceiling. */
    function pumpLimiter(state) {
      while (state.active < MAX_CONCURRENT_PAGES && state.queue.length > 0) {
        const task = state.queue.shift()
        state.active += 1
        Promise.resolve()
          .then(task)
          .catch(() => {})
          .then(() => {
            state.active -= 1
            pumpLimiter(state)
          })
      }
    }

    function SessionManagerPage(props) {
      const { ctx, t } = props
      useLocaleTick(ctx)
      const [tab, setTab] = React.useState('all')
      const [workspaceFilter, setWorkspaceFilter] = React.useState('all')
      const [queryInput, setQueryInput] = React.useState('')
      const [query, setQuery] = React.useState('')
      const [sort, setSort] = React.useState('updated')
      const [includeSubagents, setIncludeSubagents] = React.useState(false)
      const [showBlank, setShowBlank] = React.useState(false)
      const [expanded, setExpanded] = React.useState(null)
      const [selected, setSelected] = React.useState(() => new Set())
      const [selectedId, setSelectedId] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [notice, setNotice] = React.useState(null)
      const [bulkDeleteIds, setBulkDeleteIds] = React.useState(null)
      const [bulkTarget, setBulkTarget] = React.useState('')
      // Two-stage data layer: `overview` is the first paint, `pages` holds one
      // lazily loaded page box per workspace, `rowCache` is the only row source
      // for the detail view and for batch submissions.
      const [transport, setTransport] = React.useState('loading')
      const [overview, setOverview] = React.useState(null)
      const [overviewPhase, setOverviewPhase] = React.useState('loading')
      const [overviewError, setOverviewError] = React.useState(null)
      const [legacyState, setLegacyState] = React.useState(null)
      const [pages, setPages] = React.useState(() => new Map())
      const [rowCache, setRowCache] = React.useState(() => new Map())
      const [blanks, setBlanks] = React.useState(null)
      const [sizes, setSizes] = React.useState(null)
      const [sizesPhase, setSizesPhase] = React.useState('idle')
      const [searchPhase, setSearchPhase] = React.useState('idle')
      const [searchError, setSearchError] = React.useState(null)
      const [reload, setReload] = React.useState(0)
      // Legacy fallback only: per-group row window (0.1.x "load more").
      const [legacyLimits, setLegacyLimits] = React.useState({})
      const [detail, setDetail] = React.useState(null)
      const [detailPhase, setDetailPhase] = React.useState('idle')
      const [detailError, setDetailError] = React.useState(null)
      const [detailNonce, setDetailNonce] = React.useState(0)
      const searchRef = React.useRef(null)
      const listScroll = React.useRef(0)
      const overviewAbort = React.useRef(null)
      const sizesAbort = React.useRef(null)
      const searchAbort = React.useRef(null)
      const detailAbort = React.useRef(null)
      const pagesEpoch = React.useRef(0)
      const pageControllers = React.useRef(new Map())
      const inflightPages = React.useRef(new Set())
      const limiter = React.useRef({ active: 0, queue: [] })
      const preserveCounts = React.useRef(new Map())
      const preserveChain = React.useRef(new Set())
      const transportRef = React.useRef('loading')
      const overviewRef = React.useRef(null)
      const legacyStateRef = React.useRef(null)
      const pagesRef = React.useRef(pages)
      const rowCacheRef = React.useRef(rowCache)
      const tabRef = React.useRef(tab)
      const sortRef = React.useRef(sort)
      const queryRef = React.useRef(query)
      const includeSubagentsRef = React.useRef(includeSubagents)
      const showBlankRef = React.useRef(showBlank)
      // Latest-value refs: background tasks read these instead of stale closures.
      pagesRef.current = pages
      rowCacheRef.current = rowCache
      tabRef.current = tab
      sortRef.current = sort
      queryRef.current = query
      includeSubagentsRef.current = includeSubagents
      showBlankRef.current = showBlank

      const scope = dataScopeKey({ tab, workspaceFilter, query, sort, includeSubagents, showBlank })
      const isSearch = query !== ''

      /** The two empty-session shortcuts' id lists; absent until a response lands. */
      const loadBlanks = async () => {
        try {
          const value = await getBlanks(includeSubagentsRef.current)
          if (value !== null && value !== undefined) setBlanks(value)
        } catch {
          // The shortcuts degrade to hidden buttons when /blanks is unavailable.
          setBlanks(null)
        }
      }

      /** Total / per-workspace bytes, fetched out of band and never awaited. */
      const loadSizes = async () => {
        sizesAbort.current?.abort()
        const controller = new AbortController()
        sizesAbort.current = controller
        setSizesPhase('loading')
        try {
          const value = await getSizes('all', includeSubagentsRef.current, controller.signal)
          if (controller.signal.aborted) return
          setSizes(normalizeSizes(value))
          setSizesPhase('ready')
        } catch (failure) {
          if (failure?.name === 'AbortError') return
          setSizes(null)
          setSizesPhase('error')
        }
      }

      /**
       * First paint: `/overview` (counts only). A Host that predates the route
       * is detected once and served by the 0.1.x `/state` path from then on.
       */
      const loadOverview = async (options = {}) => {
        overviewAbort.current?.abort()
        const controller = new AbortController()
        overviewAbort.current = controller
        const silent = options.silent === true
        if (!silent && overviewRef.current === null) setOverviewPhase('loading')
        try {
          if (transportRef.current !== 'legacy') {
            try {
              const value = await getOverview(includeSubagentsRef.current, controller.signal)
              if (controller.signal.aborted) return
              transportRef.current = 'paged'
              setTransport('paged')
              overviewRef.current = value
              setOverview(value)
              setOverviewPhase('ready')
              setOverviewError(null)
              void loadBlanks()
              return
            } catch (failure) {
              if (failure?.name === 'AbortError') return
              if (transportRef.current !== 'loading' || !isMissingRoute(failure)) throw failure
              // Old Host: no /overview route at all. Fall back for good.
              transportRef.current = 'legacy'
              setTransport('legacy')
            }
          }
          const value = await getState(includeSubagentsRef.current, controller.signal)
          if (controller.signal.aborted) return
          legacyStateRef.current = value
          setLegacyState(value)
          setOverview(overviewFromState(value))
          setBlanks(blanksFromState(value))
          setOverviewPhase('ready')
          setOverviewError(null)
        } catch (failure) {
          if (failure?.name === 'AbortError') return
          setOverviewError(failure)
          setOverviewPhase('error')
        }
      }

      /** Cross-workspace search: one request answers every matching workspace. */
      const runSearch = async () => {
        searchAbort.current?.abort()
        const controller = new AbortController()
        searchAbort.current = controller
        const epoch = pagesEpoch.current
        setSearchPhase('loading')
        setSearchError(null)
        try {
          const value = await getSearch({
            query: queryRef.current,
            tab: tabRef.current,
            sort: sortRef.current,
            subagents: includeSubagentsRef.current ? 1 : 0,
            blank: showBlankRef.current ? 1 : 0,
            limitPerGroup: GROUP_PAGE_SIZE,
          }, controller.signal)
          if (controller.signal.aborted || epoch !== pagesEpoch.current) return
          const groups = Array.isArray(value?.groups) ? value.groups : []
          const nextPages = new Map()
          const cacheRows = []
          for (const group of groups) {
            const id = group?.workspaceId === null || group?.workspaceId === undefined ? 'ungrouped' : group.workspaceId
            const rows = Array.isArray(group?.rows) ? group.rows : []
            nextPages.set(id, {
              rows,
              total: Number.isFinite(group?.total) ? group.total : rows.length,
              offset: rows.length,
              hasMore: group?.hasMore === true,
              phase: 'ready',
              error: null,
            })
            for (const row of rows) cacheRows.push(row)
          }
          pagesRef.current = nextPages
          setPages(nextPages)
          setRowCache((previous) => mergeRowCache(previous, cacheRows))
          setSearchPhase('ready')
        } catch (failure) {
          if (failure?.name === 'AbortError') return
          if (epoch !== pagesEpoch.current) return
          setSearchError(failure)
          setSearchPhase('error')
        }
      }

      /** Load (or append) one workspace page; stale epochs are dropped. */
      const loadGroupPage = async (groupId, requestOffset, options = {}) => {
        if (transportRef.current !== 'paged') return
        const append = options.append === true
        const epoch = pagesEpoch.current
        const controller = new AbortController()
        pageControllers.current.get(groupId)?.abort()
        pageControllers.current.set(groupId, controller)
        setPages((previous) => {
          const next = new Map(previous)
          const page = next.get(groupId) ?? { rows: [], total: 0, offset: 0, hasMore: false }
          next.set(groupId, { ...page, phase: 'loading', error: null })
          return next
        })
        try {
          const value = await getSessions({
            workspaceId: groupId,
            tab: tabRef.current,
            query: queryRef.current,
            sort: sortRef.current,
            subagents: includeSubagentsRef.current ? 1 : 0,
            blank: showBlankRef.current ? 1 : 0,
            offset: requestOffset,
            limit: GROUP_PAGE_SIZE,
            sizes: 1,
          }, controller.signal)
          if (controller.signal.aborted || epoch !== pagesEpoch.current) return
          const incoming = Array.isArray(value?.rows) ? value.rows : []
          setPages((previous) => {
            const next = new Map(previous)
            const page = next.get(groupId) ?? { rows: [], total: 0, offset: 0, hasMore: false }
            const rows = append ? mergePageRows(page.rows, incoming) : incoming
            next.set(groupId, {
              rows,
              total: Number.isFinite(value?.total) ? value.total : rows.length,
              offset: (Number.isFinite(requestOffset) ? requestOffset : 0) + incoming.length,
              hasMore: value?.hasMore === true,
              phase: 'ready',
              error: null,
            })
            return next
          })
          setRowCache((previous) => mergeRowCache(previous, incoming))
          // Walk back down to the depth this group had loaded before a refresh
          // (writes and the Refresh button preserve selection/scroll).
          const target = preserveCounts.current.get(groupId)
          if (target !== undefined) {
            const loaded = (Number.isFinite(requestOffset) ? requestOffset : 0) + incoming.length
            if (loaded < target && value?.hasMore === true) {
              if (!preserveChain.current.has(groupId)) {
                preserveChain.current.add(groupId)
                schedulePage(async () => {
                  try {
                    await loadGroupPage(groupId, loaded, { append: true })
                  } finally {
                    preserveChain.current.delete(groupId)
                  }
                })
              }
            } else {
              preserveCounts.current.delete(groupId)
            }
          }
        } catch (failure) {
          if (failure?.name === 'AbortError') return
          if (epoch !== pagesEpoch.current) return
          setPages((previous) => {
            const next = new Map(previous)
            const page = next.get(groupId) ?? { rows: [], total: 0, offset: 0, hasMore: false }
            next.set(groupId, { ...page, phase: 'error', error: failure })
            return next
          })
        } finally {
          if (pageControllers.current.get(groupId) === controller) pageControllers.current.delete(groupId)
        }
      }

      /** Queue one page load under the shared concurrency ceiling. */
      const schedulePage = (task) => {
        const state = limiter.current
        state.queue.push(task)
        pumpLimiter(state)
      }

      const ensureGroupPage = (groupId, force = false) => {
        if (transportRef.current !== 'paged') return
        if (force !== true && pagesRef.current.has(groupId)) return
        if (inflightPages.current.has(groupId)) return
        inflightPages.current.add(groupId)
        schedulePage(async () => {
          try {
            await loadGroupPage(groupId, 0)
          } finally {
            inflightPages.current.delete(groupId)
          }
        })
      }

      const loadMoreGroup = (groupId) => {
        if (transportRef.current !== 'paged') return
        if (inflightPages.current.has(groupId)) return
        const page = pagesRef.current.get(groupId)
        const offset = page?.rows?.length ?? 0
        inflightPages.current.add(groupId)
        schedulePage(async () => {
          try {
            await loadGroupPage(groupId, offset, { append: true })
          } finally {
            inflightPages.current.delete(groupId)
          }
        })
      }

      const retryGroup = (groupId) => {
        ensureGroupPage(groupId, true)
      }

      /** Drop every loaded page (scope change or an explicit refresh). */
      const resetPageCache = (clearSelection) => {
        pagesEpoch.current += 1
        for (const controller of pageControllers.current.values()) controller.abort()
        pageControllers.current.clear()
        inflightPages.current.clear()
        preserveChain.current = new Set()
        if (clearSelection === true) preserveCounts.current = new Map()
        setLegacyLimits({})
        pagesRef.current = new Map()
        setPages(new Map())
        if (clearSelection === true) setSelected(new Set())
        setSearchPhase('idle')
        setSearchError(null)
      }

      /** Refresh after a write or the Refresh button: overview first, then pages. */
      const refresh = async () => {
        // Remember how deep each loaded group was so the refetch keeps the
        // user's scroll position instead of collapsing back to one page.
        const counts = new Map()
        for (const [groupId, page] of pagesRef.current) {
          if (page?.phase === 'ready' && (page.rows?.length ?? 0) > 0) counts.set(groupId, page.rows.length)
        }
        preserveCounts.current = counts
        await loadOverview({ silent: true })
        setReload((value) => value + 1)
        setDetailNonce((value) => value + 1)
      }

      React.useEffect(() => {
        void loadOverview()
        return () => {
          overviewAbort.current?.abort()
          for (const controller of pageControllers.current.values()) controller.abort()
        }
      }, [includeSubagents])

      // The window gaining focus only refreshes the cheap first paint; open
      // workspaces stay as they are and reload on the next explicit action.
      React.useEffect(() => {
        const onFocus = () => void loadOverview({ silent: true })
        window.addEventListener('focus', onFocus)
        return () => window.removeEventListener('focus', onFocus)
      }, [])

      // A scope change invalidates every page AND the selection (data safety:
      // an id selected under another tab/query must never reach a batch call).
      React.useEffect(() => {
        resetPageCache(true)
      }, [scope])

      // A write or manual refresh drops the loaded pages but keeps the selection.
      // The legacy path rebuilds its pages from /state instead of clearing them.
      React.useEffect(() => {
        if (reload === 0) return
        if (transportRef.current === 'legacy') {
          setLegacyLimits({})
          return
        }
        resetPageCache(false)
      }, [reload])

      // Old-Host fallback: pages are carved locally out of one /state payload.
      React.useEffect(() => {
        if (transport !== 'legacy' || legacyState === null) return
        const viewNow = computeView({
          state: legacyState,
          tab,
          workspaceFilter,
          query,
          sort,
          expanded: null,
          defaultExpanded: false,
          limits: {},
          showBlank,
        })
        const nextPages = new Map()
        for (const group of viewNow.groups) {
          nextPages.set(group.id, {
            rows: group.rows,
            total: group.rows.length,
            offset: group.rows.length,
            hasMore: false,
            phase: 'ready',
            error: null,
          })
        }
        pagesRef.current = nextPages
        setPages(nextPages)
        setRowCache((previous) => mergeRowCache(previous, viewNow.groups.flatMap((group) => group.rows)))
        setSizes({
          totalBytes: bytesOf(legacyState?.totals?.bytes),
          byWorkspace: new Map(viewNow.groups.map((group) => [group.id, group.bytes])),
        })
        setSizesPhase('ready')
      }, [transport, legacyState, scope, reload])

      // Search is server-side and debounced through `query`; the applied query
      // is part of the scope key, so old results never survive a new search.
      React.useEffect(() => {
        if (transport !== 'paged' || query.trim() === '') return undefined
        void runSearch()
        return () => searchAbort.current?.abort()
      }, [transport, scope, reload])

      React.useEffect(() => {
        if (transport !== 'paged') return
        void loadSizes()
        return () => sizesAbort.current?.abort()
      }, [transport, includeSubagents, reload])

      // Typing is debounced; `query` only changes once the user pauses.
      React.useEffect(() => {
        const text = queryInput.trim()
        if (text === query) return undefined
        const timer = setTimeout(() => setQuery(text), SEARCH_DEBOUNCE_MS)
        return () => clearTimeout(timer)
      }, [queryInput, query])

      React.useEffect(() => {
        if (selectedId === null) return
        const detailElement = document.querySelector('.dsm-detail')
        const parent = scrollParentOf(detailElement)
        if (parent !== null && typeof parent.scrollTop === 'number') parent.scrollTop = 0
      }, [selectedId])

      React.useEffect(() => {
        if (selectedId === null) return undefined
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            if (document.querySelector('.dsm-scope-overlay') !== null) return
            event.stopPropagation()
            backToList()
          }
        }
        document.addEventListener('keydown', onKeyDown, true)
        return () => document.removeEventListener('keydown', onKeyDown, true)
      }, [selectedId])

      // Detail row: render the cached row immediately, then refresh it from the
      // dedicated route; only an explicit not-found clears the view.
      React.useEffect(() => {
        detailAbort.current?.abort()
        if (selectedId === null) {
          setDetail(null)
          setDetailPhase('idle')
          setDetailError(null)
          return undefined
        }
        const cached = rowCacheRef.current.get(selectedId)
        if (cached !== undefined) {
          setDetail(cached)
          setDetailPhase('ready')
        } else {
          setDetail(null)
          setDetailPhase('loading')
        }
        const controller = new AbortController()
        detailAbort.current = controller
        if (transportRef.current === 'legacy') {
          const stateNow = legacyStateRef.current
          const row = (stateNow?.sessions ?? []).find((item) => item.id === selectedId)
          if (row !== undefined) {
            setDetail(row)
            setDetailPhase('ready')
          } else if (cached === undefined) {
            setDetailPhase('missing')
          }
          return () => controller.abort()
        }
        getSession(selectedId, controller.signal)
          .then((value) => {
            if (controller.signal.aborted) return
            if (value?.row !== undefined && value?.row !== null) {
              setDetail(value.row)
              setDetailPhase('ready')
              setDetailError(null)
              setRowCache((previous) => mergeRowCache(previous, [value.row]))
            } else if (cached === undefined) {
              setDetailPhase('missing')
            }
          })
          .catch((failure) => {
            if (failure?.name === 'AbortError') return
            // The Host answers an unknown id with `not-found`; that is the only
            // case that may clear the detail view. A missing *route* (old Host)
            // keeps the cached row visible instead.
            if (failure?.code === 'not-found') {
              setDetail(null)
              setDetailPhase('missing')
              return
            }
            if (isMissingRoute(failure)) {
              if (cached === undefined) setDetailPhase('missing')
              return
            }
            if (cached === undefined) {
              setDetailError(failure)
              setDetailPhase('error')
            }
          })
        return () => controller.abort()
      }, [selectedId, detailNonce])

      const totals = overview?.totals ?? {}
      const limits = overview?.limits ?? {}
      const defaultExpanded = (totals.all ?? 0) <= DEFAULT_COLLAPSE_AFTER
      const view = React.useMemo(
        () => composeGroups({
          overview,
          pages,
          sizes,
          expanded,
          defaultExpanded,
          query,
          tab,
          workspaceFilter,
          showBlank,
          searchMode: transport === 'paged' && isSearch,
          requirePage: transport === 'legacy',
          legacy: transport === 'legacy',
          legacyLimits,
        }),
        [overview, pages, sizes, expanded, defaultExpanded, query, tab, workspaceFilter, showBlank, transport, isSearch, legacyLimits],
      )
      const expandedIdsKey = view.groups.filter((group) => group.expanded === true).map((group) => group.id).join('|')
      React.useEffect(() => {
        if (transport !== 'paged' || isSearch) return
        for (const group of view.groups) if (group.expanded === true) ensureGroupPage(group.id)
      }, [transport, scope, reload, expandedIdsKey])

      const visibleKey = React.useMemo(
        () => view.groups.filter((group) => group.expanded === true).map((group) => group.rows.map((row) => row.id).join(',')).join('|'),
        [view],
      )
      React.useEffect(() => {
        setSelected((previous) => {
          if (previous.size === 0) return previous
          const visible = new Set()
          for (const group of view.groups) {
            if (group.expanded !== true) continue
            for (const row of group.rows) visible.add(row.id)
          }
          const next = new Set()
          for (const id of previous) if (visible.has(id)) next.add(id)
          return next.size === previous.size ? previous : next
        })
      }, [visibleKey])

      const rows = overview === null ? [] : view.groups
      const blankIds = blanks ?? { unarchivedIds: [], archivedIds: [], deletableIds: [] }
      const tabCounts = {
        all: Math.max(0, (totals.all ?? 0) - (showBlank ? 0 : (totals.blank ?? 0))),
        active: Math.max(0, (totals.active ?? 0) - (showBlank ? 0 : (blankIds.unarchivedIds.length ?? 0))),
        archived: Math.max(0, (totals.archived ?? 0) - (showBlank ? 0 : (blankIds.archivedIds.length ?? 0))),
      }
      const tabs = [
        { key: 'all', label: t('tabAll'), count: tabCounts.all },
        { key: 'active', label: t('tabActive'), count: tabCounts.active },
        { key: 'archived', label: t('tabArchived'), count: tabCounts.archived },
      ]
      const maxBatch = limits.maxBatch ?? 50
      const maxMoveBatch = limits.maxMoveBatch ?? 20
      const selectedRows = [...selected].map((id) => rowCache.get(id)).filter((row) => row !== undefined)
      const visibleAllSelected = view.visibleRows.length > 0 && view.visibleRows.every((row) => selected.has(row.id))
      const overBatch = selectedRows.length > maxBatch
      const overMove = selectedRows.length > maxMoveBatch
      const selectedArchived = selectedRows.length > 0 && !overBatch && selectedRows.every((row) => row.archived)
      const selectedActive = selectedRows.length > 0 && !overBatch && selectedRows.every((row) => !row.archived)
      const selectedMovable =
        selectedRows.length > 0 && !overMove &&
        selectedRows.every((row) => row.can?.move === true) &&
        new Set(selectedRows.map((row) => row.workspaceId)).size === 1
      const selectedDeletable = selectedRows.length > 0 && !overBatch && selectedRows.every((row) => row.can?.delete === true)
      const targetWorkspaces = (overview?.workspaces ?? []).filter((workspace) => {
        if (workspace.status !== 'ok') return false
        return !selectedRows.some((row) => row.workspaceId === workspace.id)
      })
      const totalBytes = sizes?.totalBytes
      const sizeText = Number.isFinite(totalBytes) ? formatBytes(totalBytes) : '—'

      const run = async (operation, successText) => {
        setBusy(true)
        setNotice(null)
        try {
          const value = await operation()
          setNotice({ tone: 'ok', text: successText(value) })
          await refresh()
          return value
        } catch (failure) {
          setNotice({ tone: 'error', text: errorText(t, failure), detail: failure?.message })
          return undefined
        } finally {
          setBusy(false)
        }
      }

      const resultText = (value) => {
        const valueTotals = value?.totals
        if (valueTotals === undefined) return t('working')
        return t('batchDone', { ok: valueTotals.succeeded, failed: valueTotals.failed })
      }

      const archiveRows = async (ids, stopActivity = false) => {
        const value = await run(
          () => post('archive', { sessionIds: ids, stopActivity }),
          (result) => resultText(result),
        )
        const activeFailures = (value?.results ?? []).filter((item) => item.ok === false && item.error?.code === 'session-active')
        if (activeFailures.length > 0 && stopActivity !== true) {
          setNotice({
            tone: 'warn',
            text: t('sessionActive'),
            action: { label: t('stopAndArchive'), run: () => void archiveRows(ids, true) },
          })
        }
        return value
      }

      const restoreRows = async (ids) => {
        return await run(() => post('unarchive', { sessionIds: ids }), () => t('restoreDone', { n: ids.length }))
      }

      const moveRows = async (ids, workspaceId) => {
        return await run(
          () => post('move', { sessionIds: ids, workspaceId }),
          (result) => resultText(result),
        )
      }

      /**
       * Permanently delete sessions in backend-sized batches. One confirmation
       * may cover more ids than a single request admits (the empty-session
       * shortcut can), so the request is split and the totals are summed into
       * one notice.
       */
      const deleteRows = async (ids) => {
        if (ids.length === 0) return undefined
        setBusy(true)
        setNotice(null)
        try {
          let succeeded = 0
          let failed = 0
          const failures = []
          for (let index = 0; index < ids.length; index += maxBatch) {
            const value = await post('delete', { sessionIds: ids.slice(index, index + maxBatch), confirm: true })
            succeeded += value?.totals?.succeeded ?? 0
            failed += value?.totals?.failed ?? 0
            for (const item of value?.results ?? []) if (item.ok === false) failures.push(item)
          }
          setNotice(
            failed === 0
              ? { tone: 'ok', text: t('batchDone', { ok: succeeded, failed: 0 }) }
              : { tone: 'error', text: t('batchDone', { ok: succeeded, failed }), details: failures.slice(0, 20) },
          )
          setBulkDeleteIds(null)
          setSelected(new Set())
          if (selectedId !== null && ids.includes(selectedId)) setSelectedId(null)
          await refresh()
          return { totals: { succeeded, failed } }
        } catch (failure) {
          setNotice({ tone: 'error', text: errorText(t, failure), detail: failure?.message })
          return undefined
        } finally {
          setBusy(false)
        }
      }

      const cleanupOrphans = async () => {
        const ids = overview?.orphans ?? []
        if (ids.length === 0) return
        setBusy(true)
        setNotice(null)
        try {
          let cleaned = 0
          for (let index = 0; index < ids.length; index += maxBatch) {
            await post('unarchive', { sessionIds: ids.slice(index, index + maxBatch) })
            cleaned += Math.min(maxBatch, ids.length - index)
          }
          setNotice({ tone: 'ok', text: t('cleanedOrphans', { n: cleaned }) })
          await refresh()
        } catch (failure) {
          setNotice({ tone: 'error', text: errorText(t, failure) })
        } finally {
          setBusy(false)
        }
      }

      /**
       * Archive every unarchived empty session, in backend-sized batches. The
       * user can then clean them up with one confirm dialog.
       */
      const archiveBlankSessions = async (ids) => {
        if (ids.length === 0) return
        setBusy(true)
        setNotice(null)
        try {
          let archived = 0
          const failures = []
          for (let index = 0; index < ids.length; index += maxBatch) {
            const value = await post('archive', { sessionIds: ids.slice(index, index + maxBatch) })
            archived += value?.totals?.succeeded ?? 0
            for (const item of value?.results ?? []) if (item.ok === false) failures.push(item)
          }
          if (failures.length === 0) {
            setNotice({ tone: 'ok', text: t('archiveDone', { n: archived }) })
          } else {
            setNotice({
              tone: 'error',
              text: t('batchDone', { ok: archived, failed: failures.length }),
              details: failures.slice(0, 20),
            })
          }
          await refresh()
        } catch (failure) {
          setNotice({ tone: 'error', text: errorText(t, failure) })
        } finally {
          setBusy(false)
        }
      }

      const openSession = (id) => {
        let service
        try {
          service = ctx.get?.('uiWorkspace')
        } catch {
          service = undefined
        }
        if (typeof service?.openSession !== 'function') return
        try {
          props.close?.()
          service.openSession(id)
        } catch (failure) {
          setNotice({ tone: 'error', text: t('openFailed', { message: messageOf(failure) }) })
        }
      }

      const restoreAndOpen = async (id) => {
        const value = await restoreRows([id])
        if (value !== undefined) openSession(id)
      }

      const openDetail = (id) => {
        const page = document.querySelector('.dsm-page')
        const parent = scrollParentOf(page)
        listScroll.current = parent?.scrollTop ?? 0
        setSelectedId(id)
      }

      const backToList = () => {
        setSelectedId(null)
        requestAnimationFrame(() => {
          const page = document.querySelector('.dsm-page')
          const parent = scrollParentOf(page)
          if (parent !== null && typeof parent.scrollTop === 'number') parent.scrollTop = listScroll.current
        })
      }

      const toggle = (id) => {
        setSelected((previous) => {
          const next = new Set(previous)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
      }
      const toggleAll = () => {
        if (visibleAllSelected) {
          setSelected((previous) => {
            const next = new Set(previous)
            for (const row of view.visibleRows) next.delete(row.id)
            return next
          })
        } else {
          setSelected((previous) => {
            const next = new Set(previous)
            for (const row of view.visibleRows) next.add(row.id)
            return next
          })
        }
      }
      const toggleGroup = (id) => {
        setExpanded((previous) => {
          const base = previous === null
            ? new Set(view.groups.filter((group) => group.expanded).map((group) => group.id))
            : new Set(previous)
          const group = view.groups.find((item) => item.id === id)
          if (group?.expanded === true) base.delete(id)
          else base.add(id)
          return base
        })
      }
      const expandAll = () => setExpanded(new Set(view.groups.map((group) => group.id)))
      const collapseAll = () => setExpanded(new Set())
      const loadMore = (id) => {
        if (transportRef.current === 'legacy') {
          setLegacyLimits((previous) => ({ ...previous, [id]: (previous[id] ?? GROUP_PAGE_SIZE) + GROUP_PAGE_SIZE }))
          return
        }
        loadMoreGroup(id)
      }

      if (overview === null) {
        if (overviewPhase === 'error') {
          return h(
            'div',
            { className: 'dsm-page' },
            h('h2', { className: 'dsm-title' }, t('pageTitle')),
            h('p', { className: 'dsm-error' }, t('overviewLoadFailed', { message: errorText(t, overviewError) })),
            h('button', { type: 'button', className: 'dsm-btn', onClick: () => void loadOverview() }, t('retry')),
          )
        }
        return h('div', { className: 'dsm-page' }, h('p', { className: 'dsm-hint' }, h(Spinner, { t, label: t('loading') })))
      }

      if (selectedId !== null) {
        const row = detail ?? rowCache.get(selectedId)
        if (row === undefined) {
          const failed = detailPhase === 'error'
          const missing = detailPhase === 'missing'
          return h(
            'div',
            { className: 'dsm-page' },
            h('div', { className: 'dsm-actions', style: { marginBottom: 4 } },
              h('button', { type: 'button', className: 'dsm-btn ghost', onClick: backToList }, `← ${t('back')}`),
            ),
            failed || missing
              ? h('p', { className: failed ? 'dsm-error' : 'dsm-empty' },
                  failed ? t('loadFailed', { message: errorText(t, detailError) }) : t('notFound'))
              : h('p', { className: 'dsm-hint' }, h(Spinner, { t, label: t('loading') })),
            failed
              ? h('button', { type: 'button', className: 'dsm-btn', onClick: () => setDetailNonce((value) => value + 1) }, t('retry'))
              : null,
          )
        }
        return h(
          'div',
          { className: 'dsm-page' },
          h(Notice, { notice, t, onDismiss: () => setNotice(null) }),
          h(DetailView, {
            ctx,
            t,
            overview,
            limits,
            row,
            busy,
            onBack: backToList,
            onChanged: (text) => {
              setNotice({ tone: 'ok', text: text ?? t('copied') })
              void refresh()
            },
            onOpen: openSession,
            onArchive: (id) => void archiveRows([id]),
            onRestore: (id) => void restoreAndOpen(id),
            onMove: (id, target) => void moveRows([id], target),
            onDelete: (ids) => void deleteRows(ids),
          }),
        )
      }

      return h(
        'div',
        { className: 'dsm-page' },
        h(
          'div',
          { className: 'dsm-head' },
          h(
            'div',
            { className: 'dsm-head-row' },
            h('h2', { className: 'dsm-title' }, t('pageTitle')),
            h('div', { className: 'dsm-head-actions' },
              blankIds.unarchivedIds.length > 0
                ? h('button', {
                    type: 'button',
                    className: 'dsm-btn',
                    disabled: busy,
                    title: t('archiveBlankHint'),
                    onClick: () => void archiveBlankSessions(blankIds.unarchivedIds),
                  }, t('archiveBlank', { n: blankIds.unarchivedIds.length }))
                : null,
              blankIds.archivedIds.length > 0
                ? h('button', {
                    type: 'button',
                    className: 'dsm-btn',
                    disabled: busy || blankIds.deletableIds.length === 0,
                    title: blankIds.deletableIds.length === blankIds.archivedIds.length
                      ? t('cleanupBlankHint')
                      : t('cleanupBlankLockedHint', { n: blankIds.archivedIds.length - blankIds.deletableIds.length }),
                    onClick: () => setBulkDeleteIds(blankIds.deletableIds),
                  }, t('cleanupBlank', { n: blankIds.archivedIds.length }))
                : null,
              h('button', { type: 'button', className: 'dsm-btn', disabled: busy, onClick: () => void refresh() },
                busy ? h(Spinner, { t, label: t('working') }) : t('refresh')),
            ),
          ),
          h('p', { className: 'dsm-sub' }, t('pageSubtitle')),
          h('p', { className: 'dsm-sub' },
            t('totalLine', {
              all: totals.all ?? 0,
              archived: totals.archived ?? 0,
              size: sizeText,
            }),
            (totals.blank ?? 0) > 0 && !showBlank
              ? ` · ${t('hiddenBlankCount', { n: totals.blank })}`
              : '',
            (totals.hiddenSubagents ?? 0) > 0 && !includeSubagents
              ? ` · ${t('hiddenSubagentCount', { n: totals.hiddenSubagents })}`
              : '',
            sizesPhase === 'loading' ? ` · ${t('sizesPending')}` : '',
          ),
        ),
        h(Notice, { notice, t, onDismiss: () => setNotice(null) }),
        overviewPhase === 'error'
          ? h(
              'div',
              { className: 'dsm-note warn' },
              h('div', { style: { flex: '1 1 auto' } }, t('overviewLoadFailed', { message: errorText(t, overviewError) })),
              h('div', { className: 'dsm-note-actions' },
                h('button', { type: 'button', className: 'dsm-btn', disabled: busy, onClick: () => void refresh() }, t('retry')),
              ),
            )
          : null,
        (overview?.orphans?.length ?? 0) > 0
          ? h(
              'div',
              { className: 'dsm-note warn' },
              h('div', { style: { flex: '1 1 auto' } }, t('orphanBanner', { n: overview.orphans.length })),
              h('div', { className: 'dsm-note-actions' },
                h('button', { type: 'button', className: 'dsm-btn', disabled: busy, onClick: () => void cleanupOrphans() },
                  busy ? t('cleaningOrphans') : t('cleanupOrphans')),
              ),
            )
          : null,
        h('div', { className: 'dsm-sticky' },
          h(
            'div',
            { className: 'dsm-toolbar' },
            h('div', { className: 'dsm-tabs', role: 'group' },
              tabs.map((item) =>
                h('button', {
                  key: item.key,
                  type: 'button',
                  className: 'dsm-tab',
                  'aria-pressed': tab === item.key ? 'true' : 'false',
                  onClick: () => setTab(item.key),
                }, `${item.label} ${item.count}`),
              ),
            ),
            h('select', {
              className: 'dsm-select',
              value: workspaceFilter,
              onChange: (event) => setWorkspaceFilter(event.target.value),
              'aria-label': t('workspaceAll'),
            },
              h('option', { value: 'all' }, t('workspaceAll')),
              ...(overview?.workspaces ?? []).map((workspace) =>
                h('option', { key: workspace.id, value: workspace.id },
                  `${workspace.title || workspace.path}${workspace.status === 'ok' ? '' : ` · ${t('workspaceMissing')}`}`),
              ),
              h('option', { value: 'ungrouped' }, t('workspaceUngrouped')),
            ),
            h('input', {
              ref: searchRef,
              className: 'dsm-input',
              type: 'search',
              value: queryInput,
              placeholder: t('searchPlaceholder'),
              'aria-label': t('searchPlaceholder'),
              onChange: (event) => setQueryInput(event.target.value),
            }),
            h('select', {
              className: 'dsm-select',
              value: sort,
              onChange: (event) => setSort(event.target.value),
              'aria-label': t('sortUpdated'),
            },
              h('option', { value: 'updated' }, t('sortUpdated')),
              h('option', { value: 'created' }, t('sortCreated')),
              h('option', { value: 'size' }, t('sortSize')),
              h('option', { value: 'title' }, t('sortTitle')),
            ),
            h('label', { className: 'dsm-check', title: t('showSubagentsHint') },
              h('input', {
                type: 'checkbox',
                checked: includeSubagents,
                onChange: (event) => setIncludeSubagents(event.target.checked),
              }),
              t('showSubagents'),
            ),
            h('label', { className: 'dsm-check' },
              h('input', {
                type: 'checkbox',
                checked: showBlank,
                onChange: (event) => setShowBlank(event.target.checked),
              }),
              t('showBlank'),
            ),
          ),
          view.visibleRows.length > 0
            ? h(
                'div',
                { className: 'dsm-batch' },
                h('label', { className: 'dsm-check' },
                  h('input', { type: 'checkbox', checked: visibleAllSelected, onChange: toggleAll }),
                  t('selectAll'),
                ),
                selectedRows.length > 0
                  ? h(React.Fragment, null,
                      h('span', { className: 'dsm-hint' }, t('selectedCount', { n: selectedRows.length })),
                      h('span', { className: 'dsm-hint' }, t('selectionScopeHint')),
                      view.partialCount > 0
                        ? h('span', { className: 'dsm-hint' }, t('partialSelection', { n: view.partialCount }))
                        : null,
                      overBatch ? h('span', { className: 'dsm-warn' }, t('tooMany', { max: maxBatch })) : null,
                      overMove ? h('span', { className: 'dsm-warn' }, t('tooMany', { max: maxMoveBatch })) : null,
                      h('button', {
                        type: 'button',
                        className: 'dsm-btn',
                        disabled: busy || !selectedActive,
                        title: selectedActive ? t('archiveHint') : t('noAction'),
                        onClick: () => void archiveRows(selectedRows.map((row) => row.id)),
                      }, t('archiveSelected')),
                      h('button', {
                        type: 'button',
                        className: 'dsm-btn',
                        disabled: busy || !selectedArchived,
                        onClick: () => void restoreRows(selectedRows.map((row) => row.id)),
                      }, t('restoreSelected')),
                      h('select', {
                        className: 'dsm-select',
                        value: bulkTarget,
                        disabled: busy || !selectedMovable,
                        onChange: (event) => setBulkTarget(event.target.value),
                        'aria-label': t('moveTo'),
                      },
                        h('option', { value: '' }, t('moveTo')),
                        ...targetWorkspaces.map((workspace) =>
                          h('option', { key: workspace.id, value: workspace.id }, workspace.title || workspace.path),
                        ),
                      ),
                      h('button', {
                        type: 'button',
                        className: 'dsm-btn',
                        disabled: busy || !selectedMovable || bulkTarget === '',
                        onClick: () => void moveRows(selectedRows.map((row) => row.id), bulkTarget),
                      }, t('moveSelected')),
                      h('button', {
                        type: 'button',
                        className: 'dsm-btn danger',
                        disabled: busy || !selectedDeletable,
                        onClick: () => setBulkDeleteIds(selectedRows.map((row) => row.id)),
                      }, t('deleteSelected')),
                      h('button', {
                        type: 'button',
                        className: 'dsm-btn ghost',
                        disabled: busy,
                        onClick: () => setSelected(new Set()),
                      }, t('clearSelection')),
                      !selectedMovable && selectedRows.length > 0
                        ? h('span', { className: 'dsm-hint' },
                            selectedRows.some((row) => row.live || row.running)
                              ? t('liveHint')
                              : selectedRows.some((row) => row.kind === 'fork')
                                ? t('moveForkHint')
                                : t('moveUnavailableHint'))
                        : null,
                    )
                  : null,
              )
            : null,
        ),
        h('div', { className: 'dsm-list-actions' },
          h('button', {
            type: 'button',
            className: 'dsm-btn ghost',
            disabled: busy || isSearch || view.groups.length === 0 || view.groups.every((group) => group.expanded),
            onClick: expandAll,
          }, t('expandAll')),
          h('button', {
            type: 'button',
            className: 'dsm-btn ghost',
            disabled: busy || isSearch || view.groups.length === 0 || view.groups.every((group) => !group.expanded),
            onClick: collapseAll,
          }, t('collapseAll')),
          isSearch ? h('span', { className: 'dsm-hint' }, t('searchAutoExpand')) : null,
        ),
        isSearch && searchPhase === 'error'
          ? h(
              'div',
              { className: 'dsm-note warn' },
              h('div', { style: { flex: '1 1 auto' } }, t('groupLoadFailed', { message: errorText(t, searchError) })),
              h('div', { className: 'dsm-note-actions' },
                h('button', { type: 'button', className: 'dsm-btn', disabled: busy, onClick: () => setReload((value) => value + 1) }, t('groupRetry')),
              ),
            )
          : null,
        bulkDeleteIds !== null
          ? h(DeleteScope, {
              ctx,
              t,
              ids: bulkDeleteIds,
              maxBatch,
              busy,
              onCancel: () => setBulkDeleteIds(null),
              onConfirmed: (ids) => void deleteRows(ids),
            })
          : null,
        rows.length > 0
          ? rows.map((group) =>
              h(Group, {
                key: group.id,
                group,
                selected,
                onToggle: () => toggleGroup(group.id),
                onSelect: toggle,
                onOpen: openDetail,
                onMore: () => loadMore(group.id),
                onRetry: () => retryGroup(group.id),
                locked: isSearch,
                t,
              }),
            )
          : isSearch && searchPhase === 'loading'
            ? h('div', { className: 'dsm-empty' }, h(Spinner, { t, label: t('groupLoading') }))
            : h('div', { className: 'dsm-empty' }, (totals.all ?? 0) === 0 ? t('emptyNoSessions') : t('emptyFiltered')),
        h('p', { className: 'dsm-footer' }, t('archiveHint')),
      )
    }


    return {
      inject: ['slots', 'locale'],
      /** Pure helpers for `node --test`; not part of the Host/client contract. */
      __test: {
        computeView,
        orderBranchRows,
        pruneSelection,
        scopeKey,
        dataScopeKey,
        queryOf,
        mergePageRows,
        mergeRowCache,
        annotateBranchRows,
        overviewFromState,
        blanksFromState,
        normalizeSizes,
        composeGroups,
        /** Components are exposed only so the vm test can smoke their render bodies. */
        components: { SessionManagerPage, Row, Group, DetailView },
      },
      apply(ctx) {
        const t = ctx.locale.bind(NS)
        ctx.effect(() => ctx.locale.register(NS, DICT), 'session-mng: dictionaries')
        ctx.effect(() => {
          const element = document.createElement('style')
          element.setAttribute('data-plugin', NS)
          element.textContent = CSS
          document.head.appendChild(element)
          return () => {
            element.remove()
          }
        }, 'session-mng: styles')

        const Page = (props) => h(SessionManagerPage, { ...props, ctx, t })
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: 'session-mng-section',
              order: 82,
              locale: NS,
              label: () => t('navLabel'),
            },
            Page,
          ),
        )
      },
    }
  },
})
