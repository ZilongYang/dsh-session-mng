import test from 'node:test'
import assert from 'node:assert/strict'
import zlib from 'node:zlib'
import { mkdtemp, mkdir, readFile, readdir, appendFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { createService, normalizeConfig } from '../lib/service.js'
import { currentLogFile, dirSize } from '../lib/store-jsonl.js'

const CHECKSUM = zlib.constants?.ZSTD_c_checksumFlag
const HAS_ZSTD = typeof zlib.zstdCompressSync === 'function'

function frame(text) {
  return zlib.zstdCompressSync(Buffer.from(text), { params: { [CHECKSUM]: 1 } })
}

function projectKey(cwd) {
  let readable = ''
  let separatorRun = false
  for (let index = 0; index < cwd.length; index += 1) {
    const ch = cwd[index]
    if (ch === '/' || ch === '\\' || ch === ':') {
      if (!separatorRun) readable += '-'
      separatorRun = true
    } else if (ch !== '~' && /^[A-Za-z0-9._-]$/u.test(ch)) {
      readable += ch
      separatorRun = false
    } else {
      readable += `~${cwd.charCodeAt(index).toString(16).toUpperCase().padStart(4, '0')}`
      separatorRun = false
    }
  }
  return `--${(readable.replace(/^-+/u, '') || 'root').slice(0, 251)}--`
}

function encodeSegment(value) {
  let out = ''
  for (let index = 0; index < value.length; index += 1) {
    const ch = value[index]
    if (ch !== '~' && /^[A-Za-z0-9._-]$/u.test(ch)) out += ch
    else out += `~${value.charCodeAt(index).toString(16).toUpperCase().padStart(4, '0')}`
  }
  return out
}

function decodeZstdFrames(buf) {
  const MAGIC = 0xfd2fb528
  const offsets = []
  for (let at = 0; at + 4 <= buf.length; ) {
    const hit = buf.indexOf(0x28, at)
    if (hit === -1) break
    if (buf.readUInt32LE(hit) === MAGIC) offsets.push(hit)
    at = hit + 1
  }
  if (offsets.length === 0 || offsets[0] !== 0) throw new Error('not a zstd frame stream')
  const ends = [...offsets.slice(1), buf.length]
  let text = ''
  for (let index = 0; index < offsets.length; index += 1) {
    text += zlib.zstdDecompressSync(buf.subarray(offsets[index], ends[index])).toString('utf8')
  }
  return text
}

async function readLog(file) {
  const buf = await readFile(file)
  const text = file.endsWith('.zstd') ? decodeZstdFrames(buf) : buf.toString('utf8')
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line))
}

async function readHeaderOf(dir) {
  const log = await currentLogFile(dir)
  if (log === undefined) return undefined
  const lines = await readLog(log.path)
  return lines[0]?.type === 'session' ? lines[0] : undefined
}

async function scanDirs(root) {
  const found = []
  let projects
  try {
    projects = await readdir(root, { withFileTypes: true })
  } catch {
    return found
  }
  for (const project of projects) {
    if (!project.isDirectory()) continue
    const sessions = await readdir(join(root, project.name), { withFileTypes: true }).catch(() => [])
    for (const session of sessions) {
      if (!session.isDirectory()) continue
      found.push(join(root, project.name, session.name))
    }
  }
  return found
}

function makePersistence(root) {
  return {
    locate({ id, cwd }) {
      return { kind: 'jsonl', path: join(root, projectKey(cwd), encodeSegment(id), 'session.v4.jsonl.zstd') }
    },
    async stat(id) {
      const dirs = await scanDirs(root)
      for (const dir of dirs) {
        const header = await readHeaderOf(dir)
        if (header?.id === id) return { header, sizeBytes: await dirSize(dir) }
      }
      return undefined
    },
    async list() {
      const out = []
      for (const dir of await scanDirs(root)) {
        const header = await readHeaderOf(dir)
        if (header !== undefined) out.push({ header, sizeBytes: await dirSize(dir) })
      }
      return out
    },
    async open(id) {
      const dirs = await scanDirs(root)
      let dir
      for (const candidate of dirs) {
        const header = await readHeaderOf(candidate)
        if (header?.id === id) dir = candidate
      }
      if (dir === undefined) throw new Error(`not found: ${id}`)
      const log = await currentLogFile(dir)
      const events = (await readLog(log.path)).filter((line) => line.type !== 'session')
      return {
        async read() {
          return { events }
        },
        async append(batch) {
          for (const event of batch) await appendFile(log.path, frame(`${JSON.stringify(event)}\n`))
        },
        async flush() {},
        async close() {},
      }
    },
  }
}

