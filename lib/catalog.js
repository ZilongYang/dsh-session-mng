/**
 * Zero-I/O session catalog and the 0.2.0 read surfaces built on it.
 *
 * `lib/state.js` assembles the whole listing on every request: two O(n)
 * persistence scans plus a log replay per untitled session. That is fine for a
 * hundred sessions and hopeless for ten thousand. The catalog instead reads two
 * in-memory seams the shipped host already maintains —
 * `workspaceRegistry.headers` (every stored header, built once at startup) and
 * the projection cache (`title` / `sessionListMetadata`) — so one request costs
 * no session-log I/O at all.
 *
 * Both seams are version-sensitive, so every accessor is feature-detected and
 * a missing seam degrades to {@link fromState}, which wraps the 0.1.x
 * `buildState()` result in the same shape. The route surface therefore never
 * changes with host version; only the cost does.
 *
 * The counting rules here are deliberately identical to `buildState` (visible
 * rows, hidden-subagent count, fork annotations over the visible set) because
 * the Client renders the same numbers from either source.
 *
 * @module dsh-session-mng/catalog
 */

import { buildState, canOf, capabilitiesOf, classifySession, isRunningSession, serviceOf } from './state.js'
import { SessionMngError } from './errors.js'

/** The pseudo workspace id naming sessions that belong to no workspace. */
export const UNGROUPED = 'ungrouped'

/** Tab filters a page or a search may request. */
export const TABS = new Set(['all', 'active', 'archived'])

/** Sort keys, all with an `id` ascending tie-break so pages never drift. */
export const SORTS = new Set(['updated', 'created', 'title', 'size'])

/** Default page size when the client names none. */
export const DEFAULT_PAGE_LIMIT = 50

/** Per-request budget for the cold-title fallback. */
export const TITLE_FALLBACK_MS = 2_000

/** Normalize a non-negative integer query value, or throw a bad-request. */
function pageOffset(value) {
  if (value === undefined || value === null || value === '') return 0
  const number = Number(value)
  if (!Number.isInteger(number) || number < 0) {
    throw new SessionMngError('bad-request', 'offset must be a non-negative integer', 400)
  }
  return number
}

/** Normalize a page size into `[1, max]`, clamping instead of failing. */
function pageLimit(value, max, label = 'limit') {
  if (value === undefined || value === null || value === '') return max
  const number = Number(value)
  if (!Number.isFinite(number) || Math.trunc(number) < 1) {
    throw new SessionMngError('bad-request', `${label} must be a positive integer`, 400)
  }
  return Math.min(Math.trunc(number), max)
}

