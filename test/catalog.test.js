import test from 'node:test'
import assert from 'node:assert/strict'

import {
  catalogAvailable,
  fromContext,
  fromState,
  legacyState,
  orderBranchRows,
  publicRow,
} from '../lib/catalog.js'
import { normalizeConfig } from '../lib/service.js'
import { buildState } from '../lib/state.js'

const config = normalizeConfig({})

/** One projection-cache block the host would serve for a header. */
function block(values) {
  return { asOfSeq: 1, values }
}

/** One header as the workspace registry's header index stores it. */
function header(id, extra = {}) {
  return { id, createdAt: 10, cwd: '/a', isSeeded: false, delegationDepth: 0, ...extra }
}

/**
 * Fake host exposing only the two in-memory seams plus the minimum the catalog
 * reads through. No persistence, no controller: the fast path must not need
 * them.
 */
function makeCtx(options = {}) {
  const workspaceList = options.workspaces ?? [{ id: 'a', path: '/a', sessionIds: [] }]
  const entities = workspaceList.map((workspace) => ({
    id: workspace.id,
    title: workspace.title ?? workspace.id.toUpperCase(),
    path: workspace.path,
    sessionIds: [...(workspace.sessionIds ?? [])],
    status: async () => workspace.status ?? 'ok',
    attachSession: async () => {},
    detachSession: async () => {},
  }))
  const registry = {
    headers: options.headers ?? new Map(),
    list: () => entities,
    get: (id) => entities.find((entity) => entity.id === id),
    archivedSessionIds: options.archived ?? [],
    pinnedSessionIds: options.pinned ?? [],
    host: { rememberSessionPath() {} },
    archiveSession: async () => {},
    unarchiveSession: async () => {},
  }
  const cacheBlocks = options.cacheBlocks ?? new Map()
  const predecessorTitles = options.predecessorTitles ?? new Map()
  const cache = {
    cachedSnapshot: (meta) => cacheBlocks.get(meta.id),
    cachedPredecessorTitle: (meta) => {
      const title = predecessorTitles.get(meta.id)
      return title === undefined ? undefined : block({ title })
    },
  }
  const liveProjections = options.liveProjections ?? new Map()
  const projections = {
    cachedSnapshot: (session) => liveProjections.get(session.id),
  }
  const live = options.live ?? []
  const persistence =
    options.sessionPersistence ?? {
      locate: () => ({ kind: 'jsonl', path: '/tmp/session.v4.jsonl.zstd' }),
      stat: async () => undefined,
    }
  const services = {
    workspaceRegistry: registry,
    sessionProjectionCache: cache,
    sessionProjections: projections,
    agents: { get: () => undefined },
    sessionController: options.sessionController,
    sessionPersistence: persistence,
    sessionQuery: options.sessionQuery,
  }
  return {
    sessions: {
      get: (id) => live.find((session) => session.id === id),
      list: () => [...live],
    },
    llm: {},
    sessionPersistence: persistence,
    sessionQuery: options.sessionQuery,
    workspaceRegistry: registry,
    get(name) {
      if (options.getThrows === true) throw new Error(`service "${name}" is unavailable`)
      return services[name]
    },
  }
}

test('catalogAvailability is a structural feature check', () => {
  assert.equal(catalogAvailable(makeCtx()), true)
  assert.equal(catalogAvailable(makeCtx({ headers: undefined }) && { sessions: {}, get: () => undefined }), false)
  const noProjection = makeCtx()
  noProjection.get = (name) => (name === 'sessionProjectionCache' ? undefined : noProjection.workspaceRegistry)
  assert.equal(catalogAvailable(noProjection), false)
  // `ctx.get` itself may throw; that must read as "not available", not crash.
  assert.equal(catalogAvailable({ get: () => { throw new Error('no services') } }), false)
})

test('catalog rows union the header index with live sessions', async () => {
  const headers = new Map([
    ['s1', header('s1', { cwd: '/a', agentPreset: 'standard' })],
    ['s2', header('s2', { cwd: '/b', createdAt: 20 })],
  ])
  const live = [{ id: 's3', header: header('s3', { cwd: '/a', createdAt: 30 }), seq: 4 }]
  const ctx = makeCtx({
    headers,
    live,
    workspaces: [
      { id: 'a', path: '/a', sessionIds: ['s1'] },
      { id: 'b', path: '/b', sessionIds: ['s2'] },
    ],
    cacheBlocks: new Map([
      ['s1', block({ title: 'Alpha', sessionListMetadata: { blank: false, lastPromptAt: 99 } })],
    ]),
    liveProjections: new Map([
      ['s3', block({ title: 'Gamma', sessionListMetadata: { blank: false, lastPromptAt: 120 } })],
    ]),
  })
  const catalog = await fromContext(ctx, config, {})
  assert.equal(catalog.source, 'catalog')
  const ids = catalog.rows.map((row) => row.id).sort()
  assert.deepEqual(ids, ['s1', 's2', 's3'])

  const s1 = catalog.entries.get('s1')
  assert.equal(s1.title, 'Alpha')
  assert.equal(s1.blank, false)
  assert.equal(s1.blankKnown, true)
  assert.equal(s1.updatedAt, 99)
  assert.equal(s1.workspaceId, 'a')
  assert.equal(s1.agentPreset, 'standard')
  assert.equal(s1.can.move, true)

  // A live session missing from the ledger and from the header index still
  // appears, grouped by cwd and marked live.
  const s3 = catalog.entries.get('s3')
  assert.equal(s3.live, true)
  assert.equal(s3.workspaceId, 'a')
  assert.equal(s3.title, 'Gamma')
  assert.equal(s3.can.move, false)
  assert.equal(s3.can.delete, false)

  // No cache block: the row reports "unknown", never "empty".
  const s2 = catalog.entries.get('s2')
  assert.equal(s2.blank, false)
  assert.equal(s2.blankKnown, false)
  assert.equal(s2.updatedAt, 20)
})

