const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function load(file, modules) {
  const module = { exports: {} }
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText
  vm.runInNewContext(js, {
    module, exports: module.exports, process: { env: {} }, console,
    URL, require(name) { if (!(name in modules)) throw Error('Unexpected dependency: ' + name); return modules[name] },
  }, { filename: file })
  return module.exports
}

function fixture() {
  const state = {
    user: { id: 'member-1', role: 'ADMIN', isActive: true, mustChangePassword: false },
    reads: 0, protectedReads: 0, failure: false,
  }
  const prisma = {
    user: { async findUnique(query) {
      state.reads++
      assert.equal(query.where.id, 'member-1')
      if (state.failure) throw Error('DB unavailable')
      return state.user
    } },
    auditLog: {
      async findMany() { state.protectedReads++; return [] },
      async count() { return 0 },
    },
  }
  let config
  const membership = load('src/lib/auth/current-membership.ts', {})
  load('src/lib/auth/auth.config.ts', {
    'next-auth': options => { config = options; return {} },
    '@auth/prisma-adapter': { PrismaAdapter: () => ({}) },
    'next-auth/providers/google': () => ({}),
    'next-auth/providers/credentials': options => options,
    '@/lib/prisma': { prisma }, './current-membership': membership,
    'bcryptjs': {}, zod: {},
  })
  const oldToken = { id: 'member-1', role: 'ADMIN', mustChangePassword: false }
  async function getAuthSession() {
    const token = await config.callbacks.jwt({ token: oldToken })
    return token ? config.callbacks.session({ session: { user: {} }, token }) : null
  }
  const route = load('src/app/api/admin/audit-logs/route.ts', {
    'next/server': { NextResponse: { json: (value, init) => Response.json(value, init) } },
    '@/lib/auth/permissions': { getAuthSession }, '@/lib/prisma': { prisma },
    '@prisma/client': { UserRole: { ADMIN: 'ADMIN', USER: 'USER' } },
  })
  return { state, config, getAuthSession, oldToken, route }
}

test('current active member retains legitimate session and admin read', async () => {
  const f = fixture()
  const r = await f.route.GET({ url: 'https://example.test/api/admin/audit-logs' })
  assert.equal(r.status, 200)
  assert.equal(f.state.reads, 1)
  assert.equal(f.state.protectedReads, 1)
})

for (const change of ['deleted', 'disabled', 'demoted', 'unknown-role']) {
  test(`existing administrator token cannot read after ${change}`, async () => {
    const f = fixture()
    assert.equal((await f.getAuthSession()).user.role, 'ADMIN')
    if (change === 'deleted') f.state.user = null
    else if (change === 'disabled') f.state.user.isActive = false
    else f.state.user.role = change === 'demoted' ? 'USER' : 'UNKNOWN'
    const r = await f.route.GET({ url: 'https://example.test/api/admin/audit-logs' })
    assert.equal(r.status, change === 'demoted' ? 403 : 401)
    assert.equal(f.state.reads, 2)
    assert.equal(f.state.protectedReads, 0)
    assert.equal(f.oldToken.role, 'ADMIN') // The original signed claims cannot override DB state.
  })
}

test('current role and password-change flag refresh even without update trigger', async () => {
  const f = fixture()
  f.state.user.role = 'USER'
  f.state.user.mustChangePassword = true
  const session = await f.getAuthSession()
  assert.equal(session.user.role, 'USER')
  assert.equal(session.user.mustChangePassword, true)
})

test('sign-in and client update both reject disabled users', async () => {
  const f = fixture()
  f.state.user.isActive = false
  assert.equal(await f.config.callbacks.jwt({ token: f.oldToken, user: { id: 'member-1', role: 'ADMIN' } }), null)
  assert.equal(await f.config.callbacks.jwt({ token: f.oldToken, trigger: 'update', session: { role: 'ADMIN', isActive: true } }), null)
})

test('DB failures never fall back to previous JWT role', async () => {
  const f = fixture()
  f.state.failure = true
  await assert.rejects(f.getAuthSession(), /DB unavailable/)
  assert.equal(f.state.protectedReads, 0)
})

test('token without a valid subject is rejected before DB access', async () => {
  const f = fixture()
  for (const id of [undefined, null, '', 42]) {
    assert.equal(await f.config.callbacks.jwt({ token: { id, role: 'ADMIN' } }), null)
  }
  assert.equal(f.state.reads, 0)
})
