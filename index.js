/**
 * Host half of dsh-session-mng.
 *
 * One prefix route serves the Settings page's session listing and actions.
 * This plugin registers no model-visible tool, no title provider, and no
 * session event type: the session log stays the single source of truth, and
 * nothing is written before the user confirms an action.
 *
 * A deployment may mount this package more than once (a market copy beside the
 * profile's bundle row, or an HMR profile-patch reload re-applying the same
 * row). The webserver refuses a duplicate prefix route outright, and that
 * refusal fails the entry, so registration here is idempotent: the newest
 * mount takes the route over from the previous one instead of colliding.
 *
 * @module dsh-session-mng
 */

import { API_PREFIX, createApiHandler } from './lib/api.js'
import { createService, normalizeConfig } from './lib/service.js'

/** Plugin identity used by the loader (matches the row id in cordis.patch.yml). */
export const name = 'session-mng'

/** Host services this plugin needs; a profile without them leaves it unmounted. */
export const inject = [
  'webServer',
  'sessions',
  'sessionQuery',
  'sessionPersistence',
  'workspaceRegistry',
  'sessionTitle',
  'llm',
]

/** Process-wide handle of the live route registration. */
const ROUTE_HANDLE = Symbol.for('dsh-session-mng/route')

/** Process-wide marker so a duplicate mount is reported once, not per reload. */
const DUPLICATE_WARNED = Symbol.for('dsh-session-mng/duplicate-mount-warned')

/**
 * Whether one thrown registration error is this route's own duplicate-path
 * refusal. Only that refusal may be tolerated; every other failure must reach
 * the entry so a real misconfiguration is not hidden.
 */
function isOwnDuplicateRoute(error) {
  return (
    error instanceof Error &&
    /^webserver: duplicate (?:exact|prefix) route /u.test(error.message) &&
    error.message.includes(`"${API_PREFIX}"`)
  )
}

/** Best-effort warning; a logging failure must never fail a mount. */
function warnDuplicateMount(ctx) {
  if (globalThis[DUPLICATE_WARNED] === true) return
  globalThis[DUPLICATE_WARNED] = true
  try {
    ctx.logger?.warn?.(
      'session-mng: this plugin is mounted from more than one loader source; keeping one API route. Remove one of the two installs (the market copy or the profile bundle row).',
    )
  } catch {
    // A missing or throwing logger changes nothing about the route.
  }
}

/** Mount the one prefix route, tolerating a second mount of this same plugin. */
function mountRoute(ctx, handler) {
  const prior = globalThis[ROUTE_HANDLE]
  if (typeof prior === 'function') {
    globalThis[ROUTE_HANDLE] = undefined
    try {
      prior()
    } catch {
      // The previous registration was already released.
    }
    warnDuplicateMount(ctx)
  }

  let dispose
  try {
    dispose = ctx.webServer.register({ kind: 'prefix', path: API_PREFIX, handler })
  } catch (error) {
    if (!isOwnDuplicateRoute(error)) throw error
    // A route this plugin never recorded already serves the prefix; leave it
    // alone rather than failing the entry being mounted now.
    warnDuplicateMount(ctx)
    return () => {}
  }

  globalThis[ROUTE_HANDLE] = dispose
  return () => {
    // Ownership moved to a newer mount: deleting by path now would take the
    // successor's route down with it.
    if (globalThis[ROUTE_HANDLE] !== dispose) return
    globalThis[ROUTE_HANDLE] = undefined
    dispose()
  }
}

/**
 * Host plugin body: normalize config and mount the one API route.
 *
 * @param {object} ctx - host context providing the workspace/session services.
 * @param {object} [config] - optional row config.
 */
export function apply(ctx, config) {
  const resolved = normalizeConfig(config)
  const service = createService(ctx, resolved)

  // `webRuntime` owns the deployment's non-loopback trusted authorities. It is
  // absent in some compositions, where the fence then accepts loopback only.
  const trustedHosts = () => {
    try {
      const hosts = ctx.get('webRuntime')?.trustedHosts
      return Array.isArray(hosts) ? hosts : []
    } catch {
      return []
    }
  }

  const handler = createApiHandler({ ctx, config: resolved, service, trustedHosts })
  ctx.effect(() => mountRoute(ctx, handler), 'session-mng: API route')
  try {
    ctx.logger?.info?.('session-mng: mounted /session-mng/api')
  } catch {
    // Logging is optional.
  }
}
