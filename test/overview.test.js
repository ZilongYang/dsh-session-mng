import test from 'node:test'
import assert from 'node:assert/strict'

import { buildOverview, fromContext } from '../lib/catalog.js'
import { createService, normalizeConfig } from '../lib/service.js'
import { buildState } from '../lib/state.js'

const config = normalizeConfig({})

/**
 * One fake host that serves BOTH the 0.1.x listing (`buildState` reads the
 * controller and persistence) and the 0.2.0 catalog (the header index and the
 * projection cache). Comparing the two on the same fixture is the whole point
 * of this file: the counts may not drift.
 */
function makeHost() {
  const rows = [
    { id: 's1', workspace: 'a', cwd: '/a', createdAt: 10, title: 'Alpha', lastPromptAt: 100, blank: false, size: 100, pinned: true },
    { id: 's2', workspace: 'b', cwd: '/b', createdAt: 20, title: 'Beta', lastPromptAt: null, blank: true, size: 200, archived: true },
    { id: 's3', workspace: 'b', cwd: '/b', createdAt: 30, title: '', lastPromptAt: null, blank: false, size: 50, origin: 'subagent', parent: 's1', depth: 1 },
    { id: 's4', workspace: 'b', cwd: '/b', createdAt: 40, title: 'Branch', lastPromptAt: 90, blank: false, size: 70, parent: 's2', seeded: true },
    { id: 's5', workspace: 'b', cwd: '/b', createdAt: 50, title: 'Orphan branch', lastPromptAt: null, blank: false, size: 30, parent: 'ghost-parent', seeded: true },
    { id: 's6', workspace: null, cwd: '/x', createdAt: 60, title: 'Ungrouped', lastPromptAt: null, blank: false, size: 10 },
  ]
  const headers = new Map()
  const cacheBlocks = new Map()
  const snapshots = []
  const items = []
  for (const row of rows) {
    headers.set(row.id, {
      id: row.id,
      createdAt: row.createdAt,
      cwd: row.cwd,
      isSeeded: row.seeded === true,
      delegationDepth: row.depth ?? 0,
      ...(row.origin === undefined ? {} : { origin: row.origin }),
      ...(row.parent === undefined ? {} : { parentSession: row.parent }),
    })
    const values = {
      title: row.title,
      sessionListMetadata: { blank: row.blank, lastPromptAt: row.lastPromptAt },
    }
    cacheBlocks.set(row.id, { asOfSeq: 1, values })
    snapshots.push({
      header: { id: row.id, createdAt: row.createdAt, cwd: row.cwd },
      sizeBytes: row.size,
      formatStatus: 'current',
    })
    items.push({
      sessionId: row.id,
      updatedAt: Math.max(row.createdAt, row.lastPromptAt ?? 0),
      running: false,
      blank: row.blank,
      cwd: row.cwd,
      ...(row.origin === undefined ? {} : { origin: row.origin }),
      ...(row.parent === undefined ? {} : { parentSessionId: row.parent }),
      formatStatus: 'current',
      projections: { values },
    })
  }
  const entities = [
    { id: 'a', title: 'A', path: '/a', sessionIds: ['s1'], status: async () => 'ok' },
    { id: 'b', title: 'B', path: '/b', sessionIds: ['s2', 's3', 's4', 's5'], status: async () => 'ok' },
  ]
  const registry = {
    headers,
    list: () => entities,
    get: (id) => entities.find((entity) => entity.id === id),
    archivedSessionIds: ['s2', 'ghost'],
    pinnedSessionIds: ['s1'],
    host: { rememberSessionPath() {} },
  }
  const services = {
    workspaceRegistry: registry,
    sessionController: { list: async () => ({ items }) },
    sessionProjectionCache: {
      cachedSnapshot: (meta) => cacheBlocks.get(meta.id),
      cachedPredecessorTitle: () => undefined,
    },
    sessionProjections: { cachedSnapshot: () => undefined },
    agents: { get: () => undefined },
  }
  return {
    ctx: {
      sessions: { get: () => undefined, list: () => [] },
      llm: {},
      sessionPersistence: {
        list: async () => snapshots,
        locate: () => ({ kind: 'jsonl', path: '/tmp/session.v4.jsonl.zstd' }),
        stat: async () => undefined,
      },
      sessionQuery: {
        listSessions: async () => [],
        readTitleSnapshots: async (ids) => ids.map((id) => ({ sessionId: id, status: 'rejected' })),
      },
      workspaceRegistry: registry,
      get(name) {
        return services[name]
      },
    },
  }
}

