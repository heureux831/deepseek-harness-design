import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { runInThisContext } from 'node:vm'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b }); return { promise, resolve, reject } }
const response = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, async json() { return structuredClone(value) } })

async function panel(t, options = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', { url: 'http://localhost/' })
  const globals = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true }
  const originals = new Map(Object.keys(globals).concat('fetch').map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key,value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  let slot, plugin, root, sid = 'a', currentInspect = true
  const intervals = new Set(), disposers = [], calls = []
  const data = { designs: options.empty ? [] : [{ name: 'a', version: 3, bytes: 10, updatedAt: 3 }, { name: 'b', version: 2, bytes: 10, updatedAt: 1 }],
    revisions: { a: { name: 'a', current: 3, revisions: [{ version: 2 }, { version: 1 }] }, b: { name: 'b', current: 2, revisions: [{ version: 1 }] } } }
  const ctx = {
    effect(register) { const dispose = register(); if (typeof dispose === 'function') disposers.push(dispose) },
    timer: { interval(fn) { intervals.add(fn); return () => intervals.delete(fn) } },
    sidebarRightTabs: { register() { return () => {} } },
    slots: { inject(_name, register) { return register() }, register(_config, component) { slot = component; return () => {} } },
  }
  globalThis.fetch = async (path, init = {}) => {
    const url = new URL(path, 'http://localhost'), body = init.body ? JSON.parse(init.body) : undefined
    const call = { url, init, body }; calls.push(call)
    const handled = options.fetch?.(call, data)
    if (handled !== undefined) return handled
    if (url.pathname === '/designer/designs') return response({ designs: data.designs })
    if (url.pathname === '/designer/rev') return response({ token: data.designs.map(x => x.name+'@'+x.version).join('|'), count: data.designs.length })
    if (url.pathname === '/designer/revisions') return response(data.revisions[url.searchParams.get('name')])
    if (url.pathname === '/designer/inspect') {
      if (body) currentInspect = body.on
      return response({ ok: true, inspect: currentInspect, token: 'inspect-test' })
    }
    if (url.pathname === '/designer/meta') return response({ hasSelection: true, inspect: currentInspect })
    return response({ ok: true })
  }
  dom.window.__ModuleLoader__ = { load(definition) { plugin = definition.factory(name => { assert.equal(name, 'react'); return React }) } }
  runInThisContext(source, { filename: 'client.js' })
  plugin.apply(ctx)
  root = createRoot(dom.window.document.getElementById('root'))
  const render = async (sessionId = sid) => { sid = sessionId; await act(async () => { root.render(React.createElement(slot, { sessionId, ctx })) }) }
  await render()
  t.after(async () => {
    await act(async () => root.unmount())
    for (const dispose of disposers.reverse()) dispose()
    dom.window.close()
    for (const [key,descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis,key,descriptor); else delete globalThis[key] }
  })
  const click = async (label, index = 0) => {
    const element = [...dom.window.document.querySelectorAll('button')].filter(x => x.textContent.trim() === label)[index]
    assert.ok(element, 'missing button: '+label)
    await act(async () => element.click())
  }
  const pulse = async () => { await act(async () => { for (const fn of [...intervals]) await fn() }) }
  const select = async (id, name = 'a', revision = 3) => {
    const frame = dom.window.document.querySelector('.dsg-frame')
    await act(async () => dom.window.dispatchEvent(new dom.window.MessageEvent('message', { source: frame.contentWindow,
      data: { source: 'dsh-designer', kind: 'select', name, revision, value: { tag: 'button', id, selector: '#'+id, text: id } } })))
  }
  return { dom, document: dom.window.document, data, calls, ctx, click, pulse, select, render,
    async settle(fn) { await act(async () => fn()) },
    get text() { return dom.window.document.body.textContent },
    get frame() { return dom.window.document.querySelector('.dsg-frame') },
  }
}

