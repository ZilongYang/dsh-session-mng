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
