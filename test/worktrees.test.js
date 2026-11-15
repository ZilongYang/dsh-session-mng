import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CREATED_RECORD,
  creationOfEvent,
  creationsOfEvents,
  creationsOfProjection,
  detectWorktrees,
  worktreesSupported,
} from '../lib/worktrees.js'
import { normalizeConfig } from '../lib/service.js'

const config = normalizeConfig({})

/** One recorded creation, shaped as the worktree service writes it. */
function record(path, branch = 'b1') {
  return {
    type: CREATED_RECORD,
    ignorable: true,
    seq: 3,
    time: 10,
    data: { path, branch, baseCommit: 'c0', repositoryRoot: '/repo' },
  }
}

/** A host context with only the seams a test needs. */
function makeContext(overrides = {}) {
  return {
    get(name) {
      return this[name]
    },
    ...overrides,
  }
}

test('a recorded creation needs an ignorable plugin record with a path', () => {
  assert.deepEqual(creationOfEvent(record('/wt/a')), { path: '/wt/a', branch: 'b1' })
  assert.equal(creationOfEvent(record('/wt/a'))?.branch, 'b1')
  assert.equal(creationOfEvent({ ...record('/wt/a'), ignorable: false }), undefined)
  assert.equal(creationOfEvent({ ...record('/wt/a'), type: 'plugin:other' }), undefined)
  assert.equal(creationOfEvent({ ...record('/wt/a'), data: { branch: 'b' } }), undefined)
  assert.equal(creationOfEvent({ type: 'user/message', data: {} }), undefined)
  assert.deepEqual(creationsOfEvents([record('/wt/a'), { type: 'user/message' }, record('/wt/b', '')]), [
    { path: '/wt/a', branch: 'b1' },
    { path: '/wt/b', branch: '' },
  ])
})

test('projection views keep owned checkouts and drop inherited ones', () => {
  assert.deepEqual(
    creationsOfProjection([
      { worktree: { path: '/wt/a', branch: 'b1' }, owned: true },
      { worktree: { path: '/wt/b', branch: 'b2' }, owned: false },
    ]),
    [{ path: '/wt/a', branch: 'b1' }],
  )
  // A host that exposes bare creations still works.
  assert.deepEqual(creationsOfProjection([{ path: '/wt/c', branch: 'b3' }]), [{ path: '/wt/c', branch: 'b3' }])
  // A value that is not an array means "this host never registered the key".
  assert.equal(creationsOfProjection(undefined), undefined)
  assert.equal(creationsOfProjection({}), undefined)
})

test('a deployment without the worktree service supports nothing', async () => {
  const ctx = makeContext({})
  assert.equal(worktreesSupported(ctx), false)
  const value = await detectWorktrees(ctx, ['session-1'], config)
  assert.equal(value.supported, false)
  assert.deepEqual(value.rows, [])
  assert.deepEqual(value.totals, { sessions: 0, worktrees: 0, unknown: 0 })
})

test('the live projection answers without touching the log', async () => {
  const ctx = makeContext({
    worktrees: {},
    sessions: { get: (id) => ({ id }) },
    sessionProjections: {
      snapshot: async (_session, keys) => {
        assert.deepEqual(keys, ['worktree'])
        // The host answers `{ asOfSeq, values }`, not a bare key map.
        return { asOfSeq: 7, values: { worktree: [{ worktree: { path: '/wt/live', branch: 'b' }, owned: true }] } }
      },
    },
    // A log read here would fail the test.
    sessionQuery: { readSession: () => assert.fail('live path must not read the log') },
  })
  const value = await detectWorktrees(ctx, ['session-1'], config)
  assert.equal(value.supported, true)
  assert.deepEqual(value.rows, [
    { sessionId: 'session-1', count: 1, worktrees: [{ path: '/wt/live', branch: 'b' }], unknown: false },
  ])
  assert.deepEqual(value.totals, { sessions: 1, worktrees: 1, unknown: 0 })
})

