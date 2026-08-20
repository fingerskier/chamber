import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'http'
import { createHmac } from 'crypto'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { registerAgent, requestAccess, setAgentWebhook } from '@/lib/services/agents'
import { approveAccessRequest, createWorkspace, createChannel } from '@/lib/services/workspaces'
import { postMessage, pollMentions } from '@/lib/services/messages'
import { hashToken } from '@/lib/token'

let userId: string
let ws: { id: string; slug: string }
let ch: { id: string }
let server: Server
let port: number
let received: { body: string; signature: string | undefined }[] = []

beforeAll(async () => {
  const [u] = await db
    .insert(schema.users)
    .values({ name: 'Push Test User', email: `push-${Date.now()}@example.com` })
    .returning()
  userId = u.id
  ws = await createWorkspace({
    name: 'Push WS',
    slug: `push-ws-${Date.now() % 100000}`,
    ownerId: userId,
  })
  ch = await createChannel({ workspaceId: ws.id, name: 'Push', slug: 'push' })

  server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      received.push({ body, signature: req.headers['x-chamber-signature'] as string | undefined })
      res.writeHead(200).end('ok')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  port = (server.address() as { port: number }).port
})

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

async function makeMemberAgent(name: string) {
  const reg = await registerAgent({ name, slug: `${name.toLowerCase()}-${Date.now() % 100000}` })
  const req = await requestAccess({ agentId: reg.agent.id, workspaceSlug: ws.slug })
  await approveAccessRequest(req.id, userId)
  return reg
}

describe('webhook push', () => {
  it('POSTs a signed doorbell to the mentioned agent webhook_url', async () => {
    const { agent, token } = await makeMemberAgent('Hooked')
    await setAgentWebhook(agent.id, `http://127.0.0.1:${port}/hook`)

    received = []
    const { message } = await postMessage({
      channelId: ch.id,
      senderType: 'user',
      senderId: userId,
      content: `ping @${agent.slug}`,
    })

    expect(received).toHaveLength(1)
    const payload = JSON.parse(received[0].body)
    expect(payload.type).toBe('mention')
    expect(payload.message_id).toBe(message.id)
    expect(payload.channel_id).toBe(ch.id)

    // signature = HMAC-SHA256(body, sha256(agent token)) — agent can derive the key
    const expected = createHmac('sha256', hashToken(token)).update(received[0].body).digest('hex')
    expect(received[0].signature).toBe(expected)
  })

  it('webhook failure does not fail the message post', async () => {
    const { agent } = await makeMemberAgent('DeadHook')
    await setAgentWebhook(agent.id, 'http://127.0.0.1:1/nope')
    const { created } = await postMessage({
      channelId: ch.id,
      senderType: 'user',
      senderId: userId,
      content: `ping @${agent.slug}`,
    })
    expect(created).toBe(true)
  })

  it('setAgentWebhook(null) clears the URL', async () => {
    const { agent } = await makeMemberAgent('Clearable')
    await setAgentWebhook(agent.id, `http://127.0.0.1:${port}/x`)
    await setAgentWebhook(agent.id, null)
    const [row] = await db.select().from(schema.agents).where(eq(schema.agents.id, agent.id))
    expect(row.webhookUrl).toBeNull()
  })
})

describe('long-poll', () => {
  it('pollMentions returns early when a mention arrives mid-wait', async () => {
    const { agent } = await makeMemberAgent('Poller')
    setTimeout(() => {
      void postMessage({
        channelId: ch.id,
        senderType: 'user',
        senderId: userId,
        content: `wake up @${agent.slug}`,
      })
    }, 1000)

    const start = Date.now()
    const result = await pollMentions({
      targetType: 'agent',
      targetId: agent.id,
      waitMs: 10000,
      intervalMs: 500,
    })
    const elapsed = Date.now() - start
    expect(result.items.length).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(9000)
  })

  it('pollMentions returns empty after the wait expires', async () => {
    const { agent } = await makeMemberAgent('Lonely')
    const result = await pollMentions({
      targetType: 'agent',
      targetId: agent.id,
      waitMs: 1200,
      intervalMs: 400,
    })
    expect(result.items).toHaveLength(0)
  })
})
