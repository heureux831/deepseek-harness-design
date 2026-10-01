/**
 * Designer — bundle browser half.
 *
 * Registers the right-sidebar "Design" tab type and its body. The body renders
 * the prototype served by the host half's `/designer/live` route inside an
 * opaque-origin sandboxed iframe, polls `/designer/rev` for a new version, and
 * relays element clicks made inside the preview.
 *
 * Plain classic script: the module system hands it `React` through `require`,
 * and every registration happens inside the factory so nothing runs at load.
 */
window.__ModuleLoader__.load({
  id: 'deepseek-harness-design',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const TAB_ID = 'deepseek-harness-design'
    const TAB_KIND = 'designer'
    const POLL_MS = 900
    const CSS_TAG_ID = 'deepseek-harness-design/panel.css'

    const CSS = [
      '.dsg-root{display:flex;flex-direction:column;height:100%;min-height:0;color:var(--dsw-alias-label-primary,#111)}',
      '.dsg-bar{display:flex;align-items:center;gap:6px;padding:6px 8px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08));flex:none;flex-wrap:wrap}',
      '.dsg-title{font-size:12px;font-weight:500;color:var(--dsw-alias-label-secondary,#666);margin-right:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px}',
      '.dsg-btn{appearance:none;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));background:transparent;color:var(--dsw-alias-label-secondary,#555);border-radius:6px;font:inherit;font-size:12px;line-height:18px;padding:2px 8px;cursor:pointer;white-space:nowrap}',
      '.dsg-btn:hover{background:var(--dsw-alias-bg-l2,rgba(0,0,0,.05));color:var(--dsw-alias-label-primary,#111)}',
      '.dsg-btn[data-on="1"]{background:var(--dsw-alias-state-business-primary,#4176e6);border-color:transparent;color:#fff}',
      '.dsg-canvas{flex:1;min-height:0;overflow:auto;display:flex;justify-content:center;align-items:flex-start;padding:10px;background:var(--dsw-alias-bg-l2,rgba(0,0,0,.04))}',
      '.dsg-holder{height:100%;min-height:400px;transition:width .16s ease}',
      '.dsg-frame{border:0;background:#fff;width:100%;height:100%;min-height:400px;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.12);display:block}',
      '.dsg-note{font-size:12px;color:var(--dsw-alias-label-tertiary,#888);padding:8px 10px;line-height:18px}',
      '.dsg-welcome{flex:1;min-height:0;overflow:auto;box-sizing:border-box;padding:28px 20px 24px}',
      '.dsg-welcome-inner{max-width:520px;margin:0 auto}',
      '.dsg-welcome-kicker{font-size:10px;line-height:16px;letter-spacing:.12em;color:var(--dsw-alias-label-tertiary,#888)}',
      '.dsg-welcome h1{font-size:23px;font-weight:600;line-height:1.4;letter-spacing:-.02em;margin:8px 0 10px;overflow-wrap:anywhere}',
      '.dsg-welcome-intro{font-size:13px;line-height:1.8;color:var(--dsw-alias-label-secondary,#555);margin:0 0 24px}',
      '.dsg-welcome-steps{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:22px}',
      '.dsg-welcome-step{display:grid;grid-template-columns:24px minmax(0,1fr);gap:12px}',
      '.dsg-welcome-num{width:24px;height:24px;display:grid;place-items:center;border-radius:50%;background:var(--dsw-alias-bg-l2,rgba(0,0,0,.05));font-size:11px;color:var(--dsw-alias-label-secondary,#555)}',
      '.dsg-welcome h2{font-size:13px;font-weight:600;line-height:24px;margin:0 0 4px}',
      '.dsg-welcome-step p{font-size:12px;line-height:1.8;margin:0;color:var(--dsw-alias-label-secondary,#555)}',
      '.dsg-welcome-example{font-size:12px;line-height:1.8;margin:10px 0 0;padding:10px 12px;background:var(--dsw-alias-bg-l2,rgba(0,0,0,.04));border-left:2px solid var(--dsw-alias-state-business-primary,#4176e6);border-radius:0 6px 6px 0;overflow-wrap:anywhere}',
      '.dsg-welcome-tip{margin:24px 0 0;padding-top:16px;border-top:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08));font-size:12px;line-height:1.8;color:var(--dsw-alias-label-secondary,#555)}',
      '.dsg-sel{flex:none;border-top:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08));padding:8px 10px;display:flex;flex-direction:column;gap:6px}',
      '.dsg-row{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary,#666);min-width:0}',
      '.dsg-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsg-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary,#666);background:var(--dsw-alias-bg-l2,rgba(0,0,0,.04));border-radius:6px;padding:6px 8px;max-height:88px;overflow:auto;white-space:pre-wrap;word-break:break-all;margin:0}',
      '.dsg-spacer{flex:1}',
      '.dsg-select{appearance:none;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));background:transparent;color:var(--dsw-alias-label-secondary,#555);border-radius:6px;font:inherit;font-size:12px;line-height:18px;padding:2px 6px;max-width:150px;cursor:pointer}',
      '.dsg-bar-versions{gap:8px}',
      '.dsg-versions{display:flex;align-items:center;gap:4px;flex-wrap:wrap;min-width:0}',
      '.dsg-vrows{display:flex;flex-direction:column;gap:5px;min-width:0;flex:1}',
      '.dsg-ver{appearance:none;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));background:transparent;color:var(--dsw-alias-label-secondary,#555);border-radius:999px;font:inherit;font-size:12px;line-height:18px;padding:2px 10px;cursor:pointer;white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis}',
      '.dsg-ver:hover:not([data-on="1"]){background:var(--dsw-alias-bg-l2,rgba(0,0,0,.05));color:var(--dsw-alias-label-primary,#111)}',
      '.dsg-ver[data-on="1"]{background:var(--dsw-alias-state-business-primary,#4176e6);border-color:transparent;color:#fff}',
      '.dsg-ver:disabled{opacity:.5;cursor:default}',
      '.dsg-split{flex:1;min-height:0;display:flex;gap:1px;background:var(--dsw-alias-border-l2,rgba(0,0,0,.08))}',
      '.dsg-side{flex:1 1 0;min-width:0;display:flex;flex-direction:column;background:var(--dsw-alias-bg-document,#fff)}',
      '.dsg-sidebar{display:flex;align-items:center;gap:6px;padding:5px 8px;flex:none;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08))}',
      '.dsg-sidehead{display:flex;align-items:center;gap:6px;padding:5px 8px;flex:none;flex-wrap:wrap}',
      '.dsg-sidehead + .dsg-sidehead{border-top:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.05));padding-top:4px;padding-bottom:4px}',
      '.dsg-tag{font-size:11px;font-weight:600;color:var(--dsw-alias-label-tertiary,#999);letter-spacing:.04em}',
      '.dsg-sidebody{flex:1;min-height:0;padding:8px;background:var(--dsw-alias-bg-l2,rgba(0,0,0,.04));display:flex}',
      '.dsg-sidebody .dsg-frame{min-height:0;height:100%}',
    ].join('\n')

    const WIDTHS = [[0, '自适应'], [390, '手机'], [834, '平板'], [1280, '桌面']]

    /** Quote a value for a query string. */
    function q(value) {
      return encodeURIComponent(String(value))
    }

    /** Install the panel stylesheet once, tagged so a reload is idempotent. */
    function installStyles() {
      if (typeof document === 'undefined') return function () {}
      if (document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_TAG_ID) + ']') !== null) {
        return function () {}
      }
      const tag = document.createElement('style')
      tag.setAttribute('data-plugin-css', CSS_TAG_ID)
      tag.textContent = CSS
      document.head.appendChild(tag)
      return function () { tag.remove() }
    }

    /** Every alternative this session holds, for the pickers. */
    function useDesigns(sessionId, ctx, tick) {
      const state = React.useState([])
      const designs = state[0]
      const setDesigns = state[1]
      const load = React.useCallback(function () {
        if (sessionId === '') return
        fetch('/designer/designs?session=' + q(sessionId), { cache: 'no-store' })
          .then(function (response) { return response.json() })
          .then(function (value) { setDesigns(Array.isArray(value.designs) ? value.designs : []) })
          .catch(function () { /* try again on the next tick */ })
      }, [sessionId])
      React.useEffect(function () { load() }, [load, tick])
      return designs
    }

    function DesignBody(props) {
      const sessionId = String(props.sessionId || '')
      const metaState = React.useState({ version: 0, token: '', count: 0 })
      const meta = metaState[0]
      const setMeta = metaState[1]
      const bumpState = React.useState(0)
      const bump = bumpState[0]
      const setBump = bumpState[1]
      const widthState = React.useState(0)
      const width = widthState[0]
      const setWidth = widthState[1]
      const inspectState = React.useState(true)
      const inspect = inspectState[0]
      const setInspect = inspectState[1]
      const selectionState = React.useState(null)
      const selection = selectionState[0]
      const setSelection = selectionState[1]
      // Each pane owns its own revision chain: the compare view shows two
      // INDEPENDENT branches, so one shared chain was wrong by construction.
      const singleRevState = React.useState({ current: 0, revisions: [], shown: 0 })
      const singleRev = singleRevState[0]
      const setSingleRev = singleRevState[1]
      const leftRevState = React.useState({ current: 0, revisions: [], shown: 0 })
      const leftRev = leftRevState[0]
      const setLeftRev = leftRevState[1]
      const rightRevState = React.useState({ current: 0, revisions: [], shown: 0 })
      const rightRev = rightRevState[0]
      const setRightRev = rightRevState[1]

      // Whether the single pane is showing a historical revision. Declared here,
      // above every reader: the canvas, the revision row, and the toolbar all
      // depend on it, and `const` does not hoist.
      const viewingOld = singleRev.shown > 0 && singleRev.shown !== singleRev.current
      const deliveryState = React.useState('idle')
      const delivery = deliveryState[0]
      const setDelivery = deliveryState[1]
      const compareState = React.useState(false)
      const compare = compareState[0]
      const setCompare = compareState[1]
      const leftState = React.useState('')
      const left = leftState[0]
      const setLeft = leftState[1]
      const rightState = React.useState('')
      const right = rightState[0]
      const setRight = rightState[1]
      const tokenRef = React.useRef('')
      const frameRefs = React.useRef(new Set())
      const comparePrimed = React.useRef(false)
      const inspectRef = React.useRef(inspect)
      inspectRef.current = inspect

      // Poll for any change across the session's alternatives; the iframes are
      // only re-pointed when the token actually moves, so an open prototype is
      // never interrupted mid-interaction.
      const tick = React.useCallback(function () {
        if (sessionId === '') return
        fetch('/designer/rev?session=' + q(sessionId), { cache: 'no-store' })
          .then(function (response) { return response.json() })
          .then(function (value) {
            if (tokenRef.current === value.token) return
            tokenRef.current = value.token
            setMeta({ version: value.version, token: value.token, count: value.count })
            setBump(function (count) { return count + 1 })
          })
          .catch(function () { /* the host may be between restarts; retry next tick */ })
      }, [sessionId])

      const designs = useDesigns(sessionId, props.ctx, bump)

      React.useEffect(function () { tick() }, [tick])

      React.useEffect(function () {
        if (sessionId === '') return undefined
        const stop = props.ctx.timer.interval(tick, POLL_MS)
        return function () { stop() }
      }, [props.ctx, sessionId, tick])

      // Keep the compare pickers pointed at real alternatives.
      React.useEffect(function () {
        if (designs.length === 0) return
        const names = designs.map(function (item) { return item.name })
        setLeft(function (current) { return names.indexOf(current) >= 0 ? current : names[0] })
        setRight(function (current) {
          if (names.indexOf(current) >= 0) return current
          return names.length > 1 ? names[1] : names[0]
        })
      }, [designs])

      /**
       * Load one pane's revision chain. `branch` is that pane's own branch, so
       * the compare view keeps a separate chain per side; `bump` re-runs it on
       * every new revision, which is what makes an edit appear in BOTH panes.
       */
      function useRevisionChain(branch, setState) {
        React.useEffect(function () {
          if (sessionId === '' || branch === '') return
          fetch('/designer/revisions?session=' + q(sessionId) + '&name=' + q(branch), { cache: 'no-store' })
            .then(function (response) { return response.json() })
            .then(function (value) {
              const current = value.current || 0
              setState(function (previous) {
                // Follow the newest revision, unless this pane is browsing history.
                const browsing = previous.shown > 0 && previous.shown < previous.current
                return {
                  current,
                  revisions: Array.isArray(value.revisions) ? value.revisions : [],
                  shown: browsing ? previous.shown : current,
                }
              })
            })
            .catch(function () { /* retry on the next bump */ })
        }, [sessionId, branch, bump])
      }

      useRevisionChain(left, setSingleRev)
      useRevisionChain(compare ? left : '', setLeftRev)
      useRevisionChain(compare ? right : '', setRightRev)

      // Entering compare mode must show two DIFFERENT things, or the mode is
      // pointless. When both panes would land on the same branch AND revision,
      // stagger them: same branch's previous revision, or the other branch.
      React.useEffect(function () {
        if (compare) {
          if (comparePrimed.current) return
          comparePrimed.current = true
        } else {
          comparePrimed.current = false
          return
        }
        const sameBranch = left === right
        const sameRevision = leftRev.shown === rightRev.shown
          || (leftRev.shown === 0 && rightRev.shown === 0)
        if (!sameBranch || !sameRevision) return

        const roll = function (chain) {
          if (chain.current <= 1) return false
          const previous = chain.current - 1
          setRightRev(function (state) {
            return { current: state.current, revisions: state.revisions, shown: previous }
          })
          return true
        }
        if (roll(rightRev)) return
        const alternate = designs.map(function (item) { return item.name })
          .filter(function (name) { return name !== left })
        if (alternate.length > 0) setRight(alternate[0])
      }, [compare, left, right, leftRev, rightRev, designs])

      // Mirror 点选 to the Host. The Host is the side that decides whether a
      // click may reach the model, so the switch has to be known there and not
      // only in this panel — and this also fires on mount, which re-gates a Host
      // that kept the mode from before a page reload.
      React.useEffect(function () {
        if (sessionId === '') return
        fetch('/designer/inspect', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ session: sessionId, on: inspect }),
        }).catch(function () { /* the panel keeps working; the Host keeps its last mode */ })
      }, [inspect, sessionId])

      // Push inspect mode into every mounted preview. This is the whole point:
      // toggling it must not reload the prototype, because the prototype has its
      // own state (which tab of a comparison it is showing) that a reload resets.
      React.useEffect(function () {
        frameRefs.current.forEach(function (node) {
          if (!node.isConnected) return
          try {
            node.contentWindow.postMessage(
              { source: 'dsh-designer-panel', kind: 'inspect', on: inspect },
              '*',
            )
          } catch (error) { /* the frame is between loads; the ready handshake catches it */ }
        })
      }, [inspect, bump])

      // Clicks relayed by the bridge inside a preview document.
      React.useEffect(function () {
        function onMessage(event) {
          const data = event.data
          if (!data || data.source !== 'dsh-designer') return
          if (![...frameRefs.current].some(function (node) {
            return node.isConnected && node.contentWindow === event.source
          })) return
          if (data.kind === 'ready') {
            // A fresh preview document booted with its own default. Overwrite it
            // with the mode this panel is actually showing, or the toolbar and
            // the preview disagree after every branch switch.
            try {
              event.source.postMessage(
                { source: 'dsh-designer-panel', kind: 'inspect', on: inspectRef.current },
                '*',
              )
            } catch (error) { /* the frame went away between announce and reply */ }
            return
          }
          if (data.kind !== 'select') return
          if (!inspectRef.current) return
          setSelection(data.value)
          setDelivery('sending')
          fetch('/designer/select', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ session: sessionId, name: data.name, selection: data.value }),
          })
            .then(function (response) { return response.json() })
            .then(function (value) {
              if (value && value.ok && !value.ignored) setDelivery('sent')
              else {
                setSelection(null)
                setDelivery('failed')
              }
            })
            .catch(function () { setDelivery('failed') })
        }
        window.addEventListener('message', onMessage)
        return function () { window.removeEventListener('message', onMessage) }
      }, [sessionId])

      /**
       * Unbind the selected element: drop it here AND in the Host store.
       * 点选 is the binding switch, so switching it off has to run this — what
       * was clicked while it was on must not reach the model afterwards.
       */
      function clearBinding() {
        setSelection(null)
        setDelivery('idle')
        fetch('/designer/select', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ session: sessionId, clear: true }),
        }).catch(function () { /* clearing is best-effort */ })
      }

      /** One preview frame, pointed at one alternative. */
      function frame(name, label, revision) {
        if (sessionId === '') return null
        const src = '/designer/live?session=' + q(sessionId) + '&name=' + q(name)
          + (revision > 0 ? '&rev=' + revision : '') + '&t=' + bump
        return h('iframe', {
          key: name,
          // The prototype may contain model-written scripts. Give it an opaque
          // origin so those scripts cannot read the Harness page or call its APIs.
          sandbox: 'allow-scripts',
          // Track frames as a SET of live nodes, never by branch name: in compare
          // mode both panes can show the same branch, and a name-keyed map then
          // lets one pane's cleanup delete the other pane's entry — after which
          // the mode push below silently reaches nobody and a rebuilt preview
          // keeps the mode it booted with.
          ref: function (node) {
            const live = frameRefs.current
            if (node !== null) live.add(node)
            for (const candidate of [...live]) if (!candidate.isConnected) live.delete(candidate)
          },
          className: 'dsg-frame',
          src: src,
          title: 'design preview: ' + name,
        })
      }

      /** A picker over the session's alternatives. */
      /**
       * The version bar: one capsule per alternative, always rendered so the
       * panel always OWNS version switching. A prototype must not grow its own
       * switcher — that is what this bar is for.
       */
      function versions(label, items, value, onChange, disabled) {
        return h('div', { className: 'dsg-versions', role: 'tablist' },
          h('span', { className: 'dsg-tag' }, label),
          items.length === 0
            ? h('span', { className: 'dsg-tag' }, '—')
            : items.map(function (item) {
              const on = item.value === value
              return h('button', {
                key: String(item.value),
                type: 'button',
                role: 'tab',
                className: 'dsg-ver',
                'data-on': on ? '1' : '0',
                disabled: disabled === true,
                title: item.title,
                onClick: function () { if (!on) onChange(item.value) },
              }, item.text)
            }),
        )
      }

      const buttons = WIDTHS.map(function (pair) {
        return h('button', {
          key: 'w' + pair[0],
          type: 'button',
          className: 'dsg-btn',
          'data-on': width === pair[0] ? '1' : '0',
          onClick: function () { setWidth(pair[0]) },
        }, pair[1])
      })

      // Comparing two revisions of ONE branch is a first-class case, so the
      // gate is "two panes' worth of content", not "two branches".
      const canCompare = designs.length >= 2
        || (designs.length === 1 && (singleRev.revisions.length + (singleRev.current > 0 ? 1 : 0)) >= 2)

      buttons.push(h('button', {
        key: 'compare',
        type: 'button',
        className: 'dsg-btn',
        'data-on': compare ? '1' : '0',
        title: canCompare
          ? '并排对比（两个方案，或同一方案的两个修订）'
          : '还只有一版，先让模型「再来一版」或改一次',
        disabled: !canCompare,
        onClick: function () { setCompare(function (value) { return !value }) },
      }, compare ? '对比中' : '对比'))

      buttons.push(h('button', {
        key: 'inspect',
        type: 'button',
        className: 'dsg-btn',
        'data-on': inspect ? '1' : '0',
        title: inspect
          ? '点选已开启：点击预览里的元素会把它的源码上下文交给模型。关闭即解除绑定。'
          : '点选已关闭：之前点过的元素已解除绑定，模型不会再收到它。',
        onClick: function () {
          const next = !inspect
          setInspect(next)
          // 点选 reads as "armed / not armed", not "filter clicks": switching it
          // off unbinds what was clicked while it was on.
          if (!next) clearBinding()
        },
      }, '点选'))

      buttons.push(h('button', {
        key: 'reload',
        type: 'button',
        className: 'dsg-btn',
        title: '重新载入预览',
        onClick: function () { setBump(function (count) { return count + 1 }) },
      }, '刷新'))

      const holderStyle = { width: width === 0 ? '100%' : width + 'px', maxWidth: '100%' }

      let canvas
      if (sessionId === '' || designs.length === 0) {
        const steps = [
          { title: '描述你想要的界面', text: '在左侧对话里告诉模型页面用途、内容和风格。第一版生成后，会自动显示在这里。',
            example: '在 Design 里做一个咖啡店首页，暖白底色、大幅产品图、简洁导航。' },
          { title: '点选元素，继续修改', text: '开启工具栏的「点选」，点击预览中的按钮、文字或卡片，再回到对话说要怎么改。',
            example: '把这个按钮改成描边样式，文字改为「了解更多」。' },
          { title: '尝试另一个方向', text: '想保留当前稿子，就明确要求一个新方案。切换「方案」看不同方向，切换「修订」回看修改前的版本。',
            example: '保留这一版，再做一个深色方案。' },
          { title: '切换尺寸，并排对比', text: '用「手机 / 平板 / 桌面」查看不同宽度。有两个方案或两个修订后，点「对比」并排查看，两侧可分别切换。' },
        ]
        canvas = h('main', { className: 'dsg-welcome', 'aria-label': 'Design 使用指南' },
          h('div', { className: 'dsg-welcome-inner' },
            h('div', { className: 'dsg-welcome-kicker' }, 'DESIGN · 快速开始'),
            h('h1', null, '从一句话，开始画界面。'),
            h('p', { className: 'dsg-welcome-intro' }, sessionId === ''
              ? '先在左侧打开一个会话，再描述你想做的页面。这里会成为你的实时预览画布。'
              : '在对话里提出想法，在这里查看效果。继续描述或点选元素，就能一轮轮把界面改到满意。'),
            h('ol', { className: 'dsg-welcome-steps' }, steps.map(function (step, index) {
              return h('li', { key: step.title, className: 'dsg-welcome-step' },
                h('span', { className: 'dsg-welcome-num', 'aria-hidden': 'true' }, index + 1),
                h('div', null,
                  h('h2', null, step.title),
                  h('p', null, step.text),
                  step.example ? h('blockquote', { className: 'dsg-welcome-example' }, '「' + step.example + '」') : null,
                ),
              )
            })),
            h('p', { className: 'dsg-welcome-tip' },
              '想体验页面自己的按钮和交互，先关闭「点选」。稿件会随当前会话保存，下次打开可以接着改。'),
          ),
        )
      } else if (compare) {
        const branchOptions = designs.map(function (entry) {
          return { value: entry.name, text: entry.name, title: entry.name + ' · 修订 ' + entry.version }
        })
        const pair = [
          { side: 'left', name: left, setBranch: setLeft, chain: leftRev, setChain: setLeftRev },
          { side: 'right', name: right, setBranch: setRight, chain: rightRev, setChain: setRightRev },
        ]
        canvas = h('div', { className: 'dsg-split' }, pair.map(function (pane) {
          // Each side carries BOTH rows: its own branch, and that branch's own
          // revision chain. Comparing A against B is comparing two independent
          // histories, not one shared one.
          const items = revisionItems(pane.chain)
          const browsing = pane.chain.shown > 0 && pane.chain.shown !== pane.chain.current
          const selectRevision = function (value) {
            pane.setChain(function (previous) {
              return { current: previous.current, revisions: previous.revisions, shown: value }
            })
          }
          return h('div', { key: pane.side, className: 'dsg-side' },
            h('div', { className: 'dsg-sidehead' },
              h('span', { className: 'dsg-tag' }, pane.side === 'left' ? '左' : '右'),
              versions('方案', branchOptions, pane.name, pane.setBranch, branchOptions.length < 2),
            ),
            h('div', { className: 'dsg-sidehead' },
              h('span', { className: 'dsg-tag' }, '修订'),
              versions('', items, browsing ? pane.chain.shown : pane.chain.current,
                selectRevision, items.length < 2),
              browsing
                ? h('button', {
                  type: 'button',
                  className: 'dsg-btn',
                  onClick: function () {
                    pane.setChain(function (previous) {
                      return { current: previous.current, revisions: previous.revisions, shown: 0 }
                    })
                    setBump(function (count) { return count + 1 })
                  },
                }, '最新')
                : null,
            ),
            h('div', { className: 'dsg-sidebody' },
              frame(pane.name || 'prototype', pane.side, browsing ? pane.chain.shown : 0)),
          )
        }))
      } else {
        canvas = h('div', { className: 'dsg-canvas' },
          h('div', { className: 'dsg-holder', style: holderStyle },
            frame(left || 'prototype', 'single', viewingOld ? singleRev.shown : 0)),
        )
      }

      // Row 1 picks the branch (the user's A / B / C). Row 2 picks which
      // revision of that branch is on screen (A1 / A2 / A3).
      const branchRow = versions('方案',
        designs.map(function (item) {
          return {
            value: item.name,
            text: item.name,
            title: item.name + ' · 修订 ' + item.version + ' · ' + item.bytes + ' 字符',
          }
        }),
        left, setLeft, designs.length < 2)

      /** One pane's revision capsules, newest first. */
      function revisionItems(chain) {
        const items = []
        if (chain.current > 0) {
          items.push({ value: chain.current, text: 'r' + chain.current, title: '当前修订' })
        }
        chain.revisions.forEach(function (item) {
          if (item.version === chain.current) return
          items.push({
            value: item.version,
            text: 'r' + item.version,
            title: 'r' + item.version + (item.note ? ' · ' + item.note : '') + ' · ' + item.bytes + ' 字符',
          })
        })
        return items
      }

      const singleItems = revisionItems(singleRev)
      const revisionRow = versions('修订', singleItems,
        viewingOld ? singleRev.shown : singleRev.current,
        function (value) {
          setSingleRev(function (previous) {
            return { current: previous.current, revisions: previous.revisions, shown: value }
          })
        }, singleItems.length < 2)

      const versionBar = compare || designs.length === 0 ? null : h('div', { className: 'dsg-bar dsg-bar-versions' },
        h('div', { className: 'dsg-vrows' },
          branchRow,
          revisionRow,
        ),
        h('span', { className: 'dsg-spacer' }),
        viewingOld
          ? h('button', {
            type: 'button',
            className: 'dsg-btn',
            'data-on': '1',
            title: '这一版是历史修订；让模型照它改，就会生成新的当前修订',
            onClick: function () {
              setSingleRev(function (previous) {
                return { current: previous.current, revisions: previous.revisions, shown: 0 }
              })
              setBump(function (count) { return count + 1 })
            },
          }, '回到最新')
          : h('span', { className: 'dsg-tag' },
            designs.length <= 1 ? '让模型「再来一版」即可对比' : designs.length + ' 个方案'),
      )

      const toolbar = compare ? null : h('div', { className: 'dsg-bar' },
        h('span', { className: 'dsg-title', title: designs.length === 0 ? '使用指南' : (left || 'prototype') },
          (designs.length === 0 ? '使用指南' : (left || 'prototype'))
            + (singleRev.current > 0 ? ' · r' + (viewingOld ? singleRev.shown : singleRev.current) : '')),
        h('span', { className: 'dsg-spacer' }),
        buttons,
      )

      return h('div', { className: 'dsg-root' },
        versionBar,
        toolbar,
        compare
          ? h('div', { className: 'dsg-bar' },
            h('span', { className: 'dsg-title' }, '并排对比'),
            h('span', { className: 'dsg-spacer' }),
            buttons,
          )
          : null,
        canvas,
        designs.length === 0 ? null : selection === null
          ? h('div', { className: 'dsg-note' },
            inspect
              ? '点选已开启：点击预览里的元素，然后对模型说「改这里」。'
              : '点选已关闭：之前点过的元素已解除绑定，模型不会再收到它。开启后可以继续点选。')
          : h('div', { className: 'dsg-sel' },
            h('div', { className: 'dsg-row' },
              h('span', null, '已选中'),
              h('span', { className: 'dsg-mono' }, '<' + selection.tag + '>'),
              h('span', { className: 'dsg-spacer' }),
              h('button', {
                type: 'button',
                className: 'dsg-btn',
                onClick: clearBinding,
              }, '清除'),
            ),
            selection.selector
              ? h('div', { className: 'dsg-row dsg-mono' }, selection.selector)
              : null,
            selection.text ? h('pre', { className: 'dsg-code' }, selection.text) : null,
            h('div', { className: 'dsg-note', style: { padding: '0' } },
              delivery === 'sent'
                ? '点选已记录：下一次模型请求会收到提示，直接说「把这个改成…」即可。'
                : delivery === 'failed'
                  ? '选中已记录，但回传 Host 失败——请让模型重新运行一次 Designer 包。'
                  : delivery === 'sending' ? '正在把选中交给模型…' : '准备中…'),
          ),
      )
    }

    /** The tab type: a page kind, opened by name. */
    function defineType() {
      return {
        id: TAB_ID,
        kind: TAB_KIND,
        priority: 'extension',
        title: function () { return 'Design' },
        guide: [{
          id: 'designer',
          order: 40,
          title: function () { return 'Design' },
          description: function () { return '在右侧实时预览并修改前端原型' },
        }],
      }
    }

    return {
      name: 'designer-client',
      inject: ['slots', 'timer', 'sidebarRightTabs'],
      apply(ctx) {
        ctx.effect(installStyles, 'designer: panel stylesheet')
        ctx.effect(function () {
          return ctx.sidebarRightTabs.register(defineType())
        }, 'designer: tab type')
        ctx.effect(function () {
          return ctx.slots.inject('sidebar.right.pane.tab', function () {
            return ctx.slots.register({
              name: 'sidebar.right.pane.tab',
              key: TAB_ID,
              inject: function () { return { ctx: ctx } },
            }, function DesignSlot(props) {
              return h(DesignBody, Object.assign({}, props, { key: props.sessionId || '' }))
            })
          })
        }, 'designer: tab body')
      },
    }
  },
})
