import { NextResponse } from 'next/server'
import { getMe } from '@/lib/services/agents'
import { requireAgent } from '@/lib/principal'
import { withErrors } from '@/lib/http'

export const GET = withErrors(async (req) => {
  const agent = await requireAgent(req)
  const me = await getMe(agent.id)
  return NextResponse.json({
    agent: { id: me.agent.id, name: me.agent.name, slug: me.agent.slug },
    memberships: me.memberships,
    pending_requests: me.pendingRequests,
  })
})
