/**
 * Filesystem primitives for the JSONL session store.
 *
 * The shipped JSONL backend keeps one directory per session:
 *
 *   <root>/--<projectKey(cwd)>--/<encoded-session-id>/session.vN.jsonl[.zstd]
 *
 * The FIRST Zstandard frame is the physical header (one JSON line carrying
 * `cwd`); every later frame is an appended batch. Moving a session to another
 * workspace therefore means: re-encode frame 0 with the new `cwd`, keep every
 * byte after it verbatim, and re-home the directory under the target project
 * key. No event is ever re-serialized, so unknown-but-ignorable events and
 * historical generations survive untouched.
 *
 * This module never writes to the live source directory: a move first renames
 * the source directory into a sibling temp root, copies it to the target, and
 * rewrites the copy. A failure can therefore always restore the original.
 *
 * @module dsh-session-mng/store-jsonl
 */

import zlib from 'node:zlib'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { access, cp, mkdir, open, readdir, readFile, rename, rm, stat } from 'node:fs/promises'

import { SessionMngError, messageOf } from './errors.js'

/** Zstandard frame magic number, `0x28B52FFD` little-endian. */
const ZSTD_MAGIC = 0xfd2fb528
const ZSTD_CHECKSUM_FLAG = zlib.constants?.ZSTD_c_checksumFlag

/** Whether this Node build exposes Zstandard compression. */
export function zstdAvailable() {
  return (
    typeof zlib.zstdCompressSync === 'function' &&
    typeof zlib.zstdDecompressSync === 'function' &&
    typeof ZSTD_CHECKSUM_FLAG === 'number'
  )
}

/** Whether a path exists. */
export async function pathExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Whether a path exists and is a directory. */
export async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

/** Default local session store root. */
export function defaultSessionsRoot() {
  return join(homedir(), '.dsh', 'sessions')
}

/** The temp root must sit OUTSIDE the sessions root so listings never see it. */
export function tempRootFor(root) {
  return join(dirname(root), '.dsh-session-mng-tmp')
}

/** Directory holding one session, derived from the backend's own locator. */
export function sessionDirFromLocate(persistence, id, cwd) {
  try {
    const located = persistence?.locate?.({ id, cwd })
    const path = located?.path
    return typeof path === 'string' && path !== '' ? dirname(path) : undefined
  } catch {
    return undefined
  }
}

/**
 * Find the one directory holding a session.
 *
 * The direct locator guess is tried first; a cwd-agnostic scan covers a header
 * whose cwd was normalized differently or no longer resolves. Every hit is
 * returned so the caller can report a duplicate instead of silently choosing
 * one.
 *
 * @returns {Promise<string[]>} matching session directories.
 */
export async function findSessionDirs({ persistence, id, cwd, root }) {
  const direct = sessionDirFromLocate(persistence, id, cwd)
  if (direct !== undefined && (await isDirectory(direct))) return [direct]
  return scanSessionDirs(root, id)
}

/** Scan the store for every directory whose current log header names `id`. */
export async function scanSessionDirs(root, id) {
  if (typeof root !== 'string' || root === '') return []
  const found = []
  let projects
  try {
    projects = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  for (const project of projects) {
    if (!project.isDirectory()) continue
    const projectDir = join(root, project.name)
    let sessions
    try {
      sessions = await readdir(projectDir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const session of sessions) {
      if (!session.isDirectory()) continue
      const dir = join(projectDir, session.name)
      const header = await readHeaderPrefix(dir, id)
      if (header !== undefined) found.push(dir)
    }
  }
  return found
}

/** Physical generation number parsed out of `session.vN.jsonl[.zstd]`. */
function generationOf(name) {
  const match = /^session(?:\.v(\d+))?\.jsonl(?:\.zstd)?$/u.exec(name)
  if (match === null) return undefined
  return match[1] === undefined ? 0 : Number(match[1])
}

/**
 * The session's current log file: the highest released generation, exactly as
 * the backend selects it.
 *
 * @returns {Promise<{path: string, name: string, compressed: boolean}|undefined>}
 */
export async function currentLogFile(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return undefined
  }
  let best
  let bestGeneration = -1
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const generation = generationOf(entry.name)
    if (generation === undefined) continue
    const compressed = entry.name.endsWith('.zstd')
    if (
      generation > bestGeneration ||
      (generation === bestGeneration && compressed && best !== undefined && !best.compressed)
    ) {
      best = { name: entry.name, generation, compressed }
      bestGeneration = generation
    }
  }
  if (best === undefined) return undefined
  return { path: join(dir, best.name), name: best.name, compressed: best.compressed }
}

/** Every offset where a Zstandard frame magic begins. */
function magicOffsets(buf) {
  const offsets = []
  let at = 0
  for (;;) {
    const hit = buf.indexOf(0x28, at)
    if (hit === -1) return offsets
    if (hit + 4 <= buf.length && buf.readUInt32LE(hit) === ZSTD_MAGIC) offsets.push(hit)
    at = hit + 1
  }
}