function makeQuery(persistence, root) {
  return {
    async readSession(id) {
      const snapshot = await persistence.stat(id)
      if (snapshot === undefined) throw new Error(`not found: ${id}`)
      const dirs = await scanDirs(root)
      for (const dir of dirs) {
        const header = await readHeaderOf(dir)
        if (header?.id !== id) continue
        const log = await currentLogFile(dir)
        const events = (await readLog(log.path)).filter((line) => line.type !== 'session')
        return { session: header, events }
      }
      throw new Error(`not found: ${id}`)
    },
    async readSurface(id) {
      const session = await this.readSession(id)
      return { events: session.events }
    },
    async readTitleSnapshots(ids) {
      const out = []
      for (const id of ids) {
        try {
          const session = await this.readSession(id)
          const title = [...session.events].reverse().find((event) => event.type === 'session/title')
          out.push({
            sessionId: id,
            status: 'fulfilled',
            value: { title: { title: title?.data?.title ?? '' } },
          })
        } catch (error) {
          out.push({ sessionId: id, status: 'rejected', reason: error })
        }
      }
      return out
    },
    async traceSession() {
      return { descendants: [] }
    },
    async listSessions() {
      return []
    },
  }
}

function makeWorkspace(id, path, sessionIds) {
  const workspace = {
    id,
    title: id,
    path,
    sessionIds: [...sessionIds],
    async status() {
      return 'ok'
    },
    async attachSession(sessionId) {
      if (!workspace.sessionIds.includes(sessionId)) workspace.sessionIds = [sessionId, ...workspace.sessionIds]
    },
    async detachSession(sessionId) {
      workspace.sessionIds = workspace.sessionIds.filter((candidate) => candidate !== sessionId)
    },
  }
  return workspace
}

function makeRegistry(workspaces, archived = [], options = {}) {
  let archivedIds = [...archived]
  const byId = new Map(workspaces.map((workspace) => [workspace.id, workspace]))
  const registry = {
    headers: new Map(),
    sessionPaths: new Map(),
    invalidSessionPaths: new Map(),
    missingSessionPaths: new Set(),
    host: {
      rememberSessionPath(sessionId, path) {
        if (options.throwOnRemember === true) throw new Error('cache seam changed')
        registry.sessionPaths.set(sessionId, path)
      },
    },
    get: (id) => byId.get(id),
    list: () => workspaces,
    async archiveSession(sessionId) {
      if (!archivedIds.includes(sessionId)) archivedIds = [...archivedIds, sessionId]
    },
    async unarchiveSession(sessionId) {
      archivedIds = archivedIds.filter((id) => id !== sessionId)
    },
  }
  Object.defineProperty(registry, 'archivedSessionIds', { get: () => archivedIds })
  Object.defineProperty(registry, 'pinnedSessionIds', { get: () => [] })
  return registry
}

async function makeFixture() {
  if (!HAS_ZSTD) return undefined
  const base = await mkdtemp(join(tmpdir(), 'dsh-session-mng-svc-'))
  const root = join(base, 'sessions')
  const oldCwd = '/tmp/dsm-old'
  const newCwd = '/tmp/dsm-new'
  const id = 'session-move-1'
  const sourceDir = join(root, projectKey(oldCwd), id)
  await mkdir(sourceDir, { recursive: true })
  const header = { type: 'session', version: 4, id, createdAt: 1, cwd: oldCwd, isSeeded: false, agentPreset: 'standard' }
  const events = [
    { type: 'user/message', seq: 0, time: 1, data: { content: [{ type: 'text', text: 'hello' }] } },
    { type: 'assistant/message', seq: 1, time: 2, data: { message: { content: [] } } },
  ]
  const logPath = join(sourceDir, 'session.v4.jsonl.zstd')
  await writeFile(logPath, Buffer.concat([frame(`${JSON.stringify(header)}\n`), ...events.map((event) => frame(`${JSON.stringify(event)}\n`))]))
  await writeFile(join(sourceDir, 'extra.txt'), 'keep')
  const oldWorkspace = makeWorkspace('w-old', oldCwd, [id])
  const newWorkspace = makeWorkspace('w-new', newCwd, [])
  const persistence = makePersistence(root)
  const query = makeQuery(persistence, root)
  const registry = makeRegistry([oldWorkspace, newWorkspace])
  const ctx = {
    sessions: { get: () => undefined },
    sessionPersistence: persistence,
    sessionQuery: query,
    workspaceRegistry: registry,
    sessionTitle: { rename() { throw new Error('live only') } },
    llm: {},
    agents: { get: () => undefined },
    logger: { info() {}, warn() {} },
    get(name) {
      if (name === 'agents') return this.agents
      return this[name]
    },
  }
  return { base, root, oldCwd, newCwd, id, sourceDir, oldWorkspace, newWorkspace, registry, ctx }
}