/** Blank rows in a `buildState` result, i.e. what the Client counts separately. */
function stateBlankCount(state) {
  return state.sessions.filter((row) => row.blank === true).length
}

function assertCountsMatch(state, overview) {
  assert.equal(overview.totals.all, state.totals.all)
  assert.equal(overview.totals.active, state.totals.active)
  assert.equal(overview.totals.archived, state.totals.archived)
  assert.equal(overview.totals.subagents, state.totals.subagents)
  assert.equal(overview.totals.hiddenSubagents, state.totals.hiddenSubagents)
  assert.equal(overview.totals.forks, state.totals.forks)
  assert.equal(overview.totals.blank, stateBlankCount(state))
  assert.equal(overview.totals.bytes, null)
  assert.deepEqual(overview.orphans, state.orphans)

  assert.deepEqual(
    overview.workspaces.map((workspace) => workspace.id),
    state.workspaces.map((workspace) => workspace.id),
  )
  for (const workspace of overview.workspaces) {
    const expected = state.workspaces.find((item) => item.id === workspace.id)
    assert.equal(workspace.count, expected.count, `workspace "${workspace.id}" count`)
    assert.equal(workspace.archivedCount, expected.archivedCount, `workspace "${workspace.id}" archivedCount`)
    assert.equal(workspace.activeCount, workspace.count - workspace.archivedCount)
    assert.equal(workspace.blankCount, stateBlankCount(state) - state.sessions.filter((row) => row.workspaceId !== workspace.id && row.blank === true).length)
    assert.equal(workspace.totalBytes, null)
    assert.equal(workspace.status, expected.status)
  }
  assert.equal(overview.ungrouped.count, state.ungrouped.count)
  assert.equal(overview.ungrouped.archivedCount, state.ungrouped.archivedCount)
  assert.equal(
    overview.ungrouped.blankCount,
    state.sessions.filter((row) => row.workspaceId === null && row.blank === true).length,
  )
  assert.equal(overview.ungrouped.totalBytes, null)

  assert.equal(overview.capabilities.title, state.capabilities.title)
  assert.equal(overview.capabilities.move, state.capabilities.move)
  assert.equal(overview.capabilities.delete, state.capabilities.delete)
  assert.equal(overview.capabilities.backend, state.capabilities.backend)
  assert.equal(overview.capabilities.search, false)
  assert.equal(overview.backend, state.backend)
  assert.equal(overview.limits.maxBatch, state.limits.maxBatch)
  assert.equal(overview.limits.maxMoveBatch, state.limits.maxMoveBatch)
}

test('overview counts match buildState field by field', async () => {
  const { ctx } = makeHost()
  const state = await buildState(ctx, config)
  const overview = buildOverview(await fromContext(ctx, config, {}))
  assert.equal(overview.source, 'catalog')
  assertCountsMatch(state, overview)
  // First paint must never carry session rows.
  assert.equal(Object.hasOwn(overview, 'sessions'), false)
  assert.equal(Object.hasOwn(overview, 'rows'), false)
})

test('overview counts match buildState with subagents included', async () => {
  const { ctx } = makeHost()
  const state = await buildState(ctx, config, { includeSubagents: true })
  const overview = buildOverview(await fromContext(ctx, config, { includeSubagents: true }))
  assertCountsMatch(state, overview)
  assert.equal(overview.totals.subagents, 1)
  assert.equal(overview.totals.hiddenSubagents, 0)
})

test('overview reports blank counts the Client renders separately', async () => {
  const { ctx } = makeHost()
  const overview = buildOverview(await fromContext(ctx, config, {}))
  // s2 is the one blank row and it is archived.
  assert.equal(overview.totals.blank, 1)
  assert.equal(overview.workspaces.find((workspace) => workspace.id === 'b').blankCount, 1)
  assert.equal(overview.ungrouped.blankCount, 0)
})

