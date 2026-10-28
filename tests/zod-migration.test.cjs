const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { z } = require('zod')

function load(file, schemaName) {
  let databaseCalls = 0
  let session = { user: { id: 'actor', role: 'ADMIN' } }
  const prisma = new Proxy({}, { get: () => new Proxy({}, { get: () => () => { databaseCalls++; throw Error('Invalid input must not reach database') } }) })
  const modules = {
    'next/server': { NextResponse: { json: (value, init) => Response.json(value, init) } },
    '@/lib/auth/permissions': { getAuthSession: async () => session },
    '@/lib/auth/auth.config': { auth: async () => session },
    '@/lib/prisma': { prisma }, '@prisma/client': { UserRole: { ADMIN: 'ADMIN', USER: 'USER' } },
    bcryptjs: {}, zod: { z }, 'node:crypto': require('node:crypto'),
  }
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8') + '\nexport const testSchema = ' + schemaName
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(js, { module, exports: module.exports, Response, console, process: { env: {} }, require: name => {
    assert.ok(Object.hasOwn(modules, name), name); return modules[name]
  } })
  return { route: module.exports, calls: () => databaseCalls, setSession: value => { session = value } }
}
const cases = [
  ['src/app/api/admin/instructors/route.ts', 'createSchema', 'POST',
    { name: 'Fixture', email: 'fixture+alias@example.invalid' }, [{}, { name: '', email: 'bad' }, { name: 'Fixture', email: 'fixture@example.invalid', role: 'ROOT' }]],
  ['src/app/api/admin/instructors/[id]/route.ts', 'patchSchema', 'PATCH',
    { isActive: false }, [{}, { isActive: 'true' }, { role: 'ROOT' }, []]],
  ['src/app/api/admin/settings/route.ts', 'updateSchema', 'PATCH',
    { transcriptionFolderUrl: null }, [{ transcriptionFolderUrl: 42 }, null, []]],
  ['src/app/api/auth/change-password/route.ts', 'changePasswordSchema', 'POST',
    { currentPassword: 'fixture-old', newPassword: 'fixture-new-password', confirmPassword: 'fixture-new-password' },
    [{}, { currentPassword: 'old', newPassword: 'short', confirmPassword: 'short' }, { currentPassword: 'old', newPassword: 'long-enough-password', confirmPassword: 'different' }]],
]
for (const [file, schema, method, valid, invalid] of cases) {
  test('Zod4 preserves valid input and returns 400 before DB for invalid input: ' + schema, async () => {
    const f = load(file, schema)
    assert.equal(f.route.testSchema.safeParse(valid).success, true)
    for (const body of invalid) {
      assert.equal(f.route.testSchema.safeParse(body).success, false)
      const response = await f.route[method]({ json: async () => body }, { params: Promise.resolve({ id: 'target' }) })
      assert.equal(response.status, 400)
      assert.equal(typeof (await response.json()).error, 'string')
    }
    assert.equal(f.calls(), 0)
    f.setSession(null)
    assert.ok([401, 403].includes((await f.route[method]({ json: async () => valid }, { params: Promise.resolve({ id: 'target' }) })).status))
    if (!file.includes('/auth/')) {
      f.setSession({ user: { id: 'actor', role: 'USER' } })
      assert.equal((await f.route[method]({ json: async () => valid }, { params: Promise.resolve({ id: 'target' }) })).status, 403)
    }
    assert.equal(f.calls(), 0)
  })
}
