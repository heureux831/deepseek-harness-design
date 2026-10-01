// Run in the Harness Electron Node runtime to use the exact shipped storage providers.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { apply } from '../host/index.js'

const [mode, root] = process.argv.slice(2)
if (!['write', 'read'].includes(mode) || !root) throw new Error('usage: harness-storage.mjs write|read /tmp/storage-test')
const moduleRoot = process.env.DSG_HARNESS_MODULES
  ?? '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules'
const load = name => import(pathToFileURL(join(moduleRoot, '@deepseek-ai', name, 'lib/index.js')).href)
const [{ Context }, { default: Storage }, { JsonStorageBackend }, { DomainFacility }] = await Promise.all([
  load('cordis'), load('dsh-storage'), load('dsh-storage-json'), load('dsh-storage-domain'),
])
const native = new Context()
const storageFiber = native.plugin(Storage)
await storageFiber
const backend = new JsonStorageBackend(root)
native.storage.backend.register('json', backend)
const facility = new DomainFacility(native, { backend: 'json', routes: {} })
const tools = new Map(), disposers = []
const session = { id: 'native-storage-test', header: { id: 'native-storage-test', createdAt: 1, cwd: join(root, 'workspace') } }
await apply({
  effect(register) { const dispose = register(); if (typeof dispose === 'function') disposers.push(dispose) },
  on() {},
  storageDomain: facility,
  sessions: { get(id) { return id === session.id ? session : undefined } },
  sessionPersistence: { async inspect() { return { meta: session.header, events: [] } } },
  tools: { register(tool) { tools.set(tool.name, tool); return () => tools.delete(tool.name) } },
  webServer: { register() { return () => {} } },
  systemPrompt: { context() { return () => {} } },
  fs: {
    async resolve(path) { return path },
    async listDir() { throw Object.assign(new Error('absent legacy folder'), { code: 'FS_NOT_FOUND' }) },
    async writeText(path, text) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, text) },
  },
})
const exec = { agent: { id: session.id, session } }
try {
  const read = args => tools.get('design_read').execute(args, exec)
  const write = args => tools.get('design_apply').execute(args, exec)
  if (mode === 'write') {
    assert.equal((await write({ name: 'alpha', title: '暖白咖啡首页', html: '<main>first</main>' })).persisted, true)
    assert.equal((await write({ name: 'alpha', html: '<main>second</main>' })).version, 2)
    assert.equal((await write({ name: 'beta', asNew: true, html: '<aside>alternative</aside>' })).persisted, true)
    // Force the real backend's atomic publication to fail, then verify rollback.
    const path = join(root, 'designer.json')
    await rename(path, path + '.backup')
    await mkdir(path)
    assert.equal((await write({ name: 'alpha', html: '<main>rejected</main>' })).ok, false)
    assert.equal((await read({ name: 'alpha' })).html, '<main>second</main>')
    assert.equal((await read({ name: 'alpha' })).title, '暖白咖啡首页')
    await rm(path, { recursive: true })
    await rename(path + '.backup', path)
    assert.equal((await read({ name: 'alpha', revision: 1 })).html, '<main>first</main>')
    const stored = JSON.parse(await readFile(path, 'utf8'))
    assert.equal(stored.tables.sessions[session.id].designs.length, 2)
    console.log('PASS native JSON durability and failed-write rollback')
  } else {
    assert.equal((await tools.get('design_list').execute({}, exec)).count, 2)
    assert.equal((await read({ name: 'alpha' })).html, '<main>second</main>')
    assert.equal((await read({ name: 'alpha' })).title, '暖白咖啡首页')
    assert.equal((await read({ name: 'alpha', revision: 1 })).html, '<main>first</main>')
    assert.equal((await write({ name: 'alpha', oldString: 'second', newString: 'third' })).version, 3)
    console.log('PASS native JSON recovery in a second process and continued editing')
  }
} finally {
  for (const dispose of disposers.reverse()) await dispose()
  await backend.close()
  await storageFiber.dispose()
}
