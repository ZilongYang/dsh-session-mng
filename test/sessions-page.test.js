import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createService, normalizeConfig } from '../lib/service.js'

/**
 * Fake host with the two in-memory seams plus a *fake* JSONL locator whose
 * paths point into a real temp directory. Only the page-size path touches the
 * filesystem, and it does so through exactly `locate` + `readdir` + `stat`.
 */
function makeHost(options = {}) {
  const root = options.root ?? '/nonexistent-sessions-root'
  const specs = options.sessions ?? []
  const workspaceSpecs = options.workspaces ?? []
  const headers = new Map()
  const cacheBlocks = new Map()
  const snapshots = []
  const counters = { locate: 0, list: 0, controller: 0, titleSnapshots: 0, titleIds: [] }
  const logPathFor = options.logPathFor ?? ((cwd, id) => join(root, encodeSegment(cwd), encodeSegment(id), 'session.v4.jsonl.zstd'))
  const workspaces = workspaceSpecs.map((spec) => ({
    id: spec.id,
    title: spec.title ?? spec.id.toUpperCase(),
    path: spec.path,
    sessionIds: [...(spec.sessionIds ?? [])],
    status: async () => spec.status ?? 'ok',
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
    const values = {
      title: spec.title ?? '',
      sessionListMetadata: {
        blank: spec.blank === true,
        lastPromptAt: spec.updatedAt ?? spec.createdAt,
      },
    }
    cacheBlocks.set(spec.id, { asOfSeq: 1, values })
    snapshots.push({
      header: headers.get(spec.id),
      sizeBytes: spec.sizeBytes ?? 1_000,
      formatStatus: 'current',
    })
  }
  const registry = {
    headers,
    list: () => workspaces,
    get: (id) => workspaces.find((workspace) => workspace.id === id),
    archivedSessionIds: options.archived ?? [],
    pinnedSessionIds: options.pinned ?? [],
    host: { rememberSessionPath() {} },
    archiveSession: async () => {},
    unarchiveSession: async () => {},
  }
  const ctxSessionQuery = {
    listSessions: async () => [],
    async readTitleSnapshots(ids) {
      counters.titleSnapshots += 1
      counters.titleIds = [...ids]
      const titles = options.titles ?? new Map()
      return ids.map((id) => {
        const title = titles.get(id)
        return title === undefined
          ? { sessionId: id, status: 'rejected' }
          : { sessionId: id, status: 'fulfilled', value: { title: { title } } }
      })
    },
  }
  const services = {
    workspaceRegistry: registry,
    sessionQuery: ctxSessionQuery,
    sessionController: {
      list: async () => {
        counters.controller += 1
        return { items: [] }
      },
    },
    sessionProjectionCache:
      options.legacy === true
        ? undefined
        : {
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
      locate({ id, cwd }) {
        counters.locate += 1
        return { kind: 'jsonl', path: logPathFor(cwd, id) }
      },
      async stat() {
        return undefined
      },
      async list() {
        counters.list += 1
        return snapshots
      },
    },
    sessionQuery: ctxSessionQuery,
    workspaceRegistry: registry,
    get(name) {
      return services[name]
    },
  }
  return { ctx, counters, registry }
}

/** Directory-safe encoding; the tests only need locate and creation to agree. */
function encodeSegment(value) {
  return String(value).replace(/[^A-Za-z0-9._-]/gu, '_')
}

const sessions = [
  { id: 'r1', workspace: 'a', cwd: '/a', createdAt: 10, updatedAt: 500, title: 'Root one' },
  { id: 'r2', workspace: 'a', cwd: '/a', createdAt: 20, updatedAt: 400, title: 'Root two' },
  { id: 'r3', workspace: 'a', cwd: '/a', createdAt: 30, updatedAt: 300, title: 'Root three' },
  { id: 'r4', workspace: 'a', cwd: '/a', createdAt: 40, updatedAt: 200, title: 'Tie A' },
  { id: 'r5', workspace: 'a', cwd: '/a', createdAt: 50, updatedAt: 200, title: 'Tie B' },
  { id: 'b1', workspace: 'a', cwd: '/a', createdAt: 60, updatedAt: 900, parent: 'r1', title: 'Branch one' },
  { id: 'b2', workspace: 'a', cwd: '/a', createdAt: 70, updatedAt: 800, parent: 'r1', title: 'Branch two' },
  { id: 'b3', workspace: 'a', cwd: '/a', createdAt: 80, updatedAt: 700, parent: 'r2', title: 'Branch three' },
  { id: 's1', workspace: 'a', cwd: '/a', createdAt: 90, updatedAt: 100, parent: 'r3', origin: 'subagent', depth: 1, title: 'Delegated' },
  { id: 'z1', workspace: 'a', cwd: '/a', createdAt: 100, updatedAt: 600, blank: true, title: '' },
  { id: 'o1', workspace: 'b', cwd: '/b', createdAt: 110, updatedAt: 150, title: 'Other workspace' },
  { id: 'u1', workspace: null, cwd: '/nowhere', createdAt: 120, updatedAt: 140, title: 'Ungrouped one' },
]

const workspaces = [
  { id: 'a', path: '/a', sessionIds: ['r1', 'r2', 'r3', 'r4', 'r5', 'b1', 'b2', 'b3', 's1', 'z1'] },
  { id: 'b', path: '/b', sessionIds: ['o1'] },
]

function makeService(overrides = {}) {
  const host = makeHost({ sessions, workspaces, ...overrides })
  const config = normalizeConfig({ ...overrides.config })
  return { service: createService(host.ctx, config), host, config }
}

test('a workspace page filters, sorts and paginates', async () => {
  const { service } = makeService()
  const page = await service.sessions({ workspaceId: 'a', limit: '3' })
  assert.equal(page.source, 'catalog')
  assert.equal(page.workspaceId, 'a')
  assert.equal(page.workspace.id, 'a')
  assert.equal(page.offset, 0)
  assert.equal(page.limit, 3)
  assert.equal(page.hasMore, true)
  // Visible: r1..r5, b1..b3 (hidden subagent and hidden blank row excluded).
  assert.equal(page.total, 8)
  // Branch-aware order under `updated` desc: r1 is first among the roots and
  // its two branches follow immediately.
  assert.deepEqual(page.rows.map((row) => row.id), ['r1', 'b1', 'b2'])

  const archived = await service.sessions({ workspaceId: 'a', tab: 'archived', limit: '10' })
  assert.equal(archived.total, 0)

  const ungrouped = await service.sessions({ workspaceId: 'ungrouped', limit: '10' })
  assert.deepEqual(ungrouped.rows.map((row) => row.id), ['u1'])
  assert.equal(ungrouped.workspace, null)
})

test('offset pages never duplicate or drop a row', async () => {
  const { service } = makeService()
  const all = await service.sessions({ workspaceId: 'a', limit: '50' })
  assert.equal(all.rows.length, all.total)
  const ids = []
  for (let offset = 0; ; offset += 2) {
    const page = await service.sessions({ workspaceId: 'a', limit: '2', offset: String(offset) })
    ids.push(...page.rows.map((row) => row.id))
    if (!page.hasMore) break
  }
  assert.deepEqual(ids, all.rows.map((row) => row.id))
  assert.equal(new Set(ids).size, ids.length)
})

test('equal sort values fall back to ascending id', async () => {
  const { service } = makeService()
  const page = await service.sessions({ workspaceId: 'a', limit: '50' })
  const tieIds = page.rows.filter((row) => row.updatedAt === 200).map((row) => row.id)
  assert.deepEqual(tieIds, ['r4', 'r5'])
})

test('branches are ordered directly under their parent', async () => {
  const { service } = makeService()
  const page = await service.sessions({ workspaceId: 'a', limit: '50' })
  const ids = page.rows.map((row) => row.id)
  assert.equal(ids.indexOf('b1'), ids.indexOf('r1') + 1)
  assert.equal(ids.indexOf('b2'), ids.indexOf('r1') + 2)
  assert.equal(ids.indexOf('b3'), ids.indexOf('r2') + 1)
  const b1 = page.rows.find((row) => row.id === 'b1')
  assert.equal(b1.branchDepth, 1)
  assert.equal(b1.parentTitle, 'Root one')
  assert.equal(b1.parentPresent, true)
  assert.equal(b1.parentStub, undefined)
  const r1 = page.rows.find((row) => row.id === 'r1')
  assert.equal(r1.forkCount, 2)
})

test('a branch whose parent is not on the page gets a parent stub', async () => {
  const { service } = makeService()
  const page = await service.sessions({ workspaceId: 'a', query: 'branch one', limit: '10' })
  assert.equal(page.total, 1)
  assert.equal(page.rows[0].id, 'b1')
  // The parent exists globally but was filtered out, so the Client must say
  // "not loaded" instead of "the source session is gone".
  assert.deepEqual(page.rows[0].parentStub, { id: 'r1', title: 'Root one', present: true })
  assert.equal(page.rows[0].parentPresent, true)
})

test('naming a parent title finds its branches', async () => {
  const { service } = makeService()
  const page = await service.sessions({ workspaceId: 'a', query: 'root two', limit: '10' })
  assert.deepEqual(page.rows.map((row) => row.id), ['r2', 'b3'])
})

test('blank rows are removed before pagination', async () => {
  const { service } = makeService()
  const without = await service.sessions({ workspaceId: 'a', limit: '50' })
  assert.equal(without.rows.some((row) => row.id === 'z1'), false)
  const withBlank = await service.sessions({ workspaceId: 'a', limit: '50', blank: '1' })
  assert.equal(withBlank.total, without.total + 1)
  const blank = withBlank.rows.find((row) => row.id === 'z1')
  assert.equal(blank.blank, true)
  assert.equal(blank.blankKnown, true)
})

test('subagent rows join the page only when asked for', async () => {
  const { service } = makeService()
  const without = await service.sessions({ workspaceId: 'a', limit: '50' })
  assert.equal(without.rows.some((row) => row.id === 's1'), false)
  const withSub = await service.sessions({ workspaceId: 'a', limit: '50', subagents: '1' })
  const s1 = withSub.rows.find((row) => row.id === 's1')
  assert.equal(s1.isSubagent, true)
  assert.equal(s1.can.move, false)
})

test('page parameters are validated', async () => {
  const { service } = makeService()
  await assert.rejects(service.sessions({}), /workspaceId is required/u)
  await assert.rejects(service.sessions({ workspaceId: 'a', tab: 'nope' }), /tab must be one of/u)
  await assert.rejects(service.sessions({ workspaceId: 'a', sort: 'nope' }), /sort must be one of/u)
  await assert.rejects(service.sessions({ workspaceId: 'a', offset: '-1' }), /offset must be a non-negative integer/u)
  await assert.rejects(service.sessions({ workspaceId: 'a', limit: 'zero' }), /limit must be a positive integer/u)
  await assert.rejects(service.sessions({ workspaceId: 'ghost' }), (error) => error.code === 'workspace-not-found')
  // limit is clamped to the configured page ceiling, not rejected.
  const { service: small } = makeService({ config: { pageLimitMax: 3 } })
  const clamped = await small.sessions({ workspaceId: 'a', limit: '999' })
  assert.equal(clamped.limit, 3)
})

test('only the page\'s missing titles are read, and leftovers are reported', async () => {
  const titles = new Map([['z1', 'Filled later']])
  const { service, host } = makeService({ titles })
  const page = await service.sessions({ workspaceId: 'a', limit: '50', blank: '1', sort: 'created' })
  assert.equal(host.counters.titleSnapshots, 1, 'only the untitled row triggers a read')
  assert.deepEqual(host.counters.titleIds, ['z1'])
  assert.equal(page.titlesPending, 0)
  assert.equal(page.rows.find((row) => row.id === 'z1').title, 'Filled later')

  // A page whose rows all carry a title performs no host read at all.
  const titled = await service.sessions({ workspaceId: 'b', limit: '50' })
  assert.equal(host.counters.titleSnapshots, 1)
  assert.equal(titled.titlesPending, 0)

  // `z1` and `r5` are the only untitled visible rows; ask for the whole page.
  // Without a title from any source the row stays pending instead of failing.
  const { service: plain, host: plainHost } = makeService({ titles: new Map() })
  const pending = await plain.sessions({ workspaceId: 'a', limit: '50', blank: '1' })
  assert.equal(plainHost.counters.titleSnapshots, 1)
  assert.equal(pending.titlesPending, 1)
  assert.equal(pending.rows.find((row) => row.id === 'z1').title, '')
})

test('page sizes come from the current log file, and on-demand only', async () => {
  const base = await mkdtemp(join(tmpdir(), 'dsh-session-mng-page-'))
  try {
    const root = join(base, 'sessions')
    const writeLog = async (cwd, id, name, bytes) => {
      const dir = join(root, encodeSegment(cwd), encodeSegment(id))
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, name), Buffer.alloc(bytes, 0x20))
    }
    // r1 has a current-generation log; r2 only retains an older generation,
    // which the backend still serves but reports as needing migration.
    await writeLog('/a', 'r1', 'session.v4.jsonl.zstd', 128)
    await writeLog('/a', 'r2', 'session.v3.jsonl', 64)
    const { service } = makeService({ root })
    const page = await service.sessions({ workspaceId: 'a', limit: '50', sort: 'created' })
    const r1 = page.rows.find((row) => row.id === 'r1')
    const r2 = page.rows.find((row) => row.id === 'r2')
    assert.equal(r1.sizeBytes, 128)
    assert.equal(r1.formatStatus, 'current')
    assert.equal(r2.sizeBytes, 64)
    assert.equal(r2.formatStatus, 'migration-required')

    const bare = await service.sessions({ workspaceId: 'a', limit: '50', sort: 'created', sizes: '0' })
    assert.equal(bare.rows.every((row) => row.sizeBytes === 0), true)
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

test('sort=size scans once and reuses the cached snapshot inside the TTL', async () => {
  const sized = sessions.map((spec) => ({
    ...spec,
    sizeBytes: spec.id === 'r1' ? 5_000 : spec.id === 'r2' ? 3_000 : spec.id === 'r3' ? 1_000 : 100,
  }))
  const { service, host } = makeService({ sessions: sized })
  const page = await service.sessions({ workspaceId: 'a', sort: 'size', limit: '3' })
  assert.equal(host.counters.list, 1)
  // Largest first; the two branches of r1 follow it, smallest id first.
  assert.deepEqual(page.rows.map((row) => row.id), ['r1', 'b1', 'b2'])
  assert.equal(page.rows[0].sizeBytes, 5_000)
  await service.sessions({ workspaceId: 'a', sort: 'size', limit: '3' })
  assert.equal(host.counters.list, 1, 'a warm size snapshot must not rescan')
})

test('10k sessions: one 50-row page, no O(n) host calls, bounded payload', async () => {
  const sessionCount = 10_000
  const workspaceCount = 6
  const largeSessions = []
  const largeWorkspaces = Array.from({ length: workspaceCount }, (_, index) => ({
    id: `w${index}`,
    path: `/w/${index}`,
    sessionIds: [],
  }))
  for (let index = 0; index < sessionCount; index += 1) {
    const workspace = index % workspaceCount
    const id = `session-${String(index).padStart(6, '0')}`
    const createdAt = 1_700_000_000_000 + index
    largeSessions.push({
      id,
      cwd: `/w/${workspace}`,
      createdAt,
      updatedAt: createdAt + 10,
      title: `Session ${index}`,
    })
    largeWorkspaces[workspace].sessionIds.push(id)
  }
  const { service, host } = makeService({ sessions: largeSessions, workspaces: largeWorkspaces })
  host.counters.locate = 0

  // Warm the module paths first: the budget covers request assembly only.
  await service.sessions({ workspaceId: 'w0', limit: '50', offset: '0', sizes: '0' })
  const startedAt = performance.now()
  const page = await service.sessions({ workspaceId: 'w0', limit: '50', offset: '0', sizes: '0' })
  const elapsed = performance.now() - startedAt

  assert.equal(page.rows.length, 50)
  assert.equal(page.total, largeWorkspaces[0].sessionIds.length)
  assert.equal(page.hasMore, true)
  assert.equal(host.counters.list, 0, 'a page must not call sessionPersistence.list')
  assert.equal(host.counters.controller, 0, 'a page must not call sessionController.list')
  assert.equal(host.counters.titleSnapshots, 0, 'titled rows must not trigger a title read')
  const payloadBytes = Buffer.byteLength(JSON.stringify(page), 'utf8')
  assert.ok(payloadBytes <= 60 * 1024, `page payload is ${payloadBytes} bytes`)
  assert.ok(elapsed < 100, `page assembly took ${elapsed.toFixed(1)} ms`)
})

test('session detail returns one decorated row, with a parent stub', async () => {
  const { service } = makeService()
  const detail = await service.session({ id: 'b1' })
  assert.equal(detail.source, 'catalog')
  assert.equal(detail.row.id, 'b1')
  assert.equal(detail.row.parentTitle, 'Root one')
  assert.equal(detail.row.parentPresent, true)
  assert.equal(detail.row.can.move, false)
  assert.equal(detail.limits.pageLimitMax, 50)
  assert.deepEqual(detail.row.parentStub, { id: 'r1', title: 'Root one', present: true })
  await assert.rejects(service.session({ id: 'nope' }), (error) => error.code === 'not-found')
  await assert.rejects(service.session({}), (error) => error.code === 'bad-request')
  await assert.rejects(service.session({ id: '../etc/passwd' }), (error) => error.code === 'bad-request')
})

test('session detail reaches rows the list hides by default', async () => {
  const { service } = makeService()
  const detail = await service.session({ id: 's1' })
  assert.equal(detail.row.isSubagent, true)
  assert.equal(detail.row.blankKnown, true)
  assert.equal(detail.row.can.move, false)
})

test('a host without the projection cache serves the legacy catalog', async () => {
  const { service } = makeService({ legacy: true })
  const overview = await service.overview({})
  assert.equal(overview.source, 'legacy')
  // Snapshot-only legacy rows carry no blank projection, so none are blank.
  assert.equal(overview.totals.all, 11)
  assert.equal(overview.totals.hiddenSubagents, 1)
  const page = await service.sessions({ workspaceId: 'a', limit: '50' })
  assert.equal(page.source, 'legacy')
  assert.equal(page.rows.length > 0, true)
  const detail = await service.session({ id: 'r2' })
  assert.equal(detail.source, 'legacy')
  assert.equal(detail.row.id, 'r2')
})
