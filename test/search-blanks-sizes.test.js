import test from 'node:test'
import assert from 'node:assert/strict'

import { createService, DEFAULT_CONFIG, normalizeConfig } from '../lib/service.js'
import { buildState } from '../lib/state.js'

/** One projection-cache block the host would serve for a header. */
function block(title, blank, lastPromptAt) {
  return { asOfSeq: 1, values: { title, sessionListMetadata: { blank, lastPromptAt } } }
}

/**
 * Fake host with the in-memory seams, a fake listable persistence (for the one
 * O(n) size scan) and a live session, so blanks/titles/sizes can all be
 * exercised without touching a real store.
 */
function makeHost(options = {}) {
  const specs = options.sessions ?? []
  const workspaceSpecs = options.workspaces ?? []
  const headers = new Map()
  const cacheBlocks = new Map()
  const liveProjections = new Map()
  const snapshots = []
  const live = []
  const counters = { list: 0, archive: 0, locate: 0 }
  const workspaces = workspaceSpecs.map((spec) => ({
    id: spec.id,
    title: spec.title ?? spec.id.toUpperCase(),
    path: spec.path,
    sessionIds: [...(spec.sessionIds ?? [])],
    status: async () => 'ok',
  }))
  for (const spec of specs) {
    headers.set(spec.id, {
      id: spec.id,
      createdAt: spec.createdAt,
      cwd: spec.cwd,
      isSeeded: spec.parent !== undefined,
      delegationDepth: spec.depth ?? 0,
      ...(spec.origin === undefined ? {} : { origin: spec.origin }),
      ...(spec.parent === undefined ? {} : { parentSession: spec.parent }),
    })
    const values = { title: spec.title ?? '', sessionListMetadata: { blank: spec.blank === true, lastPromptAt: spec.updatedAt ?? spec.createdAt } }
    snapshots.push({
      // Faithful to the host: `persistence.list()` returns the full stored
      // header, lineage fields included.
      header: headers.get(spec.id),
      sizeBytes: spec.sizeBytes ?? 0,
      formatStatus: 'current',
    })
    if (spec.live === true) {
      live.push({ id: spec.id, header: headers.get(spec.id), seq: 3 })
      liveProjections.set(spec.id, block(spec.title ?? '', spec.blank === true, spec.updatedAt ?? spec.createdAt))
    } else {
      cacheBlocks.set(spec.id, block(spec.title ?? '', spec.blank === true, spec.updatedAt ?? spec.createdAt))
    }
  }
  const archivedIds = [...(options.archived ?? [])]
  const registry = {
    headers,
    list: () => workspaces,
    get: (id) => workspaces.find((workspace) => workspace.id === id),
    get archivedSessionIds() {
      return archivedIds
    },
    pinnedSessionIds: options.pinned ?? [],
    host: { rememberSessionPath() {} },
    async archiveSession(id) {
      counters.archive += 1
      if (!archivedIds.includes(id)) archivedIds.push(id)
    },
    async unarchiveSession(id) {
      const index = archivedIds.indexOf(id)
      if (index >= 0) archivedIds.splice(index, 1)
    },
  }
  const query = {
    listSessions: async () => [],
    readTitleSnapshots: async (ids) => ids.map((id) => ({ sessionId: id, status: 'rejected' })),
  }
  const services = {
    workspaceRegistry: registry,
    sessionQuery: query,
    sessionController: { list: async () => ({ items: [] }) },
    sessionProjectionCache: {
      cachedSnapshot: (meta) => cacheBlocks.get(meta.id),
      cachedPredecessorTitle: () => undefined,
    },
    sessionProjections: { cachedSnapshot: (session) => liveProjections.get(session.id) },
    agents: { get: () => undefined },
  }
  const ctx = {
    sessions: {
      get: (id) => live.find((session) => session.id === id),
      list: () => [...live],
    },
    llm: {},
    sessionTitle: {
      rename(session, title) {
        return { title, eventSeq: 4 }
      },
    },
    sessionPersistence: {
      locate: () => {
        counters.locate += 1
        return { kind: 'jsonl', path: '/nonexistent/session.v4.jsonl.zstd' }
      },
      async stat() {
        return undefined
      },
      async list() {
        counters.list += 1
        if (options.failList === true) throw new Error('persistence exploded')
        return snapshots
      },
    },
    sessionQuery: query,
    workspaceRegistry: registry,
    get(name) {
      return services[name]
    },
  }
  return { ctx, counters, registry, workspaces }
}

