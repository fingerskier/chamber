import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/id'
import { slugify } from '@/lib/slug'
import { ServiceError } from './errors'

export async function createWorkspace(input: { name: string; slug: string; ownerId: string }) {
  const [ws] = await db
    .insert(schema.workspaces)
    .values({ id: newId('ws'), name: input.name, slug: input.slug, ownerId: input.ownerId })
    .returning()
  await db.insert(schema.memberships).values({
    workspaceId: ws.id,
    memberType: 'user',
    memberId: input.ownerId,
    role: 'owner',
  })
  await createChannel({ workspaceId: ws.id, name: 'General', slug: 'general' })
  return ws
}

export async function listUserWorkspaces(userId: string) {
  return db
    .select({ workspace: schema.workspaces, role: schema.memberships.role })
    .from(schema.memberships)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.memberships.workspaceId))
    .where(
      and(eq(schema.memberships.memberType, 'user'), eq(schema.memberships.memberId, userId)),
    )
}

export async function assertMember(
  workspaceId: string,
  memberType: 'user' | 'agent',
  memberId: string,
) {
  const [m] = await db
    .select()
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.workspaceId, workspaceId),
        eq(schema.memberships.memberType, memberType),
        eq(schema.memberships.memberId, memberId),
      ),
    )
  if (!m) throw new ServiceError(403, 'not a member of this workspace')
  return m
}

export async function getWorkspaceBySlug(slug: string) {
  const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.slug, slug))
  if (!ws) throw new ServiceError(404, 'workspace not found')
  return ws
}

export async function listChannels(workspaceId: string) {
  return db
    .select()
    .from(schema.channels)
    .where(eq(schema.channels.workspaceId, workspaceId))
    .orderBy(schema.channels.slug)
}

export async function getChannel(channelId: string) {
  const [c] = await db.select().from(schema.channels).where(eq(schema.channels.id, channelId))
  if (!c) throw new ServiceError(404, 'channel not found')
  return c
}

export async function getChannelBySlug(workspaceId: string, slug: string) {
  const [c] = await db
    .select()
    .from(schema.channels)
    .where(and(eq(schema.channels.workspaceId, workspaceId), eq(schema.channels.slug, slug)))
  if (!c) throw new ServiceError(404, 'channel not found')
  return c
}

export async function createChannel(input: { workspaceId: string; name: string; slug: string }) {
  const [c] = await db
    .insert(schema.channels)
    .values({ id: newId('ch'), workspaceId: input.workspaceId, name: input.name, slug: input.slug })
    .returning()
  return c
}

// Owner-initiated add: skips the request/approve flow for an already-registered agent.
export async function addAgentToWorkspace(input: { workspaceId: string; agentSlug: string }) {
  const slug = input.agentSlug.replace(/^@/, '')
  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.slug, slug))
  if (!agent) throw new ServiceError(404, `no agent with slug '${slug}'`)
  await db
    .insert(schema.memberships)
    .values({ workspaceId: input.workspaceId, memberType: 'agent', memberId: agent.id })
    .onConflictDoNothing()
  return agent
}

export type Member = { type: 'user' | 'agent'; id: string; label: string; slug: string }

export async function listMembers(workspaceId: string): Promise<Member[]> {
  const rows = await db
    .select()
    .from(schema.memberships)
    .where(eq(schema.memberships.workspaceId, workspaceId))
  const userIds = rows.filter((r) => r.memberType === 'user').map((r) => r.memberId)
  const agentIds = rows.filter((r) => r.memberType === 'agent').map((r) => r.memberId)

  const members: Member[] = []
  if (userIds.length) {
    const users = await db.select().from(schema.users).where(inArray(schema.users.id, userIds))
    members.push(
      ...users.map((u) => ({
        type: 'user' as const,
        id: u.id,
        label: u.name ?? u.email ?? u.id,
        slug: slugify(u.name ?? u.email ?? u.id),
      })),
    )
  }
  if (agentIds.length) {
    const agents = await db.select().from(schema.agents).where(inArray(schema.agents.id, agentIds))
    members.push(
      ...agents.map((a) => ({ type: 'agent' as const, id: a.id, label: a.name, slug: a.slug })),
    )
  }
  return members
}

export async function listAccessRequests(workspaceId: string) {
  return db
    .select()
    .from(schema.accessRequests)
    .where(
      and(
        eq(schema.accessRequests.workspaceId, workspaceId),
        eq(schema.accessRequests.status, 'pending'),
      ),
    )
}

export async function approveAccessRequest(requestId: string, userId: string) {
  const [req] = await db
    .select()
    .from(schema.accessRequests)
    .where(eq(schema.accessRequests.id, requestId))
  if (!req) throw new ServiceError(404, 'access request not found')
  if (req.status !== 'pending') throw new ServiceError(409, `request already ${req.status}`)
  await assertMember(req.workspaceId, 'user', userId)

  await db
    .insert(schema.memberships)
    .values({ workspaceId: req.workspaceId, memberType: 'agent', memberId: req.agentId })
    .onConflictDoNothing()
  const [updated] = await db
    .update(schema.accessRequests)
    .set({ status: 'approved', resolvedAt: new Date(), resolvedBy: userId })
    .where(eq(schema.accessRequests.id, requestId))
    .returning()
  return updated
}

export async function denyAccessRequest(requestId: string, userId: string) {
  const [req] = await db
    .select()
    .from(schema.accessRequests)
    .where(eq(schema.accessRequests.id, requestId))
  if (!req) throw new ServiceError(404, 'access request not found')
  await assertMember(req.workspaceId, 'user', userId)
  const [updated] = await db
    .update(schema.accessRequests)
    .set({ status: 'denied', resolvedAt: new Date(), resolvedBy: userId })
    .where(
      and(eq(schema.accessRequests.id, requestId), eq(schema.accessRequests.status, 'pending')),
    )
    .returning()
  if (!updated) throw new ServiceError(404, 'no pending request with that id')
  return updated
}
