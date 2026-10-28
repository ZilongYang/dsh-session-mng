/**
 * Session-management operations.
 *
 * Every mutation is serialized through one lock: the shipped workspace
 * registry and the JSONL store were not designed for two plugin-initiated
 * moves/deletes at once, and a retried double-click must not race itself. The
 * title *proposal* is read-only and runs outside the lock; only applying a
 * title takes it.
 *
 * @module dsh-session-mng/service
 */

import { SessionMngError, messageOf } from './errors.js'
import { normalizeTitle, proposeTitle, textOfEvent } from './title.js'
import { buildState, classifySession } from './state.js'
import {
  defaultSessionsRoot,
  dirSize,
  findSessionDirs,
  finalizeMove,
  pathExists,
  removeStagedDelete,
  restoreStagedDelete,
  stageDelete,
  stageMove,
  tempRootFor,
  rollbackMove,
  rootOfSessionDir,
  sessionDirFromLocate,
  zstdAvailable,
} from './store-jsonl.js'
import {
  canReconcileMove,
  cleanupDeletedRegistry,
  findOwningWorkspace,
  reconcileMove,
  restoreDeletedRegistry,
  rollbackMoveReconcile,
} from './workspace-sync.js'

/** Hard ceiling on one cascade delete, regardless of maxBatch. */
const MAX_DELETE_TOTAL = 500

/** Load-time defaults; a patch entry's `config` overrides them field by field. */
export const DEFAULT_CONFIG = {
  maxBatch: 50,
  maxMoveBatch: 20,
  titleTimeoutMs: 30_000,
  titleMaxInputBytes: 32 * 1024,
  titleMaxOutputTokens: 256,
  titleMaxBytes: 120,
  allowRemote: false,
  sessionsRoot: '',
}

/** Clamp one integer config field. */
function integer(value, fallback, min, max) {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

/** Resolve a partial config onto defaults with bounds applied. */
export function normalizeConfig(input) {
  const src = input !== null && typeof input === 'object' ? input : {}
  return {
    maxBatch: integer(src.maxBatch, DEFAULT_CONFIG.maxBatch, 1, 200),
    maxMoveBatch: integer(src.maxMoveBatch, DEFAULT_CONFIG.maxMoveBatch, 1, 100),
    titleTimeoutMs: integer(src.titleTimeoutMs, DEFAULT_CONFIG.titleTimeoutMs, 2_000, 120_000),
    titleMaxInputBytes: integer(src.titleMaxInputBytes, DEFAULT_CONFIG.titleMaxInputBytes, 2_048, 128 * 1024),
    titleMaxOutputTokens: integer(src.titleMaxOutputTokens, DEFAULT_CONFIG.titleMaxOutputTokens, 32, 2_048),
    titleMaxBytes: integer(src.titleMaxBytes, DEFAULT_CONFIG.titleMaxBytes, 16, 512),
    allowRemote: src.allowRemote === true,
    sessionsRoot: typeof src.sessionsRoot === 'string' ? src.sessionsRoot : '',
  }
}

/** Read a service without declaring it as a hard dependency. */
function serviceOf(ctx, name) {
  try {
    return ctx.get?.(name)
  } catch {
    return undefined
  }
}

/** Wire code / details for one thrown value. */
function resultError(error) {
  if (error instanceof SessionMngError) {
    return { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) }
  }
  const name = typeof error?.name === 'string' ? error.name : ''
  if (name.includes('ActiveSession') || Array.isArray(error?.activity)) {
    return { code: 'session-active', message: messageOf(error), ...(error?.activity === undefined ? {} : { details: { activity: error.activity } }) }
  }
  if (name.includes('UnknownSession')) return { code: 'not-found', message: messageOf(error) }
  if (name.includes('NotFound')) return { code: 'not-found', message: messageOf(error) }
  if (name.includes('AlreadyOwned') || /owned|writer/i.test(messageOf(error))) {
    return { code: 'session-writer-held', message: messageOf(error) }
  }
  return { code: typeof error?.code === 'string' ? error.code : 'internal', message: messageOf(error) }
}

/** Serialize mutations; reads stay outside. */
function createLock() {
  let tail = Promise.resolve()
  return (fn) => {
    const next = tail.then(fn, fn)
    tail = next.then(
      () => {},
      () => {},
    )
    return next
  }
}