test('a failed first design load retries without requiring another model edit', async t => {
  let failures = 2
  const h = await panel(t, { fetch: call => call.url.pathname === '/designer/designs' && failures-- > 0
    ? Promise.reject(new Error('offline')) : undefined })
  await h.pulse(); await h.pulse()
  assert.ok(h.frame, 'the preview must recover when connectivity returns and the token stays unchanged')
  assert.ok(!h.document.querySelector('.dsg-welcome'), 'must not show the empty welcome guide')
})

test('HTTP errors are shown as connection errors instead of an empty welcome guide', async t => {
  const h = await panel(t, { fetch: call => call.url.pathname === '/designer/designs' ? response({ error: 'unavailable' }, 503) : undefined })
  assert.ok(!h.document.querySelector('.dsg-welcome'), 'must not show the empty welcome guide')
  assert.match(h.text, /连接|加载|重试/)
})

test('a late revision response cannot overwrite a newly selected branch', async t => {
  const held = deferred()
  const h = await panel(t, { fetch: call => call.url.pathname === '/designer/revisions' && call.url.searchParams.get('name') === 'a' ? held.promise : undefined })
  await h.click('b')
  assert.match(h.frame.src, /name=b/)
  await h.settle(() => held.resolve(response({ name: 'a', current: 7, revisions: [{ version: 6 }] })))
  assert.equal([...h.document.querySelectorAll('.dsg-ver')].some(x => x.textContent === 'r7'), false)
  assert.match(h.document.querySelector('.dsg-title').textContent, /b · r2/)
})

test('switching alternatives exits the previous alternative historical revision', async t => {
  const h = await panel(t)
  await h.click('r1')
  assert.match(h.frame.src, /rev=1/)
  await h.click('b')
  assert.equal(new URL(h.frame.src).searchParams.get('rev'), null)
  assert.ok(!h.document.querySelector('button[title="这一版是历史修订；让模型照它改，就会生成新的当前修订"]'))
})

test('a failed revision load retries and removed history falls back to the latest retained revision', async t => {
  let fail = false
  const h = await panel(t, { fetch: call => fail && call.url.pathname === '/designer/revisions' ? response({},503) : undefined })
  await h.click('r1')
  fail = true
  h.data.designs[0].version = 44
  h.data.revisions.a = { name: 'a', current: 44, revisions: [{ version: 43 }, { version: 42 }] }
  await h.pulse()
  fail = false
  await h.pulse(); await h.pulse()
  assert.equal(new URL(h.frame.src).searchParams.get('rev'), null, 'an evicted revision must not stay as an empty historical preview')
  assert.match(h.document.querySelector('.dsg-title').textContent, /r44/)
})

test('late failure of an older click does not hide the success receipt for the newest click', async t => {
  const held = deferred()
  const h = await panel(t, { fetch: call => call.url.pathname === '/designer/select' && call.body?.selection?.id === 'first' ? held.promise : undefined })
  await h.select('first')
  await h.select('second')
  assert.match(h.text, /点选已记录/)
  await h.settle(() => held.reject(new Error('older request failed')))
  assert.match(h.text, /点选已记录/)
  assert.equal(h.text.includes('回传 Host 失败'), false)
})

test('leaving a session ignores its pending requests and shows the new session data', async t => {
  const held = deferred()
  const h = await panel(t, { fetch: call => call.url.pathname === '/designer/designs' && call.url.searchParams.get('session') === 'a' ? held.promise : undefined })
  await h.render('b')
  await h.settle(() => held.resolve(response({ designs: [{ name: 'old-session', version: 1 }] })))
  assert.equal(h.text.includes('old-session'), false)
  assert.match(h.frame.src, /session=b/)
})

test('reopening the panel adopts the Host inspect-off state without enabling it', async t => {
  const h = await panel(t, { fetch: call => call.url.pathname === '/designer/inspect' && !call.body
    ? response({ ok: true, inspect: false, token: 'closed' }) : undefined })
  const button = [...h.document.querySelectorAll('button')].find(x => x.textContent === '点选')
  assert.equal(button.getAttribute('data-on'), '0')
  assert.equal(h.calls.some(x => x.url.pathname === '/designer/inspect' && x.body), false)
  await h.select('ignored')
  assert.ok(!h.document.querySelector('.dsg-sel'))
})

