const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const bcrypt = require('bcryptjs')
const crypto = require('node:crypto')

function fixture() {
  let session = { user: { id: 'fixture-admin', role: 'ADMIN' } }, exists = false
  const writes = [], audits = []; let auditFailure = false
  const modules = {
    'next/server': { NextResponse: { json: (v, o) => Response.json(v, o) } },
    '@/lib/auth/permissions': { getAuthSession: async () => session },
    '@/lib/prisma': { prisma: {
      user: { findUnique: async () => exists ? {} : null, create: async v => { writes.push(v); return { id: 'fixture-created', email: v.data.email } } },
      auditLog: { create: async v => { if (auditFailure) throw Error('fixture audit failure'); audits.push(v); return {} } },
      async $transaction(callback) {
        const size = writes.length
        try { return await callback(this) } catch (error) { writes.length = size; throw error }
      },
    } },
    '@prisma/client': { UserRole: { ADMIN: 'ADMIN', USER: 'USER' } },
    bcryptjs: bcrypt, 'node:crypto': crypto, zod: require('zod'),
  }
  const file = path.join(__dirname, '../src/app/api/admin/instructors/route.ts')
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(js, { module, exports: module.exports, Response, Date, require: name => { assert.ok(Object.hasOwn(modules, name), name); return modules[name] } })
  return { route: module.exports, writes, audits, setSession(v) { session = v }, duplicate() { exists = true }, failAudit() { auditFailure = true } }
}
const request = (role = 'USER') => ({ json: async () => ({ name: 'Fixture', email: 'fixture@example.invalid', role }) })

test('new USER and ADMIN accounts receive unique strong initial passwords; only hashes are persisted', async () => {
  const f = fixture(), passwords = []
  for (const role of ['USER', 'ADMIN']) {
    const response = await f.route.POST(request(role))
    assert.equal(response.status, 201)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    const body = await response.json()
    assert.match(body.initialPassword, /^[A-Za-z0-9_-]{32}$/)
    passwords.push(body.initialPassword)
    const stored = f.writes.at(-1).data
    assert.equal(stored.role, role)
    assert.equal(stored.mustChangePassword, true)
    assert.equal(await bcrypt.compare(body.initialPassword, stored.accounts.create.access_token), true)
    assert.equal(await bcrypt.compare('1111', stored.accounts.create.access_token), false)
    assert.equal(JSON.stringify(f.writes).includes(body.initialPassword), false)
    assert.equal(JSON.stringify(f.audits).includes(body.initialPassword), false)
    assert.equal(body.instructor.initialPassword, undefined)
  }
  assert.notEqual(passwords[0], passwords[1])
})

test('anonymous, non-admin, invalid, and duplicate requests receive no password and create nothing', async () => {
  for (const mode of ['anonymous', 'user', 'invalid', 'duplicate']) {
    const f = fixture()
    if (mode === 'anonymous') f.setSession(null)
    if (mode === 'user') f.setSession({ user: { role: 'USER' } })
    if (mode === 'duplicate') f.duplicate()
    const response = await f.route.POST(mode === 'invalid' ? { json: async () => ({}) } : request())
    assert.equal(response.status, { anonymous: 401, user: 403, invalid: 400, duplicate: 409 }[mode])
    assert.equal((await response.json()).initialPassword, undefined)
    assert.equal(f.writes.length, 0)
  }
})

test('audit failure rolls back account creation rather than losing its only password', async () => {
  const f = fixture(); f.failAudit()
  await assert.rejects(f.route.POST(request()), /fixture audit failure/)
  assert.equal(f.writes.length, 0)
})
