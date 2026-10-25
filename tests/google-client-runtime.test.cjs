const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const ts = require('typescript')
const { google } = require('googleapis')
const logger = { info() {}, error() {}, warn() {}, debug() {} }

function fixture(t, respond) {
  for (const mod of [require('node:http'), require('node:https')]) {
    t.mock.method(mod, 'request', () => { throw Error('Unexpected external request') })
    t.mock.method(mod, 'get', () => { throw Error('Unexpected external request') })
  }
  t.mock.method(globalThis, 'fetch', () => { throw Error('Unexpected external fetch') })
  const client = new google.auth.OAuth2('fixture-client', 'fixture-secret', 'https://fixture.invalid/callback')
  client.setCredentials({ access_token: 'fixture-access', expiry_date: Date.now() + 3600000 })
  const requests = []
  client.transporter.defaults.fetchImplementation = async (url, options) => {
    const req = { url: new URL(url), method: options.method, body: options.body ? JSON.parse(options.body) : undefined }
    requests.push(req)
    const { status = 200, data = {} } = respond(req)
    return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
  }
  return { client, requests }
}
function load(name, client, overrides = {}) {
  const modules = {
    googleapis: { google }, 'date-fns': require('date-fns'),
    '@/lib/logger': { createLogger: () => logger },
    './oauth-client': { getAuthenticatedClient: async () => ({ client }) },
    '@/lib/google/oauth-client': { getAuthenticatedClient: async () => ({ client }) },
    ...overrides,
  }
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/google', name + '.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(source, { module, exports: module.exports, process: { env: {
    GOOGLE_CLIENT_ID: 'fixture-client', GOOGLE_CLIENT_SECRET: 'fixture-secret', NEXTAUTH_URL: 'https://fixture.invalid',
  } }, require: name => { assert.ok(Object.hasOwn(modules, name), name); return modules[name] } })
  return module.exports
}

test('Calendar service preserves pagination, cancelled filtering and Meet links with actual SDK', async t => {
  const f = fixture(t, req => ({ data: req.url.searchParams.has('pageToken') ? { items: [] } : {
    items: [
      { id: 'fixture-event', start: { dateTime: '2026-10-26T09:00:00Z' }, end: { dateTime: '2026-10-26T10:00:00Z' }, hangoutLink: 'https://meet.google.com/fixture-code' },
      { id: 'fixture-cancelled', status: 'cancelled' },
    ], nextPageToken: 'fixture-next',
  } }))
  const events = await load('calendar-service', f.client).fetchUpcomingEvents('fixture-user', 3)
  assert.equal(events.length, 1)
  assert.equal(events[0].meetLink, 'https://meet.google.com/fixture-code')
  assert.equal(f.requests.length, 2)
  assert.equal(f.requests[1].url.searchParams.get('pageToken'), 'fixture-next')
  assert.equal(f.requests[0].url.searchParams.get('singleEvents'), 'true')
  assert.equal(f.requests[0].url.searchParams.get('maxResults'), '100')
})

test('Drive service preserves shared-drive folder creation and parent update contracts offline', async t => {
  const f = fixture(t, req => ({ data: req.method === 'GET' ? { files: [] } : { id: 'fixture-folder' } }))
  const service = load('drive-service', f.client)
  assert.equal(await service.getOrCreateStudentFolder('fixture-user', 'fixture-parent', 'fixture-student'), 'fixture-folder')
  const create = f.requests.find(req => req.method === 'POST')
  assert.equal(create.body.name, 'fixture-student')
  assert.equal(create.body.parents[0], 'fixture-parent')
  assert.equal(create.url.searchParams.get('supportsAllDrives'), 'true')
  await service.moveFile('fixture-user', 'fixture-file', 'fixture-old', 'fixture-new')
  const move = f.requests.at(-1)
  assert.equal(move.method, 'PATCH')
  assert.equal(move.url.searchParams.get('addParents'), 'fixture-new')
  assert.equal(move.url.searchParams.get('removeParents'), 'fixture-old')
  assert.equal(move.url.searchParams.get('supportsAllDrives'), 'true')
})

test('Meet service keeps artifact PATCH body, skips already-enabled spaces and reports provider failure', async t => {
  let fail = false
  const f = fixture(t, () => fail ? { status: 403, data: { error: { message: 'fixture-denied' } } } : {
    data: { config: { artifactConfig: { recordingConfig: { autoRecordingGeneration: 'ON' }, transcriptionConfig: { autoTranscriptionGeneration: 'ON' } } } },
  })
  const service = load('meet-service', f.client)
  const result = await service.updateArtifactSettings('fixture-user', 'spaces/fixture', {})
  assert.equal(result.success, true)
  assert.equal(f.requests[0].method, 'PATCH')
  assert.equal(f.requests[0].url.searchParams.has('updateMask'), false)
  assert.equal(f.requests[0].body.config.artifactConfig.recordingConfig.autoRecordingGeneration, 'ON')
  assert.equal(Object.hasOwn(f.requests[0].body.config.artifactConfig, 'smartNotesConfig'), false)
  await service.updateArtifactSettings('fixture-user', 'spaces/fixture', {
    config: { artifactConfig: { recordingConfig: { autoRecordingGeneration: 'ON' }, transcriptionConfig: { autoTranscriptionGeneration: 'ON' } } },
  })
  assert.equal(f.requests.length, 1)
  fail = true
  assert.equal(await service.getMeetSpace('fixture-user', 'spaces/fixture'), null)
})

test('OAuth refresh service keeps encrypted persistence and expired status with real auth client', async t => {
  fixture(t, () => ({ data: {} })) // Block unexpected external I/O.
  let fail = false
  const updates = []
  const requests = []
  class OfflineOAuth extends google.auth.OAuth2 {
    constructor(...args) {
      super(...args)
      this.transporter.defaults.fetchImplementation = async (url, options) => {
        requests.push({ url: new URL(url), body: new URLSearchParams(options.body) })
        return new Response(JSON.stringify(fail ? { error: 'invalid_grant' } : {
          access_token: 'fixture-new-access', expires_in: 3600, token_type: 'Bearer',
        }), { status: fail ? 400 : 200, headers: { 'content-type': 'application/json' } })
      }
    }
  }
  const service = load('oauth-client', null, {
    googleapis: { google: { ...google, auth: { ...google.auth, OAuth2: OfflineOAuth } } },
    '@/lib/prisma': { prisma: { googleAccount: {
      findUnique: async () => ({ refreshTokenEnc: 'encrypted:fixture-refresh' }),
      update: async value => { updates.push(value); return value },
    } } },
    '@/lib/crypto/token-encrypt': { encrypt: value => 'encrypted:' + value, decrypt: value => value.slice('encrypted:'.length) },
    '@prisma/client': { GoogleAccountStatus: { ACTIVE: 'ACTIVE', TOKEN_EXPIRED: 'TOKEN_EXPIRED', REVOKED: 'REVOKED', ERROR: 'ERROR' } },
  })
  assert.equal(await service.refreshToken('fixture-user'), true)
  assert.equal(requests[0].body.get('grant_type'), 'refresh_token')
  assert.equal(requests[0].body.get('refresh_token'), 'fixture-refresh')
  assert.equal(updates[0].data.accessTokenEnc, 'encrypted:fixture-new-access')
  assert.equal(updates[0].data.status, 'ACTIVE')
  fail = true
  assert.equal(await service.refreshToken('fixture-user'), false)
  assert.equal(updates.at(-1).data.status, 'TOKEN_EXPIRED')
})
