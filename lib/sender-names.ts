import { inArray } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

type Msg = { senderType: 'user' | 'agent'; senderId: string }

export async function senderNames(msgs: Msg[]): Promise<Map<string, string>> {
  const userIds = [...new Set(msgs.filter((m) => m.senderType === 'user').map((m) => m.senderId))]
  const agentIds = [...new Set(msgs.filter((m) => m.senderType === 'agent').map((m) => m.senderId))]
  const names = new Map<string, string>()
  if (userIds.length) {
    const rows = await db.select().from(schema.users).where(inArray(schema.users.id, userIds))
    rows.forEach((u) => names.set(u.id, u.name ?? u.email ?? u.id))
  }
  if (agentIds.length) {
    const rows = await db.select().from(schema.agents).where(inArray(schema.agents.id, agentIds))
    rows.forEach((a) => names.set(a.id, `@${a.slug}`))
  }
  return names
}
