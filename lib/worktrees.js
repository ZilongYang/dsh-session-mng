/**
 * Worktree-creation detection for the archive safety net.
 *
 * Since DSH `0.2.2-rc.2` the worktree service records every checkout it created
 * as a `plugin:worktree/created` session record, and **archiving that session
 * removes the checkout** when nothing else references it, the policy is not
 * read-only, and Git reports it clean. The branch survives; untracked, ignored,
 * and skip-worktree changes do not.
 *
 * This module answers one read-only question before an archive: "did these
 * sessions create checkouts that archiving would delete?" It never removes,
 * restores, or writes anything, and it degrades to "unknown" instead of
 * claiming "none".
 *
 * Detection tries three seams in cost order:
 *
 * 1. `sessionProjections.snapshot(live, ['worktree'])` — in-memory fold, free;
 * 2. `sessionProjectionCache.cachedSnapshot(header, ['worktree'])` — the
 *    persisted projection, free when the host kept that key;
 * 3. a bounded log scan through `sessionQuery.readSession()`.
 *
 * Only creations the session itself owns count: a fork carries its parent's
 * records in the inherited prefix (`owned: false`), which the service does not
 * reclaim. The log scan cannot recover that boundary, so a fork's records are
 * reported as unknown rather than as its own checkouts.
 *
 * @module dsh-session-mng/worktrees
 */

/** Record type the worktree service writes for each checkout it created. */
export const CREATED_RECORD = 'plugin:worktree/created'

/** Projection key holding those records. */
const PROJECTION_KEY = 'worktree'

/**
 * How long one definite scan answer is reused. Creations are append-only, so
 * the only thing a TTL buys is noticing a checkout a live session created
 * after the answer was cached; the log scan behind a cache miss is the one
 * costly tier here (tens of milliseconds per session).
 */
const SCAN_CACHE_TTL_MS = 60_000

/** sessionId -> { at, creations } for definite log-scan answers. */
const scanCache = new Map()

/** Read one host service without letting a throwing accessor escape. */
function service(ctx, name) {
  try {
    return ctx?.get?.(name) ?? ctx?.[name]
  } catch {
    return undefined
  }
}

/** Whether this deployment can reclaim checkouts at archive time at all. */
export function worktreesSupported(ctx) {
  return service(ctx, 'worktrees') !== undefined
}

/**
 * Normalize one recorded `plugin:worktree/created` event, or undefined.
 *
 * The record is read structurally: the host's `pluginRecordOf()` also requires
 * `ignorable === true`, which every plugin record carries.
 *
 * @param {object} event - one session event.
 * @returns {{ path: string, branch: string } | undefined}
 */
export function creationOfEvent(event) {
  if (event?.ignorable !== true) return undefined
  if (event.type !== CREATED_RECORD) return undefined
  const data = event.data
  if (data === null || typeof data !== 'object') return undefined
  if (typeof data.path !== 'string' || data.path === '') return undefined
  return { path: data.path, branch: typeof data.branch === 'string' ? data.branch : '' }
}

/** Every recorded creation in one event list, in order. */
export function creationsOfEvents(events) {
  const out = []
  for (const event of events ?? []) {
    const creation = creationOfEvent(event)
    if (creation !== undefined) out.push(creation)
  }
  return out
}

/**
 * Normalize one `worktree` projection view into plain creations.
 *
 * Returns undefined when the value is not an array, which is how a host that
 * never registered the projection answers; the caller then tries the next seam.
 *
 * @param {unknown} value - the projection's wire view.
 * @returns {{ path: string, branch: string }[] | undefined}
 */
export function creationsOfProjection(value) {
  if (!Array.isArray(value)) return undefined
  const out = []
  for (const entry of value) {
    const worktree = entry?.worktree ?? entry
    if (typeof worktree?.path !== 'string' || worktree.path === '') continue
    if (entry?.owned === false) continue
    out.push({ path: worktree.path, branch: typeof worktree.branch === 'string' ? worktree.branch : '' })
  }
  return out
}

