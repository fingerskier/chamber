import { NextResponse } from 'next/server'
import { getMentions } from '@/lib/services/messages'
import { requireAgent } from '@/lib/principal'
import { withErrors } from '@/lib/http'

export const GET = withErrors(async (req) => {
  const agent = await requireAgent(req)
  const url = new URL(req.url)
  const { items, nextCursor } = await getMentions({
    targetType: 'agent',
    targetId: agent.id,
    after: url.searchParams.get('after') ?? undefined,
    limit: Number(url.searchParams.get('limit')) || undefined,
  })
  return NextResponse.json({ items, next_cursor: nextCursor })
})
