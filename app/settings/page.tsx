import Link from 'next/link'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { createWorkspaceAction, signOutAction } from '@/app/actions'

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const { user } = session

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-8 text-2xl font-semibold">
        <Link href="/" className="text-gray-400 hover:underline">
          ⌂
        </Link>{' '}
        Settings
      </h1>

      <section className="mb-8 rounded-md border p-4">
        <h2 className="mb-3 font-medium">Profile</h2>
        <div className="flex items-center gap-4">
          {user.image && (
            <Image
              src={user.image}
              alt=""
              width={48}
              height={48}
              className="rounded-full"
            />
          )}
          <div>
            <p className="font-medium">{user.name}</p>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>
        </div>
        <form action={signOutAction} className="mt-4">
          <button type="submit" className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50 dark:hover:bg-gray-900">
            Sign out
          </button>
        </form>
      </section>

      <section className="rounded-md border p-4">
        <h2 className="mb-3 font-medium">New workspace</h2>
        <form action={createWorkspaceAction} className="flex gap-2">
          <input
            name="name"
            placeholder="Workspace name"
            className="flex-1 rounded-md border px-3 py-2"
            required
          />
          <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-white">
            Create
          </button>
        </form>
      </section>
    </main>
  )
}
