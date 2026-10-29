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

/** Hook implementations; the render harness below swaps these per render. */
const hookImpl = {
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useMemo: (factory) => factory(),
  useRef: (initial) => ({ current: initial }),
  useCallback: (callback) => callback,
}

/** React stub: enough for the factory, plus element objects for the harness. */
const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  Fragment: Symbol.for('react.fragment'),
  useCallback: (callback, deps) => hookImpl.useCallback(callback, deps),
  useEffect: (effect, deps) => hookImpl.useEffect(effect, deps),
  useMemo: (factory, deps) => hookImpl.useMemo(factory, deps),
  useRef: (initial) => hookImpl.useRef(initial),
  useState: (initial) => hookImpl.useState(initial),
}

function loadClient() {
  let factory = null
  const net = { fetch: undefined }
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
    scrollingElement: null,
    addEventListener() {},
    removeEventListener() {},
    createElement: () => ({ setAttribute() {}, remove() {} }),
    head: { appendChild() {} },
  }
  const context = {
    window,
    document,
    fetch: (...args) => {
      if (net.fetch === undefined) throw new Error('fetch must not be used by the pure client helpers')
      return net.fetch(...args)
    },
    AbortController,
    setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
    clearTimeout: (handle) => clearTimeout(handle),
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
  return { test: exported.__test, setFetch: (fn) => { net.fetch = fn } }
}

const testApi = loadClient()
const __test = testApi.test
const {
  computeView,
  orderBranchRows,
  pruneSelection,
  scopeKey,
  dataScopeKey,
  queryOf,
  mergePageRows,
  mergeRowCache,
  annotateBranchRows,
  overviewFromState,
  blanksFromState,
  normalizeSizes,
  composeGroups,
  components: { SessionManagerPage, Row, Group, DetailView },
} = __test

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

// ---------------------------------------------------------------------------
// paged data layer: keys, paths, merges
// ---------------------------------------------------------------------------

test('dataScopeKey has the six invalidation inputs and ignores view-only state', () => {
  const base = { tab: 'all', workspaceFilter: 'all', query: '', sort: 'updated', includeSubagents: false, showBlank: false }
  const key = dataScopeKey(base)
  assert.equal(key, dataScopeKey({ ...base }))
  assert.equal(key.split('|').length, 6)
  assert.notEqual(key, dataScopeKey({ ...base, sort: 'size' }))
  assert.notEqual(key, dataScopeKey({ ...base, query: 'abc' }))
  assert.notEqual(key, dataScopeKey({ ...base, tab: 'archived' }))
  assert.notEqual(key, dataScopeKey({ ...base, workspaceFilter: 'w1' }))
  assert.notEqual(key, dataScopeKey({ ...base, includeSubagents: true }))
  assert.notEqual(key, dataScopeKey({ ...base, showBlank: true }))
  // GeneratedAt / expanded belong to the view key, not to page invalidation.
  assert.equal(key, dataScopeKey({ ...base, generatedAt: 99, expanded: new Set(['w1']) }))
})

test('queryOf encodes and skips empty parameters', () => {
  assert.equal(queryOf({ a: 1, b: '', c: undefined, d: 'x y', e: 0, f: null }), 'a=1&d=x%20y&e=0')
  assert.equal(queryOf({}), '')
  assert.equal(queryOf(undefined), '')
  assert.equal(queryOf({ workspaceId: 'ungrouped', blank: 0 }), 'workspaceId=ungrouped&blank=0')
})

test('mergePageRows appends only unseen ids and keeps the loaded order', () => {
  const current = [{ id: 'a' }, { id: 'b' }]
  const merged = mergePageRows(current, [{ id: 'b' }, { id: 'c' }, { id: 'a' }, { id: 'd' }])
  assert.deepEqual(idsOf(merged), ['a', 'b', 'c', 'd'])
  assert.equal(mergePageRows(current, []), current)
  assert.deepEqual(idsOf(mergePageRows([], [{ id: 'a' }])), ['a'])
})

test('mergeRowCache lets the newer response win per id', () => {
  const cache = new Map([['a', { id: 'a', title: 'old' }], ['b', { id: 'b', title: 'b' }]])
  const merged = mergeRowCache(cache, [{ id: 'a', title: 'new' }, { id: 'c', title: 'c' }])
  assert.equal(merged.get('a').title, 'new')
  assert.equal(merged.get('b').title, 'b')
  assert.equal(merged.get('c').title, 'c')
  assert.equal(mergeRowCache(cache, []), cache)
})

// ---------------------------------------------------------------------------
// branch across pages
// ---------------------------------------------------------------------------

test('annotateBranchRows nests a loaded branch and leaves its markers clear', () => {
  const parent = row('p', { updatedAt: 200 })
  const child = row('c', { kind: 'fork', parentSessionId: 'p', parentTitle: 'P', branchDepth: 1 })
  const ordered = annotateBranchRows([child, parent])
  assert.deepEqual(idsOf(ordered), ['p', 'c'])
  assert.equal(ordered[1].branchDepth, 1)
  assert.equal(ordered[1].branchOrphan, undefined)
  assert.equal(ordered[1].branchParentTitle, 'P')
  assert.equal(ordered[1].branchParentMissing, false)
  assert.equal(ordered[1].branchParentNotLoaded, false)
})

