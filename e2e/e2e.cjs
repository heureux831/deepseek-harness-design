// One-shot end-to-end regression for the Designer panel in a real browser.
// Boots the app, reaches the Design tab, seeds branches/revisions through the
// host dev route, then asserts every behaviour the panel is supposed to have.
const fs = require('node:fs')
const { CDP, httpJson } = require('./cdp.cjs')

const PORT = Number(process.env.DSG_E2E_PORT || 19400)
const APP = 'http://127.0.0.1:' + PORT + '/'
const OUT_DIR = process.env.DSG_E2E_OUT_DIR || '/tmp/dsg-verify'
fs.mkdirSync(OUT_DIR, { recursive: true })
// The app demands a session cookie; navigating through the launch-token URL is
// what mints it, so the suite logs itself in the same way a person would.
const APP_URL = process.env.DSG_E2E_URL
  || (fs.existsSync(OUT_DIR + '/appurl.txt') ? fs.readFileSync(OUT_DIR + '/appurl.txt', 'utf8').trim() : APP)
const results = []
const check = (name, pass, detail) => { results.push({ name, pass, detail }); console.log((pass ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  :: ' + detail : '')) }

async function main() {
  const cdp = await CDP.attach(Number(process.env.DSG_E2E_CDP || 19500), String(PORT))
  const pending = new Map(); const consoleErrors = []
  cdp.ws.onMessage((t) => {
    const m = JSON.parse(t)
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      const d = (m.params.args || []).map((a) => a.description || a.value).join(' ')
      consoleErrors.push(String(d).slice(0, 200))
    }
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result ?? m.error); pending.delete(m.id) }
  })
  const send = (method, params = {}) => new Promise((r) => {
    const id = ++cdp.id
    cdp.ws.send(JSON.stringify({ id, method, params }))
    pending.set(id, r)
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); r({ __timeout: method }) } }, 25000)
  })
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r && r.exceptionDetails) return { __error: r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text }
    return r && r.result ? r.result.value : undefined
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const frameEv = async (expr, index = 0) => {
    for (let attempt = 0; attempt < 20; attempt++) {
      // The opaque-origin sandbox is an out-of-process iframe in Chrome, so it
      // has its own CDP target rather than a context in the page target.
      const targets = await httpJson(Number(process.env.DSG_E2E_CDP || 19500), '/json/list')
      const frame = targets.filter((item) => item.type === 'iframe'
        && item.url.includes('/designer/live') && item.url.includes('session=' + encodeURIComponent(sid)))[index]
      if (frame?.webSocketDebuggerUrl) {
        try {
          const ws = await CDP.connect(frame.webSocketDebuggerUrl)
          const r = await Promise.race([
            new Promise((resolve) => {
              ws.onMessage((raw) => { const m = JSON.parse(raw); if (m.id === 1) resolve(m.result ?? m.error) })
              ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
                expression: expr, returnByValue: true, awaitPromise: true,
              } }))
            }),
            wait(2000).then(() => null),
          ])
          ws.close()
          if (r && !r.exceptionDetails && r.result) return r.result.value
        } catch (error) { /* frame navigated; retry its new target */ }
      }
      await wait(150)
    }
    return undefined
  }
  const clickPreview = () => frameEv("(function(){var el=document.querySelector('h2')||document.body; el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})); return true})()")
  const inspectMode = () => frameEv("document.documentElement.getAttribute('data-dsh-inspect')")
  const shot = async (name) => {
    const s = await send('Page.captureScreenshot', { format: 'png' })
    if (s && s.data) fs.writeFileSync(OUT_DIR + '/' + name + '.png', Buffer.from(s.data, 'base64'))
  }

  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true })
  // One navigation: the token URL mints the cookie and redirects to the app.
  await send('Page.navigate', { url: APP_URL })
  for (let i = 0; i < 20; i++) {
    await wait(1000)
    if (await ev('!!window.__DSH_BOOT__')) break
  }
  await wait(1500)

  const loggedIn = await ev('!!window.__DSH_BOOT__')
  check('01 应用可加载（cookie 有效）', loggedIn === true, 'boot=' + loggedIn)
  if (!loggedIn) { cdp.ws.close(); return finish() }

  // Reach the Design tab the way a person does: dismiss the notice, ensure a
  // session exists, open the right sidebar, then pick the Design card.
  const clickBy = async (predicate, label) => {
    const clicked = await ev(`(function(){
      var el = [...document.querySelectorAll('button')].find(${predicate});
      if (!el) return false;
      el.click();
      return true;
    })()`)
    return clicked
  }

  await clickBy("function(b){return b.textContent.trim()==='继续'}", 'dismiss notice')
  await clickBy("function(b){return b.textContent.trim()==='稍后配置'}", 'defer API key')
  await wait(900)
  await clickBy("function(b){return b.textContent.indexOf('新会话')>=0}", 'new session')
  await wait(2500)
  await clickBy("function(b){return b.getAttribute('aria-label')==='打开右侧边栏'}", 'open rightbar')
  await wait(1800)
  await clickBy("function(b){var t=(b.textContent||'').trim(); return t.indexOf('Design')===0 && t.indexOf('实时预览')>=0}", 'design card')
  await wait(2800)

  check('02 Design 面板挂载（无崩溃）', await ev("!!document.querySelector('.dsg-root')") === true)

  const sid = await ev("(function(){var m=document.body.innerHTML.match(/session-[0-9a-f-]{36}/); return m?m[0]:null})()")
  check('03 取到会话 ID', typeof sid === 'string' && sid.startsWith('session-'), sid)

  // Seed through the host dev route so branches and revisions really exist.
  const payload = JSON.stringify({
    session: sid,
    branches: [
      { name: 'A', revisions: [
        "<div style='font:16px/1.6 system-ui;padding:28px'><h2>方案 A</h2><p>第一版</p></div>",
        "<div style='font:16px/1.6 system-ui;padding:28px'><h2>方案 A</h2><p>第二版</p></div>",
        "<div style='font:16px/1.6 system-ui;padding:28px'><h2>方案 A</h2><p>第三版</p></div>",
      ] },
      { name: 'B', revisions: ["<div style='font:16px/1.6 system-ui;padding:28px'><h2>方案 B</h2><p>另一条路线</p></div>"] },
    ],
  })
  const seeded = await ev("fetch('/designer/dev/seed',{method:'POST',headers:{'content-type':'application/json'},body:" + JSON.stringify(payload) + "}).then(function(r){return r.json()}).then(function(v){return v.ok})")
  check('04 dev seed 写入两条分支', seeded === true, String(seeded))
  await wait(3500)

  const isolated = await ev("(function(){var f=document.querySelector('.dsg-frame'); return !!f && f.getAttribute('sandbox')==='allow-scripts' && f.contentDocument===null})()")
  const parentReadable = await frameEv("(function(){try{return !!parent.document.body}catch(e){return false}})()")
  check('04b 预览脚本不能读取 DSH 主页面', isolated === true && parentReadable === false,
    'sandbox=' + isolated + ' parentReadable=' + parentReadable)
  const csp = await ev("fetch(document.querySelector('.dsg-frame').getAttribute('src')).then(r=>r.headers.get('content-security-policy'))")
  check('04c 直接打开预览 URL 也有沙箱响应头', csp === 'sandbox allow-scripts', String(csp))
  await frameEv("fetch('/designer/select',{method:'POST',mode:'no-cors',headers:{'content-type':'text/plain'},body:JSON.stringify({session:window.__dshDesignerSession,name:window.__dshDesignerName,selection:{tag:'script',id:'forged-from-preview'}})}).then(()=>true).catch(()=>false)")
  const forged = await ev("fetch('/designer/meta?session=" + sid + "&name=b').then(r=>r.json()).then(v=>v.hasSelection)")
  check('04d 沙箱脚本的简单 POST 不能伪造点选', forged === false)

  const caps = await ev("(function(){return [...document.querySelectorAll('.dsg-ver')].map(function(b){return b.textContent.trim()})})()")
  check('05 面板自动跟到种子（轮询生效）', Array.isArray(caps) && caps.indexOf('b') >= 0 && caps.indexOf('a') >= 0, JSON.stringify(caps))

  const shownBranch = await ev("(function(){var on=[...document.querySelectorAll('.dsg-ver')].find(function(b){return b.getAttribute('data-on')==='1'}); return on?on.textContent.trim():null})()")
  check('07 默认停在某个方案上', shownBranch === 'a' || shownBranch === 'b', String(shownBranch))

  // Drive the branch that actually carries the revision chain.
  await ev("(function(){var v=[...document.querySelectorAll('.dsg-ver')].find(function(b){return b.textContent.trim()==='a'}); if(v)v.click(); return !!v})()")
  await wait(2200)
  const onA = { p: await frameEv("document.querySelector('p')?.textContent"), src: await ev("document.querySelector('.dsg-frame')?.getAttribute('src')") }
  check('07b 切到方案 a 显示其最新修订', onA && onA.p === '第三版', JSON.stringify(onA))

  const revCaps = await ev("(function(){return [...document.querySelectorAll('.dsg-ver')].map(function(b){return b.textContent.trim()}).filter(function(t){return /^r\\d+$/.test(t)})})()")
  check('06 修订链出现（r3/r2/r1）', Array.isArray(revCaps) && revCaps.length >= 3, JSON.stringify(revCaps))

  // Switch to r1 and confirm BOTH the url and the rendered content follow.
  await ev("(function(){var v=[...document.querySelectorAll('.dsg-ver')].find(function(b){return b.textContent.trim()==='r1'}); if(v)v.click(); return !!v})()")
  await wait(2000)
  const afterRev = { p: await frameEv("document.querySelector('p')?.textContent"), src: await ev("document.querySelector('.dsg-frame')?.getAttribute('src')") }
  check('08 切到 r1：内容真的回退', afterRev && afterRev.p === '第一版', JSON.stringify(afterRev))
  check('09 切到 r1：URL 带 rev=1', !!(afterRev && /rev=1(&|$)/.test(afterRev.src)), afterRev && afterRev.src)
  await shot('30-rev-r1')

  // Compare mode: two independent panes, each with its own branch + revision.
  await ev("(function(){var b=[...document.querySelectorAll('.dsg-btn')].find(function(x){return x.textContent.trim()==='对比'}); if(b&&!b.disabled)b.click(); return b?!b.disabled:false})()")
  await wait(2500)
  const cmp = await ev("(function(){return {sides:document.querySelectorAll('.dsg-side').length, frames:document.querySelectorAll('.dsg-frame').length, heads:document.querySelectorAll('.dsg-sidehead').length, captions:[...document.querySelectorAll('.dsg-side .dsg-tag')].map(function(t){return t.textContent.trim()}).slice(0,6)}})()")
  check('10 对比模式两栏渲染', cmp && cmp.sides === 2 && cmp.frames === 2, JSON.stringify(cmp))
  check('11 两栏各有方案+修订两行', cmp && cmp.heads === 4, 'heads=' + (cmp && cmp.heads))
  check('12 位置标记不再与分支名撞车', !!(cmp && cmp.captions.includes('左') && cmp.captions.includes('右')), JSON.stringify(cmp && cmp.captions))
  await wait(2000)
  const staggered = await ev("(function(){var sides=[...document.querySelectorAll('.dsg-side')]; return sides.map(function(s){var on=[...s.querySelectorAll('.dsg-ver')].filter(function(b){return b.getAttribute('data-on')==='1'}).map(function(b){return b.textContent.trim()}); return on.join('+')})})()")
  check('10b 对比两侧自动错开（不自己比自己）', Array.isArray(staggered) && staggered.length === 2 && staggered[0] !== staggered[1], JSON.stringify(staggered))
  await shot('31-compare')

  // Click inside the left preview and confirm the host records the selection.
  await clickPreview()
  await wait(1800)
  const sel = await ev("(function(){var s=document.querySelector('.dsg-sel'); return s?s.innerText.replace(/\\n+/g,' | ').slice(0,120):null})()")
  check('13 点选卡片确认 Host 已记录', typeof sel === 'string' && sel.includes('点选已记录') && !sel.includes('已告知模型'), sel)

  const selName = await ev("(function(){var m=document.querySelector('.dsg-sel')?document.querySelector('.dsg-sel').innerText:''; if(m.indexOf('方案 B')>=0) return 'b'; if(m.indexOf('方案 A')>=0) return 'a'; return null})()")
  const hostSel = await ev("fetch('/designer/meta?session=" + sid + "&name=" + selName + "').then(function(r){return r.json()}).then(function(v){return v.hasSelection})")
  check('14 host 侧确实收到了选中', hostSel === true, 'design=' + selName + ' hasSelection=' + hostSel)

  // Regression: turning inspect OFF, then switching branch, used to come back ON
  // because the rebuilt iframe booted with the document default.
  await ev("(function(){var b=[...document.querySelectorAll('.dsg-btn')].find(function(x){return x.textContent.trim()==='点选'}); if(b&&b.getAttribute('data-on')==='1')b.click(); return true})()")
  await wait(900)
  const offState = { btn: await ev("[...document.querySelectorAll('.dsg-btn')].find(x=>x.textContent.trim()==='点选')?.getAttribute('data-on')"), doc: await inspectMode() }
  check('16a 关闭点选立即生效', offState && offState.btn === '0' && offState.doc === 'off', JSON.stringify(offState))

  // 点选 is the BINDING switch, not a click filter: switching it off must unbind
  // what was clicked while it was on, and keep a click that is still travelling
  // from re-arming the binding behind the user's back.
  // The branch is read back from the frame itself: hard-coding it makes a
  // "nothing is bound" assertion pass for the wrong reason after a switch.
  const frameBranch = () => ev("(function(){var f=document.querySelector('.dsg-frame'); return f?f.getAttribute('src').match(/name=([^&]+)/)[1]:null})()")
  const hasSelection = (name) => ev("fetch('/designer/meta?session=" + sid + "&name=" + name + "').then(function(r){return r.json()}).then(function(v){return v.hasSelection})")

  const probe = (await frameBranch()) || selName || 'a'
  const afterOff = await hasSelection(probe)
  check('17a 关闭点选后模型不再被指向该元素', afterOff === false, 'hasSelection(' + probe + ')=' + afterOff)

  const strayBody = JSON.stringify({ session: sid, name: probe, selection: { tag: 'span', id: 'stray', selector: 'body > span' } })
  const stray = await ev("fetch('/designer/select',{method:'POST',headers:{'content-type':'application/json'},body:" + JSON.stringify(strayBody) + "}).then(function(r){return r.json()})")
  check('17b 在途点击被拒收（不复活绑定）', !!(stray && stray.ignored === 'inspect-off'), JSON.stringify(stray))

  const straySel = await hasSelection(probe)
  check('17c 拒收之后 Host 里仍然是空的', straySel === false, 'hasSelection=' + straySel)

  await ev("(function(){var v=[...document.querySelectorAll('.dsg-ver')].find(function(b){return b.textContent.trim()==='b'}); if(v)v.click(); return !!v})()")
  await wait(3000)
  const offAfterSwitch = { btn: await ev("[...document.querySelectorAll('.dsg-btn')].find(x=>x.textContent.trim()==='点选')?.getAttribute('data-on')"), doc: await inspectMode(), name: await frameBranch() }
  check('16b 切方案后点选仍为关（工具栏与预览一致）',
    offAfterSwitch && offAfterSwitch.btn === '0' && offAfterSwitch.doc === 'off',
    JSON.stringify(offAfterSwitch))
  await shot('32-inspect-off-after-switch')

  // Re-arm: the switch works both ways, but re-arming must not resurrect the
  // element that was unbound — only a fresh click may bind again. Checking the
  // store while the gate is OPEN is what separates "dropped" from "merely muted".
  await ev("(function(){var b=[...document.querySelectorAll('.dsg-btn')].find(function(x){return x.textContent.trim()==='点选'}); if(b&&b.getAttribute('data-on')==='0')b.click(); return true})()")
  await wait(1500)
  const rearmed = { btn: await ev("[...document.querySelectorAll('.dsg-btn')].find(x=>x.textContent.trim()==='点选')?.getAttribute('data-on')"), doc: await inspectMode(), card: await ev("!!document.querySelector('.dsg-sel')") }
  check('18a 重新开启点选：预览恢复捕获点击', rearmed && rearmed.btn === '1' && rearmed.doc === 'on', JSON.stringify(rearmed))
  check('18b 被解除绑定的元素没有自己回来（已丢弃，非静音）', rearmed && rearmed.card === false, 'card=' + (rearmed && rearmed.card))

  const probe2 = (await frameBranch()) || probe
  const revived = await hasSelection(probe2)
  check('18c 闸门打开后 Host 里依然是空的', revived === false, 'hasSelection(' + probe2 + ')=' + revived)

  await clickPreview()
  await wait(1800)
  const rebound = await hasSelection(probe2)
  const reboundCard = await ev("!!document.querySelector('.dsg-sel')")
  check('18d 重新开启后，新的点击又能绑定', rebound === true && reboundCard === true,
    'hasSelection(' + probe2 + ')=' + rebound + ' card=' + reboundCard)

  // The everyday path: one pane, no compare. Off means off — a click made while
  // 点选 is off must not bind, and must not be remembered for later either.
  await ev("(function(){var b=[...document.querySelectorAll('.dsg-btn')].find(function(x){return x.textContent.trim()==='对比中'}); if(b)b.click(); return true})()")
  await wait(2600)
  const single = { frames: await ev("document.querySelectorAll('.dsg-frame').length"), doc: await inspectMode() }
  check('19a 退出对比回到单栏，点选为开', single && single.frames === 1 && single.doc === 'on', JSON.stringify(single))

  await ev("(function(){var b=[...document.querySelectorAll('.dsg-btn')].find(function(x){return x.textContent.trim()==='点选'}); if(b&&b.getAttribute('data-on')==='1')b.click(); return true})()")
  await wait(1200)
  await clickPreview()
  await wait(1600)
  const p3 = (await frameBranch()) || probe2
  const offClickBound = await hasSelection(p3)
  const offClickCard = await ev("!!document.querySelector('.dsg-sel')")
  check('19b 点选关闭时点击不绑定（也不会被记住）', offClickBound === false && offClickCard === false,
    'hasSelection(' + p3 + ')=' + offClickBound + ' card=' + offClickCard)

  await ev("(function(){var b=[...document.querySelectorAll('.dsg-btn')].find(function(x){return x.textContent.trim()==='点选'}); if(b&&b.getAttribute('data-on')==='0')b.click(); return true})()")
  await wait(1200)
  await clickPreview()
  await wait(1600)
  const singleBound = await hasSelection(p3)
  check('19c 单栏下重新开启点选，点击照常绑定', singleBound === true, 'hasSelection(' + p3 + ')=' + singleBound)
  await shot('33-single-rebind')

  // Mount a real second Session through the test-only provider; no model call is needed.
  const sid2 = 'designer-e2e-other-' + Date.now()
  const secondSeed = JSON.stringify({ session: sid2, branches: [], createSession: true })
  const secondReady = await ev("fetch('/designer/dev/seed',{method:'POST',headers:{'content-type':'application/json'},body:" + JSON.stringify(secondSeed) + "}).then(r=>r.json()).then(v=>v.ok)")
  check('20 第二个真实会话可独立设置点选', secondReady === true)
  const secondOff = JSON.stringify({session:sid2,on:false})
  await ev("fetch('/designer/inspect',{method:'POST',headers:{'content-type':'application/json'},body:" + JSON.stringify(secondOff) + "}).then(r=>r.json())")
  const firstClick = JSON.stringify({session:sid,name:p3,selection:{tag:'button',id:'session-a-after-b-off'}})
  const response = await ev("fetch('/designer/select',{method:'POST',headers:{'content-type':'application/json'},body:" + JSON.stringify(firstClick) + "}).then(r=>r.json())")
  check('21 会话 B 关闭点选不影响会话 A', !!response && response.ok === true && !response.ignored && await hasSelection(p3) === true, JSON.stringify(response))

  const fatal = consoleErrors.filter((e) => e.includes('viewingOld') || e.includes("crashed in 'sidebar.right.pane.tab'")
    || e.includes('DesignBody'))
  check('15 Designer 面板无崩溃', fatal.length === 0, fatal.slice(0, 2).join(' ;; ') || 'clean')

  cdp.ws.close()
  finish()
}

function finish() {
  const failed = results.filter((r) => !r.pass)
  console.log('\n===== ' + (results.length - failed.length) + '/' + results.length + ' passed =====')
  if (failed.length) { console.log('FAILURES:'); for (const f of failed) console.log(' - ' + f.name + ' :: ' + f.detail); process.exitCode = 1 }
}
main().catch((e) => { console.error('E2E ERROR:', e.message); process.exitCode = 1 })