test('reopening the panel restores a retained historical selection and its receipt', async t => {
  const h = await panel(t, { fetch: call => call.url.pathname === '/designer/inspect' && !call.body
    ? response({ ok: true, inspect: true, token: 'open', selection: { name: 'b', revision: 1, tag: 'button', id: 'saved', selector: '#saved', delivered: true } }) : undefined })
  assert.match(h.frame.src, /name=b/)
  assert.equal(new URL(h.frame.src).searchParams.get('rev'), '1')
  assert.match(h.text, /提示已进入会话/)
  assert.match(h.text, /saved/)
  assert.equal(h.calls.some(x => x.body?.clear), false)
})

test('inspect synchronization failure pauses clicks and recovers without reloading the prototype', async t => {
  let fail = false
  const h = await panel(t, { fetch: call => fail && call.url.pathname === '/designer/inspect' && call.body
    ? Promise.reject(new Error('offline')) : undefined })
  const src = h.frame.src
  fail = true
  await h.click('点选')
  assert.match(h.text, /点选状态尚未同步/)
  await h.select('blocked')
  assert.ok(!h.document.querySelector('.dsg-sel'))
  fail = false
  await h.pulse()
  assert.equal(h.frame.src, src, 'toggling inspect must preserve prototype state')
  assert.equal(h.text.includes('点选状态尚未同步'), false)
  await h.click('点选')
  assert.equal(h.frame.src, src)
})

test('clear failure is visible and a later retry cannot clear a newer click', async t => {
  let fail = true
  const h = await panel(t, { fetch: call => fail && call.body?.clear ? Promise.reject(new Error('offline')) : undefined })
  await h.select('old')
  await h.click('清除')
  assert.match(h.text, /清除尚未同步/)
  await h.select('new')
  const count = h.calls.filter(x => x.body?.clear).length
  fail = false
  await h.pulse()
  assert.equal(h.calls.filter(x => x.body?.clear).length, count, 'obsolete clear must not be retried')
  assert.match(h.text, /点选已记录/)
  assert.match(h.text, /new/)
})

test('Host expiry removes the selection card and context delivery updates its receipt', async t => {
  let value = { hasSelection: true, delivered: true }
  const h = await panel(t, { fetch: call => call.url.pathname === '/designer/meta' ? response(value) : undefined })
  await h.select('buy')
  await h.pulse()
  assert.match(h.text, /提示已进入会话/)
  value = { hasSelection: false }
  await h.pulse()
  assert.ok(!h.document.querySelector('.dsg-sel'))
})

test('switching alternatives clears the previous element binding', async t => {
  const h = await panel(t)
  await h.select('buy')
  await h.click('b')
  assert.ok(!h.document.querySelector('.dsg-sel'))
  assert.ok(h.calls.some(x => x.body?.clear === true))
})

test('a delayed historical click cannot bind after switching to another revision', async t => {
  const h = await panel(t)
  await h.click('r1'); await h.click('r2')
  const before = h.calls.filter(x => x.body?.selection).length
  await h.select('old', 'a', 1)
  assert.ok(!h.document.querySelector('.dsg-sel'))
  assert.equal(h.calls.filter(x => x.body?.selection).length, before)
  await h.select('current', 'a', 2)
  assert.match(h.text, /点选已记录/)
})

test('one-alternative comparison waits for history and shows two different retained revisions', async t => {
  const held = deferred()
  let delay = false
  const h = await panel(t, { fetch: call => delay && call.url.pathname === '/designer/revisions' ? held.promise : undefined })
  h.data.designs.splice(1)
  await h.pulse()
  delay = true
  await h.click('对比')
  await h.settle(() => held.resolve(response(h.data.revisions.a)))
  const frames = [...h.document.querySelectorAll('.dsg-frame')]
  assert.equal(frames.length, 2)
  assert.notEqual(new URL(frames[0].src).searchParams.get('rev'), new URL(frames[1].src).searchParams.get('rev'))
})
