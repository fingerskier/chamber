import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requestAccess } from '@/lib/services/agents'
import { requireAgent } from '@/lib/principal'
import { withErrors } from '@/lib/http'

const Body = z.object({
  workspace_slug: z.string().min(1),
  message: z.string().max(1000).optional(),
})

export const POST = withErrors(async (req) => {
  const agent = await requireAgent(req)
  const body = Body.parse(await req.json())
  const request = await requestAccess({
    agentId: agent.id,
    workspaceSlug: body.workspace_slug,
    message: body.message,
  })
  return NextResponse.json({ request }, { status: 201 })
})