const sessions = [
  { id: 's1', cwd: '/a', createdAt: 10, updatedAt: 100, title: 'Alpha', sizeBytes: 100 },
  { id: 's2', cwd: '/a', createdAt: 20, updatedAt: 90, title: 'Beta', sizeBytes: 200, archived: true },
  { id: 'b1', cwd: '/a', createdAt: 30, updatedAt: 80, title: 'Branch of alpha', parent: 's1', sizeBytes: 300 },
  { id: 's3', cwd: '/b', createdAt: 40, updatedAt: 70, title: 'Gamma', blank: true, sizeBytes: 400 },
  { id: 's4', cwd: '/nowhere', createdAt: 50, updatedAt: 60, title: 'Ungrouped', sizeBytes: 50 },
  { id: 's5', cwd: '/b', createdAt: 60, updatedAt: 50, title: 'Old empty', blank: true, archived: true, sizeBytes: 10 },
  { id: 's6', cwd: '/a', createdAt: 70, updatedAt: 40, title: 'Live one', sizeBytes: 25, live: true },
  { id: 'sub1', cwd: '/a', createdAt: 80, updatedAt: 30, title: 'Delegated', parent: 's1', origin: 'subagent', depth: 1, sizeBytes: 5 },
]

const workspaces = [
  { id: 'a', path: '/a', sessionIds: ['s1', 's2', 'b1', 's6', 'sub1'] },
  { id: 'b', path: '/b', sessionIds: ['s3', 's5'] },
]

function makeService(overrides = {}) {
  const host = makeHost({ sessions, workspaces, archived: ['s2', 's5'], ...overrides })
  return { service: createService(host.ctx, normalizeConfig({ ...overrides.config })), host }
}

test('search returns one bounded page per hit workspace', async () => {
  const { service, host } = makeService()
  const result = await service.search({ query: 'alpha' })
  assert.equal(result.source, 'catalog')
  assert.equal(result.query, 'alpha')
  assert.equal(result.total, 2)
  assert.equal(result.groups.length, 1)
  const group = result.groups[0]
  assert.equal(group.workspaceId, 'a')
  assert.equal(group.workspace.title, 'A')
  assert.equal(group.total, 2)
  assert.equal(group.hasMore, false)
  // Titles AND parent titles are searched, and the branch stays under its parent.
  assert.deepEqual(group.rows.map((row) => row.id), ['s1', 'b1'])
  assert.equal(group.rows[1].parentPresent, true)
  assert.equal(host.counters.list, 0, 'search must not scan persistence')
  assert.equal(host.counters.locate, 0, 'search must not stat a row per hit')
})

test('search groups by workspace, including the ungrouped bucket', async () => {
  const { service } = makeService()
  const grouped = await service.search({ query: '/a' })
  assert.deepEqual(grouped.groups.map((group) => group.workspaceId), ['a'])
  assert.equal(grouped.groups[0].total, 4)

  const ungrouped = await service.search({ query: '/nowhere' })
  assert.equal(ungrouped.groups.length, 1)
  assert.equal(ungrouped.groups[0].workspaceId, null)
  assert.equal(ungrouped.groups[0].workspace, null)
  assert.deepEqual(ungrouped.groups[0].rows.map((row) => row.id), ['s4'])
})