/** Validate one session id. */
function normalizeId(value) {
  const id = typeof value === 'string' ? value.trim() : ''
  if (id === '') throw new SessionMngError('bad-request', 'sessionId must be a non-empty string', 400)
  if (id.includes('/') || id.includes('\\') || id.includes('\0')) {
    throw new SessionMngError('bad-request', 'sessionId contains an invalid path character', 400)
  }
  return id
}

/** Validate one id batch. */
function normalizeIds(value, max, label = 'sessionIds') {
  if (!Array.isArray(value)) throw new SessionMngError('bad-request', `${label} must be an array`, 400)
  const ids = [...new Set(value.map((item) => normalizeId(item)))]
  if (ids.length === 0) throw new SessionMngError('bad-request', `${label} must not be empty`, 400)
  if (ids.length > max) {
    throw new SessionMngError('too-many', `at most ${max} sessions are allowed in one request`, 400, { max })
  }
  return ids
}

/**
 * Walk a lineage tree, splitting descendants into the two kinds the plugin
 * treats differently.
 *
 * - `subagents` — delegation sessions; they belong to the root and are
 *   cascaded with it.
 * - `forks` — ordinary branches (including historical logs that still record
 *   a parent). They are independent user sessions, so the walk records one and
 *   stops: nothing below it may be cascaded with the root.
 *
 * @param {object} node - one `SessionLineageNode` returned by `traceSession`.
 * @param {{ subagents: object[], forks: object[] }} out - accumulator.
 */
function partitionDescendants(node, out) {
  for (const child of node?.descendants ?? []) {
    const record = child?.session
    const id = record?.header?.id
    if (typeof id !== 'string') continue
    if (classifySession(record.header) === 'subagent') {
      out.subagents.push(record)
      partitionDescendants(child, out)
    } else {
      out.forks.push(record)
    }
  }
  return out
}

/** Result envelope for one batch. */
function summarize(results) {
  const succeeded = results.filter((item) => item.ok).length
  return {
    totals: {
      requested: results.length,
      succeeded,
      failed: results.length - succeeded,
    },
    results,
  }
}

/**
 * Build the plugin's operation set.
 *
 * @param {object} ctx
 * @param {object} config - already normalized.
 */
