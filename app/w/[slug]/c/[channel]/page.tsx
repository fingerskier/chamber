import Link from 'next/link'
import { redirect } from 'next/navigation'
import { inArray } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db, schema } from '@/lib/db'
import {
  assertMember,
  getChannelBySlug,
  getWorkspaceBySlug,
  listMembers,
} from '@/lib/services/workspaces'
import { listMessages } from '@/lib/services/messages'
import { postMessageAction } from '@/app/actions'
import Poller from '@/app/components/Poller'
import Compose from '@/app/components/Compose'
import MessageContent from '@/app/components/MessageContent'

type Msg = typeof schema.messages.$inferSelect

async function senderNames(msgs: Msg[]): Promise<Map<string, string>> {
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

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ slug: string; channel: string }>
}) {
  const { slug, channel: channelSlug } = await params
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const ws = await getWorkspaceBySlug(slug)
  await assertMember(ws.id, 'user', session.user.id)
  const channel = await getChannelBySlug(ws.id, channelSlug)

  const { items: roots } = await listMessages({ channelId: channel.id, limit: 50 })
  const replies = roots.length
    ? await db
        .select()
        .from(schema.messages)
        .where(inArray(schema.messages.parentId, roots.map((m) => m.id)))
    : []
  const [names, members] = await Promise.all([
    senderNames([...roots, ...replies]),
    listMembers(ws.id),
  ])
  const byParent = new Map<string, Msg[]>()
  for (const r of replies) {
    const list = byParent.get(r.parentId!) ?? []
    list.push(r)
    byParent.set(r.parentId!, list)
  }
  const path = `/w/${slug}/c/${channelSlug}`
  const ordered = [...roots].reverse() // oldest first for display

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Poller />
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          <Link href={`/w/${slug}`} className="text-gray-400 hover:underline">
            {ws.name}
          </Link>{' '}
          / # {channel.slug}
        </h1>
        <Link href={`/w/${slug}/agents`} className="text-sm text-gray-500 hover:underline">
          Agents
        </Link>
      </div>

      <ul className="mb-6 space-y-4">
        {ordered.map((m) => (
          <li key={m.id} className="rounded-md border p-3">
            <p className="text-xs text-gray-500">
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {names.get(m.senderId) ?? m.senderId}
              </span>{' '}
              · {m.createdAt.toISOString()}
            </p>
            <MessageContent content={m.content} />
            {(byParent.get(m.id) ?? []).map((r) => (
              <div key={r.id} className="mt-2 ml-6 border-l pl-3">
                <p className="text-xs text-gray-500">
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    {names.get(r.senderId) ?? r.senderId}
                  </span>{' '}
                  · {r.createdAt.toISOString()}
                </p>
                <MessageContent content={r.content} />
              </div>
            ))}
            <div className="mt-2 ml-6">
              <Compose
                members={members}
                action={postMessageAction.bind(null, channel.id, path, m.id)}
                placeholder="Reply in thread…"
                compact
              />
            </div>
          </li>
        ))}
        {ordered.length === 0 && <li className="text-sm text-gray-500">No messages yet.</li>}
      </ul>

      <Compose
        members={members}
        action={postMessageAction.bind(null, channel.id, path, null)}
        placeholder={`Message # ${channel.slug} — type @ to mention`}
      />
    </main>
  )
}
