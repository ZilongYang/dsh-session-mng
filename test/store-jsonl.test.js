import test from 'node:test'
import assert from 'node:assert/strict'
import zlib from 'node:zlib'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  currentLogFile,
  dirSize,
  readHeader,
  removeStagedDelete,
  restoreStagedDelete,
  rewriteHeaderCwd,
  stageDelete,
  stageMove,
  finalizeMove,
  rollbackMove,
  zstdAvailable,
} from '../lib/store-jsonl.js'

const HAS_ZSTD = zstdAvailable()
const CHECKSUM = zlib.constants?.ZSTD_c_checksumFlag

function frame(text) {
  return zlib.zstdCompressSync(Buffer.from(text), {
    params: { [CHECKSUM]: 1 },
  })
}

function makeLog({ id, cwd, headerExtra = {}, events = [] }) {
  const header = {
    type: 'session',
    version: 4,
    id,
    createdAt: 1,
    cwd,
    isSeeded: false,
    agentPreset: 'standard',
    ...headerExtra,
  }
  const parts = [frame(`${JSON.stringify(header)}\n`)]
  for (const event of events) parts.push(frame(`${JSON.stringify(event)}\n`))
  return { header, buf: Buffer.concat(parts), headerFrameLength: parts[0].length }
}

async function tempWorkspace() {
  const base = await mkdtemp(join(tmpdir(), 'dsh-session-mng-test-'))
  const root = join(base, 'sessions')
  const projectA = join(root, '--project-a--')
  const projectB = join(root, '--project-b--')
  const id = 'session-test-1'
  const sourceDir = join(projectA, id)
  const targetDir = join(projectB, id)
  const tempRoot = join(base, '.session-mng-tmp')
  await mkdir(sourceDir, { recursive: true })
  return { base, root, sourceDir, targetDir, tempRoot, id }
}

test('readHeader and rewriteHeaderCwd keep every later byte', { skip: !HAS_ZSTD }, async () => {
  const { id } = await tempWorkspace()
  const { buf, headerFrameLength } = makeLog({
    id,
    cwd: '/old/path',
    headerExtra: { custom: 'keep-me' },
    events: [
      { type: 'user/message', seq: 0, time: 1, data: { content: [{ type: 'text', text: 'hi' }] } },
      { type: 'assistant/message', seq: 1, time: 2, data: { message: { content: [] } } },
    ],
  })
  const found = readHeader(buf, id)
  assert.ok(found)
  assert.equal(found.frameEnd, headerFrameLength)
  assert.equal(found.header.cwd, '/old/path')

  const rewritten = rewriteHeaderCwd(buf, '/new/path', id)
  assert.equal(rewritten.header.cwd, '/new/path')
  assert.equal(rewritten.header.custom, 'keep-me')
  assert.deepEqual(rewritten.content.subarray(rewritten.frameEnd), buf.subarray(found.frameEnd))
  assert.equal(readHeader(rewritten.content, id)?.header.cwd, '/new/path')
})

test('currentLogFile picks the highest generation', { skip: !HAS_ZSTD }, async () => {
  const { sourceDir } = await tempWorkspace()
  await writeFile(join(sourceDir, 'session.v1.jsonl.zstd'), frame('{"type":"session"}\n'))
  await writeFile(join(sourceDir, 'session.v3.jsonl.zstd'), frame('{"type":"session"}\n'))
  await writeFile(join(sourceDir, 'session.lock'), '')
  const current = await currentLogFile(sourceDir)
  assert.equal(current?.name, 'session.v3.jsonl.zstd')
})

test('stageMove moves bytes, keeps extras, and rollback restores the original', { skip: !HAS_ZSTD }, async () => {
  const { base, sourceDir, targetDir, tempRoot, id } = await tempWorkspace()
  const { buf } = makeLog({ id, cwd: '/old/path', events: [{ type: 'user/message', seq: 0, time: 1, data: {} }] })
  await writeFile(join(sourceDir, 'session.v4.jsonl.zstd'), buf)
  await writeFile(join(sourceDir, 'session.lock'), '')
  await writeFile(join(sourceDir, 'extra.txt'), 'keep')

  const staged = await stageMove({ sourceDir, targetDir, tempRoot, id, newCwd: '/new/path' })
  const movedHeader = readHeader(await readFile(join(targetDir, 'session.v4.jsonl.zstd')), id)
  assert.equal(movedHeader?.header.cwd, '/new/path')
  assert.equal(await readFile(join(targetDir, 'extra.txt'), 'utf8'), 'keep')
  assert.ok(staged.backupDir.includes('.session-mng-tmp'))
  assert.equal(await currentLogFile(sourceDir), undefined)

  await rollbackMove({ sourceDir, targetDir, backupDir: staged.backupDir })
  assert.deepEqual(await readFile(join(sourceDir, 'session.v4.jsonl.zstd')), buf)
  assert.equal(await currentLogFile(targetDir), undefined)

  const second = await stageMove({ sourceDir, targetDir, tempRoot, id, newCwd: '/new/path' })
  await finalizeMove(second.backupDir)
  assert.equal(await currentLogFile(targetDir).then((value) => value?.name), 'session.v4.jsonl.zstd')
  await rm(base, { recursive: true, force: true })
})

test('stageDelete / restore / remove round-trips directories', { skip: !HAS_ZSTD }, async () => {
  const { base, sourceDir, targetDir, tempRoot, id } = await tempWorkspace()
  await writeFile(join(sourceDir, 'session.v4.jsonl.zstd'), frame('{"type":"session","id":"x","cwd":"/x"}\n'))
  const staged = await stageDelete({ dirs: [{ id, dir: sourceDir }], tempRoot, batchId: 'b1' })
  assert.equal(await currentLogFile(sourceDir), undefined)
  const restoreFailures = await restoreStagedDelete(staged)
  assert.deepEqual(restoreFailures, [])
  assert.equal(await currentLogFile(sourceDir).then((value) => value?.name), 'session.v4.jsonl.zstd')

  const again = await stageDelete({ dirs: [{ id, dir: sourceDir }], tempRoot, batchId: 'b2' })
  const leftovers = await removeStagedDelete(again)
  assert.deepEqual(leftovers, [])
  assert.equal(await currentLogFile(sourceDir), undefined)
  assert.equal(await currentLogFile(targetDir), undefined)
  await rm(base, { recursive: true, force: true })
})

test('dirSize sums nested files', async () => {
  const { base } = await tempWorkspace()
  const nested = join(base, 'nested')
  await mkdir(join(nested, 'a'), { recursive: true })
  await writeFile(join(nested, 'a', 'one.txt'), '12345')
  await writeFile(join(nested, 'two.txt'), '123')
  assert.equal(await dirSize(nested), 8)
  await rm(base, { recursive: true, force: true })
})