test('a predecessor title is the last-resort memory title', async () => {
  const ctx = makeCtx({
    headers: new Map([['s1', header('s1')]]),
    predecessorTitles: new Map([['s1', 'Legacy title']]),
  })
  const catalog = await fromContext(ctx, config, {})
  assert.equal(catalog.entries.get('s1').title, 'Legacy title')
})

test('classification, parent annotation and fork counts follow the listing rules', async () => {
  const headers = new Map([
    ['root', header('root', { cwd: '/a', createdAt: 1 })],
    ['branch', header('branch', { cwd: '/a', createdAt: 2, parentSession: 'root', isSeeded: true })],
    ['sub', header('sub', { cwd: '/a', createdAt: 3, parentSession: 'root', origin: 'subagent', delegationDepth: 1 })],
    ['sub-branch', header('sub-branch', { cwd: '/a', createdAt: 4, parentSession: 'sub', isSeeded: true })],
    ['orphan-branch', header('orphan-branch', { cwd: '/a', createdAt: 5, parentSession: 'gone', isSeeded: true })],
  ])
  const ctx = makeCtx({
    headers,
    workspaces: [{ id: 'a', path: '/a', sessionIds: ['root', 'branch', 'sub', 'sub-branch', 'orphan-branch'] }],
    cacheBlocks: new Map([
      ['root', block({ title: 'Root', sessionListMetadata: { blank: false } })],
      ['branch', block({ title: 'Branch', sessionListMetadata: { blank: false } })],
      ['sub-branch', block({ title: 'Sub branch', sessionListMetadata: { blank: false } })],
    ]),
  })

  const hidden = await fromContext(ctx, config, {})
  // A branch of a subagent is an ordinary fork (it carries a parent but no
  // delegation), so only the delegation row itself is hidden.
  assert.deepEqual(
    hidden.rows.map((row) => row.id).sort(),
    ['branch', 'orphan-branch', 'root', 'sub-branch'],
  )
  assert.equal(hidden.hiddenSubagents, 1)
  assert.equal(hidden.entries.get('branch').kind, 'fork')
  assert.equal(hidden.entries.get('branch').parentTitle, 'Root')
  assert.equal(hidden.entries.get('branch').parentPresent, true)
  assert.equal(hidden.entries.get('root').forkCount, 1)
  assert.equal(hidden.entries.get('root').can.move, true)
  assert.equal(hidden.entries.get('sub-branch').parentPresent, false)
  const orphan = hidden.entries.get('orphan-branch')
  assert.equal(orphan.kind, 'fork')
  assert.equal(orphan.parentPresent, false)
  assert.equal(orphan.parentTitle, '')

  const shown = await fromContext(ctx, config, { includeSubagents: true })
  assert.equal(shown.hiddenSubagents, 0)
  assert.equal(shown.entries.size, 5)
  assert.equal(shown.entries.get('sub').isSubagent, true)
  assert.equal(shown.entries.get('sub').can.move, false)
  assert.equal(shown.entries.get('sub-branch').kind, 'fork')
  assert.equal(shown.entries.get('sub-branch').parentPresent, true)
  assert.equal(shown.entries.get('sub-branch').parentTitle, '')
  assert.equal(shown.entries.get('root').forkCount, 1)
})

test('archived, pinned, workspace membership and orphans', async () => {
  const headers = new Map([
    ['s1', header('s1', { cwd: '/a' })],
    ['s2', header('s2', { cwd: '/b' })],
    ['s3', header('s3', { cwd: '/elsewhere' })],
  ])
  const ctx = makeCtx({
    headers,
    archived: ['s2', 'ghost'],
    pinned: ['s1'],
    workspaces: [
      { id: 'a', path: '/a', sessionIds: ['s1'] },
      { id: 'b', path: '/b', sessionIds: ['s2'] },
    ],
  })
  const catalog = await fromContext(ctx, config, {})
  assert.deepEqual(catalog.orphans, ['ghost'])
  assert.equal(catalog.entries.get('s1').pinned, true)
  assert.equal(catalog.entries.get('s2').archived, true)
  assert.equal(catalog.entries.get('s2').can.restore, true)
  // cwd matches no workspace path: ungrouped rather than mis-grouped.
  assert.equal(catalog.entries.get('s3').workspaceId, null)
})

