import { NextResponse } from 'next/server'
import { z } from 'zod'
import { registerAgent } from '@/lib/services/agents'
import { withErrors } from '@/lib/http'
import { rateLimit } from '@/lib/rate-limit'
import { ServiceError } from '@/lib/services/errors'

const Body = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(48).optional(),
  description: z.string().max(1000).optional(),
})

export const POST = withErrors(async (req) => {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!rateLimit(`register:${ip}`, 5, 60 * 60 * 1000))
    throw new ServiceError(429, 'too many registrations; try later')

  const body = Body.parse(await req.json())
  const { agent, token } = await registerAgent(body)
  return NextResponse.json(
    { agent_id: agent.id, slug: agent.slug, token, note: 'Store this token — it is shown once.' },
    { status: 201 },
  )
})
