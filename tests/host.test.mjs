import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rename, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { apply } from '../host/index.js'

async function harness(t, options = {}) {
  const root = options.root ?? await mkdtemp(join(tmpdir(), 'dsh-design-test-'))
  if (!options.root) t.after(() => rm(root, { recursive: true, force: true }))
  const routes = new Map(), tools = new Map(), contexts = new Map(), listeners = new Map()
  const writes = [], resolutions = [], disposers = [], sessions = new Map()
  const faults = { persistence: false, export: false }
  const snapshotPath = join(root, 'designer.json')
  let rows = new Map()
  const ctx = {
    get(name) { return name === 'sandboxPolicy' ? options.sandboxPolicy : undefined },
    effect(register) { const dispose = register(); if (typeof dispose === 'function') disposers.push(dispose) },
    on(name, listener) {
      listeners.set(name, listener)
      disposers.push(() => listeners.delete(name))
    },
    webServer: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path) } },
    tools: { register(tool) { tools.set(tool.name, tool); return () => tools.delete(tool.name) } },
    systemPrompt: { context(value) { contexts.set(value.name, value); return () => contexts.delete(value.name) } },
    sessions: { get(id) { return sessions.get(id) } },
    sessionPersistence: { async inspect(id) {
      const session = sessions.get(id)
      if (!session) throw new Error('session not found')
      return { meta: session.header, events: [] }
    } },
    storageDomain: { async open(spec) {
      try {
        const entries = JSON.parse(await readFile(snapshotPath, 'utf8'))
        rows = new Map(entries.map(([id, row]) => [id, spec.tables.sessions.valueSchema.parse(row)]))
      } catch (error) { if (error.code !== 'ENOENT') throw error }
      const table = {
        entries() { return rows.entries() },
        get(id) { return rows.get(id) },
        async put(id, row) {
          if (faults.persistence) throw new Error('simulated persistence failure')
          const next = new Map(rows)
          next.set(id, structuredClone(row))
          await writeFile(snapshotPath + '.tmp', JSON.stringify([...next]))
          await rename(snapshotPath + '.tmp', snapshotPath)
          rows = next
        },
      }
      return { table() { return table }, async close() {} }
    } },
    fs: {
      sandboxMode: options.sandboxMode,
      async resolve(path, options) { resolutions.push({ path, options }); return path },
      async writeText(path, html, _expected, signal, policy) {
        if (faults.export) throw new Error('simulated HTML export failure')
        await mkdir(dirname(path), { recursive: true })
        await writeFile(path, html)
        writes.push({ path, html, signal, policy })
      },
      async listDir(path) {
        return (await readdir(path, { withFileTypes: true })).map(file => ({
          name: file.name, type: file.isFile() ? 'file' : 'directory', target: join(path, file.name),
        }))
      },
      async readBytes(path, _signal, max) {
        const bytes = await readFile(path)
        if (bytes.length > max) throw new Error('file too large')
        return bytes
      },
    },
  }
  await apply(ctx)
  let disposed = false
  async function dispose() {
    if (disposed) return
    disposed = true
    for (const fn of disposers.reverse()) await fn()
  }
  t.after(dispose)
  function agent(id, cwd = join(root, 'workspace'), createdAt = 1) {
    const session = { id, header: { id, createdAt, ...(cwd ? { cwd } : {}) } }
    sessions.set(id, session)
    return { id, session }
  }
  async function request(path, value, method = value === undefined ? 'GET' : 'POST', requestHeaders = { 'content-type': 'application/json' }) {
    const url = new URL(path, 'http://localhost')
    let status, headers, body
    const req = { method, url: path, headers: requestHeaders,
      async *[Symbol.asyncIterator]() { if (value !== undefined) yield Buffer.from(JSON.stringify(value)) },
    }
    const res = { writeHead(code, head) { status = code; headers = head; return this }, end(value) { body = value } }
    await routes.get(url.pathname).handler(req, res)
    return { status, headers, body: headers?.['content-type']?.startsWith('application/json') ? JSON.parse(body) : body }
  }
  const prompt = id => contexts.get('designer.selection').text(id ? { agent: { id } } : {})
  const commitPrompt = (id, text) => listeners.get('session/event')({ id }, {
    type: 'user/message', data: { source: {
      kind: 'plugin', plugin: '@deepseek-ai/dsh-system-prompt', form: 'snapshot',
      sections: [{ name: 'designer.selection', text }],
    } },
  })
  return { root, routes, tools, contexts, sessions, writes, resolutions, faults, agent, request, prompt, commitPrompt, dispose }
}

