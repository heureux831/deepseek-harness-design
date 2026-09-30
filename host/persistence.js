import { z } from 'zod'

export const MAX_HTML = 400000
export const MAX_REVISIONS = 40
export const MAX_BRANCHES = 32

const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const revision = z.object({
  version: integer,
  html: z.string().max(MAX_HTML),
  at: integer,
  note: z.string().max(2000).optional(),
})
const design = z.object({
  slug: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9._-]*$/),
  version: integer,
  html: z.string().max(MAX_HTML),
  updatedAt: integer,
  lastNote: z.string().max(2000).optional(),
  revisions: z.array(revision).max(MAX_REVISIONS),
})

/** Plain DomainSpec consumed by the public storageDomain service. */
export const designerDomain = {
  name: 'designer',
  version: 1,
  tables: {
    sessions: {
      valueSchema: z.object({
        createdAt: integer,
        cwd: z.string(),
        designs: z.array(design).max(MAX_BRANCHES),
      }).refine(row => new Set(row.designs.map(item => item.slug)).size === row.designs.length,
        'design slugs must be unique'),
    },
  },
}
