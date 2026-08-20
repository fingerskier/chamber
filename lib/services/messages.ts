import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, lt } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/id'
import { buildMentionWebhookHeaders } from '@/lib/webhooks'
import { ServiceError } from './errors'

export const MAX_PAYLOAD_BYTES = 8192
const MAX_LIMIT = 100

export type Mention = { type: 'user' | 'agent'; id: string }

export async function postMessage(input: {
  channelId: string
  senderType: 'user' | 'agent'
  senderId: string
  content: string
  parentId?: string
  payload?: unknown
  idempotencyKey?: string
  mentions?: Mention[]
}) {
  if (input.payload !== undefined) {
    const bytes = Buffer.byteLength(JSON.stringify(input.payload), 'utf8')
    if (bytes > MAX_PAYLOAD_BYTES)
      throw new ServiceError(413, `payload is ${bytes} bytes; max ${MAX_PAYLOAD_BYTES}`)
  }

  if (input.idempotencyKey) {
    const existing = await findByIdempotencyKey(input)
    if (existing) return { message: existing, created: false }
  }

  // Single-level threads: replies to a reply attach to the root.
  let parentId = input.parentId ?? null
  if (parentId) {
    const [parent] = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.id, parentId))
    if (!parent) throw new ServiceError(404, 'parent message not found')
    if (parent.channelId !== input.channelId)
      throw new ServiceError(400, 'parent message is in a different channel')
    if (parent.parentId) parentId = parent.parentId
  }

  let message
  try {
    ;[message] = await db
      .insert(schema.messages)
      .values({
        id: newId('msg'),
        channelId: input.channelId,
        senderType: input.senderType,
        senderId: input.senderId,
        parentId,
        content: input.content,
        payload: input.payload ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      })
      .returning()
  } catch (err) {
    // Race on the idempotency unique index: return the winner.
    if (input.idempotencyKey) {
      const existing = await findByIdempotencyKey(input)
      if (existing) return { message: existing, created: false }
    }
    throw err
  }

  const mentions = await resolveMentions(input.channelId, input.content, input.mentions)
  if (mentions.length) {
    await db.insert(schema.mentions).values(
      mentions.map((m) => ({
        messageId: message.id,
        targetType: m.type,
        targetId: m.id,
      })),
    )
    await fireMentionWebhooks(mentions, message)
  }

  return { message, created: true }
}

// Doorbell only: mentioned agents with a webhook_url get a signed POST naming
// the message; they pull content through the authed API. Failures are logged
// and swallowed — delivery is best-effort, polling remains the source of truth.
async function fireMentionWebhooks(
  mentions: Mention[],
  message: { id: string; channelId: string; parentId: string | null },
) {
  const agentIds = mentions.filter((m) => m.type === 'agent').map((m) => m.id)
  if (!agentIds.length) return
  const targets = await db
    .select()
    .from(schema.agents)
    .where(and(inArray(schema.agents.id, agentIds), isNotNull(schema.agents.webhookUrl)))

  await Promise.all(
    targets.map(async (agent) => {
      const body = JSON.stringify({
        type: 'mention',
        message_id: message.id,
        channel_id: message.channelId,
        parent_id: message.parentId,
      })
      // Key = sha256(agent token) — already at rest as tokenHash; the agent
      // derives it from its own token, so no extra secret is exchanged.
      try {
        const response = await fetch(agent.webhookUrl!, {
          method: 'POST',
          // Hermes' generic webhook adapter uses the timestamp-bound V2
          // headers; the Chamber signature remains for native receivers.
          headers: buildMentionWebhookHeaders({
            tokenHash: agent.tokenHash,
            body,
            messageId: message.id,
          }),
          body,
          signal: AbortSignal.timeout(3000),
        })
        if (!response.ok) {
          console.warn(`webhook to ${agent.slug} returned ${response.status}`)
        }
      } catch (err) {
        console.warn(`webhook to ${agent.slug} failed:`, err)
      }
    }),
  )
}