test('annotateBranchRows marks a not-loaded parent with its stub title', () => {
  const child = row('c', {
    kind: 'fork',
    parentSessionId: 'p',
    parentTitle: '',
    parentPresent: true,
    branchDepth: 1,
    parentStub: { id: 'p', title: 'Parent title', present: true },
  })
  const [annotated] = annotateBranchRows([child])
  assert.equal(annotated.branchOrphan, true)
  assert.equal(annotated.branchDepth, 0)
  assert.equal(annotated.branchParentTitle, 'Parent title')
  assert.equal(annotated.branchParentMissing, false)
  assert.equal(annotated.branchParentNotLoaded, false)
})

test('annotateBranchRows reads present-but-untitled and missing parents apart', () => {
  const untitled = row('c1', {
    kind: 'fork',
    parentSessionId: 'p',
    parentTitle: '',
    parentPresent: true,
    parentStub: { id: 'p', title: '', present: true },
  })
  const [notLoaded] = annotateBranchRows([untitled])
  assert.equal(notLoaded.branchParentNotLoaded, true)
  assert.equal(notLoaded.branchParentMissing, false)

  const missing = row('c2', {
    kind: 'fork',
    parentSessionId: 'gone',
    parentTitle: '',
    parentPresent: true,
    parentStub: { id: 'gone', title: 'Dead title', present: false },
  })
  const [gone] = annotateBranchRows([missing])
  assert.equal(gone.branchParentMissing, true)
  assert.equal(gone.branchParentNotLoaded, false)

  const noStub = row('c3', { kind: 'fork', parentSessionId: 'gone', parentTitle: '', parentPresent: false })
  const [absent] = annotateBranchRows([noStub])
  assert.equal(absent.branchParentMissing, true)

  const neutral = row('c4', { kind: 'fork', parentSessionId: 'later', parentTitle: '', parentPresent: true })
  const [unknown] = annotateBranchRows([neutral])
  assert.equal(unknown.branchParentNotLoaded, true)
  assert.equal(unknown.branchParentMissing, false)
})

test('annotateBranchRows leaves non-fork rows untouched', () => {
  const normal = row('n')
  assert.equal(annotateBranchRows([normal])[0], normal)
})

// ---------------------------------------------------------------------------
// old-Host fallback adapters
// ---------------------------------------------------------------------------

function legacyRow(id, extra = {}) {
  return row(id, { blank: false, ...extra })
}

test('overviewFromState rebuilds the overview shape and counts', () => {
  const state = {
    generatedAt: 9,
    sessions: [
      legacyRow('a'),
      legacyRow('b', { archived: true }),
      legacyRow('c', { blank: true }),
      legacyRow('u', { workspaceId: null }),
      legacyRow('s', { workspaceId: 'w2', isSubagent: true }),
    ],
    workspaces: [{ id: 'w1', title: 'W1', path: '/w1', status: 'ok' }],
    totals: { all: 5, active: 4, archived: 1, hiddenSubagents: 2, bytes: 123 },
    orphans: ['gone'],
    limits: { maxBatch: 40, maxMoveBatch: 10 },
    capabilities: { title: true },
  }
  const overview = overviewFromState(state)
  assert.equal(overview.source, 'legacy')
  assert.equal(overview.generatedAt, 9)
  assert.deepEqual([...overview.workspaces].map((workspace) => workspace.id), ['w1'])
  assert.equal(overview.workspaces[0].count, 3)
  assert.equal(overview.workspaces[0].activeCount, 2)
  assert.equal(overview.workspaces[0].archivedCount, 1)
  assert.equal(overview.workspaces[0].blankCount, 1)
  assert.equal(overview.workspaces[0].totalBytes, null)
  assert.equal(overview.ungrouped.count, 1)
  assert.equal(overview.totals.all, 5)
  assert.equal(overview.totals.active, 4)
  assert.equal(overview.totals.archived, 1)
  assert.equal(overview.totals.hiddenSubagents, 2)
  assert.equal(overview.totals.blank, 1)
  assert.equal(overview.totals.bytes, 123)
  assert.deepEqual(overview.orphans, ['gone'])
  assert.equal(overview.limits.maxBatch, 40)
})

test('overviewFromState handles an empty /state payload', () => {
  const overview = overviewFromState(null)
  assert.equal(overview.totals.all, 0)
  assert.equal(overview.workspaces.length, 0)
  assert.equal(overview.ungrouped.count, 0)
  assert.equal(overview.orphans.length, 0)
})

test('blanksFromState splits the three blank-session id lists', () => {
  const state = {
    sessions: [
      legacyRow('active-blank', { blank: true }),
      legacyRow('archived-deletable', { blank: true, archived: true, can: { delete: true } }),
      legacyRow('archived-locked', { blank: true, archived: true, can: { delete: false } }),
      legacyRow('not-blank'),
    ],
  }
  const blanks = blanksFromState(state)
  assert.deepEqual(blanks.unarchivedIds, ['active-blank'])
  assert.deepEqual(blanks.archivedIds, ['archived-deletable', 'archived-locked'])
  assert.deepEqual(blanks.deletableIds, ['archived-deletable'])
})