test('move relocates a cold session and updates both workspaces', { skip: !HAS_ZSTD }, async () => {
  const fixture = await makeFixture()
  try {
    const service = createService(fixture.ctx, normalizeConfig({ sessionsRoot: fixture.root }))
    const result = await service.move([fixture.id], 'w-new')
    assert.equal(result.totals.succeeded, 1, JSON.stringify(result))
    assert.deepEqual(fixture.oldWorkspace.sessionIds, [])
    assert.deepEqual(fixture.newWorkspace.sessionIds, [fixture.id])
    const movedDir = join(fixture.root, projectKey(fixture.newCwd), fixture.id)
    const log = await currentLogFile(movedDir)
    assert.ok(log)
    const header = (await readLog(log.path))[0]
    assert.equal(header.cwd, fixture.newCwd)
    assert.equal((await readLog(log.path)).filter((line) => line.type !== 'session').length, 2)
    assert.equal(await readFile(join(movedDir, 'extra.txt'), 'utf8'), 'keep')
    assert.equal(await currentLogFile(fixture.sourceDir), undefined)
  } finally {
    await rm(fixture.base, { recursive: true, force: true })
  }
})

test('move rolls back when the registry cache seam fails', { skip: !HAS_ZSTD }, async () => {
  const fixture = await makeFixture()
  try {
    const registry = makeRegistry([fixture.oldWorkspace, fixture.newWorkspace], [], { throwOnRemember: true })
    const ctx = { ...fixture.ctx, workspaceRegistry: registry }
    const service = createService(ctx, normalizeConfig({ sessionsRoot: fixture.root }))
    const result = await service.move([fixture.id], 'w-new')
    assert.equal(result.totals.failed, 1)
    assert.equal(await currentLogFile(fixture.sourceDir).then((value) => value?.name), 'session.v4.jsonl.zstd')
    assert.equal(await currentLogFile(join(fixture.root, projectKey(fixture.newCwd), fixture.id)), undefined)
    const header = (await readLog(join(fixture.sourceDir, 'session.v4.jsonl.zstd')))[0]
    assert.equal(header.cwd, fixture.oldCwd)
    assert.deepEqual(fixture.oldWorkspace.sessionIds, [fixture.id])
  } finally {
    await rm(fixture.base, { recursive: true, force: true })
  }
})

test('permanent delete removes an archived session and its accounting', { skip: !HAS_ZSTD }, async () => {
  const fixture = await makeFixture()
  try {
    const registry = makeRegistry([fixture.oldWorkspace, fixture.newWorkspace], [fixture.id])
    const ctx = { ...fixture.ctx, workspaceRegistry: registry }
    const service = createService(ctx, normalizeConfig({ sessionsRoot: fixture.root }))
    const result = await service.remove([fixture.id], true)
    assert.equal(result.totals.succeeded, 1, JSON.stringify(result))
    assert.equal(result.results[0].deleted, 1)
    assert.equal(await currentLogFile(fixture.sourceDir), undefined)
    assert.deepEqual(registry.archivedSessionIds, [])
    assert.deepEqual(fixture.oldWorkspace.sessionIds, [])
  } finally {
    await rm(fixture.base, { recursive: true, force: true })
  }
})

test('delete refuses an unarchived session', { skip: !HAS_ZSTD }, async () => {
  const fixture = await makeFixture()
  try {
    const service = createService(fixture.ctx, normalizeConfig({ sessionsRoot: fixture.root }))
    const result = await service.remove([fixture.id], true)
    assert.equal(result.totals.failed, 1)
    assert.equal(result.results[0].error.code, 'archived-required')
    assert.ok(await currentLogFile(fixture.sourceDir))
  } finally {
    await rm(fixture.base, { recursive: true, force: true })
  }
})

test('cold title apply appends the official session/title event', { skip: !HAS_ZSTD }, async () => {
  const fixture = await makeFixture()
  try {
    const service = createService(fixture.ctx, normalizeConfig({ sessionsRoot: fixture.root }))
    const result = await service.applyTitle(fixture.id, '  Cold title  ')
    assert.equal(result.mode, 'cold')
    assert.equal(result.title, 'Cold title')
    const log = await currentLogFile(fixture.sourceDir)
    const lines = await readLog(log.path)
    const title = lines.find((line) => line.type === 'session/title')
    assert.ok(title)
    assert.deepEqual(title.data, { title: 'Cold title', messageSeqs: [], source: { kind: 'user' } })
  } finally {
    await rm(fixture.base, { recursive: true, force: true })
  }
})
