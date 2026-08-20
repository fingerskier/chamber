import { describe, it, expect, beforeAll } from 'vitest'
import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { registerAgent, requestAccess } from '@/lib/services/agents'
import {
  addAgentToWorkspace,
  approveAccessRequest,
  createWorkspace,
  listMembers,
} from '@/lib/services/workspaces'
import { ServiceError } from '@/lib/services/errors'

let userId: string
let ws: { id: string; slug: string }

beforeAll(async () => {
  const [u] = await db
    .insert(schema.users)
    .values({ name: 'Member Test User', email: 'members@example.com' })
    .onConflictDoNothing()
    .returning()
  userId =
    u?.id ??
    (await db.select().from(schema.users).where(eq(schema.users.email, 'members@example.com')))[0]
      .id
  ws = await createWorkspace({ name: 'Members WS', slug: `members-ws-${Date.now() % 100000}`, ownerId: userId })
})

describe('listMembers', () => {
  it('returns owner user and approved agents with labels', async () => {
    const { agent } = await registerAgent({ name: 'Roster Agent' })
    const req = await requestAccess({ agentId: agent.id, workspaceSlug: ws.slug })
    await approveAccessRequest(req.id, userId)

    const members = await listMembers(ws.id)
    const user = members.find((m) => m.type === 'user' && m.id === userId)
    const ag = members.find((m) => m.type === 'agent' && m.id === agent.id)
    expect(user?.label).toBe('Member Test User')
    expect(ag?.slug).toBe(agent.slug)
    expect(ag?.label).toBe('Roster Agent')
  })
})

describe('addAgentToWorkspace (owner-initiated)', () => {
  it('adds a registered agent by slug, idempotently; unknown slug 404s', async () => {
    const { agent } = await registerAgent({ name: 'Direct Add', slug: `direct-add-${Date.now() % 100000}` })
    const added = await addAgentToWorkspace({ workspaceId: ws.id, agentSlug: agent.slug })
    expect(added.id).toBe(agent.id)

    // second add is a no-op, not an error
    await addAgentToWorkspace({ workspaceId: ws.id, agentSlug: agent.slug })

    const members = await listMembers(ws.id)
    expect(members.filter((m) => m.id === agent.id)).toHaveLength(1)

    await expect(
      addAgentToWorkspace({ workspaceId: ws.id, agentSlug: 'no-such-agent-xyz' }),
    ).rejects.toThrowError(ServiceError)
  })
})
