import { describe, it, expect, beforeAll } from 'vitest'
import { db, schema } from '@/lib/db'
import { registerAgent, authenticateAgent, requestAccess, getMe } from '@/lib/services/agents'
import {
  createWorkspace,
  createChannel,
  approveAccessRequest,
  listAccessRequests,
} from '@/lib/services/workspaces'
import { postMessage, listMessages, getMentions } from '@/lib/services/messages'
import { ServiceError } from '@/lib/services/errors'

let userId: string
let ws: { id: string; slug: string }
let ch: { id: string }

beforeAll(async () => {
  // wipe in FK order
  await db.delete(schema.mentions)
  await db.delete(schema.messages)
  await db.delete(schema.channels)
  await db.delete(schema.accessRequests)
  await db.delete(schema.memberships)
  await db.delete(schema.workspaces)
  await db.delete(schema.agents)
  await db.delete(schema.accounts)
  await db.delete(schema.users)

  const [u] = await db
    .insert(schema.users)
    .values({ name: 'Test User', email: 'test@example.com' })
    .returning()
  userId = u.id
  ws = await createWorkspace({ name: 'Test WS', slug: 'test-ws', ownerId: userId })
  ch = await createChannel({ workspaceId: ws.id, name: 'General 2', slug: 'general-2' })
})

describe('agent lifecycle', () => {
  it('register → authenticate roundtrip; bad token rejected', async () => {
    const { agent, token } = await registerAgent({ name: 'Hermes' })
    expect(agent.id).toMatch(/^ag_/)
    expect(token).toMatch(/^chm_/)
    const authed = await authenticateAgent(token)
    expect(authed?.id).toBe(agent.id)
    expect(await authenticateAgent('chm_bogus')).toBeNull()
  })

  it('request access → approve → membership visible in getMe', async () => {
    const { agent } = await registerAgent({ name: 'Approvable' })
    const req = await requestAccess({ agentId: agent.id, workspaceSlug: ws.slug })
    expect(req.status).toBe('pending')
    // duplicate pending request dedupes
    const dup = await requestAccess({ agentId: agent.id, workspaceSlug: ws.slug })
    expect(dup.id).toBe(req.id)

    const pending = await listAccessRequests(ws.id)
    expect(pending.some((r) => r.id === req.id)).toBe(true)

    await approveAccessRequest(req.id, userId)
    const me = await getMe(agent.id)
    expect(me.memberships.some((m) => m.workspaceId === ws.id)).toBe(true)
  })
})

describe('messages', () => {
  it('rejects payload over 8KB', async () => {
    await expect(
      postMessage({
        channelId: ch.id,
        senderType: 'user',
        senderId: userId,
        content: 'big',
        payload: { blob: 'x'.repeat(9000) },
      }),
    ).rejects.toThrowError(ServiceError)
  })

  it('idempotency key returns the same message on retry', async () => {
    const key = 'idem-123'
    const first = await postMessage({
      channelId: ch.id,
      senderType: 'user',
      senderId: userId,
      content: 'once',
      idempotencyKey: key,
    })
    const retry = await postMessage({
      channelId: ch.id,
      senderType: 'user',
      senderId: userId,
      content: 'once',
      idempotencyKey: key,
    })
    expect(first.created).toBe(true)
    expect(retry.created).toBe(false)
    expect(retry.message.id).toBe(first.message.id)
  })

  it('reply-to-reply re-parents to the root', async () => {
    const root = await postMessage({
      channelId: ch.id,
      senderType: 'user',
      senderId: userId,
      content: 'root',
    })
    const reply = await postMessage({
      channelId: ch.id,
      senderType: 'user',
      senderId: userId,
      content: 'reply',
      parentId: root.message.id,
    })
    const nested = await postMessage({
      channelId: ch.id,
      senderType: 'user',
      senderId: userId,
      content: 'nested',
      parentId: reply.message.id,
    })
    expect(nested.message.parentId).toBe(root.message.id)
  })

  it('paginates by message id: before desc, after asc', async () => {
    const c = await createChannel({ workspaceId: ws.id, name: 'Pager', slug: 'pager' })
    const ids: string[] = []
    for (let i = 0; i < 5; i++) {
      const r = await postMessage({
        channelId: c.id,
        senderType: 'user',
        senderId: userId,
        content: `m${i}`,
      })
      ids.push(r.message.id)
    }
    const hist = await listMessages({ channelId: c.id, before: ids[4], limit: 2 })
    expect(hist.items.map((m) => m.id)).toEqual([ids[3], ids[2]])
    expect(hist.nextCursor).toBe(ids[2])

    const tail = await listMessages({ channelId: c.id, after: ids[1], limit: 10 })
    expect(tail.items.map((m) => m.id)).toEqual([ids[2], ids[3], ids[4]])
    expect(tail.nextCursor).toBeNull()
  })

  it('mentions: after-cursor returns only newer mentions', async () => {
    const { agent } = await registerAgent({ name: 'Mentioned' })
    const m1 = await postMessage({
      channelId: ch.id,
      senderType: 'user',
      senderId: userId,
      content: 'hey @mentioned',
      mentions: [{ type: 'agent', id: agent.id }],
    })
    const m2 = await postMessage({
      channelId: ch.id,
      senderType: 'user',
      senderId: userId,
      content: 'again @mentioned',
      mentions: [{ type: 'agent', id: agent.id }],
    })
    const all = await getMentions({ targetType: 'agent', targetId: agent.id })
    expect(all.items.map((m) => m.id)).toEqual([m1.message.id, m2.message.id])

    const newer = await getMentions({
      targetType: 'agent',
      targetId: agent.id,
      after: m1.message.id,
    })
    expect(newer.items.map((m) => m.id)).toEqual([m2.message.id])
  })
})
