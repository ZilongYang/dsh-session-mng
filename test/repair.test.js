import test from 'node:test'
import assert from 'node:assert/strict'

import { createService, normalizeConfig } from '../lib/service.js'

/** One stored header as the workspace registry's header index keeps it. */
function header(id, extra = {}) {
  return { id, createdAt: 10, cwd: '/work/a', isSeeded: false, delegationDepth: 0, ...extra }
}

/**
 * Fake host with the in-memory seams the catalog reads plus a Workspace entity
 * that really mutates its ledger, so the repair path is exercised end to end.
 */
function makeHost(options = {}) {
  const attached = []
  const workspace = {
    id: 'w1',
    title: 'A',
    path: '/work/a',
    sessionIds: [...(options.sessionIds ?? [])],
    status: async () => options.status ?? 'ok',
    attachSession: async (id) => {
      attached.push(id)
      if (!workspace.sessionIds.includes(id)) workspace.sessionIds.unshift(id)
    },
    detachSession: async () => {},
  }
  const registry = {
    headers: new Map((options.headers ?? []).map((entry) => [entry.id, entry])),
    list: () => [workspace],
    get: (id) => (id === 'w1' ? workspace : undefined),
    archivedSessionIds: [],
    pinnedSessionIds: [],
    host: { rememberSessionPath() {} },
  }
  const cache = { cachedSnapshot: () => undefined }
  const projections = { cachedSnapshot: () => undefined }
  const persistence = { locate: () => ({ kind: 'jsonl', path: '/tmp/x' }), stat: async () => undefined }
  const services = {
    workspaceRegistry: registry,
    sessionProjectionCache: cache,
    sessionProjections: projections,
    agents: { get: () => undefined },
    sessionPersistence: persistence,
    sessionQuery: undefined,
    sessionController: options.sessionController,
  }
  const ctx = {
    sessions: { get: () => undefined, list: () => [] },
    llm: {},
    sessionPersistence: persistence,
    workspaceRegistry: registry,
    get(name) {
      return services[name]
    },
  }
  return { ctx, workspace, attached }
}

test('membership distinguishes ledger rows from cwd-only rows', async () => {
  const { ctx } = makeHost({
    sessionIds: ['s2'],
    headers: [header('s1'), header('s2'), header('s3', { cwd: '/work/other' })],
  })
  const service = createService(ctx, normalizeConfig({}))

  const report = await service.misplaced({})
  assert.equal(report.count, 1)
  assert.equal(report.truncated, false)
  assert.equal(report.rows[0].id, 's1')
  assert.equal(report.rows[0].workspaceId, 'w1')

  const overview = await service.overview({})
  assert.equal(overview.totals.misplaced, 1)

  const page = await service.sessions({ workspaceId: 'w1' })
  const byId = new Map(page.rows.map((row) => [row.id, row]))
  assert.equal(byId.get('s1').membership, 'cwd')
  assert.equal(byId.get('s1').can.repair, true)
  assert.equal(byId.get('s2').membership, 'ledger')
  assert.equal(byId.get('s2').can.repair, false)
})

test('repair attaches a cwd-only session and is idempotent', async () => {
  const { ctx, workspace, attached } = makeHost({ headers: [header('s1')] })
  const service = createService(ctx, normalizeConfig({}))

  const first = await service.repair(['s1'])
  assert.equal(first.totals.succeeded, 1)
  assert.equal(first.results[0].ok, true)
  assert.equal(first.results[0].workspaceId, 'w1')
  assert.deepEqual(attached, ['s1'])
  assert.deepEqual(workspace.sessionIds, ['s1'])

  const second = await service.repair(['s1'])
  assert.equal(second.totals.succeeded, 1)
  assert.equal(second.results[0].already, true)
  assert.deepEqual(attached, ['s1'])
})

test('repair reports the host list omission honestly', async () => {
  const { ctx } = makeHost({
    headers: [header('s1')],
    sessionController: { list: async () => ({ items: [{ sessionId: 'other' }] }) },
  })
  const service = createService(ctx, normalizeConfig({}))
  const result = await service.repair(['s1'])
  assert.equal(result.results[0].ok, true)
  assert.equal(result.results[0].listed, false)
})

test('repair refuses sessions without a matching workspace directory', async () => {
  const { ctx } = makeHost({ headers: [header('s3', { cwd: '/work/other' })] })
  const service = createService(ctx, normalizeConfig({}))
  const result = await service.repair(['s3'])
  assert.equal(result.totals.succeeded, 0)
  assert.equal(result.results[0].error.code, 'no-workspace-match')
})

test('repair refuses subagent sessions', async () => {
  const { ctx } = makeHost({ headers: [header('s4', { origin: 'subagent', delegationDepth: 1 })] })
  const service = createService(ctx, normalizeConfig({}))
  const result = await service.repair(['s4'])
  assert.equal(result.results[0].error.code, 'session-subagent')
})

test('repair refuses a workspace whose directory is gone', async () => {
  const { ctx } = makeHost({ headers: [header('s1')], status: 'missing-dir' })
  const service = createService(ctx, normalizeConfig({}))
  const result = await service.repair(['s1'])
  assert.equal(result.results[0].error.code, 'workspace-missing')
})

test('repair refuses an unknown session id', async () => {
  const { ctx } = makeHost({ headers: [] })
  const service = createService(ctx, normalizeConfig({}))
  const result = await service.repair(['missing'])
  assert.equal(result.results[0].error.code, 'not-found')
})
