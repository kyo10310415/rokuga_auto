const test = require('node:test')
const assert = require('node:assert/strict')

test('patched Auth.js rejects malformed Bearer tokens without throwing', async () => {
  const { getToken } = await import('next-auth/jwt')
  for (const value of ['%', '%E0%A4%A', 'not-a-jwt']) {
    const token = await getToken({ req: new Request('https://fixture.invalid/', { headers: { authorization: `Bearer ${value}` } }), secret: 'fixture-only-test-secret' })
    assert.equal(token, null)
  }
})

test('real Auth.js JWT session round trip retains identity and authorization claims', async () => {
  const { encode, decode, getToken } = await import('next-auth/jwt')
  const secret = 'fixture-only-test-secret'
  const salt = 'authjs.session-token'
  const encrypted = await encode({ secret, salt, token: { sub: 'fixture-user', role: 'ADMIN', mustChangePassword: true }, maxAge: 86400 })
  const token = await decode({ secret, salt, token: encrypted })
  assert.equal(token.sub, 'fixture-user')
  assert.equal(token.role, 'ADMIN')
  assert.equal(token.mustChangePassword, true)
  const req = new Request('https://fixture.invalid/', { headers: { cookie: `${salt}=${encrypted}` } })
  assert.equal((await getToken({ req, secret, cookieName: salt, salt })).sub, 'fixture-user')
  const secureSalt = '__Secure-authjs.session-token'
  const secureToken = await encode({ secret, salt: secureSalt, token: { sub: 'fixture-user', role: 'INSTRUCTOR' } })
  const secureRequest = new Request('https://fixture.invalid/', { headers: { cookie: `${secureSalt}=${secureToken}` } })
  assert.equal((await getToken({ req: secureRequest, secret, secureCookie: true })).role, 'INSTRUCTOR')
  assert.equal(await decode({ secret: 'different-fixture-secret', salt, token: encrypted }).catch(() => null), null)
})
