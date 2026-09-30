/** Test-only route mounted as a separate package in the browser regression. */
const hostModule = process.env.DSG_E2E_HOST_MODULE
if (!hostModule) throw new Error('DSG_E2E_HOST_MODULE must name the installed Designer host module')
const { seedDesignsForTest } = await import(hostModule)

export const name = 'designer-test-seed'
export const inject = ['webServer', 'sessions']

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

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/designer/dev/seed',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405).end()
        return
      }
      try {
        const body = JSON.parse(await readBody(req))
        if (typeof body.session !== 'string' || !Array.isArray(body.branches)
          || !body.branches.every((branch) => typeof branch.name === 'string'
            && Array.isArray(branch.revisions)
            && branch.revisions.every((html) => typeof html === 'string'))) {
          throw new Error('invalid seed data')
        }
        if (body.createSession === true && !ctx.sessions.get(body.session)) {
          ctx.sessions.create(body.session)
        }
        const designs = await seedDesignsForTest(body.session, body.branches)
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: true, designs }))
      } catch (error) {
        res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : String(error) }))
      }
    },
  }), 'designer: test seed route')
}
