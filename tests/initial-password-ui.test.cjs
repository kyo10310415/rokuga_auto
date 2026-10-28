const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function fixture() {
  const slots = []; let cursor = 0, calls = 0, closed = 0, refreshed = 0, resolveFetch
  const jsx = (type, props) => ({ type, props })
  const modules = {
    react: {
      useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => { slots[i] = v }] },
      useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial } },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/navigation': { useRouter: () => ({ refresh() { refreshed++ } }) },
  }
  const source = fs.readFileSync(path.join(__dirname, '../src/components/admin/CreateInstructorModal.tsx'), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(js, { module, exports: module.exports, fetch: () => { calls++; return new Promise(resolve => { resolveFetch = resolve }) }, require: n => { assert.ok(Object.hasOwn(modules, n), n); return modules[n] } })
  return {
    render() { cursor = 0; return module.exports.default({ onClose() { closed++ } }) },
    reply(ok, body) { resolveFetch({ ok, json: async () => body }) },
    calls: () => calls, closed: () => closed, refreshed: () => refreshed,
  }
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return
  if (predicate(node)) return node
  for (const child of [node.props?.children].flat(Infinity)) { const match = find(child, predicate); if (match) return match }
}
const byType = (tree, type) => find(tree, n => n.type === type)
const closeButton = tree => find(tree, n => n.props?.['aria-label'] === '閉じる')
const submit = form => form.props.onSubmit({ preventDefault() {} })

test('pending submit cannot repeat or close; successful display needs acknowledgment and does not repeat create', async () => {
  const f = fixture(), tree = f.render(), form = byType(tree, 'form')
  const first = submit(form)
  await submit(form)
  find(f.render(), n => n.props?.id === 'new-email').props.onChange({ target: { value: 'other@example.invalid' } })
  assert.equal(find(f.render(), n => n.props?.id === 'new-email').props.disabled, true)
  closeButton(tree).props.onClick()
  assert.equal(f.calls(), 1); assert.equal(f.closed(), 0)
  f.reply(true, { instructor: { email: 'created@example.invalid' }, initialPassword: 'fixture-not-a-real-account-password' })
  await first
  const done = f.render()
  assert.equal(byType(done, 'form'), undefined)
  assert.equal(find(done, n => n.props?.id === 'initial-password').props.value, 'fixture-not-a-real-account-password')
  assert.equal(f.refreshed(), 1)
  assert.ok(JSON.stringify(done).includes('created@example.invalid'))
  assert.equal(JSON.stringify(done).includes('other@example.invalid'), false)
  closeButton(done).props.onClick(); assert.equal(f.closed(), 0)
  done.props.onClick({ target: done, currentTarget: done }); assert.equal(f.closed(), 0)
  find(done, n => n.props?.type === 'checkbox').props.onChange({ target: { checked: true } })
  closeButton(f.render()).props.onClick()
  assert.equal(f.closed(), 1)
  assert.equal(find(f.render(), n => n.props?.id === 'initial-password'), undefined)
})

test('failed create keeps form usable, exposes no password, and can close', async () => {
  const f = fixture(), tree = f.render()
  const pending = submit(byType(tree, 'form'))
  f.reply(false, { error: 'fixture failure' }); await pending
  const failed = f.render()
  assert.ok(byType(failed, 'form'))
  assert.equal(find(failed, n => n.props?.id === 'initial-password'), undefined)
  closeButton(failed).props.onClick(); assert.equal(f.closed(), 1)
})
