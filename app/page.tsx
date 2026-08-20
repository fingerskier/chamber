import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listUserWorkspaces } from '@/lib/services/workspaces'
import { createWorkspaceAction, signOutAction } from '@/app/actions'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const workspaces = await listUserWorkspaces(session.user.id)

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Workspaces</h1>
        <div className="flex items-center gap-4">
          <Link href="/settings" className="text-sm text-gray-500 hover:underline">
            Settings
          </Link>
          <form action={signOutAction}>
            <button type="submit" className="text-sm text-gray-500 hover:underline">
              Sign out ({session.user.name})
            </button>
          </form>
        </div>
      </div>

      <ul className="mb-8 space-y-2">
        {workspaces.map(({ workspace, role }) => (
          <li key={workspace.id}>
            <Link
              href={`/w/${workspace.slug}`}
              className="block rounded-md border p-4 hover:bg-gray-50 dark:hover:bg-gray-900"
            >
              <span className="font-medium">{workspace.name}</span>
              <span className="ml-2 text-xs text-gray-500">/{workspace.slug}</span>
              <span className="ml-2 text-xs text-gray-400">{role}</span>
            </Link>
          </li>
        ))}
        {workspaces.length === 0 && (
          <li className="text-sm text-gray-500">No workspaces yet — create one below.</li>
        )}
      </ul>

      <form action={createWorkspaceAction} className="flex gap-2">
        <input
          name="name"
          placeholder="New workspace name"
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
