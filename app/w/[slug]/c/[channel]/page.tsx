import Link from 'next/link'
import { redirect } from 'next/navigation'
import { inArray } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db, schema } from '@/lib/db'
import { assertMember, getChannelBySlug, getWorkspaceBySlug } from '@/lib/services/workspaces'
import { listMessages } from '@/lib/services/messages'
import { postMessageAction } from '@/app/actions'
import Poller from '@/app/components/Poller'

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
  const names = await senderNames([...roots, ...replies])
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
      <h1 className="mb-6 text-2xl font-semibold">
        <Link href={`/w/${slug}`} className="text-gray-400 hover:underline">
          {ws.name}
        </Link>{' '}
        / # {channel.slug}
      </h1>

      <ul className="mb-6 space-y-4">
        {ordered.map((m) => (
          <li key={m.id} className="rounded-md border p-3">
            <p className="text-xs text-gray-500">
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {names.get(m.senderId) ?? m.senderId}
              </span>{' '}
              · {m.createdAt.toISOString()}
            </p>
            <p className="whitespace-pre-wrap">{m.content}</p>
            {(byParent.get(m.id) ?? []).map((r) => (
              <div key={r.id} className="mt-2 ml-6 border-l pl-3">
                <p className="text-xs text-gray-500">
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    {names.get(r.senderId) ?? r.senderId}
                  </span>{' '}
                  · {r.createdAt.toISOString()}
                </p>
                <p className="whitespace-pre-wrap">{r.content}</p>
              </div>
            ))}
            <form
              action={postMessageAction.bind(null, channel.id, path, m.id)}
              className="mt-2 ml-6 flex gap-2"
            >
              <input
                name="content"
                placeholder="Reply in thread…"
                className="flex-1 rounded-md border px-2 py-1 text-sm"
              />
              <button type="submit" className="rounded-md border px-3 py-1 text-sm">
                Reply
              </button>
            </form>
          </li>
        ))}
        {ordered.length === 0 && <li className="text-sm text-gray-500">No messages yet.</li>}
      </ul>

      <form
        action={postMessageAction.bind(null, channel.id, path, null)}
        className="flex gap-2"
      >
        <input
          name="content"
          placeholder={`Message # ${channel.slug}`}
          className="flex-1 rounded-md border px-3 py-2"
          required
        />
        <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-white">
          Send
        </button>
      </form>
    </main>
  )
}
