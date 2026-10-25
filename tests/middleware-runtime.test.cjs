const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const ts = require('typescript')

test('Next16 middleware preserves anonymous, secure-cookie and password-change redirects', async () => {
  const jwt = await import('next-auth/jwt')
  const next = require('next/server')
  const secret = require('node:crypto').randomBytes(48).toString('hex')
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', 'src/middleware.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(source, { module, exports: module.exports, URL, process: { env: { AUTH_SECRET: secret } }, require: name => {
    if (name === 'next/server') return next
    if (name === 'next-auth/jwt') return jwt
    throw Error(name)
  } })
  const middleware = module.exports.middleware
  const call = cookie => middleware(new next.NextRequest('https://fixture.invalid/admin', { headers: cookie ? { cookie } : {} }))
  assert.equal(new URL((await call()).headers.get('location')).pathname, '/login')
  const salt = '__Secure-authjs.session-token'
  const token = await jwt.encode({ secret, salt, token: { sub: 'fixture-user', role: 'ADMIN', mustChangePassword: false } })
  const permitted = await call(salt + '=' + token)
  assert.equal(permitted.headers.get('x-middleware-next'), '1')
  const changed = await jwt.encode({ secret, salt, token: { sub: 'fixture-user', role: 'ADMIN', mustChangePassword: true } })
  assert.equal(new URL((await call(salt + '=' + changed)).headers.get('location')).pathname, '/change-password')
  const forged = await jwt.encode({ secret: 'different-test-only-secret', salt, token: { sub: 'fixture-user', role: 'ADMIN' } })
  assert.equal(new URL((await call(salt + '=' + forged)).headers.get('location')).pathname, '/login')
})