test('normalizeSizes reads the real /sizes payload', () => {
  const sizes = normalizeSizes({
    generatedAt: 1,
    source: 'scan',
    workspaceId: 'all',
    total: { bytes: 500, count: 5 },
    workspaces: [{ id: 'w1', bytes: 300, count: 3 }, { id: 'w2', bytes: 200, count: 2 }],
    ungrouped: { bytes: 0, count: 0 },
  })
  assert.equal(sizes.totalBytes, 500)
  assert.equal(sizes.byWorkspace.get('w1'), 300)
  assert.equal(sizes.byWorkspace.get('w2'), 200)
  assert.equal(sizes.byWorkspace.get('ungrouped'), 0)
})

test('normalizeSizes tolerates aliases and empty payloads', () => {
  assert.equal(normalizeSizes({ totalBytes: 10, workspaces: [{ id: 'x', totalBytes: 5 }] }).totalBytes, 10)
  const empty = normalizeSizes(null)
  assert.equal(empty.totalBytes, null)
  assert.equal(empty.byWorkspace.size, 0)
})

// ---------------------------------------------------------------------------
// composeGroups
// ---------------------------------------------------------------------------

const COMPOSE_OVERVIEW = {
  workspaces: [
    { id: 'w1', title: 'W1', path: '/w1', status: 'ok', count: 3, activeCount: 2, archivedCount: 1, blankCount: 1, totalBytes: null },
    { id: 'w2', title: 'W2', path: '/w2', status: 'ok', count: 1, activeCount: 1, archivedCount: 0, blankCount: 0, totalBytes: null },
    { id: 'w3', title: 'W3', path: '/w3', status: 'ok', count: 0, activeCount: 0, archivedCount: 0, blankCount: 0, totalBytes: null },
  ],
  ungrouped: { count: 1, activeCount: 1, archivedCount: 0, blankCount: 0, totalBytes: null },
  totals: { all: 5, active: 4, archived: 1, hiddenSubagents: 0, blank: 1 },
  orphans: [],
  limits: { maxBatch: 50 },
}

const COMPOSE_SIZES = {
  totalBytes: 500,
  byWorkspace: new Map([['w1', 300], ['w2', 100], ['ungrouped', 100]]),
}

function composePages() {
  return new Map([
    ['w1', { rows: [row('a'), row('b')], total: 3, offset: 2, hasMore: true, phase: 'ready', error: null }],
    ['w2', { rows: [row('c', { workspaceId: 'w2' })], total: 1, offset: 1, hasMore: false, phase: 'ready', error: null }],
    ['ungrouped', { rows: [row('u', { workspaceId: null })], total: 1, offset: 1, hasMore: false, phase: 'ready', error: null }],
  ])
}

function compose(overrides = {}) {
  return composeGroups({
    overview: COMPOSE_OVERVIEW,
    pages: composePages(),
    sizes: COMPOSE_SIZES,
    expanded: new Set(['w1', 'w2', 'ungrouped']),
    defaultExpanded: true,
    query: '',
    tab: 'all',
    workspaceFilter: 'all',
    showBlank: true,
    searchMode: false,
    requirePage: false,
    ...overrides,
  })
}

test('composeGroups lists non-empty overview groups with page state and sizes', () => {
  const view = compose()
  assert.deepEqual(idsOf(view.groups), ['w1', 'w2', 'ungrouped'])
  const [w1, w2, ungrouped] = view.groups
  assert.deepEqual(idsOf(w1.rows), ['a', 'b'])
  assert.equal(w1.total, 3)
  assert.equal(w1.hasMore, true)
  assert.equal(w1.expanded, true)
  assert.equal(w1.bytes, 300)
  assert.equal(w2.bytes, 100)
  assert.equal(ungrouped.title, '')
  assert.equal(ungrouped.bytes, 100)
  assert.deepEqual(idsOf(view.visibleRows), ['a', 'b', 'c', 'u'])
  assert.equal(view.visibleIdSet.size, 4)
  assert.equal(view.partialCount, 1)
})

test('composeGroups honours collapsed groups, defaultExpanded and forcing queries', () => {
  const collapsed = compose({ expanded: new Set() })
  assert.equal(collapsed.visibleRows.length, 0)
  assert.equal(collapsed.partialCount, 0)

  const auto = compose({ expanded: null, defaultExpanded: false })
  assert.equal(auto.visibleRows.length, 0)

  const searching = compose({ expanded: new Set(), query: 'a' })
  assert.equal(searching.groups[0].expanded, true)
  assert.ok(searching.visibleRows.length > 0)
})

test('composeGroups hides zero-total pages and unknown workspace placeholders', () => {
  const pages = composePages()
  pages.set('w2', { rows: [], total: 0, offset: 0, hasMore: false, phase: 'ready', error: null })
  pages.delete('w1')
  const view = compose({ pages, workspaceFilter: 'w2' })
  assert.equal(view.groups.length, 0)
  const all = compose({ pages })
  // w1 has no page and a positive expected count, so it stays as a placeholder
  // whose header count comes from the overview bucket.
  assert.deepEqual(idsOf(all.groups), ['w1', 'ungrouped'])
  assert.equal(all.groups[0].total, 3)
  assert.equal(all.groups[0].rows.length, 0)
})