/** Read a registry id array (archived/pinned) read-only, tolerating a throw. */
function idArray(ctx, name) {
  try {
    const value = serviceOf(ctx, 'workspaceRegistry')?.[name]
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

/**
 * The host's in-memory header index, or undefined when this host build does
 * not expose it. `headers` is a `Map<SessionId, header>` in every checked
 * build; the check is structural so a similar-enough shape still works.
 */
export function headerIndex(ctx) {
  let headers
  try {
    headers = serviceOf(ctx, 'workspaceRegistry')?.headers
  } catch {
    return undefined
  }
  if (headers === null || headers === undefined) return undefined
  if (typeof headers.get !== 'function' || typeof headers.forEach !== 'function') return undefined
  return headers
}

/** The persisted projection cache service, when mounted. */
function projectionCache(ctx) {
  const cache = serviceOf(ctx, 'sessionProjectionCache')
  return typeof cache?.cachedSnapshot === 'function' ? cache : undefined
}

/** The live projection registry service, when mounted. */
function projectionRegistry(ctx) {
  const registry = serviceOf(ctx, 'sessionProjections')
  return typeof registry?.cachedSnapshot === 'function' ? registry : undefined
}

/**
 * Whether the fast path is available: a header index plus a projection cache.
 * When either is missing the caller must use the `buildState` slow path.
 */
export function catalogAvailable(ctx) {
  return headerIndex(ctx) !== undefined && projectionCache(ctx) !== undefined
}

/** Best-effort live sessions, creation order. */
function liveSessions(ctx) {
  try {
    const value = ctx.sessions?.list?.()
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

/** Best-effort projection block for one live session (memory only). */
function liveBlock(ctx, session) {
  const registry = projectionRegistry(ctx)
  if (registry === undefined) return undefined
  try {
    return registry.cachedSnapshot(session, ['title', 'sessionListMetadata'])
  } catch {
    return undefined
  }
}

/** Best-effort projection block for one stored header (memory only). */
function coldBlock(cache, header) {
  try {
    return cache?.cachedSnapshot(header)
  } catch {
    return undefined
  }
}

/**
 * A predecessor checkpoint's title, for a session whose current checkpoint
 * predates the title projection. Listing-only hint: title text survives a
 * format edge, no other projection does.
 */
function predecessorTitle(cache, header) {
  if (typeof cache?.cachedPredecessorTitle !== 'function') return ''
  try {
    const block = cache.cachedPredecessorTitle(header)
    return typeof block?.values?.title === 'string' ? block.values.title : ''
  } catch {
    return ''
  }
}

/**
 * Title / blank / last-prompt facts for one session, from memory only.
 *
 * `blank` stays `undefined` when the projection cache has no metadata row for
 * this lifecycle; the row then reports `blank: false, blankKnown: false`
 * instead of claiming a session is empty.
 */
function listFacts(ctx, cache, header, live) {
  const block = live === undefined ? coldBlock(cache, header) : liveBlock(ctx, live)
  const values = block?.values ?? {}
  let title = typeof values.title === 'string' ? values.title : ''
  if (title === '' && live === undefined) title = predecessorTitle(cache, header)
  const metadata = values.sessionListMetadata
  return {
    title,
    blank: typeof metadata?.blank === 'boolean' ? metadata.blank : undefined,
    lastPromptAt: typeof metadata?.lastPromptAt === 'number' ? metadata.lastPromptAt : undefined,
  }
}

/** Best-effort workspace rows in durable registry order. */
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
      status = await workspace?.status?.()
    } catch {
      status = 'missing-dir'
    }
    rows.push({
      id: workspace.id,
      title: typeof workspace.title === 'string' ? workspace.title : '',
      path: workspace.path,
      status,
      sessionIds: Array.isArray(workspace.sessionIds) ? [...workspace.sessionIds] : [],
    })
  }
  return rows
}

/** Order-independent relation annotations shared by every surface. */
function attachRelations(rows) {
  const byId = new Map(rows.map((row) => [row.id, row]))
  const forkCountByParent = new Map()
  for (const row of rows) {
    if (row.kind !== 'fork') {
      row.parentTitle = ''
      row.parentPresent = false
      continue
    }
    const parent = row.parentSessionId === null ? undefined : byId.get(row.parentSessionId)
    row.parentTitle = parent === undefined ? '' : parent.title
    row.parentPresent = parent !== undefined
    if (row.parentSessionId === null) continue
    forkCountByParent.set(row.parentSessionId, (forkCountByParent.get(row.parentSessionId) ?? 0) + 1)
  }
  for (const row of rows) row.forkCount = forkCountByParent.get(row.id) ?? 0
  return rows
}

/** One catalog row from a stored header and its in-memory facts. */
function rowFromHeader({ id, header, live, running, facts, archived, pinned, workspace, capabilities, overrides }) {
  const kind = classifySession(header)
  const createdAt = Number.isFinite(header?.createdAt) ? header.createdAt : 0
  const override = overrides?.get(id)
  const title = override !== undefined && typeof override.title === 'string' ? override.title : facts.title
  const row = {
    id,
    title,
    cwd: typeof header?.cwd === 'string' ? header.cwd : '',
    workspaceId: workspace?.id ?? null,
    workspaceTitle: workspace?.title ?? '',
    archived,
    pinned,
    live: live !== undefined,
    running,
    blank: facts.blank === true,
    blankKnown: facts.blank !== undefined,
    origin: header?.origin,
    kind,
    isFork: kind === 'fork',
    isSubagent: kind === 'subagent',
    parentSessionId: header?.parentSession ?? null,
    parentTitle: '',
    parentPresent: false,
    forkCount: 0,
    agentPreset: typeof header?.agentPreset === 'string' ? header.agentPreset : '',
    createdAt,
    updatedAt: Math.max(createdAt, facts.lastPromptAt ?? 0),
    sizeBytes: 0,
    formatStatus: undefined,
  }
  row.can = canOf(row, capabilities)
  return row
}

/**
 * The catalog fast path: build every row from memory, then annotate relations.
 *
 * @param {object} ctx
 * @param {object} config - normalized plugin config.
 * @param {{ includeSubagents?: boolean, extraIds?: readonly string[], deletedIds?: Set<string>, titleOverrides?: Map<string, {title: string, at: number}> }} [options]
 * @returns {Promise<object>} the catalog
 */
export async function fromContext(ctx, config, options = {}) {
  const includeSubagents = options.includeSubagents === true
  const extraIds = new Set(options.extraIds ?? [])
  const deletedIds = options.deletedIds
  const cache = projectionCache(ctx)
  const headers = headerIndex(ctx) ?? new Map()
  const archivedIds = idArray(ctx, 'archivedSessionIds')
  const archivedSet = new Set(archivedIds)
  const pinnedSet = new Set(idArray(ctx, 'pinnedSessionIds'))
  const workspaces = await workspaceRows(ctx)

  const workspaceById = new Map()
  const workspaceByPath = new Map()
  const workspaceBySession = new Map()
  for (const workspace of workspaces) {
    workspaceById.set(workspace.id, workspace)
    workspaceByPath.set(workspace.path, workspace)
    for (const id of workspace.sessionIds) workspaceBySession.set(id, workspace)
  }

  // Content search is host-FTS-only and disabled in this deployment profile,
  // so 0.2.0 reports it honestly as unavailable and the Client searches titles.
  const capabilities = { ...capabilitiesOf(ctx), search: false }
  const liveById = new Map()
  for (const session of liveSessions(ctx)) {
    if (typeof session?.id === 'string') liveById.set(session.id, session)
  }

  const headersById = new Map()
  headers.forEach((header, id) => {
    if (typeof id === 'string' && header !== null && typeof header === 'object') headersById.set(id, header)
  })

  const knownIds = new Set(headersById.keys())
  for (const id of liveById.keys()) knownIds.add(id)

  const rows = []
  const entries = new Map()
  const considered = new Set()
  let hiddenSubagents = 0
  const consider = (id) => {
    if (considered.has(id)) return
    considered.add(id)
    const live = liveById.get(id)
    const header = live?.header ?? headersById.get(id)
    if (header === undefined) return
    if (deletedIds?.has(id) === true && live === undefined) return
    const kind = classifySession(header)
    if (kind === 'subagent' && !includeSubagents && !extraIds.has(id)) {
      hiddenSubagents += 1
      return
    }
    const cwd = typeof header.cwd === 'string' ? header.cwd : ''
    const workspace = workspaceBySession.get(id) ?? (cwd === '' ? undefined : workspaceByPath.get(cwd))
    const facts = listFacts(ctx, cache, header, live)
    const row = rowFromHeader({
      id,
      header,
      live,
      running: isRunningSession(ctx, id),
      facts,
      archived: archivedSet.has(id),
      pinned: pinnedSet.has(id),
      workspace,
      capabilities,
      overrides: options.titleOverrides,
    })
    rows.push(row)
    entries.set(id, row)
  }

  for (const id of headersById.keys()) consider(id)
  for (const id of liveById.keys()) consider(id)
  attachRelations(rows)

  return {
    source: 'catalog',
    generatedAt: Date.now(),
    backend: capabilities.backend,
    capabilities,
    limits: {
      maxBatch: config.maxBatch,
      maxMoveBatch: config.maxMoveBatch,
      pageLimitMax: config.pageLimitMax,
    },
    workspaces: workspaces.map(({ sessionIds, ...workspace }) => workspace),
    workspaceById,
    rows,
    entries,
    hiddenSubagents,
    orphans: archivedIds.filter((id) => !knownIds.has(id)),
  }
}

/**
 * The slow-path catalog: wrap one `buildState()` result in the catalog shape.
 *
 * `buildState` already produced rows with relations and action flags, so this
 * is a projection, not a re-derivation: counts stay identical to `/state` by
 * construction.
 *
 * @param {object} state - result of `buildState`.
 * @param {object} config - normalized plugin config.
 * @returns {object} the catalog
 */
export function fromState(state, config) {
  const capabilities = { ...state.capabilities, search: false }
  const rows = (Array.isArray(state.sessions) ? state.sessions : []).map((row) => ({
    ...row,
    blankKnown: true,
  }))
  const workspaces = (Array.isArray(state.workspaces) ? state.workspaces : []).map((workspace) => ({
    id: workspace.id,
    title: workspace.title,
    path: workspace.path,
    status: workspace.status,
  }))
  const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]))
  return {
    source: 'legacy',
    generatedAt: Date.now(),
    backend: state.backend ?? capabilities.backend,
    capabilities,
    limits: {
      maxBatch: config.maxBatch,
      maxMoveBatch: config.maxMoveBatch,
      pageLimitMax: config.pageLimitMax,
    },
    workspaces,
    workspaceById,
    rows,
    entries: new Map(rows.map((row) => [row.id, row])),
    hiddenSubagents:
      typeof state.totals?.hiddenSubagents === 'number' ? state.totals.hiddenSubagents : 0,
    orphans: Array.isArray(state.orphans) ? [...state.orphans] : [],
  }
}