test('deleted ids are filtered and title overrides outrank the cache', async () => {
  const headers = new Map([['s1', header('s1')], ['s2', header('s2')]])
  const ctx = makeCtx({
    headers,
    cacheBlocks: new Map([['s1', block({ title: 'Old' })], ['s2', block({ title: 'Cached' })]]),
  })
  const catalog = await fromContext(ctx, config, {
    deletedIds: new Set(['s2']),
    titleOverrides: new Map([['s1', { title: 'Fresh', at: Date.now() }]]),
  })
  assert.deepEqual(catalog.rows.map((row) => row.id), ['s1'])
  assert.equal(catalog.entries.get('s1').title, 'Fresh')
})

test('publicRow keeps the 0.1.x row shape', async () => {
  const ctx = makeCtx({
    headers: new Map([['s1', header('s1')]]),
    cacheBlocks: new Map([['s1', block({ title: 'Alpha', sessionListMetadata: { blank: false } })]]),
  })
  const catalog = await fromContext(ctx, config, {})
  const row = publicRow(catalog.entries.get('s1'))
  for (const key of [
    'id', 'title', 'cwd', 'workspaceId', 'archived', 'pinned', 'live', 'running', 'blank', 'kind',
    'isFork', 'isSubagent', 'parentSessionId', 'parentTitle', 'parentPresent', 'forkCount',
    'agentPreset', 'createdAt', 'updatedAt', 'sizeBytes', 'can',
  ]) {
    assert.ok(Object.hasOwn(row, key), `row is missing "${key}"`)
  }
  assert.deepEqual(Object.keys(row.can).sort(), ['archive', 'delete', 'move', 'open', 'restore', 'title'])
})

test('a host without the in-memory seams falls back to buildState', async () => {
  const registryHeaders = new Map([['s1', header('s1')]])
  const items = [
    {
      sessionId: 's1',
      updatedAt: 100,
      running: false,
      blank: false,
      cwd: '/a',
      projections: { values: { title: 'Alpha' } },
    },
  ]
  const services = {
    workspaceRegistry: {
      list: () => [{ id: 'a', title: 'A', path: '/a', sessionIds: ['s1'], status: async () => 'ok' }],
      get: () => undefined,
      headers: registryHeaders,
      archivedSessionIds: [],
      pinnedSessionIds: [],
    },
    sessionController: { list: async () => ({ items }) },
    agents: { get: () => undefined },
  }
  const ctx = {
    sessions: { get: () => undefined, list: () => [] },
    llm: {},
    sessionPersistence: { list: async () => [], locate: () => ({ path: '/tmp/x' }), stat: async () => undefined },
    sessionQuery: { listSessions: async () => [], readTitleSnapshots: async () => [] },
    workspaceRegistry: services.workspaceRegistry,
    // No `sessionProjectionCache`: the fast path is unavailable.
    get: (name) => (name === 'sessionController' ? services.sessionController : services[name]),
  }
  assert.equal(catalogAvailable(ctx), false)
  const state = await buildState(ctx, config)
  const catalog = fromState(state, config)
  assert.equal(catalog.source, 'legacy')
  assert.equal(catalog.rows.length, state.sessions.length)
  assert.equal(catalog.rows[0].title, 'Alpha')
  assert.equal(catalog.rows[0].blankKnown, true)
  assert.equal(catalog.rows[0].sizeBytes, 0)
  assert.equal(catalog.hiddenSubagents, state.totals.hiddenSubagents)
  assert.deepEqual(catalog.orphans, state.orphans)

  const viaHelper = await legacyState(ctx, config, { includeSubagents: false })
  assert.equal(viaHelper.sessions.length, state.sessions.length)
})

test('orderBranchRows nests children under their parent without dropping rows', () => {
  const rows = [
    { id: 'b', kind: 'root', parentSessionId: null },
    { id: 'c', kind: 'fork', parentSessionId: 'b' },
    { id: 'a', kind: 'root', parentSessionId: null },
    { id: 'd', kind: 'fork', parentSessionId: 'a' },
    { id: 'x', kind: 'fork', parentSessionId: 'missing' },
  ]
  const ordered = orderBranchRows(rows)
  assert.deepEqual(ordered.map((row) => row.id), ['b', 'c', 'a', 'd', 'x'])
  assert.equal(ordered[1].branchDepth, 1)
  assert.equal(ordered[3].branchDepth, 1)
  assert.equal(ordered[4].branchDepth, undefined)

  // A corrupt parent cycle must not silently drop rows.
  const cycle = [
    { id: 'p', kind: 'fork', parentSessionId: 'q' },
    { id: 'q', kind: 'fork', parentSessionId: 'p' },
  ]
  assert.equal(orderBranchRows(cycle).length, 2)
})
