import test from 'node:test'
import assert from 'node:assert/strict'

import { buildState } from '../lib/state.js'

function workspace(id, path, sessionIds) {
  return {
    id,
    title: id.toUpperCase(),
    path,
    sessionIds,
    status: async () => 'ok',
  }
}

function summary(id, extra = {}) {
  return {
    sessionId: id,
    updatedAt: 100,
    running: false,
    blank: false,
    cwd: '/a',
    ...extra,
  }
}

function snapshot(id, cwd, sizeBytes, extra = {}) {
  return {
    header: { id, cwd, createdAt: 10, isSeeded: false, ...extra },
    sizeBytes,
    formatStatus: 'current',
  }
}

function makeCtx() {
  const wsA = workspace('a', '/a', ['s1'])
  const wsB = workspace('b', '/b', ['s2', 's3'])
  const registry = {
    list: () => [wsA, wsB],
    get: (id) => (id === 'a' ? wsA : id === 'b' ? wsB : undefined),
    headers: new Map(),
    host: { rememberSessionPath() {} },
    archivedSessionIds: ['s2', 'ghost'],
    pinnedSessionIds: ['s1'],
  }
  const snapshots = [snapshot('s1', '/a', 100), snapshot('s2', '/b', 200), snapshot('s3', '/b', 50, { parentSession: 's1', origin: 'subagent' })]
  const items = [
    summary('s1', { projections: { values: { title: 'Alpha' } } }),
    summary('s2', { cwd: '/b' }),
    summary('s3', { cwd: '/b', origin: 'subagent', parentSessionId: 's1' }),
  ]
  const ctx = {
    sessions: { get: () => undefined },
    sessionPersistence: {
      list: async () => snapshots,
      locate: () => ({ path: '/tmp/log' }),
      stat: async () => undefined,
    },
    sessionQuery: {
      listSessions: async () => [],
      readTitleSnapshots: async (ids) => {
        assert.deepEqual(ids, ['s2'])
        return [{ sessionId: 's2', status: 'fulfilled', value: { title: { title: 'Beta' } } }]
      },
    },
    llm: {},
    workspaceRegistry: registry,
    get(name) {
      if (name === 'sessionController') return { list: async () => ({ items }) }
      if (name === 'workspaceRegistry') return registry
      if (name === 'agents') return { get: () => undefined }
      return undefined
    },
  }
  return ctx
}

test('buildState groups, filters and annotates sessions', async () => {
  const state = await buildState(makeCtx(), { maxBatch: 50, maxMoveBatch: 20 })
  assert.equal(state.totals.all, 2)
  assert.equal(state.totals.active, 1)
  assert.equal(state.totals.archived, 1)
  assert.equal(state.totals.bytes, 300)
  assert.deepEqual(state.orphans, ['ghost'])

  const s1 = state.sessions.find((row) => row.id === 's1')
  const s2 = state.sessions.find((row) => row.id === 's2')
  assert.equal(s1.title, 'Alpha')
  assert.equal(s1.workspaceId, 'a')
  assert.equal(s1.pinned, true)
  assert.equal(s1.archived, false)
  assert.equal(s1.can.restore, false)
  assert.equal(s1.can.move, true)
  assert.equal(s1.can.delete, false)
  assert.equal(s2.title, 'Beta')
  assert.equal(s2.workspaceId, 'b')
  assert.equal(s2.archived, true)
  assert.equal(s2.can.restore, true)
  assert.equal(s2.can.delete, true)
  assert.equal(s2.can.move, true)

  const groupA = state.workspaces.find((w) => w.id === 'a')
  const groupB = state.workspaces.find((w) => w.id === 'b')
  assert.equal(groupA.count, 1)
  assert.equal(groupB.count, 1)
  assert.equal(groupB.archivedCount, 1)
  assert.equal(groupB.totalBytes, 200)
})

test('buildState can include subagent sessions', async () => {
  const state = await buildState(makeCtx(), { maxBatch: 50, maxMoveBatch: 20 }, { includeSubagents: true })
  assert.equal(state.totals.all, 3)
  const s3 = state.sessions.find((row) => row.id === 's3')
  assert.equal(s3.isSubagent, true)
  assert.equal(s3.can.move, false)
})
