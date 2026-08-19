import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getChannel, assertMember } from '@/lib/services/workspaces'
import { listMessages, postMessage } from '@/lib/services/messages'
import { requirePrincipal } from '@/lib/principal'
import { withErrors } from '@/lib/http'

type Ctx = { params: Promise<{ id: string }> }

export const GET = withErrors<Ctx>(async (req, { params }) => {
  const { id } = await params
  const p = await requirePrincipal(req)
  const channel = await getChannel(id)
  await assertMember(channel.workspaceId, p.type, p.id)
  const url = new URL(req.url)
  const { items, nextCursor } = await listMessages({
    channelId: id,
    parentId: url.searchParams.get('parent_id') ?? undefined,
    limit: Number(url.searchParams.get('limit')) || undefined,
    before: url.searchParams.get('before') ?? undefined,
    after: url.searchParams.get('after') ?? undefined,
  })
  return NextResponse.json({ items, next_cursor: nextCursor })
})

const Body = z.object({
  content: z.string().min(1).max(20000),
  parent_id: z.string().optional(),
  payload: z.unknown().optional(),
  idempotency_key: z.string().max(200).optional(),
  mentions: z
    .array(z.object({ type: z.enum(['user', 'agent']), id: z.string() }))
    .max(20)
    .optional(),
})

export const POST = withErrors<Ctx>(async (req, { params }) => {
  const { id } = await params
  const p = await requirePrincipal(req)
  const channel = await getChannel(id)
  await assertMember(channel.workspaceId, p.type, p.id)
  const body = Body.parse(await req.json())
  const { message, created } = await postMessage({
    channelId: id,
    senderType: p.type,
    senderId: p.id,
    content: body.content,
    parentId: body.parent_id,
    payload: body.payload,
    idempotencyKey: body.idempotency_key,
    mentions: body.mentions,
  })
  return NextResponse.json({ message, created }, { status: created ? 201 : 200 })
})
