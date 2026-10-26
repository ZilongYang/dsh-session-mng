/**
 * HTTP surface of dsh-session-mng.
 *
 * The Client half is a browser module and cannot call Host services directly,
 * so one same-origin prefix route carries every operation. The route is
 * loopback/trusted-host fenced, body-bounded, and only accepts session ids and
 * workspace ids that the Host already knows.
 *
 * @module dsh-session-mng/api
 */

import { SessionMngError, toErrorPayload } from './errors.js'
import { isAllowedRequest } from './fence.js'

/** Exact prefix of this plugin's routes. */
export const API_PREFIX = '/session-mng/api'

/** Request body ceiling; these requests are tiny id lists or one title. */
const MAX_BODY_BYTES = 64 * 1024

/** Write one JSON response. */
function sendJson(res, status, body) {
  if (res.writableEnded) return
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload, 'utf8'),
    'cache-control': 'no-store',
  })
  res.end(payload)
}

/** Read one bounded JSON object body. */
async function readJsonBody(req) {
  const declared = Number(req.headers?.['content-length'] ?? 0)
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new SessionMngError('too-large', 'request body is too large', 413)
  }
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk)
    total += buffer.length
    if (total > MAX_BODY_BYTES) throw new SessionMngError('too-large', 'request body is too large', 413)
    chunks.push(buffer)
  }
  if (total === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  try {
    const value = JSON.parse(text)
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new SessionMngError('bad-request', 'request body must be a JSON object', 400)
    }
    return value
  } catch (error) {
    if (error instanceof SessionMngError) throw error
    throw new SessionMngError('bad-request', 'request body is not valid JSON', 400)
  }
}

/** One dispatch table entry. `needsBody` is false only for the state read. */
const ROUTES = {
  preview: { needsBody: true, run: (service, body) => service.preview(body.sessionId, body.count) },
  'title/propose': {
    needsBody: true,
    run: (service, body, signal) => service.propose(body.sessionId, signal),
  },
  'title/apply': { needsBody: true, run: (service, body) => service.applyTitle(body.sessionId, body.title) },
  archive: { needsBody: true, run: (service, body) => service.archive(body.sessionIds, body.stopActivity === true) },
  unarchive: { needsBody: true, run: (service, body) => service.unarchive(body.sessionIds) },
  'delete/preview': { needsBody: true, run: (service, body) => service.deletePreview(body.sessionIds) },
  delete: { needsBody: true, run: (service, body) => service.remove(body.sessionIds, body.confirm) },
  move: { needsBody: true, run: (service, body) => service.move(body.sessionIds, body.workspaceId) },
}

/**
 * Build the Node request handler for the plugin's prefix route.
 *
 * @param {{ ctx: object, config: object, service: object, trustedHosts: () => readonly string[] }} input
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>}
 */
export function createApiHandler({ ctx, config, service, trustedHosts }) {
  return async function handler(req, res) {
    try {
      if (!isAllowedRequest(req, trustedHosts(), config.allowRemote)) {
        sendJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'this route serves loopback or trusted hosts only' } })
        return
      }

      const url = new URL(req.url ?? '/', 'http://localhost')
      const relative = url.pathname.startsWith(API_PREFIX)
        ? url.pathname.slice(API_PREFIX.length).replace(/^\/+/u, '').replace(/\/+$/u, '')
        : undefined
      if (relative === undefined) {
        sendJson(res, 404, { ok: false, error: { code: 'not-found', message: 'unknown route' } })
        return
      }

      if (relative === '' || relative === 'state') {
        if (req.method !== 'GET') {
          sendJson(res, 405, { ok: false, error: { code: 'method-error', message: 'state is GET-only' } })
          return
        }
        const includeSubagents = url.searchParams.get('subagents') === '1'
        const value = await service.state({ includeSubagents, signal: AbortSignal.timeout(20_000) })
        sendJson(res, 200, { ok: true, value })
        return
      }

      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: { code: 'method-error', message: 'POST only' } })
        return
      }

      const route = ROUTES[relative]
      if (route === undefined) {
        sendJson(res, 404, { ok: false, error: { code: 'not-found', message: `unknown action "${relative}"` } })
        return
      }

      const body = await readJsonBody(req)
      // A closed connection cancels a read-only model call; destructive
      // operations are deliberately allowed to finish once admitted.
      const controller = new AbortController()
      if (relative === 'title/propose') {
        res.on('close', () => {
          if (!res.writableEnded) controller.abort()
        })
      }
      const value = await route.run(service, body, controller.signal)
      sendJson(res, 200, { ok: true, value })
    } catch (error) {
      const payload = toErrorPayload(error)
      if (payload.code !== 'forbidden' && payload.code !== 'bad-request' && payload.code !== 'too-large') {
        try {
          ctx.logger?.warn?.(`session-mng: request failed (${payload.code})`)
        } catch {
          // Logging must never mask the response.
        }
      }
      sendJson(res, payload.status, {
        ok: false,
        error: {
          code: payload.code,
          message: payload.message,
          ...(payload.details === undefined ? {} : { details: payload.details }),
        },
      })
    }
  }
}
