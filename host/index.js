import { createHash, randomUUID } from 'node:crypto'
import { designerDomain, MAX_HTML, MAX_REVISIONS, MAX_BRANCHES } from './persistence.js'

/**
 * Designer — bundle host half.
 *
 * Owns the design documents, registers the model-facing design tools, and
 * serves the live preview over HTTP so the browser half can render it in an
 * iframe without needing a private RPC channel.
 *
 * Routes (all under the fixed `/designer` prefix), keyed by the session id the
 * panel reads from its own slot props:
 *   GET  /designer/live?session=<sid>   the preview document (prototype + click bridge)
 *   GET  /designer/rev?session=<sid>    `{ version, name, bytes }`, polled by the panel
 *   GET  /designer/meta?session=<sid>   `{ name, version, bytes, hasSelection }`
 *   POST /designer/select               the click the user made inside the preview
 */

let seedActiveStore

/** Only the separately mounted regression plugin calls this entry point. */
export function seedDesignsForTest(sessionId, branches) {
  if (!seedActiveStore) throw new Error('Designer is not active')
  return seedActiveStore(sessionId, branches)
}

/** The empty canvas, shown before the model writes a first version. */
const PLACEHOLDER = [
  '<div style="font:14px/1.7 system-ui,-apple-system,Segoe UI,sans-serif;color:#9aa0a6;',
  'display:grid;place-items:center;height:100vh;text-align:center">',
  '<div><div style="font-size:15px;color:#6b7280;margin-bottom:6px">还没有画布</div>',
  '直接对模型说你想做什么样的界面，它会画在这里。</div></div>',
].join('')

/**
 * The click bridge appended to every preview document. It only intercepts
 * clicks while inspect mode is on, so the prototype stays interactive.
 */
const BRIDGE = [
  '<script data-dsh-designer-bridge>(function () {',
  '  if (window.__dshDesignerBridge) return; window.__dshDesignerBridge = true;',
  '  function cssPath(el) {',
  '    var parts = [], node = el;',
  '    while (node && node.nodeType === 1 && parts.length < 6) {',
  '      var sel = node.tagName.toLowerCase();',
  '      if (node.id) { parts.unshift(sel + "#" + node.id); break; }',
  '      var cls = (node.getAttribute("class") || "").trim().split(/\\s+/).filter(Boolean).slice(0, 2);',
  '      if (cls.length) sel += "." + cls.join(".");',
  '      var parent = node.parentElement;',
  '      if (parent) {',
  '        var same = Array.prototype.filter.call(parent.children, function (c) { return c.tagName === node.tagName; });',
  '        if (same.length > 1) sel += ":nth-of-type(" + (same.indexOf(node) + 1) + ")";',
  '      }',
  '      parts.unshift(sel); node = parent;',
  '    }',
  '    return parts.join(" > ");',
  '  }',
  '  document.addEventListener("click", function (event) {',
  '    if (document.documentElement.getAttribute("data-dsh-inspect") !== "on") return;',
  '    var el = event.target;',
  '    if (!el || el.nodeType !== 1) return;',
  '    event.preventDefault(); event.stopPropagation();',
  '    var rect = el.getBoundingClientRect();',
  '    var payload = {',
  '      tag: el.tagName.toLowerCase(), id: el.id || "",',
  '      classes: el.getAttribute("class") || "",',
  '      text: (el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 200),',
  '      selector: cssPath(el),',
  '      outerHTML: (el.outerHTML || "").slice(0, 1200),',
  '      rect: Math.round(rect.width) + "x" + Math.round(rect.height) + " at " + Math.round(rect.left) + "," + Math.round(rect.top)',
  '    };',
  '    try {',
  '      parent.postMessage({ source: "dsh-designer", kind: "select", name: window.__dshDesignerName || "", value: payload }, "*");',
  '    } catch (e) {}',
  '    try {',
  '      if (window.__dshDesignerInspect === "server") {',
  '        fetch("/designer/select", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session: window.__dshDesignerSession || "", name: window.__dshDesignerName || "", selection: payload }) });',
  '      }',
  '    } catch (e) {}',
  '  }, true);',
  '  window.addEventListener("message", function (event) {',
  '    var data = event.data;',
  '    if (event.source !== parent || !data || data.source !== "dsh-designer-panel") return;',
  '    if (data.kind === "inspect") {',
  '      document.documentElement.setAttribute("data-dsh-inspect", data.on ? "on" : "off");',
  '      return;',
  '    }',
  '    if (data.kind === "inspect-ack") return;',
  '  });',
  '  // Announce readiness so the panel can push the mode it currently shows.',
  '  // Without this, a freshly built iframe keeps the document default and the',
  '  // toolbar can read "off" while the preview behaves as "on".',
  '  function announce() {',
  '    try { parent.postMessage({ source: "dsh-designer", kind: "ready", name: window.__dshDesignerName || "" }, "*"); } catch (e) {}',
  '  }',
  '  announce();',
  '  window.addEventListener("load", announce);',
  '})()<\/script>',
].join('\n')