const exec = agent => ({ agent })
const select = (h, id, name = 'prototype', elementId = 'buy') => h.request('/designer/select', {
  session: id, name, selection: { tag: 'button', id: elementId, selector: '#' + elementId, outerHTML: '<button>Buy</button>' },
})
const inspect = (h, id, on) => h.request('/designer/inspect', { session: id, on })
const read = (h, agent, args = {}) => h.tools.get('design_read').execute(args, exec(agent))
const write = (h, agent, args) => h.tools.get('design_apply').execute(args, exec(agent))

test('production has no seed route; workspace exports use the public Agent header and isolate sessions', async t => {
  const h = await harness(t)
  assert.equal(h.routes.has('/designer/dev/seed'), false)
  const a = h.agent('a'), b = h.agent('b')
  const first = await write(h, a, { html: '<p>first</p>' })
  const second = await write(h, b, { html: '<p>second</p>' })
  assert.equal(first.ok && first.persisted && first.exported, true)
  assert.equal(second.ok, true)
  assert.equal(h.writes.length, 2)
  assert.notEqual(h.writes[0].path, h.writes[1].path)
  assert.match(h.writes[0].path, /\/\.dsh-design\/[a-f0-9]{64}\/prototype\.html$/)
  assert.equal(h.writes[0].html, '<p>first</p>')
})

test('sandboxed exports carry the owning session policy and cancellation to the filesystem', async t => {
  const calls = []
  const h = await harness(t, {
    sandboxMode: 'workspace-write',
    sandboxPolicy: { resolve({ session }) {
      const policy = { mode: 'workspace-write', workspaceRoot: session.header.cwd, sessionId: session.id }
      calls.push({ session, policy })
      return policy
    } },
  })
  const signal = new AbortController().signal
  const a = h.agent('a'), b = h.agent('b', join(h.root, 'workspace-b'))
  for (const agent of [a, b, a]) {
    const result = await h.tools.get('design_apply').execute({ html: '<p>saved</p>' }, { agent, signal })
    assert.equal(result.exported, true, result.message)
    const call = calls.at(-1)
    assert.equal(call.session, agent.session)
    assert.equal(h.writes.at(-1).policy, call.policy)
    assert.equal(h.writes.at(-1).signal, signal)
    assert.equal(h.resolutions.at(-1).options.cwd, agent.session.header.cwd)
    assert.equal(h.resolutions.at(-1).options.signal, signal)
  }
  assert.equal(calls.length, 3, 'policy must be resolved per export, not cached between sessions or calls')
})

test('a sandboxed export with no policy service preserves the draft without using a fallback write', async t => {
  const h = await harness(t, { sandboxMode: 'workspace-write' })
  const a = h.agent('a')
  const result = await write(h, a, { html: '<p>durable</p>' })
  assert.equal(result.ok && result.persisted, true)
  assert.equal(result.exported, false)
  assert.match(result.message, /sandboxPolicy is unavailable/)
  assert.equal(h.writes.length, 0)
  assert.equal((await read(h, a)).html, '<p>durable</p>')
})

