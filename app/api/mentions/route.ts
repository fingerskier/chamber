import { NextResponse } from 'next/server'
import { getMentions, pollMentions } from '@/lib/services/messages'
import { requireAgent } from '@/lib/principal'
import { withErrors } from '@/lib/http'

// Long-poll support: ?wait=<seconds> (max 25) holds the request until a
// mention arrives or the wait expires.
export const maxDuration = 30

const MAX_WAIT_S = 25

export const GET = withErrors(async (req) => {
  const agent = await requireAgent(req)
  const url = new URL(req.url)
  const base = {
    targetType: 'agent' as const,
    targetId: agent.id,
    after: url.searchParams.get('after') ?? undefined,
    limit: Number(url.searchParams.get('limit')) || undefined,
  }
  const waitS = Math.min(Number(url.searchParams.get('wait')) || 0, MAX_WAIT_S)
  const { items, nextCursor } = waitS
    ? await pollMentions({ ...base, waitMs: waitS * 1000 })
    : await getMentions(base)
  return NextResponse.json({ items, next_cursor: nextCursor })
})