test('composeGroups filters the workspace selection and keeps ungrouped last', () => {
  assert.deepEqual(idsOf(compose({ workspaceFilter: 'w2' }).groups), ['w2'])
  assert.deepEqual(idsOf(compose({ workspaceFilter: 'ungrouped' }).groups), ['ungrouped'])
})

test('composeGroups shows only answered groups while searching or on the legacy path', () => {
  const pages = composePages()
  pages.delete('w2')
  const searched = compose({ pages, searchMode: true })
  assert.deepEqual(idsOf(searched.groups), ['w1', 'ungrouped'])
  const legacy = compose({ pages, requirePage: true })
  assert.deepEqual(idsOf(legacy.groups), ['w1', 'ungrouped'])
})

test('composeGroups reports the page phase and error for loading/failing groups', () => {
  const pages = new Map([
    ['w1', { rows: [], total: 0, offset: 0, hasMore: false, phase: 'loading', error: null }],
    ['w2', { rows: [], total: 0, offset: 0, hasMore: false, phase: 'error', error: { code: 'workspace-not-found' } }],
  ])
  const view = compose({ pages, workspaceFilter: 'w1' })
  assert.equal(view.groups[0].phase, 'loading')
  assert.equal(view.groups[0].rows.length, 0)
  const failing = compose({ pages, workspaceFilter: 'w2' })
  assert.equal(failing.groups[0].phase, 'error')
  assert.equal(failing.groups[0].error.code, 'workspace-not-found')
})

// ---------------------------------------------------------------------------
// component smoke tests (the stub React only builds elements; this catches
// render-body typos and bad property access without a DOM)
// ---------------------------------------------------------------------------

const smokeT = (key) => key
const smokeCtx = { locale: undefined, get: () => undefined }

test('SessionManagerPage renders its first loading frame', () => {
  assert.ok(SessionManagerPage({ ctx: smokeCtx, t: smokeT }))
  assert.ok(SessionManagerPage({ ctx: smokeCtx, t: smokeT, close: () => {} }))
})

test('Row renders loaded, cross-page branch and plain rows', () => {
  const plain = row('plain', { forkCount: 2 })
  assert.ok(Row({ row: plain, selected: true, onToggle() {}, onOpen() {}, t: smokeT }))
  const nested = row('child', { kind: 'fork', parentSessionId: 'p', parentTitle: 'P', branchDepth: 1 })
  assert.ok(Row({ row: nested, selected: false, onToggle() {}, onOpen() {}, t: smokeT }))
  const orphan = row('orphan', {
    kind: 'fork',
    parentSessionId: 'gone',
    branchOrphan: true,
    branchParentTitle: 'Parent title',
  })
  assert.ok(Row({ row: orphan, selected: false, onToggle() {}, onOpen() {}, t: smokeT }))
})

test('Group renders expanded pages, loading and error states', () => {
  const base = {
    id: 'w1',
    title: 'W1',
    path: '/w1',
    status: 'ok',
    rows: [row('a')],
    renderedRows: [],
    expanded: true,
    total: 3,
    hasMore: true,
    phase: 'ready',
    error: null,
    bytes: 1048576,
  }
  const props = {
    selected: new Set(['a']),
    onToggle() {},
    onSelect() {},
    onOpen() {},
    onMore() {},
    onRetry() {},
    t: smokeT,
    locked: false,
  }
  assert.ok(Group({ ...props, group: base }))
  assert.ok(Group({ ...props, group: { ...base, phase: 'loading', rows: [], hasMore: false } }))
  assert.ok(Group({ ...props, group: { ...base, phase: 'error', rows: [], error: { code: 'x', message: 'boom' } } }))
  assert.ok(Group({ ...props, group: { ...base, expanded: false } }))
})

test('DetailView renders with the overview and limits inputs', () => {
  const row = {
    id: 'a',
    title: 'A',
    cwd: '/a',
    workspaceId: 'w1',
    workspaceTitle: 'W1',
    archived: false,
    pinned: false,
    live: false,
    running: false,
    kind: 'normal',
    isSubagent: false,
    isFork: false,
    parentSessionId: null,
    parentTitle: '',
    parentPresent: false,
    forkCount: 0,
    createdAt: 1,
    updatedAt: 2,
    sizeBytes: 10,
    can: { title: false, move: false, delete: false },
  }
  const props = {
    ctx: smokeCtx,
    t: smokeT,
    overview: COMPOSE_OVERVIEW,
    limits: { maxBatch: 50, maxMoveBatch: 20 },
    row,
    busy: false,
    onBack() {},
    onChanged() {},
    onOpen() {},
    onArchive() {},
    onRestore() {},
    onMove() {},
    onDelete() {},
  }
  assert.ok(DetailView(props))
  assert.ok(DetailView({ ...props, row: { ...row, archived: true, kind: 'fork', parentTitle: 'P' } }))
})

// ---------------------------------------------------------------------------
// render harness: real hook semantics, fake Host, no React and no DOM
// ---------------------------------------------------------------------------

const depsEqual = (left, right) =>
  Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
  left.every((value, index) => Object.is(value, right[index]))