test('preview bootstrap escapes a session ID and retains the CSP sandbox', async t => {
  const h = await harness(t)
  const injection = '</script><script>window.evil=1</script>'
  h.agent(injection, '')
  const response = await h.request('/designer/live?session=' + encodeURIComponent(injection))
  assert.equal(response.body.includes(injection), false)
  assert.match(response.body, /\\u003c\/script>/)
  assert.equal(response.headers['content-security-policy'], 'sandbox allow-scripts')
})

test('a selection reaches only its agent and remains pending until its snapshot enters that session', async t => {
  const h = await harness(t)
  h.agent('a'); h.agent('b')
  await select(h, 'a')
  const text = h.prompt('a')
  assert.match(text, /"id":"buy"/)
  assert.equal(h.prompt('b'), '')
  assert.equal(h.prompt(), '')
  assert.equal(h.prompt('a'), text, 'a canceled or diagnostic assembly must not consume the click')
  h.commitPrompt('b', text)
  assert.equal(h.prompt('a'), text)
  h.commitPrompt('a', text)
  assert.equal(h.prompt('a'), '')
  assert.equal(h.tools.get('design_selection').execute({}, exec(h.agent('a'))).hasSelection, true)
})

test('inspect and clearing affect only the addressed session', async t => {
  const h = await harness(t)
  const a = h.agent('a'), b = h.agent('b')
  await select(h, 'a'); await select(h, 'b')
  await inspect(h, 'b', false)
  assert.equal((await select(h, 'a')).body.ignored, undefined)
  assert.equal((await select(h, 'b')).body.ignored, 'inspect-off')
  assert.equal(h.tools.get('design_selection').execute({}, exec(a)).hasSelection, true)
  assert.equal(h.tools.get('design_selection').execute({}, exec(b)).hasSelection, false)
  assert.notEqual(h.prompt('a'), '')
  assert.equal(h.prompt('b'), '')
  await inspect(h, 'b', true)
  assert.equal(h.tools.get('design_selection').execute({}, exec(b)).hasSelection, false)
  await h.request('/designer/select', { session: 'a', clear: true })
  assert.equal(h.prompt('a'), '')
})

test('ten-minute expiry is enforced by context, selection tool, read tool, and metadata', async t => {
  const h = await harness(t)
  const a = h.agent('a')
  await write(h, a, { html: '<button>Buy</button>' })
  let now = Date.now()
  t.mock.method(Date, 'now', () => now)
  await select(h, 'a')
  now += 10 * 60 * 1000
  assert.equal(h.prompt('a'), '')
  for (const args of [{}, { name: 'prototype' }]) {
    assert.equal(h.tools.get('design_selection').execute(args, exec(a)).hasSelection, false)
  }
  assert.equal((await read(h, a)).hasSelection, false)
  assert.equal((await h.request('/designer/meta?session=a')).body.hasSelection, false)
})

test('only the latest click is injected; repeated identical clicks have distinct delivery identities', async t => {
  const h = await harness(t)
  h.agent('a')
  await select(h, 'a', 'alpha')
  await select(h, 'a', 'beta')
  const text = h.prompt('a')
  assert.match(text, /"branch":"beta"/)
  h.commitPrompt('a', text)
  assert.equal(h.prompt('a'), '', 'an older branch click must not resurface')
  await select(h, 'a', 'beta')
  assert.notEqual(h.prompt('a'), text)
})

test('restart restores alternatives and historical HTML before another model edit', async t => {
  const h = await harness(t)
  const a = h.agent('a')
  await write(h, a, { name: 'alpha', html: '<p>one</p>' })
  await write(h, a, { name: 'alpha', html: '<p>two</p>' })
  await write(h, a, { name: 'beta', asNew: true, html: '<p>other</p>' })
  await h.dispose()
  const restarted = await harness(t, { root: h.root })
  const resumed = restarted.agent('a')
  const listed = await restarted.request('/designer/designs?session=a')
  assert.equal(listed.body.designs.length, 2)
  assert.equal((await read(restarted, resumed, { name: 'alpha' })).html, '<p>two</p>')
  assert.equal((await read(restarted, resumed, { name: 'alpha', revision: 1 })).html, '<p>one</p>')
  const patched = await write(restarted, resumed, { name: 'alpha', oldString: 'two', newString: 'three' })
  assert.equal(patched.version, 3)
  assert.equal((await read(restarted, resumed, { name: 'alpha', revision: 2 })).html, '<p>two</p>')
})