test('the persisted projection answers for a cold session', async () => {
  const header = { id: 'session-2', cwd: '/tmp' }
  const ctx = makeContext({
    worktrees: {},
    workspaceRegistry: { headers: new Map([['session-2', header]]) },
    sessionProjectionCache: {
      cachedSnapshot: async (given) => {
        assert.equal(given, header)
        return { asOfSeq: 4, values: { worktree: [{ worktree: { path: '/wt/cold', branch: 'b2' }, owned: true }] } }
      },
    },
    sessionQuery: { readSession: () => assert.fail('cold projection must win over a log scan') },
  })
  const value = await detectWorktrees(ctx, ['session-2'], config)
  assert.deepEqual(value.rows[0].worktrees, [{ path: '/wt/cold', branch: 'b2' }])
})

test('a projection without the worktree key falls through to the log scan', async () => {
  const ctx = makeContext({
    worktrees: {},
    sessions: { get: (id) => ({ id }) },
    sessionProjections: { snapshot: () => ({ asOfSeq: 3, values: {} }) },
    sessionProjectionCache: { cachedSnapshot: () => undefined },
    sessionPersistence: { stat: async () => ({ sizeBytes: 2048 }) },
    sessionQuery: { readSession: async () => ({ events: [record('/wt/fallback')] }) },
  })
  const value = await detectWorktrees(ctx, ['session-7'], config)
  assert.deepEqual(value.rows[0].worktrees, [{ path: '/wt/fallback', branch: 'b1' }])
})

test('a bounded log scan is the last resort', async () => {
  const ctx = makeContext({
    worktrees: {},
    sessionPersistence: { stat: async () => ({ sizeBytes: 1024 }) },
    sessionQuery: { readSession: async () => ({ events: [record('/wt/scanned'), { type: 'user/message', data: {} }] }) },
  })
  const value = await detectWorktrees(ctx, ['session-3'], config)
  assert.deepEqual(value.rows[0], {
    sessionId: 'session-3',
    count: 1,
    worktrees: [{ path: '/wt/scanned', branch: 'b1' }],
    unknown: false,
  })
})

test('an oversized log is reported unknown instead of empty', async () => {
  const ctx = makeContext({
    worktrees: {},
    sessionPersistence: { stat: async () => ({ sizeBytes: config.worktreeScanMaxBytes + 1 }) },
    sessionQuery: { readSession: () => assert.fail('an oversized log must not be read') },
  })
  const value = await detectWorktrees(ctx, ['session-4'], config)
  assert.deepEqual(value.rows[0], { sessionId: 'session-4', count: 0, worktrees: [], unknown: true })
  assert.equal(value.totals.unknown, 1)
})

test('a fork whose records may be inherited is reported unknown', async () => {
  const ctx = makeContext({
    worktrees: {},
    sessionPersistence: { stat: async () => ({ sizeBytes: 1024 }) },
    workspaceRegistry: { headers: new Map([['session-5', { id: 'session-5', isSeeded: true }]]) },
    sessionQuery: { readSession: async () => ({ events: [record('/wt/inherited')] }) },
  })
  const value = await detectWorktrees(ctx, ['session-5'], config)
  assert.equal(value.rows[0].unknown, true)
  assert.equal(value.rows[0].count, 0)
})

test('a fork without records is still a definite none', async () => {
  const ctx = makeContext({
    worktrees: {},
    sessionPersistence: { stat: async () => ({ sizeBytes: 1024 }) },
    workspaceRegistry: { headers: new Map([['session-6', { id: 'session-6', isSeeded: true }]]) },
    sessionQuery: { readSession: async () => ({ events: [{ type: 'user/message', data: {} }] }) },
  })
  const value = await detectWorktrees(ctx, ['session-6'], config)
  assert.deepEqual(value.rows[0], { sessionId: 'session-6', count: 0, worktrees: [], unknown: false })
})