// Long-poll: re-check mentions every intervalMs until something arrives or
// waitMs expires. Serverless-friendly push for clients that can't host a
// webhook endpoint (CLI harnesses).
export async function pollMentions(input: {
  targetType: 'user' | 'agent'
  targetId: string
  after?: string
  limit?: number
  waitMs: number
  intervalMs?: number
}) {
  const interval = input.intervalMs ?? 2000
  const deadline = Date.now() + input.waitMs
  for (;;) {
    const result = await getMentions(input)
    if (result.items.length || Date.now() + interval > deadline) return result
    await new Promise((r) => setTimeout(r, interval))
  }
}

// Structured mentions plus plain-typed @slug tokens resolved against the
// channel's workspace agents, deduped.
async function resolveMentions(
  channelId: string,
  content: string,
  explicit: Mention[] = [],
): Promise<Mention[]> {
  const typedSlugs = [...new Set([...content.matchAll(/@([\w-]+)/g)].map((m) => m[1]))]
  const resolved: Mention[] = [...explicit]
  if (typedSlugs.length) {
    const [channel] = await db
      .select()
      .from(schema.channels)
      .where(eq(schema.channels.id, channelId))
    if (channel) {
      const rows = await db
        .select({ id: schema.agents.id })
        .from(schema.agents)
        .innerJoin(
          schema.memberships,
          and(
            eq(schema.memberships.memberId, schema.agents.id),
            eq(schema.memberships.memberType, 'agent'),
            eq(schema.memberships.workspaceId, channel.workspaceId),
          ),
        )
        .where(inArray(schema.agents.slug, typedSlugs))
      resolved.push(...rows.map((r) => ({ type: 'agent' as const, id: r.id })))
    }
  }
  const seen = new Set<string>()
  return resolved.filter((m) => {
    const key = `${m.type}:${m.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function findByIdempotencyKey(input: {
  senderType: 'user' | 'agent'
  senderId: string
  idempotencyKey?: string
}) {
  const [row] = await db
    .select()
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.senderType, input.senderType),
        eq(schema.messages.senderId, input.senderId),
        eq(schema.messages.idempotencyKey, input.idempotencyKey!),
      ),
    )
  return row
}

export async function listMessages(input: {
  channelId: string
  parentId?: string
  limit?: number
  before?: string
  after?: string
}) {
  const limit = Math.min(input.limit ?? 50, MAX_LIMIT)
  const scope = input.parentId
    ? eq(schema.messages.parentId, input.parentId)
    : isNull(schema.messages.parentId)

  const conditions = [eq(schema.messages.channelId, input.channelId), scope]
  if (input.before) conditions.push(lt(schema.messages.id, input.before))
  if (input.after) conditions.push(gt(schema.messages.id, input.after))

  const items = await db
    .select()
    .from(schema.messages)
    .where(and(...conditions))
    .orderBy(input.after ? asc(schema.messages.id) : desc(schema.messages.id))
    .limit(limit)

  return { items, nextCursor: items.length === limit ? items[items.length - 1].id : null }
}

export async function getMessage(messageId: string) {
  const [m] = await db.select().from(schema.messages).where(eq(schema.messages.id, messageId))
  if (!m) throw new ServiceError(404, 'message not found')
  return m
}

export async function countReplies(rootIds: string[]): Promise<Map<string, number>> {
  if (!rootIds.length) return new Map()
  const rows = await db
    .select({ parentId: schema.messages.parentId, n: count() })
    .from(schema.messages)
    .where(inArray(schema.messages.parentId, rootIds))
    .groupBy(schema.messages.parentId)
  return new Map(rows.map((r) => [r.parentId!, Number(r.n)]))
}

export async function getMentions(input: {
  targetType: 'user' | 'agent'
  targetId: string
  after?: string
  limit?: number
}) {
  const limit = Math.min(input.limit ?? 20, MAX_LIMIT)
  const conditions = [
    eq(schema.mentions.targetType, input.targetType),
    eq(schema.mentions.targetId, input.targetId),
  ]
  if (input.after) conditions.push(gt(schema.mentions.messageId, input.after))

  const rows = await db
    .select({ message: schema.messages })
    .from(schema.mentions)
    .innerJoin(schema.messages, eq(schema.messages.id, schema.mentions.messageId))
    .where(and(...conditions))
    .orderBy(asc(schema.mentions.messageId))
    .limit(limit)

  const items = rows.map((r) => r.message)
  return { items, nextCursor: items.length === limit ? items[items.length - 1].id : null }
}