/** Whether one row matches a lower-cased query, using the 0.1.3 haystack. */
export function matchesQuery(row, text) {
  if (text === '') return true
  const haystack = `${row.title}\n${row.cwd}\n${row.id}\n${row.parentTitle ?? ''}`.toLowerCase()
  return haystack.includes(text)
}

/**
 * Filter rows for one tab / workspace / query / blank switch.
 *
 * `workspaceId` may be a workspace id, {@link UNGROUPED}, or `'all'`.
 */
export function selectRows(catalog, params = {}) {
  const tab = params.tab ?? 'all'
  const workspaceId = params.workspaceId ?? 'all'
  const includeBlank = params.includeBlank === true
  const text = typeof params.query === 'string' ? params.query.trim().toLowerCase() : ''
  return catalog.rows.filter((row) => {
    if (tab === 'active' && row.archived) return false
    if (tab === 'archived' && !row.archived) return false
    if (workspaceId === UNGROUPED) {
      if (row.workspaceId !== null) return false
    } else if (workspaceId !== 'all' && row.workspaceId !== workspaceId) {
      return false
    }
    if (!includeBlank && row.blank === true) return false
    return matchesQuery(row, text)
  })
}

/** One row's sort value; `sizeOf` supplies bytes for `sort=size`. */
function sortKey(row, sort, sizeOf) {
  if (sort === 'created') return row.createdAt
  if (sort === 'size') return sizeOf(row.id)
  return row.updatedAt
}