test('a persistence failure rolls back revision, HTML, branch list, and export', async t => {
  const h = await harness(t)
  const a = h.agent('a')
  await write(h, a, { html: '<p>original</p>' })
  h.faults.persistence = true
  const result = await write(h, a, { html: '<p>lost</p>' })
  assert.equal(result.ok, false)
  assert.equal(result.persisted, false)
  assert.equal(result.version, 1)
  assert.equal((await read(h, a)).html, '<p>original</p>')
  assert.equal(h.writes.length, 1)
  assert.equal((await write(h, a, { asNew: true, name: 'ghost', html: '<p>ghost</p>' })).ok, false)
  assert.equal((await h.tools.get('design_list').execute({}, exec(a))).count, 1)
  await h.dispose()
  const restarted = await harness(t, { root: h.root })
  assert.equal((await read(restarted, restarted.agent('a'))).html, '<p>original</p>')
})

test('HTML export failure is explicit and the authoritative draft survives restart', async t => {
  const h = await harness(t)
  const a = h.agent('a')
  h.faults.export = true
  const result = await write(h, a, { html: '<p>durable</p>' })
  assert.equal(result.ok, true)
  assert.equal(result.persisted, true)
  assert.equal(result.exported, false)
  assert.match(result.message, /HTML export unavailable/)
  await h.dispose()
  const restarted = await harness(t, { root: h.root })
  assert.equal((await read(restarted, restarted.agent('a'))).html, '<p>durable</p>')
})

test('a session without cwd remains durable', async t => {
  const h = await harness(t)
  const a = h.agent('a', '')
  const result = await write(h, a, { html: '<p>no workspace</p>' })
  assert.equal(result.persisted, true)
  assert.equal(result.exported, false)
  await h.dispose()
  const restarted = await harness(t, { root: h.root })
  assert.equal((await read(restarted, restarted.agent('a', ''))).html, '<p>no workspace</p>')
})

test('parallel edits preserve all revisions and mint different alternatives', async t => {
  const h = await harness(t)
  const a = h.agent('a')
  await write(h, a, { html: '<p>base</p>' })
  const revisions = await Promise.all([
    write(h, a, { html: '<p>second</p>' }), write(h, a, { html: '<p>third</p>' }),
  ])
  assert.deepEqual(revisions.map(item => item.version), [2, 3])
  assert.equal((await read(h, a, { revision: 2 })).html, '<p>second</p>')
  const alternatives = await Promise.all([
    write(h, a, { asNew: true, name: 'same', html: '<p>A</p>' }),
    write(h, a, { asNew: true, name: 'same', html: '<p>B</p>' }),
  ])
  assert.deepEqual(alternatives.map(item => item.name), ['same', 'same-v2'])
})

test('legacy session-hashed HTML is imported automatically without rewriting the original', async t => {
  const h = await harness(t)
  const a = h.agent('legacy')
  const folder = join(a.session.header.cwd, '.dsh-design', createHash('sha256').update('legacy').digest('hex'))
  await mkdir(folder, { recursive: true })
  await writeFile(join(folder, 'alpha.html'), '<p>legacy</p>')
  assert.equal((await h.request('/designer/designs?session=legacy')).body.designs.length, 1)
  assert.equal((await read(h, a, { name: 'alpha' })).html, '<p>legacy</p>')
  assert.equal(h.writes.length, 0)
  await h.dispose()
  const restarted = await harness(t, { root: h.root })
  assert.equal((await read(restarted, restarted.agent('legacy'), { name: 'alpha' })).html, '<p>legacy</p>')
})