test('search honors tab, blank and limitPerGroup', async () => {
  const { service } = makeService()
  const page = await service.search({ query: '/a', limitPerGroup: '2' })
  assert.equal(page.groups[0].total, 4)
  assert.equal(page.groups[0].rows.length, 2)
  assert.equal(page.groups[0].hasMore, true)

  const archived = await service.search({ query: '/a', tab: 'archived' })
  assert.deepEqual(archived.groups[0].rows.map((row) => row.id), ['s2'])
  assert.equal(archived.groups[0].total, 1)

  // Query ids as well as titles/cwd/parent titles.
  const byId = await service.search({ query: 'sub1', subagents: '1' })
  assert.deepEqual(byId.groups[0].rows.map((row) => row.id), ['sub1'])

  // Both hidden blank rows live in workspace b; neither matches `/b` unless
  // the blank switch is on.
  const withoutBlank = await service.search({ query: '/b' })
  assert.equal(withoutBlank.total, 0)
  assert.equal(withoutBlank.groups.length, 0)
  const withBlank = await service.search({ query: '/b', blank: '1' })
  assert.equal(withBlank.groups[0].total, 2)

  await assert.rejects(service.search({ query: '   ' }), /query must be a non-empty string/u)
  await assert.rejects(service.search({ query: 'x'.repeat(501) }), /at most 500/u)
})

test('blanks returns the three id lists the cleanup buttons need', async () => {
  const { service } = makeService()
  const blanks = await service.blanks({})
  assert.deepEqual(blanks.unarchivedIds, ['s3'])
  assert.deepEqual(blanks.archivedIds, ['s5'])
  assert.deepEqual(blanks.deletableIds, ['s5'])
  assert.equal(blanks.source, 'catalog')
})

test('sizes aggregates by workspace and scope, and a warm scan is reused', async () => {
  const { service, host } = makeService()
  const all = await service.sizes({})
  assert.equal(all.source, 'scan')
  assert.equal(all.workspaceId, 'all')
  assert.equal(all.cached, false)
  assert.equal(all.scannedAt > 0, true)
  assert.equal(all.expiresAt, all.scannedAt + normalizeConfig({}).sizesTtlMs)
  // sub1 is a hidden delegation row: it is not a 0.1.4 listing row, so neither
  // its bytes nor its count may appear here by default.
  assert.deepEqual(all.total, { bytes: 1085, count: 7 })
  const byId = new Map(all.workspaces.map((workspace) => [workspace.id, workspace]))
  assert.deepEqual(byId.get('a'), { id: 'a', title: 'A', path: '/a', bytes: 625, count: 4 })
  assert.deepEqual(byId.get('b'), { id: 'b', title: 'B', path: '/b', bytes: 410, count: 2 })
  assert.deepEqual(all.ungrouped, { bytes: 50, count: 1 })

  const again = await service.sizes({})
  assert.equal(again.cached, true)
  assert.equal(host.counters.list, 1, 'a warm size snapshot must not rescan')

  const scoped = await service.sizes({ workspaceId: 'a' })
  assert.deepEqual(scoped.total, { bytes: 625, count: 4 })
  assert.deepEqual(scoped.workspaces.map((workspace) => workspace.id), ['a'])
  assert.equal(scoped.workspaceId, 'a')

  const ungrouped = await service.sizes({ workspaceId: 'ungrouped' })
  assert.deepEqual(ungrouped.total, { bytes: 50, count: 1 })
  assert.deepEqual(ungrouped.workspaces, [])

  await assert.rejects(service.sizes({ workspaceId: 'ghost' }), (error) => error.code === 'workspace-not-found')
})