/**
 * Read the log's physical header without touching anything after it.
 *
 * Frame boundaries are found by magic scan and then VERIFIED: a candidate end
 * counts only when the bytes before it decompress to a JSONL line that is a
 * valid session header for `expectId`. A magic that happens to occur inside
 * compressed data is therefore skipped instead of truncating the log.
 *
 * @returns {{frameEnd: number, header: object}|undefined}
 */
export function readHeader(buf, expectId) {
  if (buf.length >= 4 && buf.readUInt32LE(0) === ZSTD_MAGIC) {
    if (!zstdAvailable()) {
      throw new SessionMngError('unsupported-node', 'this Node build cannot decompress Zstandard session logs', 501)
    }
    const candidates = magicOffsets(buf).filter((offset) => offset > 0)
    candidates.push(buf.length)
    for (const end of candidates) {
      try {
        const text = zlib.zstdDecompressSync(buf.subarray(0, end)).toString('utf8')
        const line = text.split('\n')[0]
        const header = JSON.parse(line)
        if (header?.type !== 'session') continue
        if (header.id !== expectId) continue
        if (typeof header.cwd !== 'string') continue
        return { frameEnd: end, header }
      } catch {
        // Not a frame boundary, or not a session header: try the next candidate.
      }
    }
    return undefined
  }
  const newline = buf.indexOf(0x0a)
  const text = buf.subarray(0, newline === -1 ? buf.length : newline).toString('utf8')
  try {
    const header = JSON.parse(text)
    if (header?.type !== 'session' || header.id !== expectId || typeof header.cwd !== 'string') return undefined
    return { frameEnd: newline === -1 ? buf.length : newline + 1, header }
  } catch {
    return undefined
  }
}

/** Read a bounded prefix and return its stored header, when readable. */
export async function readHeaderPrefix(dir, id, maxBytes = 8192) {
  const log = await currentLogFile(dir)
  if (log === undefined) return undefined
  let handle
  try {
    handle = await open(log.path, 'r')
    const buffer = Buffer.alloc(maxBytes)
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0)
    return readHeader(buffer.subarray(0, bytesRead), id)?.header
  } catch {
    return undefined
  } finally {
    await handle?.close().catch(() => {})
  }
}

/** Read a whole session log buffer plus its header. */
export async function readSessionLog(dir, id) {
  const log = await currentLogFile(dir)
  if (log === undefined) return undefined
  const buf = await readFile(log.path)
  const found = readHeader(buf, id)
  if (found === undefined) return undefined
  return { log, buf, header: found.header }
}

/** Re-encode a log's header with a new cwd, keeping every later byte. */
export function rewriteHeaderCwd(buf, newCwd, id) {
  const found = readHeader(buf, id)
  if (found === undefined) throw new SessionMngError('unreadable-header', `session log holds no readable header for "${id}"`, 422)
  const header = { ...found.header, cwd: newCwd }
  const line = Buffer.from(`${JSON.stringify(header)}\n`, 'utf8')
  let content
  if (buf.length >= 4 && buf.readUInt32LE(0) === ZSTD_MAGIC) {
    if (!zstdAvailable()) {
      throw new SessionMngError('unsupported-node', 'this Node build cannot compress Zstandard session logs', 501)
    }
    const frame = zlib.zstdCompressSync(line, { params: { [ZSTD_CHECKSUM_FLAG]: 1 } })
    content = Buffer.concat([frame, buf.subarray(found.frameEnd)])
  } else {
    content = Buffer.concat([line, buf.subarray(found.frameEnd)])
  }
  const check = readHeader(content, id)
  if (check === undefined || check.header.cwd !== newCwd) {
    throw new SessionMngError('rewrite-verify-failed', 'rewritten session log failed its own header re-read', 500)
  }
  return { content, header, frameEnd: check.frameEnd }
}