test('preview reads and rejected edits do not invent alternatives', async t => {
  const h = await harness(t)
  const a = h.agent('a')
  await h.request('/designer/live?session=a&name=ghost')
  assert.equal((await write(h, a, { name: 'invalid', oldString: 'x', newString: 'y' })).ok, false)
  const result = await write(h, a, { asNew: true, name: 'ghost', html: '<p>real</p>' })
  assert.equal(result.name, 'ghost')
  await assert.rejects(h.request('/designer/live?session=unknown'), /session not found/)
})

test('an invalid legacy import fails atomically and can recover after the source is corrected', async t => {
  const h = await harness(t)
  const a = h.agent('legacy-invalid')
  const folder = join(a.session.header.cwd, '.dsh-design', createHash('sha256').update(a.id).digest('hex'))
  await mkdir(folder, { recursive: true })
  await writeFile(join(folder, 'alpha.html'), '<p>valid</p>')
  await writeFile(join(folder, 'beta.html'), Buffer.from([0xff, 0xfe]))
  const result = await write(h, a, { html: '<p>new</p>' })
  assert.equal(result.ok, false)
  assert.match(result.message, /cannot restore session/)
  assert.equal(h.writes.length, 0)
  assert.equal(await readFile(join(folder, 'alpha.html'), 'utf8'), '<p>valid</p>')
  await writeFile(join(folder, 'beta.html'), '<p>corrected</p>')
  assert.equal((await read(h, a, { name: 'alpha' })).html, '<p>valid</p>')
  assert.equal((await read(h, a, { name: 'beta' })).html, '<p>corrected</p>')
})

test('reused session IDs do not expose a previous lifecycle draft', async t => {
  const h = await harness(t)
  await write(h, h.agent('a', '', 1), { html: '<p>old lifecycle</p>' })
  const fresh = h.agent('a', '', 2)
  assert.equal((await read(h, fresh)).version, 0)
  await write(h, fresh, { html: '<p>new lifecycle</p>' })
  assert.equal((await read(h, fresh)).html, '<p>new lifecycle</p>')
})

test('opaque previews and simple cross-origin bodies cannot mutate panel state', async t => {
  const h = await harness(t)
  const a = h.agent('a')
  await select(h, 'a')
  for (const headers of [{ 'content-type': 'text/plain' }, { 'content-type': 'application/x-www-form-urlencoded' }]) {
    const response = await h.request('/designer/inspect', { session: 'a', on: false }, 'POST', headers)
    assert.equal(response.status, 415)
    assert.equal(h.tools.get('design_selection').execute({}, exec(a)).hasSelection, true)
    assert.equal((await h.request('/designer/select', { session: 'a', clear: true }, 'POST', headers)).status, 415)
  }
})

test('out-of-order panel clicks and clears cannot replace a newer action', async t => {
  const h = await harness(t)
  const a = h.agent('a')
  const send = (sequence, id) => h.request('/designer/select', { session: 'a', name: 'prototype', client: 'panel-a', sequence,
    selection: { tag: 'button', id } })
  await send(2, 'newest')
  assert.equal((await send(1, 'late')).body.ignored, 'stale-request')
  assert.equal(h.tools.get('design_selection').execute({}, exec(a)).id, 'newest')
  await h.request('/designer/select', { session: 'a', clear: true, client: 'panel-a', sequence: 4 })
  assert.equal((await send(3, 'late-after-clear')).body.ignored, 'stale-request')
  assert.equal(h.tools.get('design_selection').execute({}, exec(a)).hasSelection, false)
})

test('an off-on cycle rejects clicks captured before the inspect token changed', async t => {
  const h = await harness(t)
  const a = h.agent('a')
  const before = (await h.request('/designer/inspect?session=a')).body
  await inspect(h, 'a', false)
  const after = (await inspect(h, 'a', true)).body
  assert.notEqual(after.token, before.token)
  const stale = await h.request('/designer/select', { session: 'a', inspectToken: before.token, selection: { tag: 'button' } })
  assert.equal(stale.body.ignored, 'inspect-changed')
  assert.equal(h.tools.get('design_selection').execute({}, exec(a)).hasSelection, false)
})

