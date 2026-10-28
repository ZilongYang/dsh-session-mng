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
  const wsB = workspace('b', '/b', ['s2', 's3', 's4', 's5'])
  const registry = {
    list: () => [wsA, wsB],
    get: (id) => (id === 'a' ? wsA : id === 'b' ? wsB : undefined),
    headers: new Map(),
    host: { rememberSessionPath() {} },
    archivedSessionIds: ['s2', 'ghost'],
    pinnedSessionIds: ['s1'],
  }
  const snapshots = [
    snapshot('s1', '/a', 100),
    snapshot('s2', '/b', 200),
    snapshot('s3', '/b', 50, { parentSession: 's1', origin: 'subagent' }),
    // A user branch: seeded from s2, no delegation, no origin.
    snapshot('s4', '/b', 70, { parentSession: 's2', isSeeded: true, delegationDepth: 0 }),
    // A historical branch whose source session is gone (deleted parent).
    snapshot('s5', '/b', 30, { parentSession: 'ghost-parent', isSeeded: true, delegationDepth: 0 }),
  ]
  const items = [
    summary('s1', { projections: { values: { title: 'Alpha' } } }),
    summary('s2', { cwd: '/b' }),
    summary('s3', { cwd: '/b', origin: 'subagent', parentSessionId: 's1' }),
    summary('s4', { cwd: '/b', parentSessionId: 's2', projections: { values: { title: 'Beta branch' } } }),
    summary('s5', { cwd: '/b', parentSessionId: 'ghost-parent', projections: { values: { title: 'Orphan branch' } } }),
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
  assert.equal(state.totals.all, 4)
  assert.equal(state.totals.active, 3)
  assert.equal(state.totals.archived, 1)
  assert.equal(state.totals.bytes, 400)
  assert.equal(state.totals.forks, 2)
  assert.equal(state.totals.hiddenSubagents, 1)
  assert.deepEqual(state.orphans, ['ghost'])

  const s1 = state.sessions.find((row) => row.id === 's1')
  const s2 = state.sessions.find((row) => row.id === 's2')
  const s4 = state.sessions.find((row) => row.id === 's4')
  const s5 = state.sessions.find((row) => row.id === 's5')
  assert.equal(s1.title, 'Alpha')
  assert.equal(s1.kind, 'root')
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

  // A branch is a first-class user session: visible by default, annotated with
  // its parent, but not movable on its own.
  assert.equal(s4.kind, 'fork')
  assert.equal(s4.isFork, true)
  assert.equal(s4.isSubagent, false)
  assert.equal(s4.workspaceId, 'b')
  assert.equal(s4.parentSessionId, 's2')
  assert.equal(s4.parentTitle, 'Beta')
  assert.equal(s4.parentPresent, true)
  assert.equal(s4.forkCount, 0)
  assert.equal(s4.can.move, false)
  assert.equal(s4.can.title, true)
  assert.equal(s4.can.archive, true)
  assert.equal(s2.forkCount, 1)

  // A historical branch whose source is gone stays a listed fork; the row
  // records that the parent is missing instead of pretending it has no title.
  assert.equal(s5.kind, 'fork')
  assert.equal(s5.parentSessionId, 'ghost-parent')
  assert.equal(s5.parentTitle, '')
  assert.equal(s5.parentPresent, false)

  const groupA = state.workspaces.find((w) => w.id === 'a')
  const groupB = state.workspaces.find((w) => w.id === 'b')
  assert.equal(groupA.count, 1)
  assert.equal(groupB.count, 3)
  assert.equal(groupB.archivedCount, 1)
  assert.equal(groupB.totalBytes, 300)
})

test('buildState can include subagent sessions', async () => {
  const state = await buildState(makeCtx(), { maxBatch: 50, maxMoveBatch: 20 }, { includeSubagents: true })
  assert.equal(state.totals.all, 5)
  assert.equal(state.totals.subagents, 1)
  assert.equal(state.totals.hiddenSubagents, 0)
  assert.equal(state.totals.forks, 2)
  const s3 = state.sessions.find((row) => row.id === 's3')
  assert.equal(s3.isSubagent, true)
  assert.equal(s3.kind, 'subagent')
  assert.equal(s3.can.move, false)
  assert.equal(state.sessions.find((row) => row.id === 's4').isFork, true)
})