/** Write a file durably (fsync) and replace `path` with it. */
export async function replaceFileDurably(path, content, mode = 0o600) {
  const temp = `${path}.tmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  let handle
  try {
    handle = await open(temp, 'w', mode)
    await handle.writeFile(content)
    await handle.sync()
  } finally {
    await handle?.close().catch(() => {})
  }
  try {
    await rename(temp, path)
  } catch (error) {
    // Windows refuses to replace an open/existing target via rename in some
    // cases; the caller always holds a backup, so a remove+rename is safe.
    if (error?.code === 'EEXIST' || error?.code === 'EPERM' || error?.code === 'EACCES') {
      await rm(path, { force: true })
      await rename(temp, path)
    } else {
      await rm(temp, { force: true }).catch(() => {})
      throw error
    }
  }
}

/** Rename a directory, falling back to copy+remove across devices. */
export async function moveDirectory(source, destination) {
  await mkdir(dirname(destination), { recursive: true })
  try {
    await rename(source, destination)
    return
  } catch (error) {
    if (error?.code !== 'EXDEV') throw error
  }
  await cp(source, destination, { recursive: true, preserveTimestamps: true })
  await rm(source, { recursive: true, force: true })
}

/** Copy a directory tree. */
export async function copyDirectory(source, destination) {
  await mkdir(dirname(destination), { recursive: true })
  await cp(source, destination, { recursive: true, preserveTimestamps: true })
}

/** Recursively sum a directory's file bytes. */
export async function dirSize(dir) {
  let total = 0
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) total += await dirSize(path)
    else if (entry.isFile()) {
      try {
        total += (await stat(path)).size
      } catch {
        // A file that vanished mid-walk contributes nothing.
      }
    }
  }
  return total
}

/** A filesystem-safe temp-name fragment. */
export function safeSegment(value) {
  return String(value).replace(/[^A-Za-z0-9._-]/gu, '_').slice(0, 120)
}

/** Root of the store, derived from a session directory. */
export function rootOfSessionDir(dir) {
  return dirname(dirname(dir))
}

/**
 * Stage a move: park the source outside the store, copy it to the target, then
 * rewrite the target copy's header. The caller validates the result and either
 * finalizes or rolls back.
 *
 * @returns {Promise<{backupDir: string, targetDir: string, header: object, oldHeader: object, logName: string, bytes: number}>}
 */
export async function stageMove({ sourceDir, targetDir, tempRoot, id, newCwd }) {
  if (!(await isDirectory(sourceDir))) {
    throw new SessionMngError('not-found', `session directory no longer exists: ${sourceDir}`, 404)
  }
  if (await pathExists(targetDir)) {
    throw new SessionMngError('move-conflict', `destination already exists: ${targetDir}`, 409)
  }
  await mkdir(tempRoot, { recursive: true })
  const backupDir = join(
    tempRoot,
    `move-${safeSegment(id)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  )
  await moveDirectory(sourceDir, backupDir)
  try {
    await copyDirectory(backupDir, targetDir)
    const log = await currentLogFile(targetDir)
    if (log === undefined) throw new SessionMngError('unreadable-session', `copied session has no log: ${targetDir}`, 422)
    const buf = await readFile(log.path)
    const old = readHeader(buf, id)
    if (old === undefined) throw new SessionMngError('unreadable-header', `copied session log has no readable header: ${log.path}`, 422)
    const rewritten = rewriteHeaderCwd(buf, newCwd, id)
    await replaceFileDurably(log.path, rewritten.content, 0o600)
    return {
      backupDir,
      targetDir,
      header: rewritten.header,
      oldHeader: old.header,
      logName: log.name,
      bytes: rewritten.content.length,
    }
  } catch (error) {
    await rm(targetDir, { recursive: true, force: true }).catch(() => {})
    await moveDirectory(backupDir, sourceDir).catch(() => {})
    throw error
  }
}

/** Undo a staged move, restoring the original directory. */
export async function rollbackMove({ sourceDir, targetDir, backupDir }) {
  await rm(targetDir, { recursive: true, force: true }).catch(() => {})
  if ((await isDirectory(backupDir)) && !(await isDirectory(sourceDir))) {
    await moveDirectory(backupDir, sourceDir)
  }
}

/** Remove the parked original after a successful move. */
export async function finalizeMove(backupDir) {
  await rm(backupDir, { recursive: true, force: true })
}

/**
 * Stage a deletion: park every existing session directory outside the store.
 *
 * @param {{ dirs: {id: string, dir: string}[], tempRoot: string, batchId: string }} input
 * @returns {Promise<{id: string, from: string, to: string}[]>}
 */
export async function stageDelete({ dirs, tempRoot, batchId }) {
  await mkdir(tempRoot, { recursive: true })
  const staged = []
  try {
    for (const item of dirs) {
      if (!(await isDirectory(item.dir))) continue
      const to = join(
        tempRoot,
        `delete-${safeSegment(batchId)}-${safeSegment(item.id)}-${Math.random().toString(36).slice(2, 8)}`,
      )
      await moveDirectory(item.dir, to)
      staged.push({ id: item.id, from: item.dir, to })
    }
    return staged
  } catch (error) {
    await restoreStagedDelete(staged).catch(() => {})
    throw error
  }
}

/** Put staged deletion dirs back, best effort. */
export async function restoreStagedDelete(staged) {
  const failures = []
  for (const item of [...staged].reverse()) {
    try {
      if (await isDirectory(item.to)) {
        if (await pathExists(item.from)) {
          failures.push({ id: item.id, from: item.from, to: item.to, reason: 'original-path-occupied' })
          continue
        }
        await moveDirectory(item.to, item.from)
      }
    } catch (error) {
      failures.push({ id: item.id, from: item.from, to: item.to, reason: messageOf(error) })
    }
  }
  return failures
}

/** Permanently remove staged deletion dirs; returns what could not be removed. */
export async function removeStagedDelete(staged) {
  const leftovers = []
  for (const item of staged) {
    try {
      await rm(item.to, { recursive: true, force: true })
      if (await pathExists(item.to)) leftovers.push({ id: item.id, path: item.to, reason: 'still-exists' })
    } catch (error) {
      leftovers.push({ id: item.id, path: item.to, reason: messageOf(error) })
    }
  }
  return leftovers
}
