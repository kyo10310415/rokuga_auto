const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const crypto = require('node:crypto')
const ts = require('typescript')
const next = require('next/server')
const env = { AUTH_SECRET: crypto.randomBytes(48).toString('hex'), NEXTAUTH_URL: 'https://fixture.invalid', GOOGLE_CLIENT_ID: 'fixture-client', GOOGLE_CLIENT_SECRET: 'fixture-secret' }
function load(file, modules = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(source, { module, exports: module.exports, Buffer, URL, Date, process: { env }, require: name => {
    if (name === 'node:crypto') return crypto
    assert.ok(Object.hasOwn(modules, name), name); return modules[name]
  } })
  return module.exports
}
const flow = load('src/lib/google/oauth-flow.ts')
function fixture() {
  let user = { id: 'fixture-user' }, exchanges = 0, writes = [], denyScopes = false, failExchange = false
  const modules = {
    'next/server': next, '@/lib/auth/permissions': { getAuthSession: async () => user ? { user } : null },
    '@/lib/google/oauth-flow': flow, '@/lib/logger': { createLogger: () => ({ info() {}, warn() {}, error() {} }) },
    '@/lib/crypto/token-encrypt': { encrypt: value => 'encrypted:' + value },
    '@prisma/client': { GoogleAccountStatus: { ACTIVE: 'ACTIVE' } },
    '@/lib/prisma': { prisma: {
      user: { findUnique: async () => user },
      googleAccount: { findUnique: async () => null, upsert: async value => { writes.push(value); return {} } },
      auditLog: { create: async () => ({}) },
    } },
    googleapis: { google: { oauth2: () => ({ userinfo: { get: async () => ({ data: { email: 'fixture@example.invalid', id: 'fixture-google' } }) } }) } },
    '@/lib/google/oauth-client': {
      GOOGLE_SCOPES: ['scope-fixture'],
      getAuthUrl: (state, challenge) => `https://accounts.example/authorize?state=${state}&code_challenge=${challenge}&code_challenge_method=S256`,
      createOAuthClient: () => ({ setCredentials() {}, getToken: async options => {
        exchanges++
        assert.equal(options.code, 'fixture-code')
        assert.equal(typeof options.codeVerifier, 'string')
        if (failExchange) throw Error('fixture-private-token-error')
        return { tokens: { access_token: 'fixture-access', refresh_token: 'fixture-refresh', scope: denyScopes ? '' : 'scope-fixture', expiry_date: Date.now() + 3600000 } }
      } }),
    },
  }
  const connect = load('src/app/api/google/connect/route.ts', modules)
  const callback = load('src/app/api/google/callback/route.ts', modules)
  return {
    connect, callback, writes, exchanges: () => exchanges,
    setUser(value) { user = value }, denyScopes() { denyScopes = true }, failExchange() { failExchange = true },
  }
}
function request(state, cookie) {
  return new next.NextRequest('https://fixture.invalid/api/google/callback?code=fixture-code&state=' + state,
    { headers: cookie ? { cookie: `${flow.flowCookieOptions().name}=${cookie}` } : {} })
}
test('flow rejects forgery, expiry, future timestamp and another user', () => {
  const value = flow.issueOAuthFlow('fixture-user')
  assert.ok(flow.verifyOAuthFlow(value.cookie, value.state, 'fixture-user'))
  assert.equal(flow.verifyOAuthFlow(value.cookie, value.state, 'other-user'), null)
  assert.equal(flow.verifyOAuthFlow(value.cookie, flow.issueOAuthFlow('fixture-user').state, 'fixture-user'), null)
  assert.equal(flow.verifyOAuthFlow(value.cookie + 'x', value.state, 'fixture-user'), null)
  assert.equal(flow.verifyOAuthFlow(value.cookie, value.state, 'fixture-user', Date.now() + 601000), null)
  const future = flow.issueOAuthFlow('fixture-user', Date.now() + 60000)
  assert.equal(flow.verifyOAuthFlow(future.cookie, future.state, 'fixture-user'), null)
})
test('connect issues fresh state and private callback cookie; anonymous start is denied', async () => {
  const f = fixture()
  const response = await f.connect.GET()
  const url = new URL(response.headers.get('location'))
  const cookie = response.cookies.get(flow.flowCookieOptions().name).value
  const verified = flow.verifyOAuthFlow(cookie, url.searchParams.get('state'), 'fixture-user')
  assert.ok(verified)
  assert.equal(crypto.createHash('sha256').update(verified.verifier).digest('base64url'), url.searchParams.get('code_challenge'))
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  const setCookie = response.headers.get('set-cookie')
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=lax', 'Max-Age=600', 'Path=/api/google/callback']) assert.ok(setCookie.includes(attribute))
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const second = await f.connect.GET()
  assert.notEqual(url.searchParams.get('state'), new URL(second.headers.get('location')).searchParams.get('state'))
  f.setUser(null)
  assert.equal((await f.connect.GET()).status, 401)
})
test('cross-user, missing-cookie and old user-ID callbacks cannot exchange tokens or write', async () => {
  for (const mode of ['cross-user', 'missing-cookie', 'old-state', 'anonymous']) {
    const f = fixture(), value = flow.issueOAuthFlow('fixture-user')
    if (mode === 'cross-user') f.setUser({ id: 'other-user' })
    if (mode === 'anonymous') f.setUser(null)
    const response = await f.callback.GET(request(mode === 'old-state' ? 'fixture-user' : value.state, mode === 'missing-cookie' ? undefined : value.cookie))
    assert.equal(f.exchanges(), 0, mode)
    assert.equal(f.writes.length, 0, mode)
    assert.ok(response.headers.get('set-cookie').includes('Max-Age=0'))
  }
})
test('normal callback uses session owner and PKCE, then clears cookie; browser replay is denied', async () => {
  const f = fixture(), value = flow.issueOAuthFlow('fixture-user')
  const response = await f.callback.GET(request(value.state, value.cookie))
  assert.equal(new URL(response.headers.get('location')).searchParams.get('success'), 'google_connected')
  assert.equal(f.exchanges(), 1)
  assert.equal(f.writes[0].where.userId, 'fixture-user')
  assert.equal(f.writes[0].create.accessTokenEnc, 'encrypted:fixture-access')
  assert.ok(response.headers.get('set-cookie').includes('Max-Age=0'))
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
  await f.callback.GET(request(value.state))
  assert.equal(f.exchanges(), 1)
})
test('scope rejection and provider failure do not persist linkage or disclose details', async () => {
  for (const mode of ['scopes', 'provider']) {
    const f = fixture(), value = flow.issueOAuthFlow('fixture-user')
    if (mode === 'scopes') f.denyScopes(); else f.failExchange()
    const response = await f.callback.GET(request(value.state, value.cookie))
    assert.equal(f.writes.length, 0)
    assert.ok(!response.headers.get('location').includes('fixture-private-token-error'))
    assert.ok(response.headers.get('set-cookie').includes('Max-Age=0'))
  }
})

