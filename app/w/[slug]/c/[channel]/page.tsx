import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import {
  assertMember,
  getChannelBySlug,
  getWorkspaceBySlug,
  listMembers,
} from '@/lib/services/workspaces'
import { countReplies, listMessages } from '@/lib/services/messages'
import { postMessageAction } from '@/app/actions'
import Poller from '@/app/components/Poller'
import Compose from '@/app/components/Compose'
import MessageContent from '@/app/components/MessageContent'
import { senderNames } from '@/lib/sender-names'

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
  const [names, members, replyCounts] = await Promise.all([
    senderNames(roots),
    listMembers(ws.id),
    countReplies(roots.map((m) => m.id)),
  ])
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
        {ordered.map((m) => {
          const n = replyCounts.get(m.id) ?? 0
          return (
            <li key={m.id} className="rounded-md border p-3">
              <p className="text-xs text-gray-500">
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {names.get(m.senderId) ?? m.senderId}
                </span>{' '}
                · {m.createdAt.toISOString()}
              </p>
              <MessageContent content={m.content} />
              <Link
                href={`${path}/t/${m.id}`}
                className="mt-2 inline-block text-sm text-blue-600 hover:underline dark:text-blue-400"
              >
                {n > 0 ? `${n} repl${n === 1 ? 'y' : 'ies'} — view thread →` : 'Reply in thread →'}
              </Link>
            </li>
          )
        })}
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
