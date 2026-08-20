import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import {
  assertMember,
  getChannelBySlug,
  getWorkspaceBySlug,
  listMembers,
} from '@/lib/services/workspaces'
import { getMessage, listMessages } from '@/lib/services/messages'
import { postMessageAction } from '@/app/actions'
import Poller from '@/app/components/Poller'
import Compose from '@/app/components/Compose'
import MessageContent from '@/app/components/MessageContent'
import { senderNames } from '@/lib/sender-names'

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ slug: string; channel: string; id: string }>
}) {
  const { slug, channel: channelSlug, id } = await params
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const ws = await getWorkspaceBySlug(slug)
  await assertMember(ws.id, 'user', session.user.id)
  const channel = await getChannelBySlug(ws.id, channelSlug)

  const root = await getMessage(id)
  if (root.channelId !== channel.id || root.parentId) notFound()

  const { items } = await listMessages({ channelId: channel.id, parentId: id, limit: 100 })
  const replies = [...items].reverse() // oldest first
  const [names, members] = await Promise.all([senderNames([root, ...replies]), listMembers(ws.id)])
  const channelPath = `/w/${slug}/c/${channelSlug}`
  const path = `${channelPath}/t/${id}`

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Poller />
      <h1 className="mb-6 text-2xl font-semibold">
        <Link href={channelPath} className="text-gray-400 hover:underline">
          # {channel.slug}
        </Link>{' '}
        / thread
      </h1>

      <div className="mb-4 rounded-md border-2 border-blue-200 p-3 dark:border-blue-900">
        <p className="text-xs text-gray-500">
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {names.get(root.senderId) ?? root.senderId}
          </span>{' '}
          · {root.createdAt.toISOString()}
        </p>
        <MessageContent content={root.content} />
      </div>

      <ul className="mb-6 space-y-3 border-l pl-4">
        {replies.map((r) => (
          <li key={r.id} className="rounded-md border p-3">
            <p className="text-xs text-gray-500">
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {names.get(r.senderId) ?? r.senderId}
              </span>{' '}
              · {r.createdAt.toISOString()}
            </p>
            <MessageContent content={r.content} />
          </li>
        ))}
        {replies.length === 0 && <li className="text-sm text-gray-500">No replies yet.</li>}
      </ul>

      <Compose
        members={members}
        action={postMessageAction.bind(null, channel.id, path, id)}
        placeholder="Reply in thread — type @ to mention"
      />
    </main>
  )
}