/**
 * Sort rows by the requested key, always breaking ties on ascending `id`.
 *
 * The tie-break is what makes offset pagination safe: two rows with the same
 * timestamp can no longer swap places between two requests and duplicate or
 * skip a row across pages.
 */
export function sortRows(rows, sort = 'updated', sizeOf) {
  const keyOf = sort === 'size' ? (typeof sizeOf === 'function' ? sizeOf : () => 0) : undefined
  return [...rows].sort((left, right) => {
    let result
    if (sort === 'title') {
      result = (left.title || left.cwd).localeCompare(right.title || right.cwd)
    } else {
      result = sortKey(right, sort, keyOf) - sortKey(left, sort, keyOf)
    }
    if (result !== 0) return result
    return String(left.id).localeCompare(String(right.id))
  })
}

/**
 * Nest branches directly under their parent, the way the sidebar shows them.
 *
 * Only parents present in `rows` absorb children: a branch whose parent was
 * filtered out (other tab, other query, other page) stays top level and keeps
 * its "from <parent>" annotation, which the page decorator turns into a
 * `parentStub`.
 */
export function orderBranchRows(rows) {
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
  // A corrupt parent cycle must never silently drop rows from the list.
  return out.length === rows.length ? out : rows
}

/**
 * Filter, sort and paginate one workspace (or the ungrouped bucket, or all).
 *
 * @returns {{rows: object[], total: number, offset: number, limit: number, hasMore: boolean, workspace: object|undefined}}
 */
export function buildPage(catalog, params = {}) {
  const limit = pageLimit(params.limit, params.limitMax ?? DEFAULT_PAGE_LIMIT)
  const offset = pageOffset(params.offset)
  const filtered = selectRows(catalog, params)
  const sorted = sortRows(filtered, params.sort ?? 'updated', params.sizeOf)
  const ordered = orderBranchRows(sorted)
  const rows = ordered.slice(offset, offset + limit)
  const workspaceId = params.workspaceId ?? 'all'
  return {
    rows,
    total: ordered.length,
    offset,
    limit,
    hasMore: offset + rows.length < ordered.length,
    workspace: workspaceId === UNGROUPED ? undefined : catalog.workspaceById.get(workspaceId),
  }
}

/**
 * Cross-workspace search: every workspace with at least one hit, each carrying
 * its own total and a bounded first page, so the Client can auto-expand them.
 */
