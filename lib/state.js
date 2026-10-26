/**
 * Assemble the one listing the Settings page renders.
 *
 * The listing is deliberately read-only and best-effort: a broken title read,
 * a corrupt log, or an unavailable summary source must degrade one row instead
 * of failing the whole page. Every row carries the capabilities the client is
 * allowed to offer, computed here from the live state so the UI never has to
 * guess.
 *
 * @module dsh-session-mng/state
 */

import { zstdAvailable } from './store-jsonl.js'
import { canReconcileMove } from './workspace-sync.js'

/** Read a service without declaring it as a hard dependency. */
function serviceOf(ctx, name) {
  try {
    return ctx.get?.(name)
  } catch {
    return undefined
  }
}

/** Best-effort list of live Session objects. */
function liveSession(ctx, id) {
  try {
    return ctx.sessions?.get?.(id)
  } catch {
    return undefined
  }
}

/** Best-effort running state for one id. */
function isRunning(ctx, id) {
  try {
    const agent = ctx.get?.('agents')?.get?.(id)
    return agent?.status === 'running' || agent?.running === true
  } catch {
    return false
  }
}

/** Best-effort snapshot list; an unavailable backend yields no snapshots. */
async function persistenceSnapshots(ctx, signal) {
  try {
    const list = await ctx.sessionPersistence?.list?.({ signal })
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/** Best-effort Session summaries from the API controller, else the raw corpus. */
async function sessionSummaries(ctx, signal) {
  const controller = serviceOf(ctx, 'sessionController')
  if (typeof controller?.list === 'function') {
    try {
      const value = await controller.list({}, signal)
      if (Array.isArray(value?.items)) return value.items
    } catch {
      // Fall through to the raw corpus.
    }
  }
  try {
    const records = await ctx.sessionQuery.listSessions(signal)
    if (!Array.isArray(records)) return []
    return records.map((record) => ({
      sessionId: record.header.id,
      updatedAt: record.header.createdAt,
      agentAvailable: false,
      running: isRunning(ctx, record.header.id),
      blank: false,
      cwd: record.header.cwd,
      origin: record.header.origin,
      parentSessionId: record.header.parentSession,
      formatStatus: record.formatStatus,
    }))
  } catch {
    return []
  }
}

/** Read the workspace list, tolerating a registry that is not started yet. */
async function workspaceRows(ctx) {
  const registry = serviceOf(ctx, 'workspaceRegistry')
  if (typeof registry?.list !== 'function') return []
  let entities
  try {
    entities = registry.list()
  } catch {
    return []
  }
  const rows = []
  for (const workspace of entities ?? []) {
    let status = 'unknown'
    try {
      status = await workspace.status?.()
    } catch {
      status = 'missing-dir'
    }
    rows.push({
      id: workspace.id,
      title: workspace.title,
      path: workspace.path,
      status,
      sessionIds: Array.isArray(workspace.sessionIds) ? [...workspace.sessionIds] : [],
    })
  }
  return rows
}

/** The latest title text from one folded snapshot, or an empty string. */
function titleOfSnapshot(snapshot) {
  const value = snapshot?.title
  return typeof value === 'string' ? value : ''
}

/** Batch-read titles for rows the summary did not carry one for. */
async function readMissingTitles(ctx, ids, signal) {
  const titles = new Map()
  if (ids.length === 0) return titles
  try {
    const results = await ctx.sessionQuery.readTitleSnapshots(ids, signal)
    for (const result of results ?? []) {
      if (result?.status !== 'fulfilled') continue
      const text = titleOfSnapshot(result.value?.title)
      if (text !== '') titles.set(result.sessionId, text)
    }
  } catch {
    // Titles are optional; the row falls back to cwd/id.
  }
  return titles
}

/** Stored header of one row, preferring the live session then persistence. */
function headerOf(row, snapshotsById, ctx) {
  const live = liveSession(ctx, row.sessionId)
  if (live?.header !== undefined) return live.header
  return snapshotsById.get(row.sessionId)?.header
}

/** Whether a header/summary pair describes a subagent session. */
function isSubagent(header, summary) {
  if (header?.origin === 'subagent' || summary?.origin === 'subagent') return true
  return Boolean(header?.parentSession ?? summary?.parentSessionId)
}

/**
 * Build the listing.
 *
 * @param {object} ctx
 * @param {object} config
 * @param {{ includeSubagents?: boolean, signal?: AbortSignal }} options
 */
export async function buildState(ctx, config, options = {}) {
  const signal = options.signal
  const includeSubagents = options.includeSubagents === true
  const [summaries, snapshots, workspaces] = await Promise.all([
    sessionSummaries(ctx, signal),
    persistenceSnapshots(ctx, signal),
    workspaceRows(ctx),
  ])

  const snapshotById = new Map()
  for (const snapshot of snapshots) {
    const id = snapshot?.header?.id
    if (id !== undefined) snapshotById.set(id, snapshot)
  }

  const registry = serviceOf(ctx, 'workspaceRegistry')
  let archivedIds = []
  let pinnedIds = []
  try {
    archivedIds = Array.isArray(registry?.archivedSessionIds) ? [...registry.archivedSessionIds] : []
  } catch {
    archivedIds = []
  }
  try {
    pinnedIds = Array.isArray(registry?.pinnedSessionIds) ? [...registry.pinnedSessionIds] : []
  } catch {
    pinnedIds = []
  }
  const archivedSet = new Set(archivedIds)
  const pinnedSet = new Set(pinnedIds)

  const workspaceBySession = new Map()
  const workspaceByPath = new Map()
  const workspaceById = new Map()
  for (const workspace of workspaces) {
    workspaceById.set(workspace.id, workspace)
    workspaceByPath.set(workspace.path, workspace)
    for (const id of workspace.sessionIds) workspaceBySession.set(id, workspace)
  }

  const seen = new Set()
  const knownIds = new Set()
  for (const summary of summaries) {
    if (typeof summary?.sessionId === 'string') knownIds.add(summary.sessionId)
  }
  for (const id of snapshotById.keys()) knownIds.add(id)
  const rows = []
  const missingTitles = []

  const pushRow = (base) => {
    const id = base.sessionId
    if (id === undefined || seen.has(id)) return
    seen.add(id)
    const header = headerOf(base, snapshotById, ctx)
    const summary = base
    const subagent = isSubagent(header, summary)
    if (subagent && !includeSubagents) return

    const cwd = summary.cwd ?? header?.cwd ?? ''
    const workspace =
      workspaceBySession.get(id) ??
      (typeof cwd === 'string' && cwd !== '' ? workspaceByPath.get(cwd) : undefined)
    const live = liveSession(ctx, id) !== undefined
    const running = summary.running === true || isRunning(ctx, id)
    const title =
      typeof summary.projections?.values?.title === 'string' ? summary.projections.values.title : ''
    if (title === '') missingTitles.push(id)

    const snapshot = snapshotById.get(id)
    rows.push({
      id,
      title,
      cwd,
      workspaceId: workspace?.id ?? null,
      workspaceTitle: workspace?.title ?? '',
      archived: archivedSet.has(id),
      pinned: pinnedSet.has(id),
      live,
      running,
      blank: summary.blank === true,
      origin: header?.origin ?? summary.origin,
      parentSessionId: header?.parentSession ?? summary.parentSessionId,
      agentPreset: header?.agentPreset ?? '',
      createdAt: header?.createdAt ?? summary.updatedAt ?? 0,
      updatedAt: summary.updatedAt ?? header?.createdAt ?? 0,
      sizeBytes: typeof snapshot?.sizeBytes === 'number' ? snapshot.sizeBytes : 0,
      formatStatus: summary.formatStatus ?? snapshot?.formatStatus,
      isSubagent: subagent,
    })
  }

  for (const summary of summaries) pushRow(summary)

  // Sessions the summary source omits (notably a stored header without cwd)
  // still exist on disk and must be reachable for archive/delete.
  for (const snapshot of snapshots) {
    const header = snapshot?.header
    if (header?.id === undefined || seen.has(header.id)) continue
    pushRow({
      sessionId: header.id,
      updatedAt: header.createdAt,
      cwd: header.cwd,
      origin: header.origin,
      parentSessionId: header.parentSession,
      running: isRunning(ctx, header.id),
      blank: false,
      formatStatus: snapshot.formatStatus,
    })
  }

  const titles = await readMissingTitles(ctx, [...new Set(missingTitles)], signal)
  for (const row of rows) {
    if (row.title === '') row.title = titles.get(row.id) ?? ''
  }

  const jsonl =
    typeof ctx.sessionPersistence?.locate === 'function' && typeof ctx.sessionPersistence?.stat === 'function'
  const capabilities = {
    title: Boolean(ctx.llm),
    move: jsonl && zstdAvailable() && canReconcileMove(serviceOf(ctx, 'workspaceRegistry')),
    delete: jsonl,
    backend: jsonl ? 'jsonl' : 'other',
  }

  for (const row of rows) {
    row.can = {
      title: capabilities.title,
      archive: !row.archived,
      restore: row.archived,
      move: capabilities.move && !row.live && !row.running && !row.isSubagent && row.parentSessionId === undefined,
      delete: capabilities.delete && row.archived && !row.live,
      open: true,
    }
  }

  // Archived ids whose log is gone can never be rendered; surface them so the
  // UI can offer to drop the stale archive marker. Every id the corpus knows
  // about counts as present, including subagent rows this listing filters.
  const orphans = archivedIds.filter((id) => !knownIds.has(id))

  const workspaceStats = workspaces.map((workspace) => {
    const group = rows.filter((row) => row.workspaceId === workspace.id)
    return {
      ...workspace,
      sessionIds: undefined,
      count: group.length,
      archivedCount: group.filter((row) => row.archived).length,
      totalBytes: group.reduce((sum, row) => sum + row.sizeBytes, 0),
    }
  })
  const ungroupedRows = rows.filter((row) => row.workspaceId === null)

  const totalBytes = rows.reduce((sum, row) => sum + row.sizeBytes, 0)
  return {
    generatedAt: Date.now(),
    workspaces: workspaceStats,
    sessions: rows,
    ungrouped: {
      count: ungroupedRows.length,
      archivedCount: ungroupedRows.filter((row) => row.archived).length,
      totalBytes: ungroupedRows.reduce((sum, row) => sum + row.sizeBytes, 0),
    },
    orphans,
    capabilities,
    backend: capabilities.backend,
    totals: {
      all: rows.length,
      active: rows.filter((row) => !row.archived).length,
      archived: rows.filter((row) => row.archived).length,
      subagents: rows.filter((row) => row.isSubagent).length,
      bytes: totalBytes,
    },
    limits: {
      maxBatch: config.maxBatch,
      maxMoveBatch: config.maxMoveBatch,
    },
  }
}
