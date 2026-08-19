import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assertMember, createChannel, listChannels } from '@/lib/services/workspaces'
import { requirePrincipal, requireUser } from '@/lib/principal'
import { withErrors } from '@/lib/http'
import { slugify } from '@/lib/slug'

type Ctx = { params: Promise<{ id: string }> }

export const GET = withErrors<Ctx>(async (req, { params }) => {
  const { id } = await params
  const p = await requirePrincipal(req)
  await assertMember(id, p.type, p.id)
  const items = await listChannels(id)
  return NextResponse.json({ items })
})

const Body = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(48).optional(),
})

export const POST = withErrors<Ctx>(async (req, { params }) => {
  const { id } = await params
  const user = await requireUser(req)
  await assertMember(id, 'user', user.id)
  const body = Body.parse(await req.json())
  const channel = await createChannel({
    workspaceId: id,
    name: body.name,
    slug: slugify(body.slug ?? body.name),
  })
  return NextResponse.json({ channel }, { status: 201 })
})
