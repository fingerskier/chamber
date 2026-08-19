import { and, asc, desc, eq, gt, isNull, lt } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/id'
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

  if (input.mentions?.length) {
    await db.insert(schema.mentions).values(
      input.mentions.map((m) => ({
        messageId: message.id,
        targetType: m.type,
        targetId: m.id,
      })),
    )
  }

  return { message, created: true }
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