/**
 * 10 000 synthetic sessions behind the two in-memory seams only. The counters
 * are the point: the fast path may not touch the O(n) persistence or the API
 * controller, and the response may stay tiny.
 */
function makeLargeHost(sessionCount, workspaceCount) {
  const headers = new Map()
  const cacheBlocks = new Map()
  const snapshots = []
  const items = []
  const counters = { persistenceList: 0, controllerList: 0, titleSnapshots: 0 }
  const workspaces = Array.from({ length: workspaceCount }, (_, index) => ({
    id: `w${index}`,
    title: `Workspace ${index}`,
    path: `/w/${index}`,
    sessionIds: [],
    status: async () => 'ok',
  }))
  for (let index = 0; index < sessionCount; index += 1) {
    const workspace = workspaces[index % workspaceCount]
    const id = `session-${String(index).padStart(6, '0')}`
    const createdAt = 1_700_000_000_000 + index
    const lastPromptAt = createdAt + 10
    headers.set(id, { id, createdAt, cwd: workspace.path, isSeeded: false, delegationDepth: 0 })
    workspace.sessionIds.push(id)
    const values = {
      title: `Session ${index}`,
      sessionListMetadata: { blank: index % 11 === 0, lastPromptAt },
    }
    cacheBlocks.set(id, { asOfSeq: 1, values })
    snapshots.push({ header: { id, createdAt, cwd: workspace.path }, sizeBytes: 1_000 + index, formatStatus: 'current' })
    items.push({ sessionId: id, updatedAt: lastPromptAt, running: false, blank: index % 11 === 0, cwd: workspace.path, projections: { values } })
  }
  const registry = {
    headers,
    list: () => workspaces,
    get: (id) => workspaces.find((workspace) => workspace.id === id),
    archivedSessionIds: [],
    pinnedSessionIds: [],
    host: { rememberSessionPath() {} },
  }
  const services = {
    workspaceRegistry: registry,
    sessionController: {
      list: async () => {
        counters.controllerList += 1
        return { items }
      },
    },
    sessionProjectionCache: {
      cachedSnapshot: (meta) => cacheBlocks.get(meta.id),
      cachedPredecessorTitle: () => undefined,
    },
    sessionProjections: { cachedSnapshot: () => undefined },
    agents: { get: () => undefined },
  }
  const ctx = {
    sessions: { get: () => undefined, list: () => [] },
    llm: {},
    sessionPersistence: {
      list: async () => {
        counters.persistenceList += 1
        return snapshots
      },
      locate: () => ({ kind: 'jsonl', path: '/tmp/session.v4.jsonl.zstd' }),
      stat: async () => undefined,
    },
    sessionQuery: {
      listSessions: async () => [],
      readTitleSnapshots: async (ids) => {
        counters.titleSnapshots += 1
        return ids.map((id) => ({ sessionId: id, status: 'rejected' }))
      },
    },
    workspaceRegistry: registry,
    get(name) {
      return services[name]
    },
  }
  return { ctx, counters, workspaces }
}

test('10k overview: no O(n) host calls, tiny payload, fast build', async () => {
  const sessionCount = 10_000
  const { ctx, counters } = makeLargeHost(sessionCount, 6)
  const service = createService(ctx, config)

  // Warm the module paths first: the budget is meant for request assembly, not
  // for first-call JIT compilation of freshly imported modules.
  await service.overview({})
  const startedAt = performance.now()
  const overview = await service.overview({})
  const elapsed = performance.now() - startedAt

  assert.equal(counters.persistenceList, 0, 'overview must not call sessionPersistence.list')
  assert.equal(counters.controllerList, 0, 'overview must not call sessionController.list')
  assert.equal(counters.titleSnapshots, 0, 'overview must not batch-read titles')
  assert.equal(overview.totals.all, sessionCount)
  assert.equal(Object.hasOwn(overview, 'rows'), false)
  assert.equal(Object.hasOwn(overview, 'sessions'), false)

  const payloadBytes = Buffer.byteLength(JSON.stringify(overview), 'utf8')
  assert.ok(payloadBytes < 2 * 1024, `overview payload is ${payloadBytes} bytes`)
  assert.ok(elapsed < 50, `overview build took ${elapsed.toFixed(1)} ms`)
})