test('historical selection names its revision and unnamed edits target the selected alternative', async t => {
  const h = await harness(t)
  const a = h.agent('a')
  await write(h, a, { name: 'alpha', html: '<button>old</button>' })
  await write(h, a, { name: 'alpha', html: '<button>new</button>' })
  await write(h, a, { name: 'beta', html: '<aside>other</aside>' })
  const stale = await h.request('/designer/select', { session: 'a', name: 'alpha', revision: 1,
    selection: { tag: 'button' } })
  assert.equal(stale.body.ignored, 'preview-changed', 'a formerly current preview must not pretend to be current')
  const picked = await h.request('/designer/select', { session: 'a', name: 'alpha', revision: 1, historical: true,
    selection: { tag: 'button', id: 'old' } })
  assert.equal(picked.body.ok, true)
  assert.equal(h.tools.get('design_selection').execute({}, exec(a)).revision, 1)
  const reopened = (await h.request('/designer/inspect?session=a')).body
  assert.equal(reopened.selection.name, 'alpha')
  assert.equal(reopened.selection.revision, 1)
  assert.equal(reopened.selection.delivered, false)
  assert.match(h.prompt('a'), /"revision":1/)
  assert.equal((await read(h, a)).name, 'alpha')
  const updated = await write(h, a, { html: '<button>updated alpha</button>' })
  assert.equal(updated.name, 'alpha')
  assert.equal(h.tools.get('design_selection').execute({}, exec(a)).hasSelection, false)
  assert.equal((await read(h, a, { name: 'beta' })).html, '<aside>other</aside>')
})

test('an intentionally empty document stays blank and missing revisions report their absence', async t => {
  const h = await harness(t)
  const a = h.agent('a')
  await write(h, a, { html: '' })
  const page = await h.request('/designer/live?session=a&name=prototype')
  assert.equal(page.body.includes('还没有画布'), false)
  const blank = await read(h, a)
  assert.equal(blank.found, true)
  assert.equal(blank.html, '')
  assert.equal((await h.request('/designer/live?session=a&name=prototype&rev=-1')).status, 400)
  assert.equal((await h.request('/designer/live?session=a&name=prototype&rev=1.5')).status, 400)
  const missing = await h.request('/designer/live?session=a&name=prototype&rev=99')
  assert.equal(missing.status, 404)
  assert.match(missing.body, /不再保留/)
  assert.match(missing.body, /__dshDesignerSelectable=false/)
  const value = await read(h, a, { revision: 99 })
  assert.equal(value.found, false)
  assert.equal(value.version, 99)
  assert.match(value.message, /not retained/)
})

test('the newest unnamed edit remains deterministic when the clock has millisecond ties', async t => {
  const h = await harness(t)
  const a = h.agent('a')
  t.mock.method(Date, 'now', () => 1000)
  await write(h, a, { name: 'alpha', html: 'A' })
  await write(h, a, { name: 'beta', html: 'B' })
  await write(h, a, { name: 'alpha', html: 'A2' })
  assert.equal((await read(h, a)).name, 'alpha')
})

test('a rejected persistence write retains the selection and a reused session clears inspect state', async t => {
  const h = await harness(t)
  const a = h.agent('a')
  await write(h, a, { html: '<button>buy</button>' })
  await select(h, 'a')
  h.faults.persistence = true
  assert.equal((await write(h, a, { html: 'failed' })).ok, false)
  assert.equal(h.tools.get('design_selection').execute({}, exec(a)).hasSelection, true)
  await inspect(h, 'a', false)
  h.agent('a', '', 2)
  const state = await h.request('/designer/inspect?session=a')
  assert.equal(state.body.inspect, true)
})

