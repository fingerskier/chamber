import { NextResponse } from 'next/server'
import { assertMember, listAccessRequests } from '@/lib/services/workspaces'
import { requireUser } from '@/lib/principal'
import { withErrors } from '@/lib/http'

type Ctx = { params: Promise<{ id: string }> }

export const GET = withErrors<Ctx>(async (req, { params }) => {
  const { id } = await params
  const user = await requireUser(req)
  await assertMember(id, 'user', user.id)
  const items = await listAccessRequests(id)
  return NextResponse.json({ items })
})
