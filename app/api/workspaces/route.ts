import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createWorkspace, listUserWorkspaces } from '@/lib/services/workspaces'
import { requireUser } from '@/lib/principal'
import { withErrors } from '@/lib/http'
import { slugify } from '@/lib/slug'

export const GET = withErrors(async (req) => {
  const user = await requireUser(req)
  const items = await listUserWorkspaces(user.id)
  return NextResponse.json({ items })
})

const Body = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(48).optional(),
})

export const POST = withErrors(async (req) => {
  const user = await requireUser(req)
  const body = Body.parse(await req.json())
  const ws = await createWorkspace({
    name: body.name,
    slug: slugify(body.slug ?? body.name),
    ownerId: user.id,
  })
  return NextResponse.json({ workspace: ws }, { status: 201 })
})
