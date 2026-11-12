const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const logger = { info() {}, warn() {}, error() {}, debug() {} }

function loadTypeScript(file, modules) {
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    Date,
    process: { env: {} },
    require(name) {
      assert.ok(Object.hasOwn(modules, name), name)
      return modules[name]
    },
  })
  return module.exports
}

function loadClassifiers() {
  return loadTypeScript('src/lib/google/drive-service.ts', {
    googleapis: { google: {} },
    '@/lib/google/oauth-client': {},
    '@/lib/logger': { createLogger: () => logger },
  })
}

function loadEngine(files, moves) {
  const classifiers = loadClassifiers()
  const driveService = {
    ...classifiers,
    getMeetSourceFolders: async () => [{
      id: 'fixture-source-folder',
      name: 'fixture-source-folder',
      sourceRootId: 'fixture-root',
      ownedFilesOnly: false,
    }],
    getFilesInFolder: async () => files,
    deleteFolderIfEmpty: async () => false,
    getOrCreateYearMonthFolder: async () => 'fixture-year-month-folder',
    getOrCreateStudentFolder: async () => { throw new Error('Unexpected student folder lookup') },
    moveFile: async (_userId, fileId, _currentParentId, destinationFolderId) => {
      moves.push({ fileId, destinationFolderId })
    },
  }

  return loadTypeScript('src/lib/google/file-moving-engine.ts', {
    '@/lib/prisma': { prisma: { calendarEvent: { findMany: async () => [] } } },
    '@prisma/client': { GoogleAccountStatus: { ACTIVE: 'ACTIVE' } },
    '@/lib/logger': { createLogger: () => logger },
    '@/lib/google/drive-service': driveService,
  })
}

test('special keywords move recordings and Gemini notes directly and take priority', async () => {
  const moves = []
  const engine = loadEngine([
    {
      id: 'fixture-overlap',
      name: 'レッスン 1on1 - 2026/11/12 10:00 JST～Recording',
      parents: ['fixture-source-folder'],
    },
    {
      id: 'fixture-special-note',
      name: 'チームMTG - 2026/11/12 10:00 JST - Gemini によるメモ',
      parents: ['fixture-source-folder'],
    },
    {
      id: 'fixture-standard',
      name: 'WannaVレッスン予約 - 2026/11/12 10:00 JST～Recording',
      parents: ['fixture-source-folder'],
    },
  ], moves)

  const result = await engine.runFileMoveForUser(
    'fixture-user',
    'fixture-recording-folder-1234567890',
    null,
    null,
    'fixture-special-folder-12345678901'
  )

  assert.deepEqual(moves, [
    { fileId: 'fixture-overlap', destinationFolderId: 'fixture-special-folder-12345678901' },
    { fileId: 'fixture-special-note', destinationFolderId: 'fixture-special-folder-12345678901' },
    { fileId: 'fixture-standard', destinationFolderId: 'fixture-year-month-folder' },
  ])
  assert.equal(result.recordingsMoved, 2)
  assert.equal(result.transcriptionsMoved, 1)
  assert.equal(result.errors, 0)
})

test('special files do not fall back to existing destinations when the new URL is empty', async () => {
  const moves = []
  const engine = loadEngine([{
    id: 'fixture-overlap',
    name: 'レッスン 1on1 - 2026/11/12 10:00 JST～Recording',
    parents: ['fixture-source-folder'],
  }], moves)

  const result = await engine.runFileMoveForUser(
    'fixture-user',
    'fixture-recording-folder-1234567890',
    null,
    null,
    null
  )

  assert.deepEqual(moves, [])
  assert.equal(result.skipped, 1)
  assert.equal(result.recordingsMoved, 0)
  assert.equal(result.errors, 0)
})

test('special destination works independently when the existing recording destination is empty', async () => {
  const moves = []
  const engine = loadEngine([{
    id: 'fixture-special-only',
    name: 'ロープレ - 2026/11/12 10:00 JST～Recording',
    parents: ['fixture-source-folder'],
  }], moves)

  const result = await engine.runFileMoveForUser(
    'fixture-user',
    null,
    null,
    null,
    'fixture-special-folder-12345678901'
  )

  assert.deepEqual(moves, [
    { fileId: 'fixture-special-only', destinationFolderId: 'fixture-special-folder-12345678901' },
  ])
  assert.equal(result.recordingsMoved, 1)
  assert.equal(result.skipped, 0)
  assert.equal(result.errors, 0)
})