export function buildSearchGroups(catalog, params = {}) {
  const limit = pageLimit(params.limit, params.limitMax ?? DEFAULT_PAGE_LIMIT, 'limitPerGroup')
  const filtered = selectRows(catalog, { ...params, workspaceId: 'all' })
  const sorted = sortRows(filtered, params.sort ?? 'updated', params.sizeOf)
  const byWorkspace = new Map()
  for (const row of sorted) {
    const key = row.workspaceId === null ? UNGROUPED : row.workspaceId
    const group = byWorkspace.get(key)
    if (group === undefined) byWorkspace.set(key, [row])
    else group.push(row)
  }
  const order = [...catalog.workspaces.map((workspace) => workspace.id), UNGROUPED]
  // Defensive: a row naming a workspace the registry no longer lists must still
  // be reachable through search instead of silently disappearing.
  for (const key of byWorkspace.keys()) if (!order.includes(key)) order.push(key)
  const groups = []
  let total = 0
  for (const key of order) {
    const groupRows = byWorkspace.get(key)
    if (groupRows === undefined || groupRows.length === 0) continue
    total += groupRows.length
    const ordered = orderBranchRows(groupRows)
    groups.push({
      workspaceId: key === UNGROUPED ? null : key,
      workspace: key === UNGROUPED ? undefined : catalog.workspaceById.get(key),
      total: ordered.length,
      hasMore: ordered.length > limit,
      rows: ordered.slice(0, limit),
    })
  }
  return { groups, total }
}

/** The three blank-session id lists the Settings page's two buttons need. */
export function buildBlanks(catalog) {
  const blanks = catalog.rows.filter((row) => row.blank === true)
  return {
    unarchivedIds: blanks.filter((row) => !row.archived).map((row) => row.id),
    archivedIds: blanks.filter((row) => row.archived).map((row) => row.id),
    deletableIds: blanks.filter((row) => row.archived && row.can?.delete === true).map((row) => row.id),
  }
}

/** Zeroed workspace bucket used by the overview counters. */
function emptyBucket() {
  return { count: 0, activeCount: 0, archivedCount: 0, blankCount: 0 }
}

/** Add one row to a counter bucket. */
function countInto(bucket, row) {
  bucket.count += 1
  if (row.archived) bucket.archivedCount += 1
  else bucket.activeCount += 1
  if (row.blank === true) bucket.blankCount += 1
}

/**
 * The first-paint overview: counts only, never a session row.
 *
 * Byte totals stay `null` on purpose — sizes cost an O(n) store scan, so the
 * Client fetches them separately and fills the line in when they arrive.
 */
export function buildOverview(catalog) {
  const buckets = new Map(catalog.workspaces.map((workspace) => [workspace.id, emptyBucket()]))
  const ungrouped = emptyBucket()
  let subagents = 0
  let forks = 0
  let blank = 0
  for (const row of catalog.rows) {
    const bucket = (row.workspaceId === null ? undefined : buckets.get(row.workspaceId)) ?? ungrouped
    countInto(bucket, row)
    if (row.isSubagent) subagents += 1
    if (row.isFork) forks += 1
    if (row.blank === true) blank += 1
  }
  return {
    generatedAt: catalog.generatedAt,
    source: catalog.source,
    workspaces: catalog.workspaces.map((workspace) => ({
      id: workspace.id,
      title: workspace.title,
      path: workspace.path,
      status: workspace.status ?? 'unknown',
      ...(buckets.get(workspace.id) ?? emptyBucket()),
      totalBytes: null,
    })),
    ungrouped: { ...ungrouped, totalBytes: null },
    totals: {
      all: catalog.rows.length,
      active: catalog.rows.length - catalog.rows.filter((row) => row.archived).length,
      archived: catalog.rows.filter((row) => row.archived).length,
      subagents,
      hiddenSubagents: catalog.hiddenSubagents,
      forks,
      blank,
      bytes: null,
    },
    orphans: [...catalog.orphans],
    capabilities: catalog.capabilities,
    limits: catalog.limits,
    backend: catalog.backend,
  }
}

/** The detail payload for one id, or undefined when the catalog never saw it. */
export function buildDetail(catalog, id) {
  const row = catalog.entries.get(id)
  if (row === undefined) return undefined
  return { row, capabilities: catalog.capabilities, limits: catalog.limits }
}

/**
 * The wire shape of one row: the 0.1.x `/state` row plus the catalog-only
 * `blankKnown` flag. Page and detail decorators add `sizeBytes`,
 * `formatStatus`, `branchDepth` and `parentStub`.
 */
