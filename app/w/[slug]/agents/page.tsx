import Link from 'next/link'
import { redirect } from 'next/navigation'
import { eq, and, inArray } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db, schema } from '@/lib/db'
import { assertMember, getWorkspaceBySlug, listAccessRequests } from '@/lib/services/workspaces'
import { approveRequestAction, denyRequestAction } from '@/app/actions'

export default async function AgentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const ws = await getWorkspaceBySlug(slug)
  await assertMember(ws.id, 'user', session.user.id)

  const pending = await listAccessRequests(ws.id)
  const members = await db
    .select({ agent: schema.agents })
    .from(schema.memberships)
    .innerJoin(schema.agents, eq(schema.agents.id, schema.memberships.memberId))
    .where(
      and(eq(schema.memberships.workspaceId, ws.id), eq(schema.memberships.memberType, 'agent')),
    )
  const requestAgents = pending.length
    ? await db
        .select()
        .from(schema.agents)
        .where(inArray(schema.agents.id, pending.map((r) => r.agentId)))
    : []
  const agentName = new Map(requestAgents.map((a) => [a.id, a.name]))
  const path = `/w/${slug}/agents`

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-8 text-2xl font-semibold">
        <Link href={`/w/${slug}`} className="text-gray-400 hover:underline">
          {ws.name}
        </Link>{' '}
        / Agents
      </h1>

      <h2 className="mb-2 font-medium">Pending requests</h2>
      <ul className="mb-8 space-y-2">
        {pending.map((r) => (
          <li key={r.id} className="flex items-center justify-between rounded-md border p-3">
            <div>
              <span className="font-medium">{agentName.get(r.agentId) ?? r.agentId}</span>
              {r.message && <p className="text-sm text-gray-500">{r.message}</p>}
              <p className="text-xs text-gray-400">{r.createdAt.toISOString()}</p>
            </div>
            <div className="flex gap-2">
              <form action={approveRequestAction.bind(null, r.id, path)}>
                <button type="submit" className="rounded-md bg-green-600 px-3 py-1 text-white">
                  Approve
                </button>
              </form>
              <form action={denyRequestAction.bind(null, r.id, path)}>
                <button type="submit" className="rounded-md bg-red-600 px-3 py-1 text-white">
                  Deny
                </button>
              </form>
            </div>
          </li>
        ))}
        {pending.length === 0 && <li className="text-sm text-gray-500">None.</li>}
      </ul>

      <h2 className="mb-2 font-medium">Approved agents</h2>
      <ul className="space-y-2">
        {members.map(({ agent }) => (
          <li key={agent.id} className="rounded-md border p-3">
            <span className="font-medium">{agent.name}</span>
            <span className="ml-2 text-xs text-gray-500">@{agent.slug}</span>
          </li>
        ))}
        {members.length === 0 && <li className="text-sm text-gray-500">None yet.</li>}
      </ul>
    </main>
  )
}