export function createService(ctx, config) {
  const withLock = createLock()

  const persistence = () => ctx.sessionPersistence
  const registry = () => ctx.workspaceRegistry
  const query = () => ctx.sessionQuery

  const sessionsRoot = () => config.sessionsRoot || defaultSessionsRoot()

  const archivedIds = () => {
    try {
      const value = registry()?.archivedSessionIds
      return Array.isArray(value) ? [...value] : []
    } catch {
      return []
    }
  }

  const readTitle = async (id) => {
    try {
      const snaps = await query().readTitleSnapshots([id])
      const first = Array.isArray(snaps) ? snaps[0] : undefined
      if (first?.status !== 'fulfilled') return ''
      const title = first.value?.title?.title
      return typeof title === 'string' ? title : ''
    } catch {
      return ''
    }
  }

  const descendantsOf = async (id) => {
    const trace = query()?.traceSession
    if (typeof trace !== 'function') {
      throw new SessionMngError('trace-unavailable', 'this DSH build cannot trace session lineage', 501)
    }
    try {
      const lineage = await trace.call(query(), id)
      return partitionDescendants(lineage, { subagents: [], forks: [] })
    } catch (error) {
      throw new SessionMngError('trace-failed', `could not trace descendants of "${id}": ${messageOf(error)}`, 500)
    }
  }

  /** Stop an attached/running agent before touching its log. */
  const stopAgent = async (id) => {
    const agents = serviceOf(ctx, 'agents')
    let agent
    try {
      agent = agents?.get?.(id)
    } catch {
      agent = undefined
    }
    if (agent === undefined) return false
    const running = agent.status === 'running' || agent.running === true
    if (!running) return false
    if (typeof agent.cancel !== 'function') {
      throw new SessionMngError('session-running', `session "${id}" is running and cannot be stopped by this DSH build`, 409)
    }
    try {
      agent.cancel({ kind: 'disposed' })
      if (typeof agent.whenIdle === 'function') await agent.whenIdle()
      return true
    } catch (error) {
      throw new SessionMngError('session-running', `could not stop session "${id}": ${messageOf(error)}`, 409)
    }
  }

  const workspaceOfId = (id) => {
    try {
      return findOwningWorkspace(registry(), id)
    } catch {
      return undefined
    }
  }

  const workspaceById = (workspaceId) => {
    try {
      return registry()?.get?.(workspaceId)
    } catch {
      return undefined
    }
  }

  /** Locate the one directory holding a session, or throw. */
  const dirsOf = async (id, cwd) => {
    const dirs = await findSessionDirs({
      persistence: persistence(),
      id,
      cwd,
      root: sessionsRoot(),
    })
    if (dirs.length === 0) throw new SessionMngError('not-found', `no stored session directory for "${id}"`, 404)
    if (dirs.length > 1) {
      throw new SessionMngError('duplicate-session', `session "${id}" exists in ${dirs.length} project directories`, 409, {
        dirs,
      })
    }
    return dirs[0]
  }

  // -------------------------------------------------------------------------
  // Listing / preview
  // -------------------------------------------------------------------------

  const state = (options = {}) =>
    buildState(ctx, config, {
      includeSubagents: options.includeSubagents === true,
      signal: options.signal,
    })

  const preview = async (sessionId, count) => {
    const id = normalizeId(sessionId)
    const limit = Number.isFinite(count) ? Math.max(1, Math.min(10, Math.trunc(count))) : 10
    let events = []
    try {
      const surface = await query().readSurface(id)
      events = Array.isArray(surface?.events) ? surface.events : []
    } catch {
      try {
        const log = await query().readSession(id)
        events = Array.isArray(log?.events) ? log.events : []
      } catch (error) {
        throw new SessionMngError('not-found', `could not read session "${id}": ${messageOf(error)}`, 404)
      }
    }
    const messages = []
    for (let index = events.length - 1; index >= 0 && messages.length < limit; index -= 1) {
      const event = events[index]
      const text = textOfEvent(event)
      if (text === '') continue
      messages.push({
        role: event.type === 'user/message' ? 'user' : 'assistant',
        text: text.replace(/\s+/gu, ' ').slice(0, 2000),
        time: typeof event.time === 'number' ? event.time : 0,
      })
    }
    messages.reverse()
    return { messages, total: messages.length }
  }

  // -------------------------------------------------------------------------
  // Titles
  // -------------------------------------------------------------------------

  const propose = async (sessionId, signal) => {
    const id = normalizeId(sessionId)
    return proposeTitle(ctx, id, config, signal)
  }

  const applyTitle = async (sessionId, title) => {
    const id = normalizeId(sessionId)
    const normalized = normalizeTitle(title, config.titleMaxBytes)
    if (normalized === '') throw new SessionMngError('title-invalid', 'session title must contain visible characters', 400)

    return withLock(async () => {
      let live
      try {
        live = ctx.sessions?.get?.(id)
      } catch {
        live = undefined
      }
      if (live !== undefined) {
        const titles = ctx.sessionTitle
        if (titles === undefined) throw new SessionMngError('unsupported-host', 'this deployment mounts no session-title service', 501)
        try {
          const accepted = titles.rename(live, normalized)
          return { title: accepted.title, seq: accepted.eventSeq, mode: 'live' }
        } catch (error) {
          if (String(error?.name).includes('TitleInvalid')) {
            throw new SessionMngError('title-invalid', messageOf(error), 400)
          }
          throw error
        }
      }

      const store = persistence()
      if (store === undefined || typeof store.open !== 'function') {
        throw new SessionMngError('unsupported-backend', 'this deployment has no writable session persistence', 501)
      }
      let handle
      try {
        handle = await store.open(id, 'write')
      } catch (error) {
        const mapped = resultError(error)
        throw new SessionMngError(mapped.code === 'internal' ? 'session-writer-held' : mapped.code, messageOf(error), 409)
      }
      let result
      try {
        const { events } = await handle.read()
        const list = Array.isArray(events) ? events : []
        let latestTitle = ''
        let latestSeq = -1
        let maxSeq = -1
        for (let index = list.length - 1; index >= 0; index -= 1) {
          const event = list[index]
          if (typeof event?.seq !== 'number') continue
          if (event.seq > maxSeq) maxSeq = event.seq
          if (latestSeq < 0 && event.type === 'session/title') {
            latestTitle = typeof event.data?.title === 'string' ? event.data.title : ''
            latestSeq = event.seq
          }
        }
        if (latestTitle === normalized && latestSeq >= 0) {
          result = { title: normalized, seq: latestSeq, mode: 'cold', noop: true }
        } else {
          const seq = maxSeq + 1
          await handle.append([
            {
              type: 'session/title',
              seq,
              time: Date.now(),
              data: { title: normalized, messageSeqs: [], source: { kind: 'user' } },
            },
          ])
          await handle.flush()
          result = { title: normalized, seq, mode: 'cold' }
        }
      } finally {
        await handle?.close?.().catch?.(() => {})
      }
      const actual = await readTitle(id)
      if (actual !== normalized) {
        throw new SessionMngError('title-verify-failed', 'the title event did not read back after the write', 500, {
          expected: normalized,
          actual,
        })
      }
      return result
    })
  }

  // -------------------------------------------------------------------------
  // Archive / restore
  // -------------------------------------------------------------------------

  const archive = async (sessionIds, stopActivity = false) => {
    const ids = normalizeIds(sessionIds, config.maxBatch)
    const store = registry()
    if (store === undefined) throw new SessionMngError('unsupported-host', 'workspace registry is unavailable', 501)
    const results = []
    for (const id of ids) {
      try {
        await store.archiveSession(id, stopActivity === true ? { stopActivity: true } : {})
        results.push({ sessionId: id, ok: true })
      } catch (error) {
        results.push({ sessionId: id, ok: false, error: resultError(error) })
      }
    }
    return summarize(results)
  }

  const unarchive = async (sessionIds) => {
    const ids = normalizeIds(sessionIds, config.maxBatch)
    const store = registry()
    if (store === undefined) throw new SessionMngError('unsupported-host', 'workspace registry is unavailable', 501)
    const results = []
    for (const id of ids) {
      try {
        await store.unarchiveSession(id)
        results.push({ sessionId: id, ok: true })
      } catch (error) {
        results.push({ sessionId: id, ok: false, error: resultError(error) })
      }
    }
    return summarize(results)
  }

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------

  const deletePreview = async (sessionIds) => {
    const ids = normalizeIds(sessionIds, config.maxBatch)
    const store = persistence()
    if (store === undefined || typeof store.stat !== 'function' || typeof store.locate !== 'function') {
      throw new SessionMngError('unsupported-backend', 'permanent deletion requires the local JSONL session backend', 501)
    }
    const archived = new Set(archivedIds())
    const selected = new Set(ids)
    const roots = []
    const errors = []
    const sessions = []
    // Ordinary forks are independent sessions: they keep their own log when a
    // parent is deleted and only lose the "from <parent>" label. Collect them
    // separately so the confirmation can say so instead of silently cascading
    // a user branch. A fork selected in this same batch is deleted on its own.
    const forkChildren = []
    const forkSeen = new Set()
    for (const rootId of ids) {
      try {
        if (!archived.has(rootId)) {
          throw new SessionMngError('archived-required', 'only archived sessions can be permanently deleted', 409, {
            sessionId: rootId,
          })
        }
        const snapshot = await store.stat(rootId)
        const header = snapshot?.header
        if (header === undefined) throw new SessionMngError('not-found', `session "${rootId}" is not stored`, 404)
        const lineage = await descendantsOf(rootId)
        const all = [rootId, ...lineage.subagents.map((record) => record.header.id).filter((id) => id !== rootId)]
        for (const record of lineage.forks) {
          const forkId = record.header.id
          if (selected.has(forkId) || forkSeen.has(forkId)) continue
          forkSeen.add(forkId)
          forkChildren.push({
            id: forkId,
            parentId: record.header.parentSession ?? rootId,
            title: await readTitle(forkId),
          })
        }
        const rootRow = {
          id: rootId,
          title: await readTitle(rootId),
          archived: true,
          descendantCount: all.length - 1,
          sessions: [],
          bytes: 0,
        }
        for (const id of all) {
          const targetHeader = id === rootId ? header : (await store.stat(id).catch(() => undefined))?.header
          let dir
          try {
            dir = await dirsOf(id, targetHeader?.cwd)
          } catch {
            dir = undefined
          }
          const bytes = dir === undefined ? 0 : await dirSize(dir)
          let readable = false
          try {
            await query().readSession(id)
            readable = true
          } catch {
            readable = false
          }
          const row = {
            id,
            title: id === rootId ? rootRow.title : '',
            dir: dir ?? null,
            bytes,
            descendant: id !== rootId,
            archived: archived.has(id),
            live: ctx.sessions?.get?.(id) !== undefined,
            running:
              serviceOf(ctx, 'agents')?.get?.(id)?.status === 'running' ||
              serviceOf(ctx, 'agents')?.get?.(id)?.running === true,
            readable,
            missing: dir === undefined,
          }
          rootRow.sessions.push(row)
          rootRow.bytes += bytes
          sessions.push(row)
        }
        roots.push(rootRow)
      } catch (error) {
        errors.push({ sessionId: rootId, ...resultError(error) })
      }
    }
    return {
      roots,
      errors,
      sessions,
      descendantCount: roots.reduce((sum, root) => sum + root.descendantCount, 0),
      forkChildren,
      totalBytes: sessions.reduce((sum, row) => sum + row.bytes, 0),
    }
  }

  const remove = async (sessionIds, confirm) => {
    if (confirm !== true) throw new SessionMngError('confirm-required', 'permanent deletion requires confirm: true', 400)
    const roots = normalizeIds(sessionIds, config.maxBatch)
    const store = persistence()
    if (store === undefined || typeof store.stat !== 'function' || typeof store.locate !== 'function') {
      throw new SessionMngError('unsupported-backend', 'permanent deletion requires the local JSONL session backend', 501)
    }

    return withLock(async () => {
      const archived = new Set(archivedIds())
      const records = []
      const seen = new Set()
      const failures = new Map()

      for (const rootId of roots) {
        if (!archived.has(rootId)) {
          failures.set(rootId, {
            sessionId: rootId,
            ok: false,
            error: { code: 'archived-required', message: 'only archived sessions can be permanently deleted' },
          })
          continue
        }
        let lineage
        try {
          lineage = await descendantsOf(rootId)
        } catch (error) {
          failures.set(rootId, { sessionId: rootId, ok: false, error: resultError(error) })
          continue
        }
        // Only delegation sessions are cascaded. An ordinary fork (including a
        // historical log that still records a parent) is an independent user
        // session and stays where it is.
        for (const id of [rootId, ...lineage.subagents.map((record) => record.header.id)]) {
          if (seen.has(id)) continue
          seen.add(id)
          const snapshot = await store.stat(id).catch(() => undefined)
          const header = snapshot?.header
          let dir
          if (header !== undefined) {
            try {
              dir = await dirsOf(id, header.cwd)
            } catch {
              dir = undefined
            }
          }
          records.push({
            id,
            header,
            dir,
            bytes: dir === undefined ? 0 : await dirSize(dir),
            owner: workspaceOfId(id),
            archived: archived.has(id),
            rootId,
          })
        }
      }

      if (records.length === 0) return summarize([...failures.values()])
      if (records.length > MAX_DELETE_TOTAL) {
        throw new SessionMngError('too-many', `at most ${MAX_DELETE_TOTAL} sessions (including descendants) can be deleted at once`, 400, {
          max: MAX_DELETE_TOTAL,
        })
      }

      // A live Session keeps its in-memory object after its log is deleted,
      // which would leave a ghost row until the process restarts. Refuse it
      // and name the remedy instead of deleting under a running object.
      for (const record of records) {
        if (ctx.sessions?.get?.(record.id) !== undefined) {
          throw new SessionMngError(
            'session-live',
            `session "${record.id}" is open in this DSH process; restart DSH and retry the deletion`,
            409,
            { sessionId: record.id },
          )
        }
        const agent = serviceOf(ctx, 'agents')?.get?.(record.id)
        if (agent?.status === 'running' || agent?.running === true) {
          throw new SessionMngError('session-running', `session "${record.id}" is running; stop it before deleting`, 409, {
            sessionId: record.id,
          })
        }
      }

      const existing = records.filter((record) => record.dir !== undefined)
      const tempRoot = existing.length > 0 ? tempRootFor(rootOfSessionDir(existing[0].dir)) : tempRootFor(sessionsRoot())
      const staged = await stageDelete({
        dirs: existing.map((record) => ({ id: record.id, dir: record.dir })),
        tempRoot,
        batchId: Date.now().toString(36),
      })

      try {
        const cleanupFailures = await cleanupDeletedRegistry({
          registry: registry(),
          records: records.map((record) => ({
            id: record.id,
            owner: record.owner,
            archived: record.archived,
          })),
        })
        if (cleanupFailures.length > 0) {
          const restoreFailures = await restoreStagedDelete(staged)
          const registryRestore = await restoreDeletedRegistry({
            registry: registry(),
            records: records.map((record) => ({ id: record.id, owner: record.owner, archived: record.archived })),
          })
          throw new SessionMngError(
            'registry-cleanup-failed',
            'could not detach every session from its workspace; the files were restored',
            500,
            { cleanupFailures, restoreFailures, registryRestore },
          )
        }
      } catch (error) {
        if (!(error instanceof SessionMngError)) {
          await restoreStagedDelete(staged).catch(() => {})
          await restoreDeletedRegistry({
            registry: registry(),
            records: records.map((record) => ({ id: record.id, owner: record.owner, archived: record.archived })),
          }).catch(() => {})
        }
        throw error
      }

      const leftovers = await removeStagedDelete(staged)
      if (leftovers.length > 0) {
        throw new SessionMngError('leftover-trash', 'session logs were detached but some files could not be removed', 500, {
          leftovers,
        })
      }

      const results = []
      for (const rootId of roots) {
        const failure = failures.get(rootId)
        if (failure !== undefined) {
          results.push(failure)
          continue
        }
        const members = records.filter((record) => record.rootId === rootId)
        results.push({
          sessionId: rootId,
          ok: true,
          deleted: members.length,
          descendants: members.filter((record) => record.id !== rootId).length,
          bytes: members.reduce((sum, record) => sum + record.bytes, 0),
          alreadyGone: members.every((record) => record.dir === undefined),
          ...(members.length === 0 ? { coveredByAnotherRoot: true } : {}),
        })
      }
      return summarize(results)
    })
  }

  // -------------------------------------------------------------------------
  // Move
  // -------------------------------------------------------------------------

  const move = async (sessionIds, workspaceId) => {
    const ids = normalizeIds(sessionIds, config.maxMoveBatch)
    if (typeof workspaceId !== 'string' || workspaceId.trim() === '') {
      throw new SessionMngError('bad-request', 'workspaceId must be a non-empty string', 400)
    }
    const store = registry()
    if (store === undefined) throw new SessionMngError('unsupported-host', 'workspace registry is unavailable', 501)
    const target = workspaceById(workspaceId.trim())
    if (target === undefined) throw new SessionMngError('workspace-not-found', `unknown workspace "${workspaceId}"`, 404)
    let targetStatus
    try {
      targetStatus = await target.status?.()
    } catch {
      targetStatus = 'missing-dir'
    }
    if (targetStatus !== 'ok') {
      throw new SessionMngError('workspace-missing', `workspace directory is not available: ${target.path}`, 409, {
        workspaceId: target.id,
        path: target.path,
      })
    }
    if (!zstdAvailable()) {
      throw new SessionMngError('unsupported-node', 'moving a session needs Node.js with Zstandard support (>=22.15)', 501)
    }
    if (!canReconcileMove(store)) {
      throw new SessionMngError(
        'unsupported-registry',
        'this DSH version no longer exposes the workspace header cache needed for a restart-free move',
        501,
        { dsh: '0.2.1-rc.2' },
      )
    }

    const results = []
    await withLock(async () => {
      for (const id of ids) {
        try {
          results.push(await moveOne(id, target))
        } catch (error) {
          results.push({ sessionId: id, ok: false, error: resultError(error) })
        }
      }
    })
    return summarize(results)
  }

  /** Move one cold session. Throws on any failure; the caller converts it. */
  async function moveOne(id, target) {
    const store = persistence()
    if (store === undefined || typeof store.stat !== 'function' || typeof store.locate !== 'function') {
      throw new SessionMngError('unsupported-backend', 'moving a session requires the local JSONL session backend', 501)
    }
    const snapshot = await store.stat(id)
    const header = snapshot?.header
    if (header === undefined) throw new SessionMngError('not-found', `session "${id}" is not stored`, 404)
    if (typeof header.cwd !== 'string' || header.cwd === '') {
      throw new SessionMngError('no-cwd', 'this session has no recorded working directory, so it cannot be moved', 409)
    }
    if (ctx.sessions?.get?.(id) !== undefined) {
      throw new SessionMngError('session-live', 'this session is open in the running DSH process; restart DSH and retry the move', 409)
    }
    if (serviceOf(ctx, 'agents')?.get?.(id)?.status === 'running') {
      throw new SessionMngError('session-running', 'this session is running; stop it before moving', 409)
    }
    if (header.origin === 'subagent' || (typeof header.delegationDepth === 'number' && header.delegationDepth >= 1)) {
      throw new SessionMngError('subagent-session', 'subagent sessions are not moved on their own', 409)
    }
    if (header.parentSession !== undefined && header.parentSession !== null) {
      throw new SessionMngError(
        'branch-session',
        "a branch session must stay in its parent's workspace, so it is not moved on its own",
        409,
      )
    }
    // Only subagent descendants block a move. An ordinary fork (historical or
    // not) is an independent session, so it no longer blocks its source.
    const lineage = await descendantsOf(id)
    if (lineage.subagents.length > 0) {
      throw new SessionMngError('has-descendants', 'this session has subagent descendants; they cannot follow it yet', 409, {
        descendants: lineage.subagents.length,
      })
    }
    const source = workspaceOfId(id)
    const sourceDir = await dirsOf(id, header.cwd)
    const targetDir = sessionDirFromLocate(store, id, target.path)
    if (targetDir === undefined) {
      throw new SessionMngError('unsupported-backend', 'the session backend cannot locate a target directory', 501)
    }

    if (targetDir === sourceDir) {
      // Bytes are already in the target project directory; only the ledger and
      // the cache may disagree.
      await reconcileMove({ registry: registry(), id, oldHeader: header, newHeader: header, source, target })
      return { sessionId: id, ok: true, moved: false, alreadyThere: true, to: target.id }
    }
    if (await pathExists(targetDir)) {
      throw new SessionMngError('move-conflict', `destination already holds a session directory: ${targetDir}`, 409)
    }

    // Prove the log is readable and that no other process is writing it before
    // touching a single byte.
    let original
    try {
      original = await query().readSession(id)
    } catch (error) {
      throw new SessionMngError('unreadable-session', `could not replay session "${id}": ${messageOf(error)}`, 422)
    }
    const originalCount = Array.isArray(original?.events) ? original.events.length : 0
    let lease
    try {
      lease = await store.open(id, 'write')
    } catch (error) {
      throw new SessionMngError('session-writer-held', `session "${id}" is being written by another process: ${messageOf(error)}`, 409)
    }
    await lease.close().catch(() => {})

    const root = rootOfSessionDir(sourceDir)
    const staged = await stageMove({
      sourceDir,
      targetDir,
      tempRoot: tempRootFor(root),
      id,
      newCwd: target.path,
    })
    try {
      const validation = await query().readSession(id)
      const validatedCwd = validation?.session?.cwd
      const validatedCount = Array.isArray(validation?.events) ? validation.events.length : -1
      if (validatedCwd !== target.path || validatedCount !== originalCount) {
        throw new SessionMngError('move-verify-failed', 'the moved session did not read back with the expected header and event count', 500, {
          expectedCwd: target.path,
          actualCwd: validatedCwd,
          expectedEvents: originalCount,
          actualEvents: validatedCount,
        })
      }
      await reconcileMove({
        registry: registry(),
        id,
        oldHeader: header,
        newHeader: staged.header,
        source,
        target,
      })
    } catch (error) {
      await rollbackMoveReconcile({
        registry: registry(),
        id,
        oldHeader: header,
        source,
        target,
        sourcePath: source?.path ?? header.cwd,
      })
      try {
        await rollbackMove({ sourceDir, targetDir, backupDir: staged.backupDir })
      } catch (rollbackError) {
        throw new SessionMngError('manual-recovery', 'the move failed and the automatic rollback also failed', 500, {
          sourceDir,
          targetDir,
          backupDir: staged.backupDir,
          cause: messageOf(error),
          rollback: messageOf(rollbackError),
        })
      }
      throw error
    }

    let leftoverBackup
    try {
      await finalizeMove(staged.backupDir)
    } catch (error) {
      leftoverBackup = { path: staged.backupDir, reason: messageOf(error) }
    }
    return {
      sessionId: id,
      ok: true,
      moved: true,
      from: source?.id ?? null,
      to: target.id,
      cwd: { from: header.cwd, to: target.path },
      bytes: staged.bytes,
      ...(leftoverBackup === undefined ? {} : { leftoverBackup }),
    }
  }

  return {
    state,
    preview,
    propose,
    applyTitle,
    archive,
    unarchive,
    deletePreview,
    remove,
    move,
  }
}
