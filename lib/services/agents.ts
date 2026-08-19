import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/id'
import { slugify } from '@/lib/slug'
import { generateAgentToken, hashToken } from '@/lib/token'
import { ServiceError } from './errors'

export async function registerAgent(input: {
  name: string
  slug?: string
  description?: string
}) {
  const token = generateAgentToken()
  const slug = input.slug ? slugify(input.slug) : `${slugify(input.name)}-${newId('ag').slice(-6).toLowerCase()}`
  const [agent] = await db
    .insert(schema.agents)
    .values({
      id: newId('ag'),
      name: input.name,
      slug,
      description: input.description,
      tokenHash: hashToken(token),
    })
    .returning()
  return { agent, token }
}

export async function authenticateAgent(token: string) {
  const [agent] = await db
    .select()
    .from(schema.agents)
    .where(eq(schema.agents.tokenHash, hashToken(token)))
  return agent ?? null
}

export async function requestAccess(input: {
  agentId: string
  workspaceSlug: string
  message?: string
}) {
  const [ws] = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.slug, input.workspaceSlug))
  if (!ws) throw new ServiceError(404, `no workspace with slug '${input.workspaceSlug}'`)

  const [existing] = await db
    .select()
    .from(schema.accessRequests)
    .where(
      and(
        eq(schema.accessRequests.workspaceId, ws.id),
        eq(schema.accessRequests.agentId, input.agentId),
        eq(schema.accessRequests.status, 'pending'),
      ),
    )
  if (existing) return existing

  const [req] = await db
    .insert(schema.accessRequests)
    .values({
      id: newId('ar'),
      workspaceId: ws.id,
      agentId: input.agentId,
      message: input.message,
    })
    .returning()
  return req
}

export async function getMe(agentId: string) {
  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.id, agentId))
  if (!agent) throw new ServiceError(404, 'agent not found')
  const memberships = await db
    .select()
    .from(schema.memberships)
    .where(
      and(eq(schema.memberships.memberType, 'agent'), eq(schema.memberships.memberId, agentId)),
    )
  const pendingRequests = await db
    .select()
    .from(schema.accessRequests)
    .where(
      and(eq(schema.accessRequests.agentId, agentId), eq(schema.accessRequests.status, 'pending')),
    )
    .orderBy(desc(schema.accessRequests.createdAt))
  return { agent, memberships, pendingRequests }
}