function walkTree(node, visit) {
  if (Array.isArray(node)) {
    for (const item of node) walkTree(item, visit)
    return
  }
  if (node === null || node === undefined || typeof node !== 'object') return
  visit(node)
  for (const child of node.children ?? []) walkTree(child, visit)
}

function collect(element, type) {
  const found = []
  walkTree(element, (node) => {
    if (node.type === type) found.push(node)
  })
  return found
}

function findFirst(element, predicate) {
  let found = null
  walkTree(element, (node) => {
    if (found === null && predicate(node)) found = node
  })
  return found
}

/** Mount one component with minimal hooks; `flush` drains requests + rerenders. */
function mount(component, props) {
  const slots = []
  let cursor = 0
  let scheduled = false
  let element = null

  const schedule = () => {
    if (scheduled) return
    scheduled = true
    queueMicrotask(render)
  }

  const render = () => {
    scheduled = false
    cursor = 0
    const pending = []
    hookImpl.useState = (initial) => {
      const index = cursor++
      if (slots[index] === undefined) slots[index] = { value: typeof initial === 'function' ? initial() : initial }
      const slot = slots[index]
      return [slot.value, (update) => {
        const next = typeof update === 'function' ? update(slot.value) : update
        if (Object.is(next, slot.value)) return
        slot.value = next
        schedule()
      }]
    }
    hookImpl.useRef = (initial) => {
      const index = cursor++
      if (slots[index] === undefined) slots[index] = { current: initial }
      return slots[index]
    }
    hookImpl.useMemo = (factory, deps) => {
      const index = cursor++
      const slot = slots[index]
      if (slot === undefined || !depsEqual(slot.deps, deps)) slots[index] = { deps, value: factory() }
      return slots[index].value
    }
    hookImpl.useCallback = (callback, deps) => {
      const index = cursor++
      const slot = slots[index]
      if (slot === undefined || !depsEqual(slot.deps, deps)) slots[index] = { deps, value: callback }
      return slots[index].value
    }
    hookImpl.useEffect = (effect, deps) => {
      const index = cursor++
      const slot = slots[index]
      if (slot === undefined) {
        slots[index] = { kind: 'effect', deps, effect, cleanup: undefined, pending: true }
      } else if (!depsEqual(slot.deps, deps)) {
        slot.deps = deps
        slot.effect = effect
        slot.pending = true
      }
      if (slots[index].pending === true) pending.push(index)
    }
    element = component(props)
    for (const index of pending.sort((left, right) => left - right)) {
      const slot = slots[index]
      if (slot === undefined || slot.kind !== 'effect' || slot.pending !== true) continue
      slot.pending = false
      if (typeof slot.cleanup === 'function') {
        try {
          slot.cleanup()
        } catch {
          // A cleanup failure must not mask the test result.
        }
      }
      const cleanup = slot.effect()
      slot.cleanup = typeof cleanup === 'function' ? cleanup : undefined
    }
  }

  render()
  return {
    element: () => element,
    flush: async (rounds = 40) => {
      for (let index = 0; index < rounds; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0))
        await Promise.resolve()
      }
    },
  }
}

/** Install a fake Host; `routes` maps `/path` to `() => {status, value|error}`. */
function installHost(routes) {
  const calls = []
  testApi.setFetch(async (url) => {
    calls.push(url)
    const parsed = new URL(`http://host${url}`)
    const path = parsed.pathname.replace(/^\/session-mng\/api/u, '')
    const route = routes[path]
    if (route === undefined) {
      return { ok: false, status: 404, json: async () => ({ ok: false, error: { code: 'not-found', message: `no route ${path}` } }) }
    }
    const result = await route(parsed.searchParams)
    if (result.status !== 200) {
      return { ok: false, status: result.status, json: async () => ({ ok: false, error: result.error }) }
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, value: result.value }) }
  })
  return calls
}

function pathOf(url) {
  return new URL(`http://host${url}`).pathname.replace(/^\/session-mng\/api/u, '')
}

const PAGED_OVERVIEW = {
  generatedAt: 10,
  source: 'catalog',
  workspaces: [
    { id: 'w1', title: 'W1', path: '/w1', status: 'ok', count: 2, activeCount: 2, archivedCount: 0, blankCount: 0, totalBytes: null },
    { id: 'w2', title: 'W2', path: '/w2', status: 'ok', count: 1, activeCount: 1, archivedCount: 0, blankCount: 0, totalBytes: null },
  ],
  ungrouped: { count: 0, activeCount: 0, archivedCount: 0, blankCount: 0, totalBytes: null },
  totals: { all: 3, active: 3, archived: 0, subagents: 0, hiddenSubagents: 0, forks: 0, blank: 0, bytes: null },
  orphans: [],
  capabilities: { title: true, move: true, delete: true, search: false },
  limits: { maxBatch: 50, maxMoveBatch: 20, pageLimitMax: 50 },
  backend: 'jsonl',
}