/** One creation list from the live projection, or undefined when unavailable. */
async function liveCreations(ctx, sessionId) {
  const projections = service(ctx, 'sessionProjections')
  if (typeof projections?.snapshot !== 'function') return undefined
  let session
  try {
    session = service(ctx, 'sessions')?.get?.(sessionId)
  } catch {
    session = undefined
  }
  if (session === undefined) return undefined
  try {
    // `snapshot()` answers `{ asOfSeq, values }`; a key the host never
    // registered is simply absent from `values`.
    const snapshot = await projections.snapshot(session, [PROJECTION_KEY])
    return creationsOfProjection(snapshot?.values?.[PROJECTION_KEY])
  } catch {
    return undefined
  }
}

/** One creation list from the persisted projection cache, or undefined. */
async function coldCreations(ctx, header) {
  if (header === undefined) return undefined
  const cache = service(ctx, 'sessionProjectionCache')
  if (typeof cache?.cachedSnapshot !== 'function') return undefined
  try {
    const block = await cache.cachedSnapshot(header, [PROJECTION_KEY])
    return creationsOfProjection(block?.values?.[PROJECTION_KEY])
  } catch {
    return undefined
  }
}

/**
 * One creation list from a bounded log scan, or undefined when the log is too
 * large to scan or belongs to a fork whose record ownership cannot be recovered.
 */
async function scannedCreations(ctx, sessionId, header, config) {
  const cached = scanCache.get(sessionId)
  if (cached !== undefined) {
    if (Date.now() - cached.at < SCAN_CACHE_TTL_MS) return cached.creations
    scanCache.delete(sessionId)
  }
  const persistence = service(ctx, 'sessionPersistence')
  let sizeBytes
  try {
    sizeBytes = (await persistence?.stat?.(sessionId))?.sizeBytes
  } catch {
    sizeBytes = undefined
  }
  if (Number.isFinite(sizeBytes) && sizeBytes > config.worktreeScanMaxBytes) return undefined
  const query = service(ctx, 'sessionQuery')
  if (typeof query?.readSession !== 'function') return undefined
  let events
  try {
    events = (await query.readSession(sessionId))?.events
  } catch {
    return undefined
  }
  if (!Array.isArray(events)) return undefined
  const found = creationsOfEvents(events)
  const fork =
    header?.isSeeded === true ||
    (header?.parentSession !== undefined && header?.parentSession !== null)
  // A fork's log repeats its parent's records inside the inherited prefix, and
  // that boundary is not in the log: report the uncertainty instead of claiming
  // the checkouts are this session's own.
  if (fork && found.length > 0) return undefined
  scanCache.set(sessionId, { at: Date.now(), creations: found })
  return found
}

/** The header of one stored session, from the registry's in-memory index. */
function headerOf(ctx, sessionId) {
  const headers = service(ctx, 'workspaceRegistry')?.headers
  try {
    return headers?.get?.(sessionId)
  } catch {
    return undefined
  }
}

/** Detected creations of one session, or undefined when it could not be decided. */
async function creationsOf(ctx, sessionId, config) {
  const live = await liveCreations(ctx, sessionId)
  if (live !== undefined) return live
  const header = headerOf(ctx, sessionId)
  const cold = await coldCreations(ctx, header)
  if (cold !== undefined) return cold
  return await scannedCreations(ctx, sessionId, header, config)
}

/**
 * Detect the checkouts archiving these sessions would delete.
 *
 * @param {object} ctx - host context.
 * @param {readonly string[]} sessionIds - ids to inspect (caller bounds the count).
 * @param {{ worktreeScanMaxBytes: number }} config - resolved plugin config.
 * @returns {Promise<{ supported: boolean, rows: object[], totals: { sessions: number, worktrees: number, unknown: number } }>}
 */
export async function detectWorktrees(ctx, sessionIds, config) {
  const supported = worktreesSupported(ctx)
  const rows = []
  if (supported) {
    for (const sessionId of sessionIds) {
      const found = await creationsOf(ctx, sessionId, config)
      // `unknown` is honest: a log past the scan budget, or a fork whose
      // record ownership is not recoverable, is not the same as "none".
      if (found === undefined) rows.push({ sessionId, count: 0, worktrees: [], unknown: true })
      else rows.push({ sessionId, count: found.length, worktrees: found, unknown: false })
    }
  }
  const totals = {
    sessions: rows.length,
    worktrees: rows.reduce((sum, row) => sum + row.count, 0),
    unknown: rows.filter((row) => row.unknown).length,
  }
  return { supported, rows, totals }
}
