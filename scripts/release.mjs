import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const COPY = ['host', 'locale', 'client.js', 'package.json', 'package-lock.json',
  'cordis.patch.yml', 'README.md', 'README.zh-CN.md', 'LICENSE']
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const json = async path => JSON.parse(await readFile(path, 'utf8'))
// Known local noise; do not exclude arbitrary dotfiles or resource logs.
const isBuildNoise = name => ['.DS_Store', '.git', 'node_modules', 'npm-debug.log'].includes(name) || name.startsWith('._')
async function exists(path) {
  try { await stat(path); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error }
}
async function hashes(root) {
  const files = {}
  async function visit(path) {
    if (isBuildNoise(basename(path))) return
    const absolute = join(root, path)
    if ((await stat(absolute)).isDirectory()) {
      for (const entry of (await readdir(absolute)).sort()) await visit(path + '/' + entry)
    } else files[path] = digest(await readFile(absolute))
  }
  for (const path of COPY) await visit(path)
  return files
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args[0]} failed (${result.status ?? result.signal})`)
  return result.stdout
}

/** The output directory owns a lock and one completed package per version. */
export async function release({ source = SOURCE, base = process.env.DSG_RELEASE_DIR || join(source, 'dist'), number, execute = run } = {}) {
  source = resolve(source)
  base = resolve(base)
  await mkdir(base, { recursive: true })
  const lock = join(base, '.release-lock')
  try { await mkdir(lock) } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Another release owns ${lock}. If a process crashed, remove this lock only after confirming it has stopped.`)
    throw error
  }
  let stage
  try {
    const pkg = await json(join(source, 'package.json'))
    const packageLock = await json(join(source, 'package-lock.json'))
    if (packageLock.version !== pkg.version || packageLock.packages?.['']?.version !== pkg.version) {
      throw new Error('package.json and package-lock.json versions must match.')
    }
    const snapshots = (await readdir(base)).filter(name => /^r[1-9][0-9]*$/.test(name))
    for (const snapshot of snapshots) {
      const root = join(base, snapshot)
      if (!await exists(join(root, 'package.json'))) continue
      const old = await json(join(root, 'package.json'))
      const filename = `${old.name.replace(/^@/, '').replaceAll('/', '-')}-${old.version}.tgz`
      if (old.name === pkg.name && old.version === pkg.version && await exists(join(root, filename))) {
        throw new Error(`Version ${pkg.version} already exists in ${root}. Reuse that package or bump the version before building again.`)
      }
    }
    const next = number === undefined ? Math.max(0, ...snapshots.map(name => Number(name.slice(1)))) + 1 : Number(number)
    if (!Number.isSafeInteger(next) || next < 1 || (number !== undefined && !/^[1-9][0-9]*$/.test(String(number)))) {
      throw new Error('release number must be a positive integer')
    }
    const output = join(base, 'r' + next)
    if (await exists(output)) throw new Error(`Refusing to overwrite ${output}`)
    const before = await hashes(source)
    execute('npm', ['test'], { cwd: source })
    execute('npm', ['run', 'check'], { cwd: source })
    stage = await mkdtemp(join(base, `.r${next}-`))
    for (const path of COPY) await cp(join(source, path), join(stage, path), {
      recursive: true, filter: path => !isBuildNoise(basename(path)),
    })
    if (JSON.stringify(await hashes(stage)) !== JSON.stringify(before)) {
      throw new Error('Release inputs changed during verification. Retry with stable source files.')
    }
    execute('npm', ['ci', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund'], { cwd: stage })
    // Tests ran against the same bytes above. Pack only the frozen snapshot;
    // its production install intentionally does not contain development tests.
    const packed = JSON.parse(execute('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', stage, stage], { cwd: source, capture: true }))
    if (packed.length !== 1 || packed[0].name !== pkg.name || packed[0].version !== pkg.version) throw new Error('Unexpected npm package identity')
    const item = packed[0]
    const expectedFilename = `${pkg.name.replace(/^@/, '').replaceAll('/', '-')}-${pkg.version}.tgz`
    if (item.filename !== expectedFilename) throw new Error('Unexpected npm tarball name')
    const expectedFiles = Object.keys(before).filter(path => path !== 'package-lock.json').sort()
    const actualFiles = item.files.map(file => file.path).sort()
    if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
      const expected = new Set(expectedFiles), actual = new Set(actualFiles)
      const missing = expectedFiles.filter(path => !actual.has(path))
      const unexpected = actualFiles.filter(path => !expected.has(path))
      throw new Error('The npm tarball does not contain exactly the expected release files. '
        + `Missing from tarball: ${missing.join(', ') || '(none)'}. Unexpected in tarball: ${unexpected.join(', ') || '(none)'}.`)
    }
    const files = {}
    for (const file of [...item.files].sort((a, b) => a.path.localeCompare(b.path))) {
      if (!Object.hasOwn(before, file.path)) throw new Error(`Unexpected packaged file: ${file.path}`)
      files[file.path] = digest(await readFile(join(stage, file.path)))
      if (files[file.path] !== before[file.path]) throw new Error(`Packaged file changed: ${file.path}`)
    }
    const tarball = join(stage, item.filename)
    if (JSON.stringify(await hashes(source)) !== JSON.stringify(before)) {
      throw new Error('Release inputs changed during packaging. Retry with stable source files.')
    }
    let commit = null
    const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' })
    if (git.status === 0) commit = git.stdout.trim()
    const worktree = spawnSync('git', ['status', '--porcelain'], { cwd: source, encoding: 'utf8' })
    await writeFile(join(stage, 'BUILD.json'), JSON.stringify({ schemaVersion: 1, name: pkg.name, version: pkg.version,
      snapshot: 'r' + next, sourceCommit: commit, sourceDirty: worktree.status === 0 ? worktree.stdout.trim() !== '' : null,
      tarball: item.filename, sha256: digest(await readFile(tarball)), files }, null, 2) + '\n')
    await rename(stage, output)
    stage = undefined
    return { output, tarball: join(output, item.filename) }
  } finally {
    if (stage) await rm(stage, { recursive: true, force: true })
    await rm(lock, { recursive: true, force: true })
  }
}

const isMain = (() => {
  if (!process.argv[1]) return false
  try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)) }
  catch { return false }
})()
if (isMain) {
  try {
    if (process.argv.length > 3) throw new Error('usage: release.sh [positive release number]')
    const result = await release({ number: process.argv[2] })
    console.log(`install snapshot: ${result.output}\npackage: ${result.tarball}\nbuild identity: ${join(result.output, 'BUILD.json')}`)
  } catch (error) { console.error(`release: ${error.message}`); process.exitCode = 1 }
}
