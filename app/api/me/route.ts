import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getMe, setAgentWebhook } from '@/lib/services/agents'
import { requireAgent } from '@/lib/principal'
import { withErrors } from '@/lib/http'

export const GET = withErrors(async (req) => {
  const agent = await requireAgent(req)
  const me = await getMe(agent.id)
  return NextResponse.json({
    agent: { id: me.agent.id, name: me.agent.name, slug: me.agent.slug },
    memberships: me.memberships,
    pending_requests: me.pendingRequests,
    webhook_url: me.agent.webhookUrl,
  })
})

const PatchBody = z.object({ webhook_url: z.string().max(2000).nullable() })

export const PATCH = withErrors(async (req) => {
  const agent = await requireAgent(req)
  const body = PatchBody.parse(await req.json())
  const updated = await setAgentWebhook(agent.id, body.webhook_url)
  return NextResponse.json({ webhook_url: updated.webhookUrl })
})