const PAGED_SIZES = {
  generatedAt: 11,
  source: 'scan',
  workspaceId: 'all',
  scannedAt: 11,
  cached: false,
  expiresAt: 99,
  total: { bytes: 512, count: 3 },
  workspaces: [
    { id: 'w1', title: 'W1', path: '/w1', bytes: 300, count: 2 },
    { id: 'w2', title: 'W2', path: '/w2', bytes: 212, count: 1 },
  ],
  ungrouped: { bytes: 0, count: 0 },
}

function pagedRoutes(extra = {}) {
  return {
    '/overview': () => ({ status: 200, value: PAGED_OVERVIEW }),
    '/blanks': () => ({ status: 200, value: { unarchivedIds: [], archivedIds: [], deletableIds: [] } }),
    '/sizes': () => ({ status: 200, value: PAGED_SIZES }),
    '/sessions': (params) => {
      const workspaceId = params.get('workspaceId')
      const offset = Number(params.get('offset') ?? 0)
      if (workspaceId === 'w1') {
        return {
          status: 200,
          value: offset === 0
            ? { total: 2, offset: 0, hasMore: true, rows: [row('a')] }
            : { total: 2, offset: 1, hasMore: false, rows: [row('b', { updatedAt: 50 })] },
        }
      }
      return { status: 200, value: { total: 1, offset: 0, hasMore: false, rows: [row('c', { workspaceId: 'w2' })] } }
    },
    '/session': (params) => ({
      status: 200,
      value: {
        row: row(params.get('id') ?? 'a', { title: 'Detail A', archived: false, kind: 'normal', parentPresent: false, can: { title: false, move: false, delete: false } }),
        capabilities: { title: true, move: true, delete: true },
        limits: { maxBatch: 50, maxMoveBatch: 20, pageLimitMax: 50 },
      },
    }),
    ...extra,
  }
}

test('page talks to /overview + /sizes then one /sessions page per expanded workspace', async () => {
  const calls = installHost(pagedRoutes())
  const instance = mount(SessionManagerPage, { ctx: { get: () => undefined }, t: smokeT })
  await instance.flush()
  const paths = calls.map(pathOf)
  assert.equal(paths.includes('/overview'), true)
  assert.equal(paths.includes('/sizes'), true)
  assert.equal(paths.includes('/state'), false)
  assert.equal(paths.filter((path) => path === '/sessions').length, 2)

  const groups = collect(instance.element(), Group).map((node) => node.props.group)
  assert.deepEqual(idsOf(groups), ['w1', 'w2'])
  assert.equal(groups[0].expanded, true)
  assert.deepEqual(idsOf(groups[0].rows), ['a'])
  assert.equal(groups[0].total, 2)
  assert.equal(groups[0].hasMore, true)
  assert.equal(groups[0].bytes, 300)

  // "Load more" requests the next page and appends without duplicates.
  const first = collect(instance.element(), Group)[0]
  first.props.onMore()
  await instance.flush()
  const reloaded = collect(instance.element(), Group).map((node) => node.props.group)
  assert.deepEqual(idsOf(reloaded[0].rows), ['a', 'b'])
  assert.equal(reloaded[0].hasMore, false)
  const offsets = calls.filter((url) => url.includes('workspaceId=w1')).map((url) => new URL(`http://host${url}`).searchParams.get('offset'))
  assert.equal(offsets.includes('1'), true)

  // Refresh keeps the loaded depth instead of collapsing back to one page.
  const refresh = findFirst(instance.element(), (node) => node.type === 'button' && node.children[0] === 'refresh')
  assert.ok(refresh, 'the head renders a Refresh button')
  refresh.props.onClick()
  await instance.flush()
  const afterRefresh = collect(instance.element(), Group).map((node) => node.props.group)
  assert.deepEqual(idsOf(afterRefresh[0].rows), ['a', 'b'])
  assert.equal(calls.filter((url) => url.includes('workspaceId=w1') && new URL(`http://host${url}`).searchParams.get('offset') === '1').length, 2)
})

test('a failing workspace page shows an error state and can be retried', async () => {
  let failures = 1
  const calls = installHost(pagedRoutes({
    '/sessions': (params) => {
      if (params.get('workspaceId') === 'w1' && failures > 0) {
        failures -= 1
        return { status: 503, error: { code: 'sizes-pending', message: 'still scanning' } }
      }
      const offset = Number(params.get('offset') ?? 0)
      if (params.get('workspaceId') === 'w1') {
        return { status: 200, value: offset === 0 ? { total: 2, offset: 0, hasMore: true, rows: [row('a')] } : { total: 2, offset: 1, hasMore: false, rows: [row('b')] } }
      }
      return { status: 200, value: { total: 1, offset: 0, hasMore: false, rows: [row('c', { workspaceId: 'w2' })] } }
    },
  }))
  const instance = mount(SessionManagerPage, { ctx: { get: () => undefined }, t: smokeT })
  await instance.flush()
  const failed = collect(instance.element(), Group).map((node) => node.props.group).find((group) => group.id === 'w1')
  assert.equal(failed.phase, 'error')
  assert.equal(failed.error.code, 'sizes-pending')
  const failedElement = collect(instance.element(), Group).find((node) => node.props.group.id === 'w1')
  assert.ok(failedElement, 'the failed group is rendered')
  failedElement.props.onRetry()
  await instance.flush()
  const recovered = collect(instance.element(), Group).map((node) => node.props.group).find((group) => group.id === 'w1')
  assert.equal(recovered.phase, 'ready')
  assert.deepEqual(idsOf(recovered.rows), ['a'])
  assert.equal(calls.filter((url) => pathOf(url) === '/sessions').length >= 3, true)
})

