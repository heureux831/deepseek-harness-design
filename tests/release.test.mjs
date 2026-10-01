import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { release } from '../scripts/release.mjs'

async function fixture(t) {
  const source = await mkdtemp(join(tmpdir(), 'design-release-'))
  t.after(() => rm(source, { recursive: true, force: true }))
  await mkdir(join(source, 'host')); await mkdir(join(source, 'locale'))
  const paths = ['host/index.js', 'host/persistence.js', 'locale/en.json', 'locale/zh.json', 'client.js', 'cordis.patch.yml', 'README.md', 'README.zh-CN.md', 'LICENSE']
  for (const path of paths) await writeFile(join(source, path), path + '\n')
  const version = async value => {
    await writeFile(join(source, 'package.json'), JSON.stringify({ name: 'deepseek-harness-design', version: value,
      files: ['host', 'locale', 'client.js', 'cordis.patch.yml', 'README.zh-CN.md'],
      scripts: { test: 'node -e ""', check: 'node -e ""' } }))
    await writeFile(join(source, 'package-lock.json'), JSON.stringify({ name: 'deepseek-harness-design', version: value,
      lockfileVersion: 3, packages: { '': { name: 'deepseek-harness-design', version: value } } }))
  }
  await version('0.5.4')
  const calls = []
  const execute = (command, args, options) => {
    calls.push({ command, args, options })
    if (args[0] !== 'pack') return ''
    const stage = args.at(-1), pkg = JSON.parse(readFileSync(join(stage, 'package.json'), 'utf8'))
    const filename = `${pkg.name}-${pkg.version}.tgz`
    writeFileSync(join(stage, filename), 'frozen test tarball')
    return JSON.stringify([{ ...pkg, filename, files: paths.concat('package.json').map(path => ({ path })) }])
  }
  const base = join(source, 'dist')
  return { source, base, version, calls, execute, build: options => release({ source, base, execute, ...options }) }
}

async function cliFixture(t) {
  const h = await fixture(t)
  await mkdir(join(h.source, 'scripts'))
  for (const path of ['scripts/release.mjs', 'release.sh']) {
    await writeFile(join(h.source, path), await readFile(new URL('../' + path, import.meta.url)))
  }
  return h
}

test('the shell entry builds a real npm tarball through a symlinked project path', async t => {
  const h = await cliFixture(t), link = h.source + '-linked'
  await symlink(h.source, link, 'dir')
  t.after(() => rm(link, { force: true }))
  const result = spawnSync('bash', [join(link, 'release.sh')], { encoding: 'utf8', timeout: 60000,
    env: { ...process.env, DSG_RELEASE_DIR: h.base, npm_config_cache: join(h.source, 'npm-cache'), npm_config_update_notifier: 'false' } })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /install snapshot:.*r1/, 'success must report a created artifact')
  const manifest = JSON.parse(await readFile(join(h.base, 'r1', 'BUILD.json'), 'utf8'))
  assert.equal((await readFile(join(h.base, 'r1', manifest.tarball)))[0], 0x1f, 'must be a real gzip tarball')
})

test('Finder metadata does not block real npm packing or enter the snapshot', async t => {
  const h = await cliFixture(t)
  for (const path of ['host/.DS_Store', 'locale/.DS_Store', 'host/._index.js', 'host/npm-debug.log']) {
    await writeFile(join(h.source, path), 'local metadata')
  }
  await writeFile(join(h.source, 'host/.runtime-data.json'), '{}')
  await writeFile(join(h.source, 'host/runtime.log'), 'intentional resource')
  const result = spawnSync('bash', [join(realpathSync(h.source), 'release.sh')], { encoding: 'utf8', timeout: 60000,
    env: { ...process.env, DSG_RELEASE_DIR: h.base, npm_config_cache: join(h.source, 'npm-cache'), npm_config_update_notifier: 'false' } })
  assert.equal(result.status, 0, result.stderr)
  const manifest = JSON.parse(await readFile(join(h.base, 'r1', 'BUILD.json'), 'utf8'))
  assert.equal(Object.keys(manifest.files).length, 12)
  assert.deepEqual(await readdir(join(h.base, 'r1', 'host')), ['.runtime-data.json', 'index.js', 'persistence.js', 'runtime.log'])
  const packed = spawnSync('tar', ['-tzf', join(h.base, 'r1', manifest.tarball)], { encoding: 'utf8' })
  assert.equal(packed.status, 0, packed.stderr)
  assert.equal(packed.stdout.includes('.DS_Store'), false)
  assert.equal(packed.stdout.includes('host/.runtime-data.json'), true)
  assert.equal(packed.stdout.includes('host/runtime.log'), true)
  assert.equal(packed.stdout.trim().split('\n').length, 12)
})

