/**
 * Keep the in-memory workspace registry in agreement with bytes we just moved
 * or deleted.
 *
 * Membership is derived from each session's stored header `cwd`, but the
 * registry caches headers and canonical paths at startup. After a cold move
 * the cached header still names the old cwd, so `attachSession` would reject
 * the just-moved session and the sidebar would keep filtering it out. Teaching
 * that cache the new truth first, then using the public entity mutators, keeps
 * both the ledger and the live projection correct without a restart.
 *
 * This is the one version-sensitive seam in the plugin. Every accessor is
 * feature-detected; when the shape is gone the caller refuses the operation
 * before touching bytes instead of leaving a half-moved session behind.
 *
 * @module dsh-session-mng/workspace-sync
 */

import { SessionMngError, messageOf } from './errors.js'

/** Whether the registry exposes everything a restart-free move needs. */
export function canReconcileMove(registry) {
  return (
    registry !== undefined &&
    registry !== null &&
    typeof registry.get === 'function' &&
    typeof registry.list === 'function' &&
    typeof registry.headers?.set === 'function' &&
    typeof registry.host?.rememberSessionPath === 'function'
  )
}

/** Find the workspace whose ledger currently accounts for `id`. */
export function findOwningWorkspace(registry, id) {
  if (typeof registry?.list !== 'function') return undefined
  for (const workspace of registry.list() ?? []) {
    if (Array.isArray(workspace?.sessionIds) && workspace.sessionIds.includes(id)) return workspace
    if (Array.isArray(workspace?.record?.sessionIds) && workspace.record.sessionIds.includes(id)) return workspace
  }
  return undefined
}

/** Find a workspace by its canonical directory path. */
export function findWorkspaceByPath(registry, path) {
  if (typeof registry?.list !== 'function') return undefined
  return (registry.list() ?? []).find((workspace) => workspace?.path === path)
}

/**
 * Point the registry cache at the moved header, then update the ledger through
 * the public entity API.
 *
 * @param {{registry: object, id: string, oldHeader: object, newHeader: object, source: object|undefined, target: object}} input
 */
export async function reconcileMove({ registry, id, oldHeader, newHeader, source, target }) {
  if (!canReconcileMove(registry)) {
    throw new SessionMngError(
      'unsupported-registry',
      'this DSH version no longer exposes the workspace header cache needed for a restart-free move',
      501,
      { dsh: '0.2.1-rc.2' },
    )
  }
  registry.headers.set(id, newHeader)
  registry.host.rememberSessionPath(id, target.path)
  try {
    registry.invalidSessionPaths?.delete?.(id)
    registry.missingSessionPaths?.delete?.(id)
  } catch {
    // Optional cache cleanup only.
  }
  await target.attachSession(id)
  if (source !== undefined && source.id !== target.id) await source.detachSession(id)
}

/**
 * Undo {@link reconcileMove} after a later step failed. Best effort: restoring
 * the bytes and the header cache is what makes a restart safe, even if a
 * ledger write cannot be undone here.
 */
export async function rollbackMoveReconcile({ registry, id, oldHeader, source, target, sourcePath }) {
  try {
    if (sourcePath !== undefined) registry?.headers?.set?.(id, oldHeader)
    if (sourcePath !== undefined) registry?.host?.rememberSessionPath?.(id, sourcePath)
    registry?.invalidSessionPaths?.delete?.(id)
    registry?.missingSessionPaths?.delete?.(id)
  } catch {
    // Cache restoration is best effort; the persisted header is the truth.
  }
  try {
    if (source?.id !== target?.id) await target?.detachSession?.(id)
  } catch {
    // A ledger row that cannot be removed is cleared by the next mutation.
  }
  try {
    if (source !== undefined && source.id === target.id) {
      // Same workspace: the ledger row was already there; nothing to re-add.
    } else if (source !== undefined) {
      await source.attachSession(id)
    }
  } catch {
    // The next registry mutation prunes and revalidates; do not mask the
    // original failure with a rollback failure.
  }
}

/**
 * Drop every trace of deleted sessions from the workspace registry.
 *
 * @param {{registry: object, records: {id: string, owner: object|undefined, archived: boolean}[]}} input
 * @returns {Promise<{id: string, error: string}[]>} failures
 */
export async function cleanupDeletedRegistry({ registry, records }) {
  const failures = []
  for (const record of records) {
    try {
      await registry.unarchiveSession(record.id)
    } catch (error) {
      failures.push({ id: record.id, step: 'unarchive', error: messageOf(error) })
    }
    if (record.owner !== undefined) {
      try {
        await record.owner.detachSession(record.id)
      } catch (error) {
        failures.push({ id: record.id, step: 'detach', error: messageOf(error) })
      }
    }
    try {
      registry.headers?.delete?.(record.id)
      registry.sessionPaths?.delete?.(record.id)
      registry.invalidSessionPaths?.delete?.(record.id)
      registry.missingSessionPaths?.delete?.(record.id)
    } catch {
      // Optional in-memory cache cleanup only.
    }
  }
  return failures
}

/**
 * Best-effort restoration after a staged deletion could not be completed.
 *
 * @param {{registry: object, records: {id: string, owner: object|undefined, archived: boolean}[]}} input
 */
export async function restoreDeletedRegistry({ registry, records }) {
  const failures = []
  for (const record of records) {
    if (record.owner !== undefined) {
      try {
        await record.owner.attachSession(record.id)
      } catch (error) {
        failures.push({ id: record.id, step: 'attach', error: messageOf(error) })
      }
    }
    if (record.archived) {
      try {
        await registry.archiveSession(record.id)
      } catch (error) {
        failures.push({ id: record.id, step: 'archive', error: messageOf(error) })
      }
    }
  }
  return failures
}
