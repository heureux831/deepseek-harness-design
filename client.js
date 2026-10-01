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
      '.dsg-root{display:flex;flex-direction:column;height:100%;min-height:0;color:var(--dsw-alias-label-primary,inherit)}',
      '.dsg-bar{display:flex;align-items:center;gap:4px;padding:8px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.16));flex:none;flex-wrap:nowrap}',
      '.dsg-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:5px;height:30px;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary,#777);border-radius:7px;font:inherit;font-size:12px;line-height:18px;padding:0 6px;cursor:pointer;white-space:nowrap;transition:background .12s,color .12s}',
      '.dsg-btn:hover{background:var(--dsw-alias-bg-l2,rgba(0,0,0,.05));color:var(--dsw-alias-label-primary,#111)}',
      '.dsg-btn[data-on="1"]{background:rgba(65,118,230,.13);color:var(--dsw-alias-state-business-primary,#5e8ded)}',
      '.dsg-btn:disabled{opacity:.45;cursor:default}.dsg-btn:focus-visible,.dsg-select:focus-visible,.dsg-input:focus-visible{outline:2px solid #5e8ded;outline-offset:2px}',
      '.dsg-icon-btn{width:30px;flex:none;padding:0}.dsg-device{display:flex;align-items:center;gap:2px;padding:2px;border:1px solid rgba(128,128,128,.16);border-radius:9px;background:rgba(128,128,128,.04)}',
      '.dsg-device .dsg-btn{width:26px;height:26px;padding:0}.dsg-device .dsg-btn[data-on="1"]{background:rgba(128,128,128,.18);color:var(--dsw-alias-label-primary,inherit)}',
      '.dsg-picker{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}.dsg-picker[data-kind="revision"]{flex:0 1 104px}.dsg-picker-label{font-size:10px;line-height:14px;color:var(--dsw-alias-label-tertiary,#888)}',
      '.dsg-header{align-items:flex-end;flex-wrap:nowrap;gap:8px}.dsg-rename{display:flex;flex-wrap:wrap;gap:6px;padding:8px 10px;border-bottom:1px solid rgba(128,128,128,.16)}',
      '.dsg-input{min-width:0;flex:1;min-height:30px;border:1px solid rgba(128,128,128,.25);background:transparent;border-radius:7px;padding:4px 8px;color:inherit;font:inherit;font-size:12px}.dsg-rename-error{width:100%;font-size:12px;color:#d97070}',
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
      '.dsg-select{width:100%;min-width:0;height:32px;border:1px solid rgba(128,128,128,.18);background:rgba(128,128,128,.05);color:inherit;border-radius:8px;font:inherit;font-size:12px;padding:0 7px;cursor:pointer;text-overflow:ellipsis;color-scheme:inherit}',
      '.dsg-select option{color:CanvasText;background:Canvas}',
      '.dsg-split{flex:1;min-height:0;display:flex;gap:0;background:transparent}',
      '.dsg-side + .dsg-side{border-left:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.16))}',
      '.dsg-side{flex:1 1 0;min-width:0;display:flex;flex-direction:column;background:transparent}',
      '.dsg-sidehead{display:flex;align-items:center;gap:6px;padding:5px 8px;flex:none;flex-wrap:wrap}',
      '.dsg-sidehead + .dsg-sidehead{border-top:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.05));padding-top:4px;padding-bottom:4px}',
      '.dsg-tag{font-size:11px;font-weight:600;color:var(--dsw-alias-label-tertiary,#999);letter-spacing:.04em}',
      '.dsg-sidebody{flex:1;min-height:0;overflow:auto;padding:8px;background:var(--dsw-alias-bg-l2,rgba(0,0,0,.04));display:flex}',
      '.dsg-sidebody .dsg-holder{min-height:0}',
      '.dsg-sidebody .dsg-frame{min-height:0;height:100%}',
    ].join('\n')

    const WIDTHS = [[0, '自适应'], [390, '手机'], [834, '平板'], [1280, '桌面']]

    function icon(name) {
      const paths = {
        fit: 'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5',
        phone: 'M8 3h8v18H8z M11 18h2', tablet: 'M5 3h14v18H5z M11 18h2',
        desktop: 'M3 4h18v13H3z M12 17v4 M8 21h8',
        compare: 'M3 4h18v16H3z M12 4v16', select: 'M5 3l14 9-7 2-3 7z',
        refresh: 'M20 7v5h-5 M20 12a8 8 0 1 0-2 6', rename: 'M15 4l5 5 M4 20l4-1L21 6l-3-3L5 16z',
      }
      return h('svg', { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6,
        strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: paths[name] }))
    }

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

    async function requestJson(url, options) {
      const settings = Object.assign({ cache: 'no-store' }, options)
      const timeout = AbortSignal.timeout(10000)
      settings.signal = settings.signal ? AbortSignal.any([settings.signal, timeout]) : timeout
      const response = await fetch(url, settings)
      if (!response.ok) {
        const detail = await response.json().catch(function () { return {} })
        throw new Error(detail.message || 'HTTP ' + response.status)
      }
      return response.json()
    }

    /** Commit metadata and its list together; a failed list must not consume the token. */
    function useDocuments(sessionId, ctx, changed, refresh) {
      const state = React.useState({ designs: [], status: 'loading', error: '' })
      React.useEffect(function () {
        if (sessionId === '') return undefined
        let active = true, pending = false, committedToken, contentToken, hadError = false
        const controller = new AbortController()
        async function load() {
          if (pending) return
          pending = true
          try {
            const meta = await requestJson('/designer/rev?session=' + q(sessionId), { signal: controller.signal })
            if (typeof meta.token !== 'string') throw new Error('Invalid design metadata')
            if (committedToken !== meta.token) {
              const value = await requestJson('/designer/designs?session=' + q(sessionId), { signal: controller.signal })
              if (!Array.isArray(value.designs)) throw new Error('Invalid design list')
              if (!active) return
              committedToken = meta.token
              state[1]({ designs: value.designs, status: 'ready', error: '' })
              const nextContent = JSON.stringify(value.designs.map(function (item) { return [item.name, item.version] }))
              if (contentToken !== nextContent) changed()
              contentToken = nextContent
            } else if (active && hadError) {
              state[1](function (previous) { return Object.assign({}, previous, { status: 'ready', error: '' }) })
            }
            hadError = false
          } catch (error) {
            if (!active) return
            hadError = true
            state[1](function (previous) { return Object.assign({}, previous, { status: 'error', error: '暂时无法读取会话稿件，正在自动重试。也可以点击「刷新」。' }) })
          } finally { pending = false }
        }
        load()
        const stop = ctx.timer.interval(load, POLL_MS)
        return function () { active = false; controller.abort(); stop() }
      }, [sessionId, ctx, changed, refresh])
      return state[0]
    }

    function DesignBody(props) {
      const sessionId = String(props.sessionId || '')
      const refreshState = React.useState(0)
      const refresh = refreshState[0]
      const setRefresh = refreshState[1]
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
      const singleRevState = React.useState({ name: '', current: 0, revisions: [], shown: 0 })
      const singleRev = singleRevState[0]
      const setSingleRev = singleRevState[1]
      const leftRevState = React.useState({ name: '', current: 0, revisions: [], shown: 0 })
      const leftRev = leftRevState[0]
      const setLeftRev = leftRevState[1]
      const rightRevState = React.useState({ name: '', current: 0, revisions: [], shown: 0 })
      const rightRev = rightRevState[0]
      const setRightRev = rightRevState[1]

      // Whether the single pane is showing a historical revision. Declared here,
      // above every reader: the canvas, the revision row, and the toolbar all
      // depend on it, and `const` does not hoist.
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
      const renameState = React.useState(null)
      const rename = renameState[0], setRename = renameState[1]
      const renameSequence = React.useRef(0)
      const viewingOld = singleRev.name === left && singleRev.shown > 0 && singleRev.shown !== singleRev.current
      const frameRefs = React.useRef(new Set())
      const comparePrimed = React.useRef(false)
      const controlState = React.useState({ synced: false, error: '' })
      const control = controlState[0], setControl = controlState[1]
      const bindingErrorState = React.useState('')
      const bindingError = bindingErrorState[0], setBindingError = bindingErrorState[1]
      const inspectRef = React.useRef(false)
      inspectRef.current = inspect && control.synced
      const inspectToken = React.useRef('')
      const modeRequest = React.useRef(null)
      const syncMode = React.useRef(function () {})
      const controlReady = React.useRef(false)
      const selectionRef = React.useRef(null)
      const resumeSelection = React.useRef(null)
      const initialSelectionLoaded = React.useRef(false)
      const deliveryRef = React.useRef(delivery)
      deliveryRef.current = delivery
      const actionSequence = React.useRef(0)
      const pendingClear = React.useRef(null)
      const alive = React.useRef(true)
      const clientId = React.useRef('')
      if (!clientId.current) clientId.current = window.crypto.randomUUID()
      React.useEffect(function () {
        alive.current = true
        return function () { alive.current = false; actionSequence.current += 1 }
      }, [])

      const changed = React.useCallback(function () { setBump(function (count) { return count + 1 }) }, [])
      const documents = useDocuments(sessionId, props.ctx, changed, refresh)
      const designs = documents.designs
      function designTitle(name) { return designs.find(function (entry) { return entry.name === name })?.title || name }
      React.useEffect(function () { renameSequence.current += 1; setRename(null) }, [left, compare])

      // Keep the compare pickers pointed at real alternatives.
      React.useEffect(function () {
        if (designs.length === 0) { setCompare(false); setLeft(''); setRight(''); return }
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
          if (sessionId === '' || branch === '') return undefined
          let active = true, pending = false, retry = true
          const controller = new AbortController()
          setState(function (previous) {
            return previous.name === branch ? previous : { name: branch, current: 0, revisions: [], shown: 0 }
          })
          async function load() {
            if (pending || !retry) return
            pending = true
            try {
              const value = await requestJson('/designer/revisions?session=' + q(sessionId) + '&name=' + q(branch), { signal: controller.signal })
              if (value.name !== branch || !Number.isSafeInteger(value.current) || !Array.isArray(value.revisions)) throw new Error('Invalid revision list')
              if (!active) return
              setState(function (previous) {
                const browsing = previous.name === branch && previous.shown > 0 && previous.shown < previous.current
                  && value.revisions.some(function (item) { return item.version === previous.shown })
                return { name: branch, current: value.current, revisions: value.revisions, shown: browsing ? previous.shown : value.current }
              })
              retry = false
            } catch (error) { /* keep the current preview and retry this branch */ }
            finally { pending = false }
          }
          load()
          const stop = props.ctx.timer.interval(load, POLL_MS)
          return function () { active = false; controller.abort(); stop() }
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
          if (leftRev.name !== left || rightRev.name !== right || leftRev.current === 0 || rightRev.current === 0) return
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
          const previous = chain.revisions.find(function (item) { return item.version !== chain.current })?.version
          if (!previous) return false
          setRightRev(function (state) {
            return { name: state.name, current: state.current, revisions: state.revisions, shown: previous }
          })
          return true
        }
        if (roll(rightRev)) return
        const alternate = designs.map(function (item) { return item.name })
          .filter(function (name) { return name !== left })
        if (alternate.length > 0) setRight(alternate[0])
      }, [compare, left, right, leftRev, rightRev, designs])

      // Read the Host's switch on mount; reopening a tab must not re-arm it.
      React.useEffect(function () {
        if (sessionId === '') return undefined
        let active = true, pending = false
        const controller = new AbortController()
        async function sync() {
          if (pending || (controlReady.current && !modeRequest.current)) return
          pending = true
          const body = modeRequest.current
          try {
            const value = await requestJson('/designer/inspect' + (body ? '' : '?session=' + q(sessionId)), body
              ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal }
              : { signal: controller.signal })
            if (!value.ok || typeof value.inspect !== 'boolean' || typeof value.token !== 'string') throw new Error('Invalid inspect state')
            if (!active || modeRequest.current !== body) return
            inspectToken.current = value.token
            if (!body && !initialSelectionLoaded.current) {
              initialSelectionLoaded.current = true
              resumeSelection.current = value.selection || null
              if (value.selection?.name) setLeft(value.selection.name)
            }
            modeRequest.current = null
            controlReady.current = true
            setInspect(value.inspect)
            setControl({ synced: true, error: '' })
          } catch (error) {
            if (active) setControl({ synced: false, error: '点选状态尚未同步，已暂停点选，正在自动重试。' })
          } finally { pending = false }
        }
        syncMode.current = sync
        sync()
        const stop = props.ctx.timer.interval(sync, POLL_MS)
        return function () { active = false; controller.abort(); stop() }
      }, [sessionId, props.ctx])

      React.useEffect(function () {
        frameRefs.current.forEach(function (node) {
          if (!node.isConnected) return
          try { node.contentWindow.postMessage({ source: 'dsh-designer-panel', kind: 'inspect', on: inspectRef.current }, '*') }
          catch (error) { /* the frame's ready handshake retries the mode */ }
        })
      }, [inspect, control.synced, bump])

      function forgetSelection() {
        resumeSelection.current = null
        actionSequence.current += 1
        selectionRef.current = null
        setSelection(null)
        setDelivery('idle')
      }

      // A clear retries on reconnect. Its action identity prevents an old retry
      // from clearing a newer click, and late responses cannot change its receipt.
      async function syncClear(body) {
        try {
          const value = await requestJson('/designer/select', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
          })
          if (!value.ok) throw new Error('Clear rejected')
          if (alive.current && pendingClear.current === body) {
            pendingClear.current = null
            setBindingError('')
          }
        } catch (error) {
          if (alive.current && pendingClear.current === body) setBindingError('清除尚未同步到会话，正在自动重试。')
        }
      }

      function clearBinding() {
        forgetSelection()
        if (sessionId === '') return
        const body = { session: sessionId, clear: true, client: clientId.current, sequence: actionSequence.current }
        pendingClear.current = body
        syncClear(body)
      }

      React.useEffect(function () {
        if (selectionRef.current) clearBinding()
      }, [left, right, compare, bump, singleRev.shown, leftRev.shown, rightRev.shown])

      // Reopening a tab restores the visible receipt only after its document
      // and revision are ready; setup changes must not clear that binding.
      React.useEffect(function () {
        const pick = resumeSelection.current
        if (!pick || !control.synced || singleRev.name !== pick.name || !singleRev.current) return
        if (!designs.some(function (entry) { return entry.name === pick.name })) { resumeSelection.current = null; return }
        if (left !== pick.name) { setLeft(pick.name); return }
        if (pick.revision && pick.revision !== singleRev.current) {
          if (!singleRev.revisions.some(function (entry) { return entry.version === pick.revision })) { clearBinding(); return }
          if (singleRev.shown !== pick.revision) {
            setSingleRev(function (value) { return Object.assign({}, value, { shown: pick.revision }) })
            return
          }
        }
        resumeSelection.current = null
        selectionRef.current = pick
        setSelection(pick)
        setDelivery(pick.delivered ? 'delivered' : 'sent')
      }, [left, singleRev, designs, control.synced, bump])

      React.useEffect(function () {
        let active = true, pending = false
        async function reconcile() {
          if (pending) return
          pending = true
          try {
            if (pendingClear.current) await syncClear(pendingClear.current)
            const pick = selectionRef.current
            if (!pick || !['sent', 'delivered'].includes(deliveryRef.current)) return
            const sequence = actionSequence.current
            const value = await requestJson('/designer/meta?session=' + q(sessionId) + '&name=' + q(pick.name))
            if (!active || sequence !== actionSequence.current) return
            if (!value.hasSelection) forgetSelection()
            else if (value.delivered) setDelivery('delivered')
          } catch (error) { /* retain the existing receipt until the Host can confirm it */ }
          finally { pending = false }
        }
        const stop = props.ctx.timer.interval(reconcile, POLL_MS)
        return function () { active = false; stop() }
      }, [sessionId, props.ctx])

      React.useEffect(function () {
        function onMessage(event) {
          const data = event.data
          if (!data || data.source !== 'dsh-designer') return
          const node = [...frameRefs.current].find(function (frame) { return frame.isConnected && frame.contentWindow === event.source })
          if (!node) return
          if (data.kind === 'ready') {
            try { event.source.postMessage({ source: 'dsh-designer-panel', kind: 'inspect', on: inspectRef.current }, '*') }
            catch (error) { /* the iframe navigated */ }
            return
          }
          if (data.kind !== 'select' || !inspectRef.current || !data.value || typeof data.value.tag !== 'string') return
          const url = new URL(node.src, window.location.href)
          if (data.name !== url.searchParams.get('name')) return
          const displayedRevision = Number(url.searchParams.get('rev'))
          if (!Number.isSafeInteger(data.revision) || data.revision < 1
            || (displayedRevision > 0 && data.revision !== displayedRevision)) return
          const sequence = ++actionSequence.current
          resumeSelection.current = null
          const pick = Object.assign({}, data.value, { name: data.name, revision: data.revision })
          selectionRef.current = pick
          pendingClear.current = null
          setBindingError('')
          setSelection(pick)
          setDelivery('sending')
          requestJson('/designer/select', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ session: sessionId, name: data.name, revision: data.revision,
              historical: displayedRevision > 0, selection: data.value,
              inspectToken: inspectToken.current, client: clientId.current, sequence }),
          }).then(function (value) {
            if (!alive.current || sequence !== actionSequence.current) return
            if (value.ok && !value.ignored) setDelivery('sent')
            else {
              forgetSelection()
              setBindingError('预览或点选状态已变化，请重新点选。')
              controlReady.current = false
              setControl({ synced: false, error: '' })
              syncMode.current()
            }
          }).catch(function () {
            if (alive.current && sequence === actionSequence.current) setDelivery('failed')
          })
        }
        window.addEventListener('message', onMessage)
        return function () { window.removeEventListener('message', onMessage) }
      }, [sessionId])

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

      /** Bounded pickers keep long alternative and revision lists out of the canvas. */
      function versions(label, items, value, onChange, disabled) {
        const numeric = label !== '方案'
        const selected = items.some(function (item) { return item.value === value }) ? value : (items[0]?.value || '')
        return h('label', { className: 'dsg-picker', 'data-kind': numeric ? 'revision' : 'branch' },
          label ? h('span', { className: 'dsg-picker-label' }, label) : null,
          h('select', { className: 'dsg-select', 'aria-label': label || '修订', disabled: disabled === true || !items.length,
            value: String(selected), title: items.find(function (item) { return item.value === selected })?.title,
            onChange: function (event) { onChange(numeric ? Number(event.target.value) : event.target.value) } },
          items.length ? items.map(function (item) {
            return h('option', { key: String(item.value), value: String(item.value) }, item.text)
          }) : h('option', { value: '' }, '读取中…')),
        )
      }

      const devices = WIDTHS.map(function (pair, index) {
        return h('button', {
          key: 'w' + pair[0],
          type: 'button',
          className: 'dsg-btn',
          'data-on': width === pair[0] ? '1' : '0',
          'aria-label': pair[1], 'aria-pressed': width === pair[0],
          title: pair[1] + (pair[0] ? ' · ' + pair[0] + ' px' : ' · 跟随面板宽度'),
          onClick: function () { setWidth(pair[0]) },
        }, icon(['fit', 'phone', 'tablet', 'desktop'][index]))
      })
      const buttons = [h('div', { key: 'devices', className: 'dsg-device', role: 'group', 'aria-label': '预览尺寸' }, devices),
        h('span', { key: 'space', className: 'dsg-spacer' })]

      // Comparing two revisions of ONE branch is a first-class case, so the
      // gate is "two panes' worth of content", not "two branches".
      const canCompare = designs.length >= 2
        || (designs.length === 1 && (singleRev.revisions.length + (singleRev.current > 0 ? 1 : 0)) >= 2)

      buttons.push(h('button', {
        key: 'compare',
        type: 'button',
        className: 'dsg-btn',
        'data-on': compare ? '1' : '0',
        'aria-pressed': compare,
        title: canCompare
          ? '并排对比（两个方案，或同一方案的两个修订）'
          : '还只有一版，先让模型「再来一版」或改一次',
        disabled: !canCompare,
        onClick: function () {
          if (!compare) {
            setLeftRev(Object.assign({}, singleRev, { name: left }))
            if (right === left) setRightRev(Object.assign({}, singleRev, { name: right, shown: singleRev.current }))
          }
          setCompare(function (value) { return !value })
        },
      }, icon('compare'), compare ? '对比中' : '对比'))

      buttons.push(h('button', {
        key: 'inspect',
        type: 'button',
        disabled: sessionId === '' || !control.synced,
        className: 'dsg-btn',
        'data-on': inspect ? '1' : '0',
        'aria-pressed': inspect,
        title: inspect
          ? '点选已开启：点击预览里的元素会把它的源码上下文交给模型。关闭即解除绑定。'
          : '点选已关闭：之前点过的元素已解除绑定，模型不会再收到它。',
        onClick: function () {
          const next = !inspect
          forgetSelection()
          pendingClear.current = null
          setBindingError('')
          setInspect(next)
          controlReady.current = false
          setControl({ synced: false, error: '' })
          modeRequest.current = { session: sessionId, on: next, client: clientId.current, sequence: actionSequence.current }
          syncMode.current()
        },
      }, icon('select'), '点选'))

      buttons.push(h('button', {
        key: 'reload',
        type: 'button',
        className: 'dsg-btn dsg-icon-btn',
        title: '刷新预览', 'aria-label': '刷新',
        onClick: function () { setRefresh(function (count) { return count + 1 }) },
      }, icon('refresh')))

      const holderStyle = { width: width === 0 ? '100%' : width + 'px', flexShrink: 0 }

      let canvas
      if (sessionId !== '' && designs.length === 0 && documents.status !== 'ready') {
        canvas = h('div', { className: 'dsg-note', role: 'status' }, documents.status === 'error' ? documents.error : '正在读取会话稿件…')
      } else if (sessionId === '' || designs.length === 0) {
        const steps = [
          { title: '描述你想要的界面', text: '在左侧对话里告诉模型页面用途、内容和风格。第一版生成后，会自动显示在这里。',
            example: '在 Design 里做一个咖啡店首页，暖白底色、大幅产品图、简洁导航。' },
          { title: '点选元素，继续修改', text: '开启工具栏的「点选」，点击预览中的按钮、文字或卡片，再回到对话说要怎么改。',
            example: '把这个按钮改成描边样式，文字改为「了解更多」。' },
          { title: '尝试另一个方向', text: '想保留当前稿子，就明确要求一个新方案。切换「方案」看不同方向，切换「修订」回看修改前的版本。',
            example: '保留「暖白咖啡首页」，再做一个叫「深色编辑风」的新方案。' },
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
          return { value: entry.name, text: entry.title || entry.name, title: (entry.title || entry.name) + ' · 修订 ' + entry.version }
        })
        const pair = [
          { side: 'left', name: left, setBranch: setLeft, chain: leftRev, setChain: setLeftRev },
          { side: 'right', name: right, setBranch: setRight, chain: rightRev, setChain: setRightRev },
        ]
        canvas = h('div', { className: 'dsg-split' }, pair.map(function (pane) {
          // Each side carries BOTH rows: its own branch, and that branch's own
          // revision chain. Comparing A against B is comparing two independent
          // histories, not one shared one.
          const items = revisionItems(pane.chain.name === pane.name ? pane.chain : { current: 0, revisions: [] })
          const browsing = pane.chain.name === pane.name && pane.chain.shown > 0 && pane.chain.shown !== pane.chain.current
          const selectRevision = function (value) {
            pane.setChain(function (previous) {
              return { name: previous.name, current: previous.current, revisions: previous.revisions, shown: value }
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
                      return { name: previous.name, current: previous.current, revisions: previous.revisions, shown: 0 }
                    })
                    setBump(function (count) { return count + 1 })
                  },
                }, '最新')
                : null,
            ),
            h('div', { className: 'dsg-sidebody' },
              h('div', { className: 'dsg-holder', style: holderStyle },
                frame(pane.name || 'prototype', pane.side, browsing ? pane.chain.shown : 0))),
          )
        }))
      } else {
        canvas = h('div', { className: 'dsg-canvas', style: { justifyContent: width === 0 ? 'center' : 'flex-start' } },
          h('div', { className: 'dsg-holder', style: holderStyle },
            frame(left || 'prototype', 'single', viewingOld ? singleRev.shown : 0)),
        )
      }

      const branchRow = versions('方案',
        designs.map(function (item) {
          return {
            value: item.name,
            text: item.title || item.name,
            title: (item.title || item.name) + ' · 修订 ' + item.version,
          }
        }),
        left, setLeft, designs.length < 2)

      /** One pane's revision options, newest first. */
      function revisionItems(chain) {
        const items = []
        if (chain.current > 0) {
          items.push({ value: chain.current, text: '最新 · r' + chain.current, title: '当前修订' })
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

      const singleItems = revisionItems(singleRev.name === left ? singleRev : { current: 0, revisions: [] })
      const revisionRow = versions('修订', singleItems,
        viewingOld ? singleRev.shown : singleRev.current,
        function (value) {
          setSingleRev(function (previous) {
            return { name: previous.name, current: previous.current, revisions: previous.revisions, shown: value }
          })
        }, singleItems.length < 2)

      const versionBar = compare || !designs.length ? null : h('div', { className: 'dsg-bar dsg-header' },
        branchRow, revisionRow, h('button', { type: 'button', className: 'dsg-btn dsg-icon-btn',
          title: '重命名方案', 'aria-label': '重命名方案',
          onClick: function () { setRename({ name: left, title: designTitle(left), saving: false, error: '' }) } }, icon('rename')))

      const renameForm = rename ? h('form', { className: 'dsg-rename', onSubmit: async function (event) {
        event.preventDefault()
        const draft = rename, sequence = ++renameSequence.current
        setRename(Object.assign({}, draft, { saving: true, error: '' }))
        try {
          const value = await requestJson('/designer/rename', { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ session: sessionId, name: draft.name, title: draft.title.trim() }) })
          if (!value.ok) throw new Error(value.message || '名称未保存。')
          if (alive.current && sequence === renameSequence.current) setRename(null)
        } catch (error) {
          if (alive.current && sequence === renameSequence.current) setRename(Object.assign({}, draft,
            { saving: false, error: error.message.startsWith('HTTP') ? '名称未保存，请稍后重试。' : error.message }))
        }
      } }, h('input', { className: 'dsg-input', 'aria-label': '方案名称', value: rename.title, maxLength: 80, required: true,
        autoFocus: true, disabled: rename.saving, onChange: function (event) { setRename(Object.assign({}, rename, { title: event.target.value })) } }),
      h('button', { className: 'dsg-btn', type: 'submit', disabled: rename.saving || !rename.title.trim() }, rename.saving ? '保存中…' : '保存'),
      h('button', { className: 'dsg-btn', type: 'button', disabled: rename.saving, onClick: function () { setRename(null) } }, '取消'),
      rename.error ? h('span', { className: 'dsg-rename-error', role: 'status' }, rename.error) : null) : null

      const toolbar = h('div', { className: 'dsg-bar' }, buttons)

      return h('div', { className: 'dsg-root' },
        versionBar,
        renameForm,
        toolbar,
        control.error ? h('div', { className: 'dsg-note', role: 'status' }, control.error) : null,
        bindingError ? h('div', { className: 'dsg-note', role: 'status' }, bindingError) : null,
        documents.status === 'error' && designs.length > 0 ? h('div', { className: 'dsg-note', role: 'status' }, documents.error) : null,
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
              h('span', { className: 'dsg-tag' }, designTitle(selection.name) + (selection.revision ? ' · r' + selection.revision : '')),
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
                : delivery === 'delivered' ? '点选提示已进入会话，可以继续描述要怎么修改。'
                : delivery === 'failed'
                  ? '点选尚未确认，请检查连接后重新点选。'
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