test('release freezes the package and records hashes outside the tarball', async t => {
  const h = await fixture(t), result = await h.build()
  assert.equal(result.output, join(h.base, 'r1'))
  const manifest = JSON.parse(await readFile(join(result.output, 'BUILD.json'), 'utf8'))
  assert.equal(manifest.version, '0.5.4')
  assert.equal(manifest.snapshot, 'r1')
  assert.equal(manifest.sha256, createHash('sha256').update(await readFile(result.tarball)).digest('hex'))
  assert.equal(manifest.files['client.js'], createHash('sha256').update('client.js\n').digest('hex'))
  assert.equal(Object.hasOwn(manifest.files, 'BUILD.json'), false)
  assert.equal(h.calls.find(call => call.args[0] === 'pack').args.at(-1).startsWith(join(h.base, '.r1-')), true)
  assert.deepEqual(await readdir(h.base), ['r1'])
})

test('a completed version cannot be rebuilt with changed bytes; bumping allows a new snapshot', async t => {
  const h = await fixture(t), first = await h.build()
  await writeFile(join(h.source, 'client.js'), 'changed browser code')
  const count = h.calls.length
  await assert.rejects(h.build(), /Version 0.5.4 already exists.*bump the version/)
  assert.equal(h.calls.length, count, 'reject before testing or installing dependencies')
  assert.equal(await readFile(join(first.output, 'client.js'), 'utf8'), 'client.js\n')
  await h.version('0.5.5')
  const second = await h.build()
  assert.equal(second.output, join(h.base, 'r2'))
  assert.equal(await readFile(join(second.output, 'client.js'), 'utf8'), 'changed browser code')
})

test('a failed dependency install leaves no completed snapshot or owned lock', async t => {
  const h = await fixture(t)
  await assert.rejects(h.build({ execute(command, args, options) {
    if (args[0] === 'ci') throw new Error('offline')
    return h.execute(command, args, options)
  } }), /offline/)
  assert.deepEqual(await readdir(h.base), [])
  assert.equal((await h.build()).output, join(h.base, 'r1'))
})

test('edits during verification cannot make the snapshot differ from tested source', async t => {
  const h = await fixture(t)
  await assert.rejects(h.build({ execute(command, args, options) {
    if (args[0] === 'test') writeFileSync(join(h.source, 'client.js'), 'edited during tests')
    return h.execute(command, args, options)
  } }), /inputs changed during verification/)
  assert.deepEqual(await readdir(h.base), [])
})

test('mismatched lockfile versions, invalid numbers, and existing targets are rejected', async t => {
  const h = await fixture(t)
  await writeFile(join(h.source, 'package-lock.json'), JSON.stringify({ version: '0.5.3' }))
  await assert.rejects(h.build(), /versions must match/)
  await h.version('0.5.4')
  await assert.rejects(h.build({ number: '1.5' }), /positive integer/)
  await mkdir(join(h.base, 'r7'))
  await assert.rejects(h.build({ number: '7' }), /Refusing to overwrite/)
  assert.equal(h.calls.length, 0)
})

test('a concurrent release cannot take or remove another process lock', async t => {
  const h = await fixture(t)
  await mkdir(join(h.base, '.release-lock'), { recursive: true })
  await writeFile(join(h.base, '.release-lock', 'owner'), 'another builder')
  await assert.rejects(h.build(), /Another release owns/)
  assert.equal(await readFile(join(h.base, '.release-lock', 'owner'), 'utf8'), 'another builder')
})

test('missing and unexpected tarball files are named and never become a completed release', async t => {
  const h = await fixture(t)
  await assert.rejects(h.build({ execute(command, args, options) {
    const result = h.execute(command, args, options)
    if (args[0] !== 'pack') return result
    const packed = JSON.parse(result)
    packed[0].files = packed[0].files.filter(file => file.path !== 'host/index.js')
    packed[0].files.push({ path: 'tests/seed.js' })
    return JSON.stringify(packed)
  } }), error => {
    assert.match(error.message, /exactly the expected release files/)
    assert.match(error.message, /Unexpected.*tests\/seed\.js/)
    assert.match(error.message, /Missing.*host\/index\.js/)
    return true
  })
  assert.deepEqual(await readdir(h.base), [])
})