test('typing debounces into /search and the answer replaces the loaded groups', async () => {
  const calls = installHost(pagedRoutes({
    '/search': () => ({
      status: 200,
      value: {
        generatedAt: 12,
        source: 'catalog',
        query: 'match',
        total: 1,
        groups: [{
          workspaceId: 'w1',
          workspace: { id: 'w1', title: 'W1', path: '/w1', status: 'ok' },
          total: 1,
          hasMore: false,
          rows: [row('hit', { title: 'match one' })],
        }],
      },
    }),
  }))
  const instance = mount(SessionManagerPage, { ctx: { get: () => undefined }, t: smokeT })
  await instance.flush()
  const input = findFirst(instance.element(), (node) => node.type === 'input' && node.props.type === 'search')
  assert.ok(input, 'the toolbar renders a search input')
  input.props.onChange({ target: { value: 'match' } })
  await new Promise((resolve) => setTimeout(resolve, 320))
  await instance.flush()
  const searchCalls = calls.filter((url) => pathOf(url) === '/search')
  assert.equal(searchCalls.length, 1)
  assert.equal(new URL(`http://host${searchCalls[0]}`).searchParams.get('query'), 'match')
  const groups = collect(instance.element(), Group).map((node) => node.props.group)
  assert.deepEqual(idsOf(groups), ['w1'])
  assert.equal(groups[0].expanded, true)
  assert.deepEqual(idsOf(groups[0].rows), ['hit'])
})

test('a Host without /overview falls back to one /state read and pages locally', async () => {
  const legacyState = {
    generatedAt: 20,
    sessions: [row('l1'), row('l2', { workspaceId: 'w2', updatedAt: 50 })],
    workspaces: [
      { id: 'w1', title: 'W1', path: '/w1', status: 'ok' },
      { id: 'w2', title: 'W2', path: '/w2', status: 'ok' },
    ],
    totals: { all: 2, active: 2, archived: 0, hiddenSubagents: 0, bytes: 1234 },
    orphans: [],
    limits: { maxBatch: 50, maxMoveBatch: 20 },
    capabilities: { title: true },
  }
  const calls = installHost({
    '/overview': () => ({ status: 404, error: { code: 'not-found', message: 'unknown route' } }),
    '/state': () => ({ status: 200, value: legacyState }),
  })
  const instance = mount(SessionManagerPage, { ctx: { get: () => undefined }, t: smokeT })
  await instance.flush()
  const paths = calls.map(pathOf)
  assert.equal(paths.includes('/overview'), true)
  assert.equal(paths.includes('/state'), true)
  assert.equal(paths.includes('/sessions'), false)
  const groups = collect(instance.element(), Group).map((node) => node.props.group)
  assert.deepEqual(idsOf(groups), ['w1', 'w2'])
  assert.equal(groups[0].expanded, true)
  assert.deepEqual(idsOf(groups[0].rows), ['l1'])
  assert.equal(groups[1].rows.length, 1)
  assert.equal(calls.filter((url) => pathOf(url) === '/overview').length, 1, '/overview is probed once')
})

test('opening the detail draws the cached row immediately and Back keeps the pages', async () => {
  const calls = installHost(pagedRoutes())
  const instance = mount(SessionManagerPage, { ctx: { get: () => undefined }, t: smokeT })
  await instance.flush()
  const first = collect(instance.element(), Group)[0]
  first.props.onOpen('a')
  await instance.flush()
  assert.equal(calls.some((url) => pathOf(url) === '/session' && new URL(`http://host${url}`).searchParams.get('id') === 'a'), true)
  const detail = collect(instance.element(), DetailView)
  assert.equal(detail.length, 1)
  assert.equal(detail[0].props.row.id, 'a')
  assert.equal(detail[0].props.limits.maxBatch, 50)
  // Back to the list: the loaded page cache is still there, no refetch needed.
  const pageCallsBefore = calls.filter((url) => pathOf(url) === '/sessions').length
  detail[0].props.onBack()
  await instance.flush()
  const groups = collect(instance.element(), Group)
  assert.equal(groups.length, 2)
  assert.deepEqual(idsOf(groups[0].props.group.rows), ['a'])
  assert.equal(calls.filter((url) => pathOf(url) === '/sessions').length, pageCallsBefore)
})

