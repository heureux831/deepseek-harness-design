// Exercise the shipped policy resolver and sandboxed filesystem outside temp roots.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, stat, symlink } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, relative, isAbsolute } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const [mode = 'verify', hostPath] = process.argv.slice(2)
if (!['repro', 'verify'].includes(mode)) throw new Error('usage: harness-sandbox.mjs repro|verify [host-module-path]')
if (mode === 'repro' && !hostPath) throw new Error('repro requires the original 0.5.0 host module path')
const { apply } = await import(hostPath ? pathToFileURL(hostPath).href : '../host/index.js')
const moduleRoot = process.env.DSG_HARNESS_MODULES
  ?? '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules'
const load = name => import(pathToFileURL(join(moduleRoot, '@deepseek-ai', name, 'lib/index.js')).href)
const [{ Context }, { default: Projections }, { default: Policy }, { default: Filesystem },
  { default: Storage }, { JsonStorageBackend }, { DomainFacility }, { writableRoots }] = await Promise.all([
  load('cordis'), load('dsh-session-projection'), load('dsh-sandbox-policy'), load('dsh-fs-sandbox'),
  load('dsh-storage'), load('dsh-storage-json'), load('dsh-storage-domain'), load('dsh-sandbox'),
])
const dist = fileURLToPath(new URL('../dist/', import.meta.url))
await mkdir(dist, { recursive: true })
const root = await mkdtemp(join(dist, 'sandbox-'))
const fallback = join(root, 'fallback'), cwd = join(root, 'workspace'), outside = join(root, 'outside')
const native = new Context(), fibers = [], disposers = []
let backend, domain
const tools = new Map(), routes = new Map(), sessions = new Map()
async function mount(plugin, config) { const fiber = native.plugin(plugin, config); fibers.push(fiber); await fiber }
function session(id, workspace = cwd) {
  const events = []
  const value = { id, header: { id, createdAt: 1, cwd: workspace }, inheritedEventCount: 0,
    get seq() { return events.length }, snapshotEvents() { return [...events] }, eventAt(seq) { return events[seq] },
    setMode(mode) { events.push({ seq: events.length, type: 'sandbox/mode', data: { mode } }) },
  }
  sessions.set(id, value)
  return value
}
const exec = value => ({ agent: { id: value.id, session: value }, signal: new AbortController().signal })
const write = (value, args) => tools.get('design_apply').execute(args, exec(value))
const exportPath = (value, slug) => join(value.header.cwd, '.dsh-design', createHash('sha256').update(value.id).digest('hex'), slug + '.html')
const exists = path => stat(path).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error })
try {
  for (const folder of [fallback, cwd, outside]) await mkdir(folder)
  await mount(Projections)
  await mount(Policy, { mode: 'workspace-write', workspaceRoot: fallback })
  await mount(Filesystem, { cwd: fallback })
  // Temp roots are writable in workspace-write even with a missing session policy.
  // Refuse a fixture location that would conceal this regression.
  for (const allowed of writableRoots(native.sandboxPolicy.resolve())) {
    const rel = relative(allowed, cwd)
    assert.ok(rel === '..' || rel.startsWith('../') || isAbsolute(rel), 'run this test from a repository outside temporary roots')
  }
  await mount(Storage)
  backend = new JsonStorageBackend(join(root, 'storage'))
  native.storage.backend.register('json', backend)
  domain = new DomainFacility(native, { backend: 'json', routes: {} })
  await apply({
    effect(register) { const dispose = register(); if (typeof dispose === 'function') disposers.push(dispose) },
    on() {}, get(name) { return native.get(name) }, fs: native.fs, storageDomain: domain,
    sessions: { get(id) { return sessions.get(id) } },
    sessionPersistence: { async inspect(id) { return { meta: sessions.get(id).header, events: [] } } },
    tools: { register(tool) { tools.set(tool.name, tool); return () => tools.delete(tool.name) } },
    webServer: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path) } },
    systemPrompt: { context() { return () => {} } },
  })
  const a = session('sandbox-a')
  for (const slug of ['a-ink-ring', 'b-donut', 'c-hud-orb']) {
    const result = await write(a, { name: slug, html: `<main>${slug}</main>` })
    assert.equal(result.ok && result.persisted, true)
    assert.equal(result.exported, mode !== 'repro', result.message)
    assert.equal(result.path, exportPath(a, slug))
    if (mode === 'repro') {
      assert.match(result.message, /file access denied under workspace-write mode/)
      assert.equal(await exists(result.path), false)
      console.log('REPRO plugin denied export: ' + slug)
    } else assert.equal(await readFile(result.path, 'utf8'), `<main>${slug}</main>`)
  }
  if (mode === 'repro') assert.equal(await exists(join(cwd, '.dsh-design')), false)
  // Same path, native fs-tool call shape: the fifth argument carries the session.
  const path = exportPath(a, 'a-ink-ring')
  const policy = native.sandboxPolicy.resolve({ session: a })
  const target = await native.fs.resolve(path, { cwd: policy.workspaceRoot })
  await native.fs.writeText(target, '<main>native fs call</main>', undefined, exec(a).signal, policy)
  assert.equal(await readFile(path, 'utf8'), '<main>native fs call</main>')
  console.log('PASS same absolute path succeeds with the session policy')
  const outsidePath = join(outside, 'control.txt')
  await assert.rejects(native.fs.writeText(await native.fs.resolve(outsidePath), 'denied', undefined, exec(a).signal, policy),
    { code: 'FS_SANDBOX_DENIED' })
  assert.equal(await exists(outsidePath), false)
  console.log('PASS workspace-write still rejects outside writes')
  if (mode === 'verify') {
    const b = session('sandbox-b', join(root, 'workspace-b'))
    await mkdir(b.header.cwd)
    const second = await write(b, { html: '<aside>B</aside>' })
    assert.equal(second.exported, true, second.message)
    assert.equal(await readFile(second.path, 'utf8'), '<aside>B</aside>')
    assert.notEqual(second.path, path)
    a.setMode('read-only')
    const denied = await write(a, { name: 'readonly', html: '<main>saved only</main>' })
    assert.equal(denied.ok && denied.persisted, true)
    assert.equal(denied.exported, false)
    assert.match(denied.message, /read-only mode/)
    assert.equal(await exists(denied.path), false)
    assert.equal((await tools.get('design_read').execute({ name: 'readonly' }, exec(a))).html, '<main>saved only</main>')
    a.setMode('workspace-write')
    const resumed = await write(a, { name: 'readonly', html: '<main>export resumed</main>' })
    assert.equal(resumed.exported, true, resumed.message)
    // A symlinked export directory must not grant writes outside this workspace.
    const linked = session('sandbox-linked')
    const linkedFolder = dirname(exportPath(linked, 'prototype'))
    await symlink(outside, linkedFolder)
    const escaped = await write(linked, { html: '<main>no escape</main>' })
    assert.equal(escaped.persisted, true)
    assert.equal(escaped.exported, false)
    assert.match(escaped.message, /workspace-write mode/)
    assert.equal(await exists(join(outside, 'prototype.html')), false)
    // Existing legacy exports remain readable, including from an agentless panel request.
    const legacy = session('sandbox-legacy')
    const legacyPath = exportPath(legacy, 'old')
    await native.fs.writeText(await native.fs.resolve(legacyPath), '<p>legacy</p>', undefined, undefined,
      native.sandboxPolicy.resolve({ session: legacy }))
    legacy.setMode('read-only')
    let response
    await routes.get('/designer/designs').handler({ url: '/designer/designs?session=' + legacy.id },
      { writeHead() {}, end(text) { response = JSON.parse(text) } })
    assert.equal(response.designs.length, 1)
    const imported = await tools.get('design_read').execute({ name: 'old' }, exec(legacy))
    assert.equal(imported.html, '<p>legacy</p>')
    assert.equal(await readFile(legacyPath, 'utf8'), '<p>legacy</p>')
    console.log('PASS per-session roots, mode changes, read-only durability, symlink fence, and legacy import')
  }
  console.log(mode === 'repro' ? 'CONFIRMED 0.5.0 missing-session-policy regression' : 'PASS native sandbox export regression')
} finally {
  for (const dispose of disposers.reverse()) await dispose()
  if (backend) await backend.close()
  for (const fiber of fibers.reverse()) await fiber.dispose()
  await rm(root, { recursive: true, force: true })
}
