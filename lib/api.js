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

/** Budget for one read request: a catalog read plus, at worst, one size scan. */
const GET_TIMEOUT_MS = 20_000

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

/** Read one GET query string into a plain parameter object. */
function queryOf(url) {
  const params = {}
  for (const [key, value] of url.searchParams) {
    if (!Object.hasOwn(params, key)) params[key] = value
  }
  return params
}

/** One dispatch table entry. `needsBody` is false only for the read routes. */
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
 * The read surface. `/state` stays byte-compatible for 0.1.x clients; the
 * 0.2.0 routes serve the same data through a paginated, catalog-backed shape.
 * Each entry receives the parsed query object and one request signal.
 */
const GET_ROUTES = {
  state: (service, params, signal) =>
    service.state({ includeSubagents: params.subagents === '1', signal }),
  overview: (service, params, signal) =>
    service.overview({ includeSubagents: params.subagents === '1', signal }),
  sessions: (service, params, signal) => service.sessions({ ...params, signal }),
  search: (service, params, signal) => service.search({ ...params, signal }),
  session: (service, params, signal) => service.session({ ...params, signal }),
  blanks: (service, params, signal) =>
    service.blanks({ includeSubagents: params.subagents === '1', signal }),
  sizes: (service, params, signal) => service.sizes({ ...params, signal }),
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

      // A prefix route also answers the bare prefix; it means the legacy `/state`.
      const key = relative === '' ? 'state' : relative

      const readRoute = GET_ROUTES[key]
      if (readRoute !== undefined) {
        if (req.method !== 'GET') {
          sendJson(res, 405, { ok: false, error: { code: 'method-error', message: `${key} is GET-only` } })
          return
        }
        const value = await readRoute(service, queryOf(url), AbortSignal.timeout(GET_TIMEOUT_MS))
        sendJson(res, 200, { ok: true, value })
        return
      }

      const route = ROUTES[key]
      if (route === undefined) {
        sendJson(res, 404, { ok: false, error: { code: 'not-found', message: `unknown route "${key}"` } })
        return
      }

      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: { code: 'method-error', message: 'POST only' } })
        return
      }

      const body = await readJsonBody(req)
      // A closed connection cancels a read-only model call; destructive
      // operations are deliberately allowed to finish once admitted.
      const controller = new AbortController()
      if (key === 'title/propose') {
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