test('sizes count only catalog-visible rows and follow the subagents switch', async () => {
  const { service, host } = makeService()
  const hidden = await service.sizes({})
  const shown = await service.sizes({ subagents: '1' })
  assert.equal(host.counters.list, 1, 'both scopes reuse the same O(n) scan')

  // Hidden by default: the delegation row is not a 0.1.x listing row and is
  // not part of totals.bytes either.
  assert.deepEqual(hidden.total, { bytes: 1085, count: 7 })
  assert.deepEqual(hidden.workspaces.find((workspace) => workspace.id === 'a'), {
    id: 'a',
    title: 'A',
    path: '/a',
    bytes: 625,
    count: 4,
  })

  // Asking for subagents adds exactly that one log, no other bytes change.
  assert.deepEqual(shown.total, { bytes: 1090, count: 8 })
  assert.deepEqual(shown.workspaces.find((workspace) => workspace.id === 'a'), {
    id: 'a',
    title: 'A',
    path: '/a',
    bytes: 630,
    count: 5,
  })

  // Same fake ctx, same switch: the totals match what buildState reports.
  const state = await buildState(host.ctx, normalizeConfig({}))
  const stateWithSubagents = await buildState(host.ctx, normalizeConfig({}), { includeSubagents: true })
  assert.equal(hidden.total.bytes, state.totals.bytes)
  assert.equal(hidden.total.count, state.totals.all)
  assert.equal(shown.total.bytes, stateWithSubagents.totals.bytes)
  assert.equal(shown.total.count, stateWithSubagents.totals.all)

  // And the count agrees with the overview the Client paints first.
  const overview = await service.overview({})
  assert.equal(hidden.total.count, overview.totals.all)
  const overviewWithSubagents = await service.overview({ includeSubagents: true })
  assert.equal(shown.total.count, overviewWithSubagents.totals.all)
})

test('the size TTL expires and mutations invalidate the snapshot', async () => {
  const { service, host } = makeService()
  await service.sizes({})
  const expiresAt = Date.now()
  const realNow = Date.now
  const ttl = DEFAULT_CONFIG.sizesTtlMs
  try {
    Date.now = () => expiresAt + ttl + 1
    const rescanned = await service.sizes({})
    assert.equal(rescanned.cached, false)
    assert.equal(host.counters.list, 2)
  } finally {
    Date.now = realNow
  }

  // An archive is a registry write the size snapshot cannot know about.
  const result = await service.archive(['s1'])
  assert.equal(result.totals.succeeded, 1)
  assert.equal(host.counters.archive, 1)
  const afterArchive = await service.sizes({})
  assert.equal(afterArchive.cached, false)
  assert.equal(host.counters.list, 3)
})

test('a locally written title outranks the projection cache', async () => {
  const { service } = makeService()
  const applied = await service.applyTitle('s6', '  Live renamed  ')
  assert.equal(applied.mode, 'live')
  const page = await service.sessions({ workspaceId: 'a', limit: '50' })
  const s6 = page.rows.find((row) => row.id === 's6')
  assert.equal(s6.title, 'Live renamed')
})

test('a failing or oversized store reports sizes-pending instead of mis-sorting', async () => {
  const { service } = makeService({ failList: true })
  await assert.rejects(service.sizes({}), (error) => error.code === 'sizes-pending' && error.status === 503)
  await assert.rejects(
    service.sessions({ workspaceId: 'a', sort: 'size' }),
    (error) => error.code === 'sizes-pending',
  )

  const many = []
  for (let index = 0; index < 101; index += 1) {
    many.push({ id: `m${index}`, cwd: '/m', createdAt: index, updatedAt: index, title: `M${index}`, sizeBytes: 1 })
  }
  const { service: capped } = makeService({
    sessions: many,
    workspaces: [{ id: 'm', path: '/m', sessionIds: many.map((spec) => spec.id) }],
    archived: [],
    config: { sizeScanMax: 100 },
  })
  await assert.rejects(capped.sizes({}), (error) => {
    assert.equal(error.code, 'sizes-pending')
    assert.deepEqual(error.details, { count: 101, max: 100 })
    return true
  })
})