test('actual Google SDK encodes S256 and sends the matching verifier in token exchange', async t => {
  for (const mod of [require('node:http'), require('node:https')]) {
    t.mock.method(mod, 'request', () => { throw Error('Unexpected external request') })
    t.mock.method(mod, 'get', () => { throw Error('Unexpected external request') })
  }
  t.mock.method(globalThis, 'fetch', () => { throw Error('Unexpected external fetch') })
  const service = load('src/lib/google/oauth-client.ts', {
    googleapis: require('googleapis'), '@/lib/prisma': {}, '@/lib/crypto/token-encrypt': {}, '@prisma/client': {},
    '@/lib/logger': { createLogger: () => ({ info() {}, warn() {}, error() {} }) },
  })
  const value = flow.issueOAuthFlow('fixture-user')
  const url = new URL(service.getAuthUrl(value.state, value.challenge))
  assert.equal(url.searchParams.get('state'), value.state)
  assert.equal(url.searchParams.get('code_challenge'), value.challenge)
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(url.searchParams.get('redirect_uri'), 'https://fixture.invalid/api/google/callback')
  const client = service.createOAuthClient()
  let body
  client.transporter.defaults.fetchImplementation = async (url, options) => {
    assert.equal(new URL(url).hostname, 'oauth2.googleapis.com')
    body = new URLSearchParams(options.body)
    return new Response(JSON.stringify({ access_token: 'fixture-token', expires_in: 3600 }), { headers: { 'content-type': 'application/json' } })
  }
  const verified = flow.verifyOAuthFlow(value.cookie, value.state, 'fixture-user')
  await client.getToken({ code: 'fixture-code', codeVerifier: verified.verifier })
  assert.equal(body.get('code_verifier'), verified.verifier)
})
