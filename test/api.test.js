import test from 'node:test'
import assert from 'node:assert/strict'

import { createApiHandler } from '../lib/api.js'
import { isAllowedRequest, isTrustedApiRequest } from '../lib/fence.js'

function makeService(overrides = {}) {
  return {
    state: async () => ({ hello: true }),
    preview: async () => ({ messages: [] }),
    propose: async () => ({ title: 'x' }),
    applyTitle: async () => ({ title: 'x' }),
    archive: async () => ({ totals: {} }),
    unarchive: async () => ({ totals: {} }),
    deletePreview: async () => ({ roots: [] }),
    remove: async () => ({ totals: {} }),
    move: async () => ({ totals: {} }),
    overview: async () => ({ source: 'catalog', totals: {} }),
    sessions: async () => ({ source: 'catalog', rows: [] }),
    search: async () => ({ source: 'catalog', groups: [] }),
    session: async () => ({ row: {} }),
    blanks: async () => ({ unarchivedIds: [] }),
    sizes: async () => ({ total: { bytes: 0 } }),
    ...overrides,
  }
}

function makeHandler(options = {}) {
  return createApiHandler({
    ctx: { logger: { warn() {} } },
    config: { allowRemote: false, ...options.config },
    service: options.service ?? makeService(),
    trustedHosts: options.trustedHosts ?? (() => []),
  })
}

function mockResponse() {
  return {
    status: 0,
    body: '',
    writableEnded: false,
    writeHead(status) {
      this.status = status
    },
    end(chunk) {
      this.body += chunk ?? ''
      this.writableEnded = true
    },
  }
}

function mockRequest({ method = 'GET', url = '/session-mng/api/state', headers = {}, body = '' } = {}) {
  const payload = body === '' ? [] : [Buffer.from(body)]
  return {
    method,
    url,
    headers: { host: '127.0.0.1:53334', ...headers },
    async *[Symbol.asyncIterator]() {
      for (const chunk of payload) yield chunk
    },
  }
}

async function call(handler, request) {
  const response = mockResponse()
  await handler(request, response)
  return { status: response.status, body: response.body === '' ? undefined : JSON.parse(response.body) }
}

test('fence accepts loopback and refuses foreign or cross-site requests', () => {
  assert.equal(isTrustedApiRequest({ headers: { host: 'localhost:1' } }, []), true)
  assert.equal(isTrustedApiRequest({ headers: { host: '127.0.0.1:53334' } }, []), true)
  assert.equal(isTrustedApiRequest({ headers: { host: '[::1]:53334' } }, []), true)
  assert.equal(isTrustedApiRequest({ headers: { host: 'evil.example' } }, []), false)
  assert.equal(isTrustedApiRequest({ headers: { host: '127.0.0.1:1', 'sec-fetch-site': 'cross-site' } }, []), false)
  assert.equal(
    isTrustedApiRequest({ headers: { host: '127.0.0.1:1', origin: 'https://evil.example' } }, []),
    false,
  )
  assert.equal(
    isTrustedApiRequest({ headers: { host: '127.0.0.1:1', origin: 'http://127.0.0.1:1' } }, []),
    true,
  )
  assert.equal(isTrustedApiRequest({ headers: { host: 'trusted.example:1' } }, ['trusted.example']), true)
})

test('allowRemote widens the host check but keeps cross-site markers refused', () => {
  assert.equal(isAllowedRequest({ headers: { host: 'lan.example:1' } }, [], true), true)
  assert.equal(isAllowedRequest({ headers: { host: 'lan.example:1', 'sec-fetch-site': 'cross-site' } }, [], true), false)
  assert.equal(isAllowedRequest({ headers: { host: 'lan.example:1', origin: 'null' } }, [], true), false)
  assert.equal(isAllowedRequest({ headers: { host: 'lan.example:1', origin: 'http://lan.example:1' } }, [], true), true)
  assert.equal(isAllowedRequest({ headers: { host: 'lan.example:1' } }, [], false), false)
})

test('GET state returns the envelope', async () => {
  const result = await call(makeHandler(), mockRequest())
  assert.equal(result.status, 200)
  assert.deepEqual(result.body, { ok: true, value: { hello: true } })
})

test('foreign host is refused before any work', async () => {
  const result = await call(makeHandler(), mockRequest({ headers: { host: 'evil.example' } }))
  assert.equal(result.status, 403)
  assert.equal(result.body.error.code, 'forbidden')
})

test('cross-site origin is refused', async () => {
  const result = await call(
    makeHandler(),
    mockRequest({ headers: { origin: 'https://evil.example' } }),
  )
  assert.equal(result.status, 403)
})

test('unknown action and wrong method are rejected', async () => {
  const unknown = await call(
    makeHandler(),
    mockRequest({ method: 'POST', url: '/session-mng/api/nope', body: '{}' }),
  )
  assert.equal(unknown.status, 404)
  const wrongMethod = await call(
    makeHandler(),
    mockRequest({ method: 'GET', url: '/session-mng/api/preview' }),
  )
  assert.equal(wrongMethod.status, 405)
})

test('malformed JSON and oversized bodies are rejected', async () => {
  const malformed = await call(
    makeHandler(),
    mockRequest({ method: 'POST', url: '/session-mng/api/preview', body: '{' }),
  )
  assert.equal(malformed.status, 400)
  assert.equal(malformed.body.error.code, 'bad-request')

  const oversized = await call(
    makeHandler(),
    mockRequest({
      method: 'POST',
      url: '/session-mng/api/preview',
      headers: { 'content-length': '70000' },
      body: '{}',
    }),
  )
  assert.equal(oversized.status, 413)
  assert.equal(oversized.body.error.code, 'too-large')
})

