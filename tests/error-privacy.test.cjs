const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const marker = 'synthetic-private-provider-detail'
const noopLog = { info() {}, warn() {}, error() {} }
function load(file, modules, env = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(source, { module, exports: module.exports, Error, URL, Date, process: { env }, require: name => {
    assert.ok(Object.hasOwn(modules, name), name); return modules[name]
  } })
  return module.exports
}
test('real Pino output omits Error message/stack/config and child error bindings', () => {
  let output = ''
  const sink = { write(value) { output += value } }
  const mod = load('src/lib/logger/index.ts', { pino: { default: options => require('pino')(options, sink) } }, { NODE_ENV: 'production' })
  const error = Object.assign(new Error(marker), { config: { headers: { Authorization: marker }, data: marker } })
  mod.logger.error({ err: error, error }, 'fixture-operation-failed')
  mod.logger.error(error)
  mod.createLogger({ err: error }).error('fixture-child-failed')
  assert.ok(output.includes('fixture-operation-failed'))
  assert.ok(output.includes('fixture-child-failed'))
  assert.ok(!output.includes(marker))
})
for (const route of ['move-files', 'pre-check', 'scan-events']) {
  test('internal ' + route + ' hides provider errors and retains authentication', async () => {
    let calls = 0
    const fail = async () => { calls++; throw new Error(marker) }
    const mod = load('src/app/api/internal/' + route + '/route.ts', {
      'next/server': { NextResponse: { json: (value, init) => Response.json(value, init) } },
      '@/lib/logger': { createLogger: () => noopLog },
      '@/lib/google/file-moving-engine': { runFileMoveForAllUsers: fail },
      '@/lib/google/correction-engine': { runPreCheckJobs: fail, scanAndQueueJobs: fail, executePendingJobs: fail, cleanupOldCorrectionJobs: fail },
    }, { INTERNAL_API_KEY: 'fixture-internal' })
    assert.equal((await mod.POST({ headers: new Headers() })).status, 401)
    assert.equal(calls, 0)
    const response = await mod.POST({ headers: new Headers({ Authorization: 'Bearer fixture-internal' }) })
    assert.equal(response.status, 500)
    assert.ok(!(await response.text()).includes(marker))
    assert.equal(calls, 1)
  })
}
test('OAuth callback redirect hides token-exchange error details', async () => {
  const mod = load('src/app/api/google/callback/route.ts', {
    'next/server': require('next/server'),
    '@/lib/logger': { createLogger: () => noopLog },
    '@/lib/google/oauth-client': { createOAuthClient: () => ({ getToken: async () => { throw new Error(marker) } }), GOOGLE_SCOPES: [] },
    '@/lib/auth/permissions': { getAuthSession: async () => ({ user: { id: 'fixture-user' } }) },
    '@/lib/google/oauth-flow': { flowCookieOptions: () => ({ name: 'fixture-flow' }), verifyOAuthFlow: () => ({ verifier: 'fixture-verifier' }) },
    '@/lib/prisma': { prisma: { user: { findUnique: async () => ({ id: 'fixture-user' }) } } },
    '@/lib/crypto/token-encrypt': { encrypt: () => { throw Error('Must not encrypt') } },
    '@prisma/client': {}, googleapis: {},
  }, { NEXTAUTH_URL: 'https://fixture.invalid' })
  const response = await mod.GET({ url: 'https://fixture.invalid/api/google/callback?code=fixture-code&state=fixture-user', cookies: { get: () => ({ value: 'fixture-cookie' }) } })
  const location = response.headers.get('location')
  assert.equal(new URL(location).searchParams.get('error'), 'connection_failed')
  assert.ok(!location.includes(marker))
})
for (const attempt of [1, 3]) {
  test('correction failure retains retry/status but stores no provider detail: attempt ' + attempt, async () => {
    const updates = []
    const job = { id: 'fixture-job', userId: 'fixture-user', calendarEventId: 'fixture-event', attemptCount: attempt, maxAttempts: 3,
      calendarEvent: { meetLink: 'https://meet.google.com/fixture-code' } }
    const mod = load('src/lib/google/correction-engine.ts', {
      '@/lib/prisma': { prisma: { correctionJob: { update: async value => { updates.push(value); return job } }, calendarEvent: { update: async () => ({}) } } },
      '@/lib/google/calendar-service': {},
      '@/lib/google/meet-service': { getMeetSpaceByLink: async () => { throw new Error(marker) } },
      '@/lib/logger': { createLogger: () => noopLog },
      '@prisma/client': { JobStatus: { RUNNING: 'RUNNING', RETRYING: 'RETRYING', PENDING: 'PENDING', FAILED: 'FAILED' }, DetectionStatus: {}, JobType: {}, GoogleAccountStatus: {} },
      'date-fns': require('date-fns'),
    })
    assert.equal(await mod.executeJob('fixture-job'), false)
    assert.ok(!JSON.stringify(updates).includes(marker))
    if (attempt < 3) {
      assert.equal(updates[1].data.status, 'RETRYING')
      assert.equal(updates[2].data.status, 'PENDING')
      assert.ok(updates[1].data.nextRetryAt instanceof Date)
    } else assert.equal(updates[1].data.status, 'FAILED')
    assert.equal(Object.hasOwn(updates[1].data.errorDetail, 'err'), false)
  })
}