test('toggling subagents re-fetches overview, sizes and pages with the new flag', async () => {
  const calls = installHost(pagedRoutes())
  const instance = mount(SessionManagerPage, { ctx: { get: () => undefined }, t: smokeT })
  await instance.flush()

  const query = (url, key) => new URL(`http://host${url}`).searchParams.get(key)
  const sizesCalls = () => calls.filter((url) => pathOf(url) === '/sizes')
  assert.equal(sizesCalls().length >= 1, true)
  assert.equal(sizesCalls().every((url) => query(url, 'workspaceId') === 'all'), true)
  assert.equal(sizesCalls().every((url) => query(url, 'subagents') === '0'), true)

  const checkboxes = collect(instance.element(), 'input').filter((node) => node.props.type === 'checkbox')
  assert.ok(checkboxes.length >= 2, 'the toolbar renders its two toggles')
  const subagentsToggle = checkboxes.find((node) => node.props.checked === false)
  assert.ok(subagentsToggle, 'the subagent toggle starts unchecked')
  subagentsToggle.props.onChange({ target: { checked: true } })
  await instance.flush()

  // sizes/overview/pages all follow the switch, so the byte totals keep the
  // same 0.1.x scope as the counts.
  assert.equal(calls.some((url) => pathOf(url) === '/overview' && query(url, 'subagents') === '1'), true)
  assert.equal(sizesCalls().some((url) => query(url, 'subagents') === '1'), true)
  assert.equal(calls.some((url) => pathOf(url) === '/sessions' && query(url, 'subagents') === '1'), true)
})

test('composeGroups windows legacy groups at 50 rows while keeping the full visibility set', () => {
  const legacyRows = Array.from({ length: 60 }, (_, index) => row(`legacy-${String(index).padStart(2, '0')}`))
  const pages = new Map([[
    'w1',
    { rows: legacyRows, total: 60, offset: 60, hasMore: false, phase: 'ready', error: null },
  ]])
  const windowed = compose({ pages, workspaceFilter: 'w1', legacy: true, legacyLimits: {} })
  assert.equal(windowed.groups[0].rows.length, 60)
  assert.equal(windowed.groups[0].renderedRows.length, 50)
  assert.equal(windowed.groups[0].total, 60)
  // The visible/selection set is the whole expanded group, as in 0.1.4.
  assert.equal(windowed.visibleRows.length, 60)
  assert.equal(windowed.visibleIdSet.size, 60)
  assert.equal(windowed.partialCount, 0)

  const widened = compose({ pages, workspaceFilter: 'w1', legacy: true, legacyLimits: { w1: 100 } })
  assert.equal(widened.groups[0].renderedRows.length, 60)

  const paged = compose({ pages, workspaceFilter: 'w1' })
  assert.equal(paged.groups[0].renderedRows.length, 60)
})

test('the legacy fallback renders 50 rows per group, grows on load more and keeps selecting all', async () => {
  const legacyRows = Array.from({ length: 120 }, (_, index) =>
    row(`legacy-${String(index).padStart(3, '0')}`, { updatedAt: 5000 - index }),
  )
  const legacyState = {
    generatedAt: 30,
    sessions: [...legacyRows, row('w2-row', { workspaceId: 'w2', updatedAt: 10 })],
    workspaces: [
      { id: 'w1', title: 'W1', path: '/w1', status: 'ok' },
      { id: 'w2', title: 'W2', path: '/w2', status: 'ok' },
    ],
    totals: { all: 121, active: 121, archived: 0, hiddenSubagents: 0, bytes: 9999 },
    orphans: [],
    limits: { maxBatch: 50, maxMoveBatch: 20 },
    capabilities: { title: true },
  }
  const calls = installHost({
    '/overview': () => ({ status: 404, error: { code: 'not-found', message: 'unknown route' } }),
    '/state': () => ({ status: 200, value: legacyState }),
  })
  const instance = mount(SessionManagerPage, { ctx: { get: () => undefined }, t: smokeT })
  await instance.flush()

  // 121 sessions is above the collapse threshold, so expand w1 explicitly
  // (0.1.4 collapsed by default too); the group then renders its first 50.
  const groupElement = (id) => collect(instance.element(), Group).find((node) => node.props.group.id === id)
  const groupOf = (id) => groupElement(id)?.props.group
  groupElement('w1').props.onToggle()
  groupElement('w2').props.onToggle()
  await instance.flush()
  const w1 = groupOf('w1')
  assert.equal(w1.rows.length, 120)
  assert.equal(w1.renderedRows.length, 50)
  assert.equal(w1.total, 120)
  assert.equal(groupOf('w2').renderedRows.length, 1)

  // "Select all" covers the whole expanded group, including the 70 rows that
  // are not rendered yet (0.1.4 semantics, still safe because they are loaded).
  const checkboxes = collect(instance.element(), 'input').filter((node) => node.props.type === 'checkbox')
  const selectAll = checkboxes.find((node) => node.props.checked === false && node.props.onChange !== undefined && checkboxes.indexOf(node) >= 2)
  assert.ok(selectAll, 'the batch bar renders Select all')
  selectAll.props.onChange({ target: { checked: true } })
  await instance.flush()
  assert.equal(groupElement('w1').props.selected.size, 121)

  // Load more grows the local window without any Host request.
  const sessionsBefore = calls.filter((url) => pathOf(url) === '/sessions').length
  groupElement('w1').props.onMore()
  await instance.flush()
  const widened = groupOf('w1')
  assert.equal(widened.renderedRows.length, 100)
  assert.equal(widened.rows.length, 120)
  assert.equal(calls.filter((url) => pathOf(url) === '/sessions').length, sessionsBefore)

  groupElement('w1').props.onMore()
  await instance.flush()
  assert.equal(groupOf('w1').renderedRows.length, 120)
  assert.equal(groupOf('w1').total, 120)
})