test('a service failure keeps its code and status', async () => {
  const { SessionMngError } = await import('../lib/errors.js')
  const handler = makeHandler({
    service: makeService({
      preview: async () => {
        throw new SessionMngError('not-found', 'gone', 404)
      },
    }),
  })
  const result = await call(handler, mockRequest({ method: 'POST', url: '/session-mng/api/preview', body: '{}' }))
  assert.equal(result.status, 404)
  assert.deepEqual(result.body, { ok: false, error: { code: 'not-found', message: 'gone' } })
})

test('every 0.2.0 read route answers with the value envelope', async () => {
  const calls = []
  const record = (name) => async (params) => {
    calls.push({ name, params })
    return { route: name }
  }
  const handler = makeHandler({
    service: makeService({
      overview: record('overview'),
      sessions: record('sessions'),
      search: record('search'),
      session: record('session'),
      blanks: record('blanks'),
      sizes: record('sizes'),
    }),
  })
  const urls = [
    ['overview', '/session-mng/api/overview?subagents=1'],
    ['sessions', '/session-mng/api/sessions?workspaceId=a&tab=active&sort=title&offset=2&limit=10&subagents=1&blank=1&sizes=0'],
    ['search', '/session-mng/api/search?query=alpha&limitPerGroup=5'],
    ['session', '/session-mng/api/session?id=s1'],
    ['blanks', '/session-mng/api/blanks?subagents=1'],
    ['sizes', '/session-mng/api/sizes?workspaceId=all'],
  ]
  for (const [name, url] of urls) {
    const result = await call(handler, mockRequest({ url }))
    assert.equal(result.status, 200, `${name} status`)
    assert.deepEqual(result.body, { ok: true, value: { route: name } }, `${name} envelope`)
  }
  assert.deepEqual(calls.map((entry) => entry.name), ['overview', 'sessions', 'search', 'session', 'blanks', 'sizes'])
  assert.equal(calls[0].params.includeSubagents, true)
  assert.deepEqual(calls[1].params, {
    workspaceId: 'a',
    tab: 'active',
    sort: 'title',
    offset: '2',
    limit: '10',
    subagents: '1',
    blank: '1',
    sizes: '0',
    signal: calls[1].params.signal,
  })
  assert.equal(calls[2].params.query, 'alpha')
  assert.equal(calls[3].params.id, 's1')
  assert.equal(calls[4].params.includeSubagents, true)
  assert.equal(calls[5].params.workspaceId, 'all')
  assert.ok(calls[0].params.signal instanceof AbortSignal)
})

test('the legacy /state route is unchanged', async () => {
  const calls = []
  const handler = makeHandler({
    service: makeService({
      state: async (options) => {
        calls.push(options)
        return { hello: true }
      },
    }),
  })
  const bare = await call(handler, mockRequest({ url: '/session-mng/api' }))
  assert.deepEqual(bare.body, { ok: true, value: { hello: true } })
  const legacy = await call(handler, mockRequest({ url: '/session-mng/api/state?subagents=1' }))
  assert.deepEqual(legacy.body, { ok: true, value: { hello: true } })
  assert.equal(calls[0].includeSubagents, false)
  assert.equal(calls[1].includeSubagents, true)
})

test('read routes reject the wrong method and unknown paths', async () => {
  const handler = makeHandler()
  const wrongMethod = await call(handler, mockRequest({ method: 'POST', url: '/session-mng/api/overview', body: '{}' }))
  assert.equal(wrongMethod.status, 405)
  assert.equal(wrongMethod.body.error.code, 'method-error')
  const postOnSession = await call(handler, mockRequest({ method: 'POST', url: '/session-mng/api/session', body: '{}' }))
  assert.equal(postOnSession.status, 405)
  const unknownRead = await call(handler, mockRequest({ url: '/session-mng/api/nope' }))
  assert.equal(unknownRead.status, 404)
  assert.equal(unknownRead.body.error.code, 'not-found')
})

test('a read-route validation failure keeps its status and code', async () => {
  const { SessionMngError } = await import('../lib/errors.js')
  const handler = makeHandler({
    service: makeService({
      sessions: async () => {
        throw new SessionMngError('workspace-not-found', 'unknown workspace "ghost"', 404)
      },
    }),
  })
  const result = await call(handler, mockRequest({ url: '/session-mng/api/sessions?workspaceId=ghost' }))
  assert.equal(result.status, 404)
  assert.deepEqual(result.body, {
    ok: false,
    error: { code: 'workspace-not-found', message: 'unknown workspace "ghost"' },
  })
})

test('the fence protects the new read routes too', async () => {
  const handler = makeHandler()
  for (const url of ['/session-mng/api/overview', '/session-mng/api/sessions?workspaceId=a', '/session-mng/api/sizes']) {
    const result = await call(handler, mockRequest({ url, headers: { host: 'evil.example' } }))
    assert.equal(result.status, 403, url)
    assert.equal(result.body.error.code, 'forbidden')
  }
  const crossSite = await call(
    handler,
    mockRequest({ url: '/session-mng/api/overview', headers: { origin: 'https://evil.example' } }),
  )
  assert.equal(crossSite.status, 403)
})
