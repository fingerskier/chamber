import { describe, it, expect, beforeAll } from 'vitest'
import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { registerAgent, requestAccess } from '@/lib/services/agents'
import {
  approveAccessRequest,
  createWorkspace,
  listMembers,
} from '@/lib/services/workspaces'

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