test('revision history and branch limits remain enforced at their boundaries', async t => {
  const h = await harness(t)
  const a = h.agent('a', '')
  for (let version = 1; version <= 43; version++) await write(h, a, { name: 'alpha', html: 'revision '+version })
  assert.equal((await read(h, a, { name: 'alpha', revision: 1 })).found, false)
  assert.equal((await read(h, a, { name: 'alpha', revision: 3 })).html, 'revision 3')
  for (let index = 1; index <= 31; index++) assert.equal((await write(h, a, { asNew: true, name: 'branch-'+index, html: 'B' })).ok, true)
  assert.equal((await write(h, a, { asNew: true, name: 'overflow', html: 'B' })).ok, false)
  assert.equal((await write(h, a, { name: 'alpha', html: 'allowed edit' })).ok, true)
  assert.equal((await write(h, a, { name: 'alpha', html: 'x'.repeat(400001) })).ok, false)
  assert.equal((await read(h, a, { name: 'alpha' })).html, 'allowed edit')
})

test('descriptive titles support Chinese names and survive edits and restart', async t => {
  const h = await harness(t), a = h.agent('titles')
  const first = await write(h, a, { name: '咖啡首页 1', title: '暖白咖啡首页', html: '<h1>咖啡</h1>' })
  const second = await write(h, a, { name: '商城首页 1', title: '深色编辑风', html: '<h1>商店</h1>' })
  assert.notEqual(first.name, second.name)
  assert.equal(first.title, '暖白咖啡首页')
  await write(h, a, { name: first.name, html: '<h1>更新咖啡</h1>' })
  assert.equal((await read(h, a, { name: first.name })).title, '暖白咖啡首页')
  await h.dispose()
  const restarted = await harness(t, { root: h.root })
  assert.equal((await read(restarted, restarted.agent('titles'), { name: first.name })).title, '暖白咖啡首页')
})

test('unnamed designs infer a title and colliding labels remain distinguishable', async t => {
  const h = await harness(t), a = h.agent('titles')
  const first = await write(h, a, { html: '<title>暖白咖啡首页</title><p>页面</p>' })
  const second = await write(h, a, { asNew: true, html: '<title>暖白咖啡首页</title><p>另一版</p>' })
  assert.equal(first.title, '暖白咖啡首页')
  assert.equal(second.title, '暖白咖啡首页 · 2')
  assert.equal(second.name, 'design')
})

test('renaming changes only the label, stays isolated, and rolls back failed saves', async t => {
  const h = await harness(t), a = h.agent('a'), b = h.agent('b')
  await write(h, a, { name: 'warm', title: '暖白首页', html: '<button>one</button>' })
  await write(h, b, { name: 'warm', title: '另一会话', html: '<p>other</p>' })
  await select(h, 'a', 'warm')
  const before = (await h.request('/designer/rev?session=a')).body.token
  assert.equal((await h.request('/designer/rename', { session: 'a', name: 'warm', title: '极简咖啡首页' })).body.ok, true)
  assert.notEqual((await h.request('/designer/rev?session=a')).body.token, before)
  assert.equal((await read(h, a, { name: 'warm' })).version, 1)
  assert.equal((await read(h, a, { name: 'warm' })).hasSelection, true)
  assert.equal((await read(h, b, { name: 'warm' })).title, '另一会话')
  h.faults.persistence = true
  assert.equal((await h.request('/designer/rename', { session: 'a', name: 'warm', title: '不会保存' })).status, 500)
  assert.equal((await read(h, a, { name: 'warm' })).title, '极简咖啡首页')
  assert.equal((await h.request('/designer/rename', { session: 'a', name: 'warm', title: '' })).status, 400)
  assert.equal((await h.request('/designer/rename', { session: 'a', name: 'warm', title: 'x' }, 'POST', { 'content-type': 'text/plain' })).status, 415)
})
