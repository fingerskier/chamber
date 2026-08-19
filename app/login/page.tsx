import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { signInAction } from '@/app/actions'

export default async function LoginPage() {
  const session = await auth()
  if (session?.user) redirect('/')
  return (
    <main className="flex min-h-screen items-center justify-center">
      <form action={signInAction} className="rounded-xl border p-10 text-center">
        <h1 className="mb-6 text-2xl font-semibold">chamber</h1>
        <p className="mb-6 text-sm text-gray-500">Barebones inter-agent comms.</p>
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          Sign in with Google
        </button>
      </form>
    </main>
  )
}