/** Compose one served preview document. */
function composeDocument(html, options) {
  const body = html && html.trim() !== '' ? html : PLACEHOLDER
  const inspect = options.inspect === false ? 'off' : 'on'
  const scriptJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c')
  const boot = '<script>window.__dshDesignerSession=' + scriptJson(options.session)
    + ';window.__dshDesignerName=' + scriptJson(options.slug)
    + ';window.__dshDesignerInspect="client";<\/script>'
  return '<!doctype html><html data-dsh-inspect="' + inspect + '">'
    + '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<style>html,body{margin:0}</style></head>'
    + '<body>' + boot + body + BRIDGE + '</body></html>'
}

/** Send one JSON response. */
function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

/** Read a bounded JSON request body from the panel. */
async function readBody(req) {
  let total = 0
  const chunks = []
  for await (const chunk of req) {
    total += chunk.length
    if (total > 65536) throw new Error('body too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** Reject simple cross-origin POSTs, including requests from opaque previews. */
function acceptsPanelJson(req, res) {
  const contentType = String(req.headers?.['content-type'] ?? '').split(';')[0].trim().toLowerCase()
  if (contentType !== 'application/json') {
    sendJson(res, 415, { ok: false, message: 'Designer requires a JSON request from the panel.' })
    return false
  }
  return true
}

export const name = 'designer'

export const inject = ['tools', 'fs', 'webServer', 'systemPrompt', 'storageDomain', 'sessions', 'sessionPersistence']

export async function apply(ctx) {
  /**
   * Route registration is a ONE-OWNER contract: the webserver throws on a
   * duplicate `(kind, path)`. Loading two versions of this bundle at once (a
   * stale install left beside a new one) would otherwise fail one half, and a
   * failed browser half leaves the whole web shell on "Failed to load plugins".
   * A probe tells us to stand down instead of breaking the page.
   */
  const ownsRoutes = globalThis[Symbol.for('dsh.designer.routes')] === undefined
  if (!ownsRoutes) {
    console.warn('[designer] another Designer instance already owns /designer/* routes; standing down')
    return
  }
  globalThis[Symbol.for('dsh.designer.routes')] = true
  ctx.effect(() => () => { delete globalThis[Symbol.for('dsh.designer.routes')] }, 'designer: route ownership')

  /**
   * Every design, per session: `sessionId -> slug -> record`. A session holds as
   * many alternatives as it likes, and each is a first-class document the panel
   * can preview and compare.
   */
  const designs = new Map()

  /** Latest element the user clicked, per session and design. */
  const selections = new Map()
  let selectionSequence = 0

  /** How long a click stays worth telling the model about. */
  const SELECTION_TTL_MS = 10 * 60 * 1000

  /** The slug a session's design uses when the model names nothing. */
  const DEFAULT_SLUG = 'prototype'

  /**
   * The 点选 switch, mirrored here from the panel that owns it.
   *
   * 点选 is not a click filter, it is the ARMING switch for element→model binding.
   * While it is off, nothing the user clicked may reach the model — including
   * clicks made *before* it was switched off, which is the whole point: switching
   * it off has to unbind, not merely stop collecting. Turning it off therefore
   * drops what was stored AND gates the store, so a click whose POST is still in
   * flight cannot re-arm the binding behind the user's back.
   */
  const inspectModes = new Map()

  function inspectArmed(sessionId) {
    return inspectModes.get(sessionId) !== false
  }

  /** Reduce a display name to a safe file stem; never empty. */
  function slugOf(value) {
    const slug = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '')
    return slug === '' ? DEFAULT_SLUG : slug.slice(0, 64)
  }

  /** The slug -> record map of one session, created on first access. */
  function shelfOf(sessionId) {
    const key = String(sessionId ?? 'anonymous')
    let shelf = designs.get(key)
    if (shelf === undefined) {
      shelf = new Map()
      designs.set(key, shelf)
    }
    return shelf
  }

  /** One existing record, or `undefined` — reads never invent a design. */
  function peek(sessionId, slug) {
    return designs.get(String(sessionId ?? 'anonymous'))?.get(slugOf(slug))
  }

  /** The revision chain of one design, newest first. */
  function revisionsOf(sessionId, slug) {
    const entry = peek(sessionId, slug)
    if (entry === undefined) return []
    return [...entry.revisions]
      .sort((left, right) => right.version - left.version)
      .map((item) => ({ version: item.version, at: item.at, bytes: item.html.length, note: item.note }))
  }

  /** The html of one revision, or `undefined` when that revision is gone. */
  function revisionHtml(sessionId, slug, version) {
    const entry = peek(sessionId, slug)
    if (entry === undefined) return undefined
    if (version === entry.version) return entry.html
    const found = entry.revisions.find((item) => item.version === version)
    return found === undefined ? undefined : found.html
  }

  /** Every design of a session, newest first, for the panel's pickers. */
  function designsOf(sessionId) {
    const shelf = designs.get(String(sessionId ?? 'anonymous'))
    if (shelf === undefined) return []
    return [...shelf.values()]
      .filter((entry) => entry.updatedAt > 0 || entry.html !== '')
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map((entry) => ({
        name: entry.slug,
        version: entry.version,
        bytes: entry.html.length,
        updatedAt: entry.updatedAt,
      }))
  }

  /** Expiry and the arming switch apply equally to every selection reader. */
  function freshSelection(sessionId, slug, undelivered = false) {
    if (!inspectArmed(sessionId)) return undefined
    let best
    for (const [key, candidate] of selections) {
      if (Date.now() - candidate.at >= SELECTION_TTL_MS) {
        selections.delete(key)
        continue
      }
      if (candidate.session !== sessionId) continue
      if (slug !== undefined && candidate.name !== slugOf(slug)) continue
      if (best === undefined || candidate.order > best.order) best = candidate
    }
    return undelivered && best?.consumedAt !== undefined ? undefined : best
  }

  /**
   * What the model reads every turn while a click is fresh. This is the fix for
   * "the model ignored my selection": a tool has to be CALLED, and a model that
   * does not know a selection exists never calls it. Runtime context does not
   * depend on the model guessing.
   */
  function selectionPromptText(sessionId) {
    const pick = freshSelection(sessionId, undefined, true)
    return pick ? promptForSelection(pick) : ''
  }

  function promptForSelection(pick) {
    // A STATUS LINE, not the detail. The model is told that a selection exists and
    // is expected to fetch it — so an unqualified "change this" begins with a
    // design_selection call instead of an edit based on a guess.
    const where = JSON.stringify({
      branch: pick.name, tag: pick.tag, id: pick.id, selector: pick.selector, selectionId: pick.token,
    })
    return 'Designer: the user just clicked an element in the Design preview '
      + `(${where}). Before changing anything for a request like "change this" / `
      + '"把这个改一下", call design_selection and act on the element it returns. If it reports no selection, '
      + 'treat the request as a fresh instruction rather than an edit.'
  }

  /** The selection slot of one (session, design) pair. */
  function selectionKey(sessionId, slug) {
    return `${String(sessionId ?? 'anonymous')}\u0000${slugOf(slug)}`
  }

  /**
   * Forget every click of one session, across all of its designs. Returns how many
   * records were dropped, so a caller can tell "unbound something" from "there was
   * nothing to unbind" without guessing.
   */
  function dropSelections(sessionId) {
    const prefix = `${String(sessionId ?? 'anonymous')}\u0000`
    let dropped = 0
    for (const key of [...selections.keys()]) {
      if (!key.startsWith(prefix)) continue
      selections.delete(key)
      dropped += 1
    }
    return dropped
  }

  /**
   * The design an unnamed edit continues: the most recently touched one when the
   * session already has designs, otherwise the default slug.
   */
  function defaultSlug(sessionId) {
    const all = designsOf(sessionId)
    return all.length > 0 ? all[0].name : DEFAULT_SLUG
  }

  /** Mint a slug that does not collide on this session's shelf. */
  function uniqueSlug(sessionId, name) {
    const shelf = shelfOf(sessionId)
    const base = slugOf(name)
    if (!shelf.has(base)) return base
    for (let index = 2; index < 1000; index += 1) {
      const suffix = `-v${index}`
      const candidate = `${base.slice(0, 64 - suffix.length)}${suffix}`
      if (!shelf.has(candidate)) return candidate
    }
    return `${base.slice(0, 50)}-${Date.now()}`
  }

  /** Seed in-memory designs for the separately mounted browser regression plugin. */
  function seedDesignsForTest(sessionId, branches) {
    const shelf = shelfOf(sessionId)
    shelf.clear()
    dropSelections(sessionId)
    if (branches.length > MAX_BRANCHES) throw new Error('Too many test branches')
    for (const branch of branches) {
      const slug = slugOf(branch.name)
      const entry = {
        version: 0, html: '', slug, cwd: '', updatedAt: 0, revisions: [], lastNote: 'seed',
      }
      for (const html of branch.revisions) {
        if (entry.version > 0) {
          entry.revisions.push({
            version: entry.version, html: entry.html, at: entry.updatedAt, note: entry.lastNote,
          })
        }
        entry.html = html
        entry.version += 1
        entry.updatedAt = Date.now() + shelf.size * 1000 + entry.version
        entry.lastNote = 'seed r' + entry.version
      }
      shelf.set(slug, entry)
    }
    return designsOf(sessionId)
  }


  // A whole session is one durable record: branch and revision changes commit together.
  const domain = await ctx.storageDomain.open(designerDomain)
  const table = domain.table('sessions')
  const loaded = new Map()
  const operations = new Map()
  let closing = false
  for (const [sessionId, row] of table.entries()) {
    designs.set(sessionId, new Map(row.designs.map(entry => [entry.slug, entry])))
  }
  seedActiveStore = seedDesignsForTest
  ctx.effect(() => async () => {
    closing = true
    if (seedActiveStore === seedDesignsForTest) seedActiveStore = undefined
    await Promise.allSettled([...operations.values()])
    await domain.close()
    designs.clear()
    selections.clear()
    inspectModes.clear()
    loaded.clear()
  }, 'designer: persistent state')

  /** Serialize edits so concurrent calls cannot overwrite a revision or an alternative. */
  function withSession(sessionId, work) {
    if (closing) return Promise.reject(new Error('Designer is closing'))
    const previous = operations.get(sessionId) ?? Promise.resolve()
    const operation = previous.catch(() => {}).then(work)
    operations.set(sessionId, operation)
    const clear = () => { if (operations.get(sessionId) === operation) operations.delete(sessionId) }
    operation.then(clear, clear)
    return operation
  }

  /** Resolve a real session, without resuming an agent just to render its design. */
  async function sessionHeader(sessionId, agent) {
    const live = agent?.session?.header ?? ctx.sessions.get(sessionId)?.header
    if (live) return live
    return (await ctx.sessionPersistence.inspect(sessionId)).meta
  }

  /** Import the previous release's session-hashed HTML files once, preserving originals. */
  async function ensureSession(sessionId, agent) {
    const header = await sessionHeader(sessionId, agent)
    const identity = `${header.createdAt}\u0000${header.cwd ?? ''}`
    if (loaded.get(sessionId) === identity) return header
    return withSession(sessionId, async () => {
      if (loaded.get(sessionId) === identity) return header
      const row = table.get(sessionId)
      if (row && row.createdAt === header.createdAt && row.cwd === (header.cwd ?? '')) {
        designs.set(sessionId, new Map(row.designs.map(entry => [entry.slug, entry])))
      } else if (row) {
        // A reused session id belongs to a different lifecycle.
        designs.delete(sessionId)
        dropSelections(sessionId)
      } else if (header.cwd && !designs.has(sessionId)) {
        const folder = `${header.cwd.replace(/\/+$/, '')}/.dsh-design/${createHash('sha256').update(sessionId).digest('hex')}`
        let files
        try {
          files = await ctx.fs.listDir(await ctx.fs.resolve(folder))
        } catch (error) {
          if (error?.code !== 'FS_NOT_FOUND' && error?.code !== 'ENOENT') throw error
          files = []
        }
        const imported = []
        for (const file of files) {
          if (file.type !== 'file' || !file.name.endsWith('.html')) continue
          const slug = slugOf(file.name.slice(0, -5))
          if (file.name !== slug + '.html') continue
          if (imported.length >= MAX_BRANCHES) throw new Error(`Too many legacy designs (limit ${MAX_BRANCHES})`)
          const bytes = await ctx.fs.readBytes(file.target, undefined, MAX_HTML * 4)
          const html = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
          if (html.length > MAX_HTML) throw new Error(`Legacy design "${slug}" exceeds ${MAX_HTML} characters`)
          imported.push({ slug, html, version: 1, updatedAt: Date.now(), revisions: [], lastNote: 'Imported from 0.4' })
        }
        if (imported.length) {
          const next = designerDomain.tables.sessions.valueSchema.parse({
            createdAt: header.createdAt, cwd: header.cwd, designs: imported,
          })
          await table.put(sessionId, next)
          designs.set(sessionId, new Map(next.designs.map(entry => [entry.slug, entry])))
        }
      }
      loaded.set(sessionId, identity)
      return header
    })
  }

  /** Extra workspace export; the Harness domain already owns the durable draft. */
  async function exportDesign(entry, cwd, sessionId, signal) {
    if (!cwd) return { exported: false, path: '', error: 'This session has no workspace directory.' }
    const path = `${cwd.replace(/\/+$/, '')}/.dsh-design/${createHash('sha256').update(sessionId).digest('hex')}/${entry.slug}.html`
    try {
      const target = await ctx.fs.resolve(path)
      await ctx.fs.writeText(target, entry.html, undefined, signal)
      return { exported: true, path }
    } catch (error) {
      return { exported: false, path, error: error instanceof Error ? error.message : String(error) }
    }
  }

  // Consumption happens after the named context snapshot enters this session's log.
  // Assembly alone may be aborted or rejected and must not lose the click.
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'user/message') return
    const source = event.data?.source
    if (source?.kind !== 'plugin' || source.plugin !== '@deepseek-ai/dsh-system-prompt') return
    const section = source.sections?.find(item => item.name === 'designer.selection')
    if (!section) return
    for (const pick of selections.values()) {
      if (pick.session === String(session.id) && section.text === promptForSelection(pick)) {
        pick.consumedAt = Date.now()
      }
    }
  })

  // ---------------------------------------------------------------------
  // HTTP surface: what the Design panel renders.
  // ---------------------------------------------------------------------

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/designer/live',
    handler: async (req, res) => {
      const url = new URL(req.url ?? '/designer/live', 'http://localhost')
      const sessionId = url.searchParams.get('session') ?? 'anonymous'
      await ensureSession(sessionId)
      const slug = slugOf(url.searchParams.get('name'))
      const entry = peek(sessionId, slug)
      const asked = Number(url.searchParams.get('rev') ?? 0)
      const html = asked > 0 && asked !== entry?.version
        ? revisionHtml(sessionId, slug, asked)
        : entry?.html
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        // Protect direct navigation to this URL as well as iframe embedding.
        'content-security-policy': 'sandbox allow-scripts',
      })
      res.end(composeDocument(html === undefined ? '' : html, {
        session: sessionId,
        slug,
        // A document built while 点选 is off boots disarmed, so a branch switch
        // cannot hand the user a preview that captures clicks again.
        inspect: inspectArmed(sessionId) && url.searchParams.get('inspect') !== '0',
      }))
    },
  }), 'designer: live route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/designer/rev',
    handler: async (req, res) => {
      const url = new URL(req.url ?? '/designer/rev', 'http://localhost')
      const sessionId = url.searchParams.get('session') ?? 'anonymous'
      await ensureSession(sessionId)
      // The token folds in every design's version, so the panel notices a new
      // alternative appearing just as fast as an edit to the one it shows.
      const all = designsOf(sessionId)
      const token = all.map((item) => `${item.name}@${item.version}`).join('|')
      let version = 0
      for (const item of all) version += item.version
      sendJson(res, 200, {
        version,
        token,
        count: all.length,
        name: all.length > 0 ? all[0].name : DEFAULT_SLUG,
        bytes: all.length > 0 ? all[0].bytes : 0,
        designs: all.map((item) => ({ name: item.name, version: item.version })),
      })
    },
  }), 'designer: rev route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/designer/designs',
    handler: async (req, res) => {
      const url = new URL(req.url ?? '/designer/designs', 'http://localhost')
      const sessionId = url.searchParams.get('session') ?? 'anonymous'
      await ensureSession(sessionId)
      sendJson(res, 200, { designs: designsOf(sessionId) })
    },
  }), 'designer: designs route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/designer/revisions',
    handler: async (req, res) => {
      const url = new URL(req.url ?? '/designer/revisions', 'http://localhost')
      const sessionId = url.searchParams.get('session') ?? 'anonymous'
      await ensureSession(sessionId)
      const slug = slugOf(url.searchParams.get('name'))
      const entry = peek(sessionId, slug)
      sendJson(res, 200, {
        name: slug,
        current: entry === undefined ? 0 : entry.version,
        revisions: revisionsOf(sessionId, slug),
      })
    },
  }), 'designer: revisions route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/designer/meta',
    handler: async (req, res) => {
      const url = new URL(req.url ?? '/designer/meta', 'http://localhost')
      const sessionId = url.searchParams.get('session') ?? 'anonymous'
      await ensureSession(sessionId)
      const slug = slugOf(url.searchParams.get('name'))
      const entry = peek(sessionId, slug)
      sendJson(res, 200, {
        name: slug,
        version: entry === undefined ? 0 : entry.version,
        bytes: entry === undefined ? 0 : entry.html.length,
        hasSelection: freshSelection(sessionId, slug) !== undefined,
      })
    },
  }), 'designer: meta route')

  /**
   * The 点选 switch, as seen by the Host. The panel calls this whenever the
   * toggle moves — and once on mount, so a page reload with 点选 already off
   * re-gates a Host that would otherwise still be armed.
   * POST { session, on }
   */
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/designer/inspect',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false })
        return
      }
      if (!acceptsPanelJson(req, res)) return
      try {
        const body = JSON.parse(await readBody(req))
        const sessionId = String(body.session ?? 'anonymous')
        await sessionHeader(sessionId)
        const on = body.on !== false
        inspectModes.set(sessionId, on)
        // Switching off unbinds: everything clicked before this moment stops
        // being something the model can be told about.
        const dropped = on ? 0 : dropSelections(sessionId)
        sendJson(res, 200, { ok: true, inspect: on, dropped })
      } catch (error) {
        sendJson(res, 400, { ok: false, message: error instanceof Error ? error.message : String(error) })
      }
    },
  }), 'designer: inspect route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/designer/select',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false })
        return
      }
      if (!acceptsPanelJson(req, res)) return
      try {
        const body = JSON.parse(await readBody(req))
        const sessionId = String(body.session ?? 'anonymous')
        await sessionHeader(sessionId)
        const slug = slugOf(body.name)
        // "Clear" must reach the Host too: the injected runtime context reads
        // this store, so a UI-only clear would keep feeding the model an element
        // the user already dismissed. It drops the whole session, because the
        // injection only ever carries the freshest click of the session.
        if (body.clear === true) {
          sendJson(res, 200, { ok: true, cleared: true, dropped: dropSelections(sessionId) })
          return
        }
        // 点选 is off: a click cannot bind. This is not just a courtesy to the
        // panel — it closes the race where a click's POST is still travelling
        // when the user switches 点选 off, and would otherwise land after the
        // drop and quietly re-arm the binding.
        if (!inspectArmed(sessionId)) {
          sendJson(res, 200, { ok: true, ignored: 'inspect-off' })
          return
        }
        const selection = body.selection ?? {}
        selections.set(selectionKey(sessionId, slug), {
          token: randomUUID(),
          order: ++selectionSequence,
          tag: String(selection.tag ?? '').slice(0, 40),
          id: String(selection.id ?? '').slice(0, 200),
          classes: String(selection.classes ?? '').slice(0, 500),
          text: String(selection.text ?? '').slice(0, 200),
          selector: String(selection.selector ?? '').slice(0, 1000),
          outerHTML: String(selection.outerHTML ?? '').slice(0, 1200),
          rect: String(selection.rect ?? '').slice(0, 100),
          name: slug,
          session: sessionId,
          at: Date.now(),
        })
        sendJson(res, 200, { ok: true })
      } catch (error) {
        sendJson(res, 400, { ok: false, message: error instanceof Error ? error.message : String(error) })
      }
    },
  }), 'designer: select route')

  // ---------------------------------------------------------------------
  // Model-facing tools
  // ---------------------------------------------------------------------

  const applyTool = {
    name: 'design_apply',
    description:
      'Create or update the frontend prototype shown in the user\'s Design panel (right sidebar, "Design" tab). '
      + 'Pass `html` to write the whole document, or `oldString` + `newString` for a surgical edit of the current one. '
      + 'The panel reloads it as soon as this returns. Write realistic markup and CSS (inline scripts and SVG are fine) '
      + 'so the prototype reads as a real screen of a product, not a wireframe. '
      + 'When the user refers to "this" / "这里" / "选中的", the element they clicked in the preview is already described '
      + 'in your runtime context — patch that element with oldString + newString instead of redesigning the screen. '
      + 'VERSIONS ARE SEPARATE DOCUMENTS: when the user wants another version, a variant, or something to compare '
      + '("再来一版", "对比一下", "另一个方向", "another version"), call this again with asNew: true and a distinct `name`. '
      + 'The Design panel owns the version switcher — do NOT build version tabs, A/B toggles, or comparison UI '
      + 'inside the prototype HTML; one document is exactly one design.',
    parameters: {
      type: 'object',
      properties: {
        html: { type: 'string', description: 'Complete replacement document (HTML, inline CSS/JS). Mutually exclusive with oldString/newString.' },
        oldString: { type: 'string', description: 'Literal text to find in the current document; must occur exactly once unless replaceAll is set.' },
        newString: { type: 'string', description: 'Replacement text for oldString.' },
        replaceAll: { type: 'boolean', description: 'Replace every occurrence of oldString. Default false.' },
        name: { type: 'string', description: 'Design name; also its file stem. Omit to keep editing the current design.' },
        asNew: { type: 'boolean', description: 'Save as a NEW alternative instead of editing the current one. Use this when the user asks for another version / a variant to compare. A colliding name is suffixed automatically.' },
        note: { type: 'string', description: 'One short line describing this edit, echoed back to the user.' },
      },
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          persisted: { type: 'boolean' },
          exported: { type: 'boolean' },
          path: { type: 'string' },
          version: { type: 'number' },
          bytes: { type: 'number' },
          message: { type: 'string' },
        },
        required: ['ok', 'version', 'message'],
      },
      render: (_args, value) => [{ type: 'text', text: String(value.message) }],
    },
    async execute(args, exec) {
      const sessionId = String(exec.agent?.id ?? 'anonymous')
      let header
      try { header = await ensureSession(sessionId, exec.agent) } catch (error) {
        return { ok: false, version: 0, message: `design_apply: cannot restore session: ${error.message}` }
      }
      return withSession(sessionId, async () => {
        const asNew = args.asNew === true
        const asked = typeof args.name === 'string' && args.name.trim() !== '' ? args.name.trim() : ''
        // `asNew` mints a fresh alternative; otherwise the named design is edited
        // in place, falling back to the default when nothing is named yet.
        const slug = asNew ? uniqueSlug(sessionId, asked || `v${designsOf(sessionId).length + 1}`)
          : (asked !== '' ? slugOf(asked) : defaultSlug(sessionId))
        const current = peek(sessionId, slug)
        if (!current && designsOf(sessionId).length >= MAX_BRANCHES) {
          return { ok: false, version: 0, message: `design_apply: at most ${MAX_BRANCHES} alternatives are allowed per session.` }
        }
        const entry = current
          ? { ...current, revisions: [...current.revisions] }
          : { version: 0, html: '', slug, updatedAt: 0, revisions: [] }
        let html = entry.html

        if (typeof args.html === 'string' && (args.oldString !== undefined || args.newString !== undefined)) {
          return { ok: false, version: entry.version, message: 'design_apply: use html OR oldString/newString, not both.' }
        }
        if (typeof args.html === 'string') {
          html = args.html
        } else if (typeof args.oldString === 'string' || typeof args.newString === 'string') {
          const oldString = typeof args.oldString === 'string' ? args.oldString : ''
          const newString = typeof args.newString === 'string' ? args.newString : ''
          if (entry.html === '') {
            return { ok: false, version: entry.version, message: 'design_apply: no document yet — pass `html` to create the first version.' }
          }
          if (oldString === '') {
            return { ok: false, version: entry.version, message: 'design_apply: `oldString` must not be empty when patching.' }
          }
          const occurrences = entry.html.split(oldString).length - 1
          const replaceAll = args.replaceAll === true
          if (occurrences === 0) {
            return { ok: false, version: entry.version, message: 'design_apply: `oldString` was not found. Call design_read to see the exact current text.' }
          }
          if (occurrences > 1 && !replaceAll) {
            return { ok: false, version: entry.version, message: `design_apply: \`oldString\` occurs ${occurrences} times; add surrounding context or pass replaceAll: true.` }
          }
          html = replaceAll ? entry.html.split(oldString).join(newString) : entry.html.replace(oldString, newString)
        } else {
          return { ok: false, version: entry.version, message: 'design_apply: pass `html`, or `oldString` + `newString`.' }
        }

        if (html.length > MAX_HTML) {
          return { ok: false, version: entry.version, message: `design_apply: the document is ${html.length} characters, over the ${MAX_HTML} limit. Split the prototype into pages.` }
        }

        // Append, never overwrite: the previous revision stays browsable, so the
        // panel can walk A1 -> A2 -> A3 without the model remembering anything.
        if (entry.version > 0) {
          entry.revisions.push({
            version: entry.version,
            html: entry.html,
            at: entry.updatedAt,
            note: entry.lastNote,
          })
          if (entry.revisions.length > MAX_REVISIONS) {
            entry.revisions.splice(0, entry.revisions.length - MAX_REVISIONS)
          }
        }
        entry.html = html
        entry.version += 1
        entry.updatedAt = Date.now()
        entry.lastNote = typeof args.note === 'string' ? args.note.slice(0, 2000) : ''

        let row
        try {
          const shelf = new Map(designs.get(sessionId) ?? [])
          shelf.set(entry.slug, entry)
          row = designerDomain.tables.sessions.valueSchema.parse({
            createdAt: header.createdAt, cwd: header.cwd ?? '', designs: [...shelf.values()],
          })
          exec.signal?.throwIfAborted()
          await table.put(sessionId, row)
        } catch (error) {
          return { ok: false, version: current?.version ?? 0, persisted: false,
            message: `design_apply: could not save; the previous draft is unchanged. ${error.message}` }
        }
        designs.set(sessionId, new Map(row.designs.map(item => [item.slug, item])))
        const stored = await exportDesign(entry, header.cwd, sessionId, exec.signal)
        const where = stored.exported
          ? ` Exported to ${stored.path}.`
          : ` Saved in Harness; HTML export unavailable: ${stored.error}`

        const siblings = designsOf(sessionId)
        const note = typeof args.note === 'string' && args.note !== '' ? ` (${args.note})` : ''
        const alternatives = siblings.length > 1
          ? ` This session now holds ${siblings.length} alternatives: ${siblings.map((item) => item.name).join(', ')}.`
          : ''
        return {
          ok: true,
          persisted: true,
          exported: stored.exported,
          path: stored.path,
          name: entry.slug,
          version: entry.version,
          count: siblings.length,
          bytes: entry.html.length,
          revision: entry.version,
          message: `Designer: "${entry.slug}" is now at revision ${entry.version}${note}, ${entry.html.length} characters`
            + `${asNew ? ' (saved as a new alternative)' : ''}.`
            + ' The user\'s Design tab reloads it automatically.' + alternatives + where,
        }
      })
    },
  }

  const readTool = {
    name: 'design_read',
    description:
      'Read the current frontend prototype shown in the user\'s Design panel, plus whether the user has clicked an element in the preview.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Which branch to read. Omit for the most recently edited one.' },
        revision: { type: 'number', description: 'Read one historical revision of that branch instead of the current one.' },
        html: { type: 'boolean', description: 'Include the full HTML document. Default true; pass false for metadata only.' },
      },
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          version: { type: 'number' },
          bytes: { type: 'number' },
          count: { type: 'number' },
          hasSelection: { type: 'boolean' },
          html: { type: 'string' },
        },
        required: ['name', 'version', 'bytes', 'count', 'hasSelection'],
      },
      render: (_args, value) => [{
        type: 'text',
        text: [
          `Designer: "${value.name}" version ${value.version}, ${value.bytes} characters.`
            + (value.hasSelection ? ' The user has selected an element in the preview.' : ''),
          value.html ?? '',
        ].filter(Boolean).join('\n\n'),
      }],
    },
    async execute(args, exec) {
      const sessionId = String(exec.agent?.id ?? 'anonymous')
      await ensureSession(sessionId, exec.agent)
      const all = designsOf(sessionId)
      const slug = typeof args.name === 'string' && args.name.trim() !== ''
        ? slugOf(args.name)
        : defaultSlug(sessionId)
      const entry = peek(sessionId, slug)
      const wantHtml = args.html !== false
      if (entry === undefined) {
        return { name: slug, version: 0, bytes: 0, count: all.length, hasSelection: false }
      }
      const wanted = typeof args.revision === 'number' ? args.revision : entry.version
      const html = wanted === entry.version ? entry.html : revisionHtml(sessionId, slug, wanted)
      if (html === undefined) {
        return {
          name: entry.slug,
          version: entry.version,
          bytes: 0,
          count: all.length,
          hasSelection: false,
        }
      }
      return {
        name: entry.slug,
        version: wanted,
        bytes: html.length,
        count: all.length,
        hasSelection: freshSelection(sessionId, entry.slug) !== undefined,
        ...(wantHtml && html !== '' ? { html } : {}),
      }
    },
  }

  const selectionTool = {
    name: 'design_selection',
    description:
      'Read the element the user most recently clicked in the Design panel preview, or report that nothing is selected. '
      + 'Use it whenever the user says "this", "here", or "the one I clicked" about the prototype. '
      + 'The freshest click is also described automatically in your runtime context; call this for the full '
      + 'outerHTML / rect / a specific alternative via `name`.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Which alternative the click was in. Omit to get the most recent click in this session.' },
      },
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          hasSelection: { type: 'boolean' },
          design: { type: 'string' },
          tag: { type: 'string' },
          id: { type: 'string' },
          classes: { type: 'string' },
          text: { type: 'string' },
          selector: { type: 'string' },
          outerHTML: { type: 'string' },
          rect: { type: 'string' },
        },
        required: ['hasSelection'],
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.hasSelection
          ? `Designer selection${value.design ? ` in "${value.design}"` : ''}: <${value.tag}>${value.id ? `#${value.id}` : ''}\n`
            + `selector: ${value.selector}\nrect: ${value.rect}\ntext: ${value.text}\n\n${value.outerHTML}`
          : 'Designer: the user has not clicked any element in the preview yet.',
      }],
    },
    execute(args, exec) {
      const sessionId = String(exec.agent?.id ?? 'anonymous')
      const selection = freshSelection(sessionId,
        typeof args.name === 'string' && args.name.trim() !== '' ? args.name : undefined)
      if (selection === undefined) return { hasSelection: false }
      const { session, at, consumedAt, token, order, ...rest } = selection
      return { hasSelection: true, design: selection.name, ...rest }
    },
  }

  const listTool = {
    name: 'design_list',
    description:
      'List every prototype branch this session holds (A / B / C) together with that branch\'s revision '
      + 'chain (A1, A2, A3). Call it before comparing, or to find the exact name of a branch the user refers to.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: {
        type: 'object',
        properties: {
          count: { type: 'number' },
          names: { type: 'string' },
          lines: { type: 'string' },
        },
        required: ['count', 'names', 'lines'],
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.count === 0
          ? 'Designer: this session has no prototype yet.'
          : `Designer: ${value.count} branch(es).\n${value.lines}`,
      }],
    },
    async execute(_args, exec) {
      const sessionId = String(exec.agent?.id ?? 'anonymous')
      await ensureSession(sessionId, exec.agent)
      const all = designsOf(sessionId)
      return {
        count: all.length,
        names: all.map((item) => item.name).join(', '),
        lines: all.map((item) => {
          const chain = revisionsOf(sessionId, item.name)
            .map((entry) => entry.version)
            .sort((left, right) => left - right)
            .join(', ')
          return `- ${item.name}: at revision ${item.version} (${item.bytes} chars)`
            + (chain === '' ? '; no earlier revisions' : `; revisions kept: ${chain}`)
        }).join('\n'),
      }
    },
  }

  // Injected every turn while a click is fresh, so "change this" resolves even
  // when the model never thinks to call a tool. Best-effort: a failure here must
  // never break prompt assembly.
  ctx.effect(() => ctx.systemPrompt.context({
    name: 'designer.selection',
    order: 50,
    text: (assembly) => {
      try {
        return assembly.agent?.id ? selectionPromptText(String(assembly.agent.id)) : ''
      } catch (error) {
        return ''
      }
    },
  }), 'designer: selection context')

  ctx.effect(() => ctx.tools.register(applyTool), 'designer: design_apply')
  ctx.effect(() => ctx.tools.register(listTool), 'designer: design_list')
  ctx.effect(() => ctx.tools.register(readTool), 'designer: design_read')
  ctx.effect(() => ctx.tools.register(selectionTool), 'designer: design_selection')
}
