/**
 * Unit tests for the pure client helpers exported as `__test`.
 *
 * `client.js` is a hand-written browser bundle whose top-level statement is a
 * `window.__ModuleLoader__.load({ factory })` side effect, so the file is
 * evaluated in a `node:vm` context with minimal `window` / `document` /
 * `require('react')` stubs. The captured factory is invoked (which only
 * defines functions and constants), but `apply()` is never called: no DOM, no
 * fetch and no Harness runtime is involved.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const SOURCE = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

/** Minimal React: enough for the module factory, never for rendering. */
const React = {
  createElement: () => null,
  Fragment: Symbol.for('react.fragment'),
  useCallback: (callback) => callback,
  useEffect: () => {},
  useMemo: (factory) => factory(),
  useRef: (initial) => ({ current: initial }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
}

function loadClient() {
  let factory = null
  const window = {
    __ModuleLoader__: {
      load(options) {
        factory = options.factory
      },
    },
    addEventListener() {},
    removeEventListener() {},
  }
  const document = {
    querySelector: () => null,
    addEventListener() {},
    removeEventListener() {},
    createElement: () => ({ setAttribute() {}, remove() {} }),
    head: { appendChild() {} },
  }
  const context = {
    window,
    document,
    fetch: () => {
      throw new Error('fetch must not be used by the pure client helpers')
    },
    requestAnimationFrame: (callback) => callback(),
  }
  vm.runInNewContext(SOURCE, context, { filename: 'client.js' })
  assert.equal(typeof factory, 'function', 'client.js registers a module factory')
  const exported = factory((name) => {
    if (name === 'react') return React
    throw new Error(`unexpected require: ${name}`)
  })
  assert.equal(typeof exported?.apply, 'function', 'module exports apply()')
  assert.ok(exported.__test, 'module exports the __test helpers')
  return exported.__test
}

const { computeView, orderBranchRows, pruneSelection, scopeKey } = loadClient()

const WORKSPACES = [
  { id: 'w1', title: 'W1', path: '/w1', status: 'ok' },
  { id: 'w2', title: 'W2', path: '/w2', status: 'ok' },
]

function row(id, extra = {}) {
  return {
    id,
    title: `title ${id}`,
    cwd: `cwd/${id}`,
    workspaceId: 'w1',
    parentSessionId: null,
    parentTitle: '',
    parentPresent: true,
    forkCount: 0,
    kind: 'normal',
    archived: false,
    blank: false,
    live: false,
    running: false,
    createdAt: 100,
    updatedAt: 100,
    sizeBytes: 10,
    ...extra,
  }
}

function stateOf(sessions, workspaces = WORKSPACES) {
  return { generatedAt: 1, sessions, workspaces, totals: { all: sessions.length } }
}

function viewOf(overrides = {}) {
  return computeView({
    state: stateOf([]),
    tab: 'all',
    workspaceFilter: 'all',
    query: '',
    sort: 'updated',
    expanded: null,
    defaultExpanded: true,
    limits: {},
    showBlank: true,
    ...overrides,
  })
}

/** Host-realm projections so nothing cross-realm reaches assert.deepEqual. */
function idsOf(rows) {
  return [...rows].map((item) => item.id)
}

function filteredIds(view) {
  return idsOf(view.filteredRows).sort()
}

function groupIds(view) {
  return [...view.groups].map((group) => `${group.id}:${idsOf(group.rows).join(',')}`)
}

// ---------------------------------------------------------------------------
// filtering
// ---------------------------------------------------------------------------

const FILTER_ROWS = [
  row('a-active', { title: 'Alpha session', cwd: 'proj/alpha', updatedAt: 500 }),
  row('b-archived', { archived: true, title: 'Archived beta', cwd: 'proj/beta' }),
  row('c-blank', { blank: true, title: 'Blank gamma' }),
  row('d-w2', { workspaceId: 'w2', title: 'Delta other workspace' }),
  row('e-ungrouped', { workspaceId: null, title: 'Epsilon ungrouped' }),
  row('f-fork', { kind: 'fork', parentSessionId: 'a-active', parentTitle: 'Alpha parent', title: 'fork child' }),
]

function filterView(overrides) {
  return viewOf({ state: stateOf(FILTER_ROWS), ...overrides })
}

test('computeView filters by tab', () => {
  assert.deepEqual(filteredIds(filterView({ tab: 'all' })), [
    'a-active', 'b-archived', 'c-blank', 'd-w2', 'e-ungrouped', 'f-fork',
  ])
  assert.deepEqual(filteredIds(filterView({ tab: 'active' })), [
    'a-active', 'c-blank', 'd-w2', 'e-ungrouped', 'f-fork',
  ])
  assert.deepEqual(filteredIds(filterView({ tab: 'archived' })), ['b-archived'])
})

test('computeView filters by workspace', () => {
  assert.deepEqual(filteredIds(filterView({ workspaceFilter: 'all' })), [
    'a-active', 'b-archived', 'c-blank', 'd-w2', 'e-ungrouped', 'f-fork',
  ])
  assert.deepEqual(filteredIds(filterView({ workspaceFilter: 'w1' })), [
    'a-active', 'b-archived', 'c-blank', 'f-fork',
  ])
  assert.deepEqual(filteredIds(filterView({ workspaceFilter: 'w2' })), ['d-w2'])
  assert.deepEqual(filteredIds(filterView({ workspaceFilter: 'ungrouped' })), ['e-ungrouped'])
})

test('computeView hides blank rows unless showBlank is true', () => {
  assert.deepEqual(filteredIds(filterView({ showBlank: false })), [
    'a-active', 'b-archived', 'd-w2', 'e-ungrouped', 'f-fork',
  ])
  assert.deepEqual(filteredIds(filterView({ showBlank: undefined })), [
    'a-active', 'b-archived', 'd-w2', 'e-ungrouped', 'f-fork',
  ])
  assert.deepEqual(filteredIds(filterView({ showBlank: true })), [
    'a-active', 'b-archived', 'c-blank', 'd-w2', 'e-ungrouped', 'f-fork',
  ])
})

test('computeView query searches title, cwd, id and parentTitle', () => {
  assert.deepEqual(filteredIds(filterView({ query: 'alpha' })), ['a-active', 'f-fork'])
  assert.deepEqual(filteredIds(filterView({ query: 'ALPHA' })), ['a-active', 'f-fork'])
  assert.deepEqual(filteredIds(filterView({ query: 'other workspace' })), ['d-w2'])
  assert.deepEqual(filteredIds(filterView({ query: 'proj/beta' })), ['b-archived'])
  assert.deepEqual(filteredIds(filterView({ query: 'e-ungr' })), ['e-ungrouped'])
  assert.deepEqual(filteredIds(filterView({ query: '   ' })), [
    'a-active', 'b-archived', 'c-blank', 'd-w2', 'e-ungrouped', 'f-fork',
  ])
  assert.deepEqual(filteredIds(filterView({ query: 'no-such-session' })), [])
})

// ---------------------------------------------------------------------------
// sorting (every key falls back to id ascending)
// ---------------------------------------------------------------------------

const SORT_ROWS = [
  row('a', { updatedAt: 200, createdAt: 20, sizeBytes: 50, title: 'same' }),
  row('b', { updatedAt: 200, createdAt: 20, sizeBytes: 50, title: 'same' }),
  row('c', { updatedAt: 300, createdAt: 10, sizeBytes: 10, title: 'zulu' }),
  row('d', { updatedAt: 100, createdAt: 30, sizeBytes: 90, title: 'apple' }),
  row('e', { title: '', cwd: 'zzz', updatedAt: 50, createdAt: 5, sizeBytes: 1 }),
  row('f', { title: '', cwd: 'aaa', updatedAt: 50, createdAt: 5, sizeBytes: 1 }),
]

function sortIds(sort) {
  return idsOf(viewOf({ state: stateOf(SORT_ROWS), sort }).groups[0].rows)
}

test('computeView sorts by updated desc with an id tie-break', () => {
  assert.deepEqual(sortIds('updated'), ['c', 'a', 'b', 'd', 'e', 'f'])
  assert.deepEqual(sortIds(undefined), ['c', 'a', 'b', 'd', 'e', 'f'])
  assert.deepEqual(sortIds('bogus'), ['c', 'a', 'b', 'd', 'e', 'f'])
})

test('computeView sorts by createdAt desc with an id tie-break', () => {
  assert.deepEqual(sortIds('created'), ['d', 'a', 'b', 'c', 'e', 'f'])
})

test('computeView sorts by sizeBytes desc with an id tie-break', () => {
  assert.deepEqual(sortIds('size'), ['d', 'a', 'b', 'c', 'e', 'f'])
})

test('computeView sorts by title asc, falls back to cwd, then id', () => {
  assert.deepEqual(sortIds('title'), ['f', 'd', 'a', 'b', 'c', 'e'])
})

test('sorting keeps every row exactly once', () => {
  for (const sort of ['updated', 'created', 'size', 'title']) {
    const sorted = filteredIds(viewOf({ state: stateOf(SORT_ROWS), sort }))
    assert.deepEqual(sorted, ['a', 'b', 'c', 'd', 'e', 'f'], `sort=${sort}`)
  }
})

// ---------------------------------------------------------------------------
// expansion, page limit and visible set
// ---------------------------------------------------------------------------

const MANY_ROWS = Array.from({ length: 60 }, (_, index) =>
  row(`r${String(index).padStart(2, '0')}`, { updatedAt: 1000 - index }),
)

function manyView(overrides) {
  return viewOf({ state: stateOf(MANY_ROWS), ...overrides })
}

test('expanded === null follows defaultExpanded and slices at GROUP_PAGE_SIZE', () => {
  const view = manyView({ expanded: null, defaultExpanded: true })
  const group = view.groups[0]
  assert.equal(group.expanded, true)
  assert.equal(group.limit, 50)
  assert.equal(group.rows.length, 60)
  assert.deepEqual(idsOf(group.renderedRows).slice(0, 3), ['r00', 'r01', 'r02'])
  assert.equal(group.renderedRows.length, 50)
  // visibleRows is the expanded group's *loaded* rows, not the rendered slice.
  assert.equal(view.visibleRows.length, 60)
  assert.equal(view.visibleIdSet.size, 60)
})

test('limits overrides the rendered slice without shrinking the visible set', () => {
  const view = manyView({ expanded: null, defaultExpanded: true, limits: { w1: 2 } })
  const group = view.groups[0]
  assert.equal(group.limit, 2)
  assert.deepEqual(idsOf(group.renderedRows), ['r00', 'r01'])
  assert.equal(view.visibleRows.length, 60)
  assert.equal(view.visibleIdSet.size, 60)
})

test('defaultExpanded false leaves every group collapsed', () => {
  const view = manyView({ expanded: null, defaultExpanded: false })
  const group = view.groups[0]
  assert.equal(group.expanded, false)
  assert.deepEqual(idsOf(group.renderedRows), [])
  assert.deepEqual(idsOf(view.visibleRows), [])
  assert.equal(view.visibleIdSet.size, 0)
})

test('an explicit expanded Set wins over defaultExpanded', () => {
  const opened = manyView({ expanded: new Set(['w1']), defaultExpanded: false })
  assert.equal(opened.groups[0].expanded, true)
  assert.equal(opened.groups[0].renderedRows.length, 50)

  const closed = manyView({ expanded: new Set(), defaultExpanded: true })
  assert.equal(closed.groups[0].expanded, false)
  assert.deepEqual(idsOf(closed.groups[0].renderedRows), [])
})

test('a non-empty query force-expands matching groups and still slices', () => {
  const view = manyView({ expanded: new Set(), defaultExpanded: false, query: 'r0' })
  const group = view.groups[0]
  assert.equal(group.expanded, true)
  assert.equal(view.filteredRows.length, 10)
  assert.equal(group.renderedRows.length, 10)
  assert.equal(view.visibleIdSet.size, 10)
})

// ---------------------------------------------------------------------------
// grouping
// ---------------------------------------------------------------------------

test('computeView groups in workspace order, ungrouped last, with branch nesting', () => {
  const rows = [
    row('w2-a', { workspaceId: 'w2', updatedAt: 300 }),
    row('w1-a', { workspaceId: 'w1', updatedAt: 200 }),
    row('u-a', { workspaceId: null, updatedAt: 100 }),
    row('w1-child', { workspaceId: 'w1', kind: 'fork', parentSessionId: 'w1-a', updatedAt: 400 }),
  ]
  const view = viewOf({ state: stateOf(rows) })
  assert.deepEqual(groupIds(view), ['w1:w1-a,w1-child', 'w2:w2-a', 'ungrouped:u-a'])
  const w1 = view.groups[0]
  // Branch is re-parented under its parent even though it sorts first.
  assert.equal(w1.rows[1].branchDepth, 1)
  assert.equal(w1.rows[0].branchDepth, undefined)
  assert.equal(w1.bytes, 20)
  assert.equal(view.groups[2].title, '')
  assert.equal(view.groups[2].path, '')
})

test('computeView drops empty workspace groups and keeps the given workspace order', () => {
  const rows = [row('only-w2', { workspaceId: 'w2' })]
  const view = viewOf({ state: stateOf(rows, [...WORKSPACES].reverse()) })
  assert.deepEqual([...view.groups].map((group) => group.id), ['w2'])

  const noGroups = viewOf({ state: stateOf([]) })
  assert.equal(noGroups.groups.length, 0)
  assert.equal(noGroups.visibleIdSet.size, 0)
})

// ---------------------------------------------------------------------------
// orderBranchRows
// ---------------------------------------------------------------------------

test('orderBranchRows pulls a branch directly under its parent', () => {
  const parent = row('p', { updatedAt: 200 })
  const child = row('c', { kind: 'fork', parentSessionId: 'p', parentTitle: 'P' })
  const other = row('o')
  const ordered = orderBranchRows([child, other, parent])
  assert.deepEqual(idsOf(ordered), ['o', 'p', 'c'])
  assert.equal(ordered[1].branchDepth, undefined)
  assert.equal(ordered[2].branchDepth, 1)
  assert.equal(ordered[2].id, 'c')
})

test('orderBranchRows keeps a branch whose parent is absent at the top level', () => {
  const child = row('c', { kind: 'fork', parentSessionId: 'gone', parentTitle: 'Gone' })
  const ordered = orderBranchRows([child])
  assert.equal(ordered.length, 1)
  assert.equal(ordered[0], child)
  assert.equal(ordered[0].branchDepth, undefined)
})

test('orderBranchRows keeps a parent cycle from dropping rows', () => {
  const first = row('a', { kind: 'fork', parentSessionId: 'b' })
  const second = row('b', { kind: 'fork', parentSessionId: 'a' })
  const rows = [first, second]
  const ordered = orderBranchRows(rows)
  assert.equal(ordered, rows)
  assert.deepEqual(idsOf(ordered), ['a', 'b'])
})

test('orderBranchRows treats a self-referencing branch as a top-level row', () => {
  const self = row('s', { kind: 'fork', parentSessionId: 's' })
  const ordered = orderBranchRows([self])
  assert.deepEqual(idsOf(ordered), ['s'])
  assert.equal(ordered[0].branchDepth, undefined)
})

test('orderBranchRows only follows parents of fork rows', () => {
  const normal = row('n', { kind: 'normal', parentSessionId: 'p' })
  const parent = row('p')
  const ordered = orderBranchRows([normal, parent])
  assert.deepEqual(idsOf(ordered), ['n', 'p'])
  assert.equal(ordered[0].branchDepth, undefined)
})

// ---------------------------------------------------------------------------
// pruneSelection
// ---------------------------------------------------------------------------

test('pruneSelection keeps only the still-visible ids', () => {
  const selected = new Set(['a', 'b', 'c'])
  const pruned = pruneSelection(selected, new Set(['a', 'c', 'not-selected']))
  assert.deepEqual([...pruned].sort(), ['a', 'c'])
  assert.notEqual(pruned, selected)
})

test('pruneSelection preserves the Set identity when nothing is dropped', () => {
  const selected = new Set(['a'])
  assert.equal(pruneSelection(selected, new Set(['a', 'b'])), selected)

  const empty = new Set()
  assert.equal(pruneSelection(empty, new Set(['a'])), empty)
})

test('computeView visibleIdSet drives selection pruning', () => {
  const state = stateOf([row('kept'), row('hidden', { workspaceId: 'w2' })])
  const collapsed = viewOf({ state, expanded: new Set(), workspaceFilter: 'w1' })
  const selected = new Set(['kept', 'hidden'])
  assert.deepEqual([...pruneSelection(selected, collapsed.visibleIdSet)], [])
})

// ---------------------------------------------------------------------------
// scopeKey
// ---------------------------------------------------------------------------

const BASE_KEY = {
  generatedAt: 7,
  tab: 'all',
  workspaceFilter: 'all',
  query: '',
  sort: 'updated',
  includeSubagents: false,
  showBlank: false,
  defaultExpanded: true,
  expanded: null,
}

test('scopeKey changes with every scope input, including sort', () => {
  const base = scopeKey(BASE_KEY)
  assert.equal(base, scopeKey({ ...BASE_KEY }))
  assert.notEqual(base, scopeKey({ ...BASE_KEY, sort: 'created' }))
  assert.notEqual(base, scopeKey({ ...BASE_KEY, sort: 'size' }))
  assert.notEqual(base, scopeKey({ ...BASE_KEY, query: 'x' }))
  assert.notEqual(base, scopeKey({ ...BASE_KEY, tab: 'active' }))
  assert.notEqual(base, scopeKey({ ...BASE_KEY, workspaceFilter: 'w1' }))
  assert.notEqual(base, scopeKey({ ...BASE_KEY, includeSubagents: true }))
  assert.notEqual(base, scopeKey({ ...BASE_KEY, showBlank: true }))
  assert.notEqual(base, scopeKey({ ...BASE_KEY, defaultExpanded: false }))
  assert.notEqual(base, scopeKey({ ...BASE_KEY, generatedAt: 8 }))
})

test('scopeKey normalises expanded and a missing generatedAt', () => {
  assert.equal(scopeKey(BASE_KEY).split('|')[8], 'auto')
  assert.equal(scopeKey({ ...BASE_KEY, generatedAt: undefined }).split('|')[0], '0')
  assert.equal(
    scopeKey({ ...BASE_KEY, expanded: new Set(['b', 'a']) }),
    scopeKey({ ...BASE_KEY, expanded: new Set(['a', 'b']) }),
  )
  assert.notEqual(
    scopeKey({ ...BASE_KEY, expanded: new Set(['a']) }),
    scopeKey({ ...BASE_KEY, expanded: new Set() }),
  )
  const parts = scopeKey(BASE_KEY).split('|')
  assert.equal(parts.length, 9)
  assert.equal(parts[4], 'updated')
  assert.equal(scopeKey({ ...BASE_KEY, sort: 'title' }).split('|')[4], 'title')
})
