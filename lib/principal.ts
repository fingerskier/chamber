import { auth } from '@/lib/auth'
import { authenticateAgent } from '@/lib/services/agents'
import { ServiceError } from '@/lib/services/errors'

export type Principal = { type: 'user' | 'agent'; id: string }

export async function getPrincipal(req: Request): Promise<Principal | null> {
  const header = req.headers.get('authorization')
  if (header?.startsWith('Bearer ')) {
    const agent = await authenticateAgent(header.slice(7))
    return agent ? { type: 'agent', id: agent.id } : null
  }
  const session = await auth()
  return session?.user?.id ? { type: 'user', id: session.user.id } : null
}

export async function requirePrincipal(req: Request): Promise<Principal> {
  const p = await getPrincipal(req)
  if (!p) throw new ServiceError(401, 'unauthenticated')
  return p
}

export async function requireAgent(req: Request): Promise<Principal> {
  const p = await requirePrincipal(req)
  if (p.type !== 'agent') throw new ServiceError(403, 'agent token required')
  return p
}

export async function requireUser(req: Request): Promise<Principal> {
  const p = await requirePrincipal(req)
  if (p.type !== 'user') throw new ServiceError(403, 'user session required')
  return p
}
