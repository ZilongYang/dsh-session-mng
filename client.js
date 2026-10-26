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
        showSubagents: '显示子会话',
        selectAll: '全选当前列表',
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
        subagent: '子会话',
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
        moveSubagentHint: '子会话不能单独移动。',
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
        selectAll: 'Select all shown',
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
.dsm-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
.dsm-title{margin:0;font-size:17px;font-weight:600;line-height:24px}
.dsm-sub{margin:2px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dsm-head-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
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
.dsm-batch{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;border-radius:7px;
 border:1px dashed var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);
 position:sticky;top:0;z-index:2;box-shadow:0 1px 0 var(--dsw-alias-border-l1)}
.dsm-group{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:hidden;background:var(--dsw-alias-bg-layer-1)}
.dsm-group-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;background:var(--dsw-alias-bg-layer-2)}
.dsm-group-title{font-size:12px;font-weight:600;line-height:18px}
.dsm-group-path{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);word-break:break-all}
.dsm-group-meta{margin-left:auto;font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dsm-warn{color:var(--dsw-alias-state-warn-primary);font-size:11px}
.dsm-row{display:grid;grid-template-columns:18px minmax(0,1fr) auto auto;align-items:center;gap:8px;
 padding:7px 10px;border-top:1px solid var(--dsw-alias-border-l1);min-width:0}
.dsm-row:first-of-type{border-top:none}
.dsm-row:hover,.dsm-row.selected{background:var(--dsw-alias-bg-layer-2)}
.dsm-row-main{display:flex;flex-direction:column;align-items:flex-start;gap:1px;min-width:0;
 border:none;background:transparent;color:inherit;font:inherit;text-align:left;padding:0;cursor:pointer}
.dsm-row-title{max-width:100%;font-size:13px;line-height:19px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
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
.dsm-detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap}
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

    function Notice({ notice, t, onDismiss }) {
      if (notice === null || notice === undefined) return null
      return h(
        'div',
        { className: `dsm-note ${notice.tone ?? ''}`, role: 'status' },
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
      const badges = []
      if (row.running) badges.push(h(Badge, { key: 'run', tone: 'run' }, t('running')))
      if (row.archived) badges.push(h(Badge, { key: 'arch' }, t('archived')))
      if (row.live) badges.push(h(Badge, { key: 'live', tone: 'brand' }, t('liveBadge')))
      if (row.pinned) badges.push(h(Badge, { key: 'pin' }, t('pinned')))
      if (row.isSubagent) badges.push(h(Badge, { key: 'sub', tone: 'warn' }, t('subagent')))
      return h(
        'div',
        { className: `dsm-row${selected === true ? ' selected' : ''}` },
        h('input', {
          type: 'checkbox',
          checked: selected === true,
          onChange: onToggle,
          'aria-label': t('selectRow', { name: row.title || row.id }),
        }),
        h(
          'button',
          { type: 'button', className: 'dsm-row-main', onClick: onOpen, title: row.cwd || row.id },
          h('span', { className: 'dsm-row-title' }, row.title === '' ? t('untitled') : row.title),
          h(
            'span',
            { className: 'dsm-row-meta' },
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

    function Group({ group, selected, onToggle, onOpen, t }) {
      return h(
        'section',
        { className: 'dsm-group' },
        h(
          'header',
          { className: 'dsm-group-head' },
          h('div', { style: { minWidth: 0 } },
            h('div', { className: 'dsm-group-title' }, group.title || t('workspaceUngrouped')),
            group.path ? h('div', { className: 'dsm-group-path' }, group.path) : null,
            group.status !== undefined && group.status !== 'ok'
              ? h('div', { className: 'dsm-warn' }, t('workspaceMissing'))
              : null,
          ),
          h('div', { className: 'dsm-group-meta' }, t('groupLine', { n: group.rows.length, size: formatBytes(group.bytes) })),
        ),
        group.rows.map((row) =>
          h(Row, {
            key: row.id,
            row,
            selected: selected.has(row.id),
            onToggle: () => onToggle(row.id),
            onOpen: () => onOpen(row.id),
            t,
          }),
        ),
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

    function DeleteScope({ ctx, t, ids, onConfirmed, onCancel, busy }) {
      const [phase, setPhase] = React.useState('loading')
      const [preview, setPreview] = React.useState(null)
      const [error, setError] = React.useState(null)
      const [checked, setChecked] = React.useState(false)
      const idsKey = ids.join('\u0000')

      React.useEffect(() => {
        const controller = new AbortController()
        setPhase('loading')
        post('delete/preview', { sessionIds: ids }, controller.signal)
          .then((value) => {
            if (controller.signal.aborted) return
            setPreview(value)
            setPhase('ready')
          })
          .catch((failure) => {
            if (failure?.name === 'AbortError') return
            setError(errorText(t, failure))
            setPhase('error')
          })
        return () => controller.abort()
      }, [idsKey, t])

      const rows = preview?.sessions ?? []
      const blocked = rows.some((row) => row.live || row.running)
      return h(
        'div',
        { className: 'dsm-danger-box' },
        h('h3', null, t('deleteScope')),
        h('p', { className: 'dsm-hint', style: { margin: '0 0 6px' } }, t('deleteHint')),
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
                blocked
                  ? h('p', { className: 'dsm-error' }, t('deleteLiveHint'))
                  : null,
                h('label', { className: 'dsm-check', style: { marginBottom: 8 } },
                  h('input', {
                    type: 'checkbox',
                    checked,
                    disabled: blocked,
                    onChange: (event) => setChecked(event.target.checked),
                  }),
                  t('deleteConfirmCheck'),
                ),
                h(
                  'div',
                  { className: 'dsm-actions' },
                  h('button', {
                    type: 'button',
                    className: 'dsm-btn danger',
                    disabled: busy || blocked || checked !== true,
                    onClick: () => onConfirmed(ids),
                  }, busy ? t('deleting') : t('deleteConfirm')),
                  h('button', { type: 'button', className: 'dsm-btn ghost', disabled: busy, onClick: onCancel }, t('cancel')),
                  blocked ? h('span', { className: 'dsm-hint' }, t('liveHint')) : null,
                ),
              ),
      )
    }

    // ---------------------------------------------------------------------
    // Detail view
    // ---------------------------------------------------------------------

    function DetailView({ ctx, t, state, row, busy, onBack, onChanged, onOpen, onArchive, onRestore, onMove, onDelete }) {
      const [copied, setCopied] = React.useState(false)
      const [showDelete, setShowDelete] = React.useState(false)
      const deleteIds = React.useMemo(() => [row.id], [row.id])
      const [target, setTarget] = React.useState('')
      const targets = (state?.workspaces ?? []).filter((workspace) => workspace.id !== row.workspaceId && workspace.status === 'ok')
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
          !movable
            ? h('p', { className: 'dsm-hint' },
                row.live ? t('moveLiveHint') : row.isSubagent ? t('moveSubagentHint') : row.can?.move === false ? t('moveDescendantsHint') : t('moveNoTarget'))
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

    function SessionManagerPage(props) {
      const { ctx, t } = props
      useLocaleTick(ctx)
      const [state, setState] = React.useState(null)
      const [phase, setPhase] = React.useState('loading')
      const [error, setError] = React.useState(null)
      const [tab, setTab] = React.useState('all')
      const [workspaceFilter, setWorkspaceFilter] = React.useState('all')
      const [query, setQuery] = React.useState('')
      const [sort, setSort] = React.useState('updated')
      const [includeSubagents, setIncludeSubagents] = React.useState(false)
      const [selected, setSelected] = React.useState(() => new Set())
      const [selectedId, setSelectedId] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [notice, setNotice] = React.useState(null)
      const [bulkDeleteIds, setBulkDeleteIds] = React.useState(null)
      const [bulkTarget, setBulkTarget] = React.useState('')
      const abortRef = React.useRef(null)
      const searchRef = React.useRef(null)
      const listScroll = React.useRef(0)

      const load = React.useCallback(async (options = {}) => {
        abortRef.current?.abort()
        const controller = new AbortController()
        abortRef.current = controller
        if (options.silent !== true) setPhase((previous) => (previous === 'ready' ? previous : 'loading'))
        try {
          const value = await getState(includeSubagents, controller.signal)
          if (controller.signal.aborted) return
          setState(value)
          setPhase('ready')
          setError(null)
        } catch (failure) {
          if (failure?.name === 'AbortError') return
          setError(failure)
          setPhase('error')
        }
      }, [includeSubagents])

      React.useEffect(() => {
        void load()
        return () => abortRef.current?.abort()
      }, [load])

      React.useEffect(() => {
        const onFocus = () => void load({ silent: true })
        window.addEventListener('focus', onFocus)
        return () => window.removeEventListener('focus', onFocus)
      }, [load])

      React.useEffect(() => {
        if (selectedId === null) return
        if (state !== null && !state.sessions.some((row) => row.id === selectedId)) setSelectedId(null)
      }, [state, selectedId])

      React.useEffect(() => {
        if (selectedId === null) return
        const detail = document.querySelector('.dsm-detail')
        const parent = scrollParentOf(detail)
        if (parent !== null && typeof parent.scrollTop === 'number') parent.scrollTop = 0
      }, [selectedId])

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

      React.useEffect(() => {
        if (selectedId === null) return undefined
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            backToList()
          }
        }
        document.addEventListener('keydown', onKeyDown, true)
        return () => document.removeEventListener('keydown', onKeyDown, true)
      }, [selectedId])

      const run = async (operation, successText) => {
        setBusy(true)
        setNotice(null)
        try {
          const value = await operation()
          setNotice({ tone: 'ok', text: successText(value) })
          await load({ silent: true })
          return value
        } catch (failure) {
          setNotice({ tone: 'error', text: errorText(t, failure), detail: failure?.message })
          return undefined
        } finally {
          setBusy(false)
        }
      }

      const resultText = (value) => {
        const totals = value?.totals
        if (totals === undefined) return t('working')
        return t('batchDone', { ok: totals.succeeded, failed: totals.failed })
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
        const value = await run(
          () => post('move', { sessionIds: ids, workspaceId }),
          (result) => resultText(result),
        )
        return value
      }

      const deleteRows = async (ids) => {
        const value = await run(
          () => post('delete', { sessionIds: ids, confirm: true }),
          (result) => resultText(result),
        )
        if (value !== undefined) {
          setBulkDeleteIds(null)
          setSelected(new Set())
          if (selectedId !== null && ids.includes(selectedId)) setSelectedId(null)
        }
        return value
      }

      const cleanupOrphans = async () => {
        const ids = state?.orphans ?? []
        if (ids.length === 0) return
        const max = state?.limits?.maxBatch ?? 50
        setBusy(true)
        setNotice(null)
        try {
          let cleaned = 0
          for (let index = 0; index < ids.length; index += max) {
            await post('unarchive', { sessionIds: ids.slice(index, index + max) })
            cleaned += Math.min(max, ids.length - index)
          }
          setNotice({ tone: 'ok', text: t('cleanedOrphans', { n: cleaned }) })
          await load({ silent: true })
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

      if (state === null) {
        if (phase === 'error') {
          return h(
            'div',
            { className: 'dsm-page' },
            h('h2', { className: 'dsm-title' }, t('pageTitle')),
            h('p', { className: 'dsm-error' }, t('loadFailed', { message: errorText(t, error) })),
            h('button', { type: 'button', className: 'dsm-btn', onClick: () => void load() }, t('retry')),
          )
        }
        return h('div', { className: 'dsm-page' }, h('p', { className: 'dsm-hint' }, h(Spinner, { t, label: t('loading') })))
      }

      const rows = state?.sessions ?? []
      const workspaceOrder = state?.workspaces ?? []
      const tabs = [
        { key: 'all', label: t('tabAll'), count: rows.length },
        { key: 'active', label: t('tabActive'), count: rows.filter((row) => !row.archived).length },
        { key: 'archived', label: t('tabArchived'), count: rows.filter((row) => row.archived).length },
      ]
      const visible = rows.filter((row) => {
        if (tab === 'active' && row.archived) return false
        if (tab === 'archived' && !row.archived) return false
        if (workspaceFilter === 'ungrouped' && row.workspaceId !== null) return false
        if (workspaceFilter !== 'all' && workspaceFilter !== 'ungrouped' && row.workspaceId !== workspaceFilter) return false
        const text = query.trim().toLowerCase()
        if (text !== '') {
          const haystack = `${row.title}\n${row.cwd}\n${row.id}`.toLowerCase()
          if (!haystack.includes(text)) return false
        }
        return true
      })
      const sorted = [...visible].sort((left, right) => {
        if (sort === 'created') return right.createdAt - left.createdAt
        if (sort === 'size') return right.sizeBytes - left.sizeBytes
        if (sort === 'title') return (left.title || left.cwd).localeCompare(right.title || right.cwd)
        return right.updatedAt - left.updatedAt
      })
      const groups = []
      for (const workspace of workspaceOrder) {
        const groupRows = sorted.filter((row) => row.workspaceId === workspace.id)
        if (groupRows.length === 0) continue
        groups.push({
          ...workspace,
          rows: groupRows,
          bytes: groupRows.reduce((sum, row) => sum + row.sizeBytes, 0),
        })
      }
      const ungroupedRows = sorted.filter((row) => row.workspaceId === null)
      if (ungroupedRows.length > 0) {
        groups.push({
          id: 'ungrouped',
          title: t('workspaceUngrouped'),
          path: '',
          rows: ungroupedRows,
          bytes: ungroupedRows.reduce((sum, row) => sum + row.sizeBytes, 0),
        })
      }
      const visibleAllSelected = sorted.length > 0 && sorted.every((row) => selected.has(row.id))
      const selectedRows = rows.filter((row) => selected.has(row.id))
      const overBatch = selectedRows.length > (state.limits?.maxBatch ?? 50)
      const overMove = selectedRows.length > (state.limits?.maxMoveBatch ?? 20)
      const selectedArchived = selectedRows.length > 0 && !overBatch && selectedRows.every((row) => row.archived)
      const selectedActive = selectedRows.length > 0 && !overBatch && selectedRows.every((row) => !row.archived)
      const selectedMovable =
        selectedRows.length > 0 && !overMove &&
        selectedRows.every((row) => row.can?.move === true) &&
        new Set(selectedRows.map((row) => row.workspaceId)).size === 1
      const selectedDeletable = selectedRows.length > 0 && !overBatch && selectedRows.every((row) => row.can?.delete === true)
      const targetWorkspaces = (state?.workspaces ?? []).filter((workspace) => {
        if (workspace.status !== 'ok') return false
        return !selectedRows.some((row) => row.workspaceId === workspace.id)
      })

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
            for (const row of sorted) next.delete(row.id)
            return next
          })
        } else {
          setSelected((previous) => {
            const next = new Set(previous)
            for (const row of sorted) next.add(row.id)
            return next
          })
        }
      }

      if (selectedId !== null) {
        const row = state.sessions.find((item) => item.id === selectedId)
        if (row === undefined) {
          return h('div', { className: 'dsm-page' },
            h('button', { type: 'button', className: 'dsm-btn ghost', onClick: backToList }, `← ${t('back')}`),
            h('div', { className: 'dsm-empty' }, t('notFound')),
          )
        }
        return h(
          'div',
          { className: 'dsm-page' },
          h(Notice, { notice, t, onDismiss: () => setNotice(null) }),
          h(DetailView, {
            ctx,
            t,
            state,
            row,
            busy,
            onBack: backToList,
            onChanged: (text) => {
              setNotice({ tone: 'ok', text: text ?? t('copied') })
              void load({ silent: true })
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
          h('div', null,
            h('h2', { className: 'dsm-title' }, t('pageTitle')),
            h('p', { className: 'dsm-sub' }, t('pageSubtitle')),
            h('p', { className: 'dsm-sub' },
              t('totalLine', {
                all: state.totals.all,
                archived: state.totals.archived,
                size: formatBytes(state.totals.bytes),
              }),
            ),
          ),
          h('div', { className: 'dsm-head-actions' },
            h('button', { type: 'button', className: 'dsm-btn', disabled: busy, onClick: () => void load({ silent: true }) },
              busy ? h(Spinner, { t, label: t('working') }) : t('refresh')),
          ),
        ),
        h(Notice, { notice, t, onDismiss: () => setNotice(null) }),
        state.orphans.length > 0
          ? h(
              'div',
              { className: 'dsm-note warn' },
              h('div', { style: { flex: '1 1 auto' } }, t('orphanBanner', { n: state.orphans.length })),
              h('div', { className: 'dsm-note-actions' },
                h('button', { type: 'button', className: 'dsm-btn', disabled: busy, onClick: () => void cleanupOrphans() },
                  busy ? t('cleaningOrphans') : t('cleanupOrphans')),
              ),
            )
          : null,
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
            ...(state.workspaces ?? []).map((workspace) =>
              h('option', { key: workspace.id, value: workspace.id },
                `${workspace.title || workspace.path}${workspace.status === 'ok' ? '' : ` · ${t('workspaceMissing')}`}`),
            ),
            h('option', { value: 'ungrouped' }, t('workspaceUngrouped')),
          ),
          h('input', {
            ref: searchRef,
            className: 'dsm-input',
            type: 'search',
            value: query,
            placeholder: t('searchPlaceholder'),
            'aria-label': t('searchPlaceholder'),
            onChange: (event) => setQuery(event.target.value),
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
          h('label', { className: 'dsm-check' },
            h('input', {
              type: 'checkbox',
              checked: includeSubagents,
              onChange: (event) => setIncludeSubagents(event.target.checked),
            }),
            t('showSubagents'),
          ),
        ),
        sorted.length > 0
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
                    overBatch ? h('span', { className: 'dsm-warn' }, t('tooMany', { max: state.limits?.maxBatch ?? 50 })) : null,
                    overMove ? h('span', { className: 'dsm-warn' }, t('tooMany', { max: state.limits?.maxMoveBatch ?? 20 })) : null,
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
                      ? h('span', { className: 'dsm-hint' }, t('liveHint'))
                      : null,
                  )
                : null,
            )
          : null,
        bulkDeleteIds !== null
          ? h(DeleteScope, {
              ctx,
              t,
              ids: bulkDeleteIds,
              busy,
              onCancel: () => setBulkDeleteIds(null),
              onConfirmed: (ids) => void deleteRows(ids),
            })
          : null,
        groups.length > 0
          ? groups.map((group) =>
              h(Group, {
                key: group.id,
                group,
                selected,
                onToggle: toggle,
                onOpen: openDetail,
                t,
              }),
            )
          : h('div', { className: 'dsm-empty' }, rows.length === 0 ? t('emptyNoSessions') : t('emptyFiltered')),
        h('p', { className: 'dsm-footer' }, t('archiveHint')),
      )
    }


    return {
      inject: ['slots', 'locale'],
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
