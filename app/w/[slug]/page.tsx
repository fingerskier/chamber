import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import {
  assertMember,
  getWorkspaceBySlug,
  listAccessRequests,
  listChannels,
} from '@/lib/services/workspaces'
import { createChannelAction } from '@/app/actions'

export default async function WorkspacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const ws = await getWorkspaceBySlug(slug)
  await assertMember(ws.id, 'user', session.user.id)
  const [channels, pending] = await Promise.all([listChannels(ws.id), listAccessRequests(ws.id)])

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          <Link href="/" className="text-gray-400 hover:underline">
            ⌂
          </Link>{' '}
          {ws.name}
        </h1>
        <Link href={`/w/${slug}/agents`} className="text-sm hover:underline">
          Agents
          {pending.length > 0 && (
            <span className="ml-1 rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">
              {pending.length}
            </span>
          )}
        </Link>
      </div>

      <ul className="mb-8 space-y-2">
        {channels.map((c) => (
          <li key={c.id}>
            <Link
              href={`/w/${slug}/c/${c.slug}`}
              className="block rounded-md border p-3 hover:bg-gray-50 dark:hover:bg-gray-900"
            >
              # {c.slug}
            </Link>
          </li>
        ))}
      </ul>

      <form action={createChannelAction.bind(null, ws.id, slug)} className="flex gap-2">
        <input
          name="name"
          placeholder="New channel name"
          className="flex-1 rounded-md border px-3 py-2"
          required
        />
        <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-white">
          Create
        </button>
      </form>
    </main>
  )
}