export function publicRow(row) {
  const out = {
    id: row.id,
    title: row.title,
    cwd: row.cwd,
    workspaceId: row.workspaceId,
    workspaceTitle: row.workspaceTitle,
    archived: row.archived,
    pinned: row.pinned,
    live: row.live,
    running: row.running,
    blank: row.blank,
    blankKnown: row.blankKnown === true,
    origin: row.origin,
    kind: row.kind,
    isFork: row.isFork,
    isSubagent: row.isSubagent,
    parentSessionId: row.parentSessionId,
    parentTitle: row.parentTitle,
    parentPresent: row.parentPresent,
    forkCount: row.forkCount,
    agentPreset: row.agentPreset,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sizeBytes: Number.isFinite(row.sizeBytes) ? row.sizeBytes : 0,
    formatStatus: row.formatStatus,
    can: row.can,
  }
  if (row.branchDepth !== undefined) out.branchDepth = row.branchDepth
  return out
}

/**
 * Batch-read titles for page rows the projection cache had none for.
 *
 * This is the one expensive host call the 0.2.0 design keeps, so it is bounded
 * twice: only the ids missing a title on this page, and a hard time budget.
 * Whatever does not arrive in time stays empty and is reported as
 * `titlesPending` — the Client shows a placeholder rather than blocking.
 *
 * @returns {Promise<Map<string, string>>} id → title
 */
export async function readPageTitles(ctx, ids, signal, budgetMs = TITLE_FALLBACK_MS) {
  const titles = new Map()
  if (!Array.isArray(ids) || ids.length === 0) return titles
  const query = serviceOf(ctx, 'sessionQuery')
  if (typeof query?.readTitleSnapshots !== 'function') return titles
  let budget
  try {
    budget = AbortSignal.timeout(budgetMs)
  } catch {
    return titles
  }
  let combined = budget
  if (signal !== undefined && typeof AbortSignal.any === 'function') {
    try {
      combined = AbortSignal.any([signal, budget])
    } catch {
      combined = budget
    }
  }
  try {
    const results = await query.readTitleSnapshots(ids, combined)
    for (const result of results ?? []) {
      if (result?.status !== 'fulfilled') continue
      const snapshot = result.value?.title
      const text = typeof snapshot?.title === 'string' ? snapshot.title : ''
      if (text !== '') titles.set(result.sessionId, text)
    }
  } catch {
    // A timed-out or unavailable fallback leaves the titles pending.
  }
  return titles
}

/**
 * Decorate one ordered row set for the wire: sizes, format status and the
 * parent stub a branch needs when its parent is not on this page.
 *
 * @param {object[]} rows - rows already ordered for the response.
 * @param {Map<string, {sizeBytes?: number, formatStatus?: string}>} facts
 */
export function decorateRows(rows, facts) {
  const pageIds = new Set(rows.map((row) => row.id))
  return rows.map((row) => {
    const out = publicRow(row)
    const factsOfRow = facts?.get(row.id)
    if (factsOfRow !== undefined && Number.isFinite(factsOfRow.sizeBytes)) out.sizeBytes = factsOfRow.sizeBytes
    if (typeof factsOfRow?.formatStatus === 'string') out.formatStatus = factsOfRow.formatStatus
    if (row.kind === 'fork' && row.parentSessionId !== null && !pageIds.has(row.parentSessionId)) {
      out.parentStub = { id: row.parentSessionId, title: row.parentTitle, present: row.parentPresent === true }
    }
    return out
  })
}

/** Build the slow-path state once; callers cache it behind their own TTL. */
export async function legacyState(ctx, config, options = {}) {
  return buildState(ctx, config, {
    includeSubagents: options.includeSubagents === true,
    signal: options.signal,
  })
}

/**
 * The slow-path catalog cache: one `buildState` result per includeSubagents
 * flag, served for `ttlMs` and dropped wholesale by {@link invalidate}.
 *
 * This is the 0.2.0 guarantee stated as a fallback: on a host whose in-memory
 * seams changed shape, the routes keep answering the same shapes, and the cost
 * degrades to 0.1.x plus a 30 s memo instead of failing.
 *
 * @param {object} ctx
 * @param {object} config - normalized plugin config.
 * @param {number} [ttlMs]
 */
export function createLegacyCatalogCache(ctx, config, ttlMs = 30_000) {
  const states = { 0: undefined, 1: undefined }
  return {
    async catalog(includeSubagents, signal) {
      const key = includeSubagents === true ? 1 : 0
      const hit = states[key]
      if (hit !== undefined && Date.now() - hit.at < ttlMs) return hit.catalog
      const catalog = fromState(await legacyState(ctx, config, { includeSubagents: key === 1, signal }), config)
      states[key] = { at: Date.now(), catalog }
      return catalog
    },
    invalidate() {
      states[0] = undefined
      states[1] = undefined
    },
  }
}
