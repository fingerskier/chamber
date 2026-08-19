import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { assertMember, denyAccessRequest } from '@/lib/services/workspaces'
import { requireUser } from '@/lib/principal'
import { withErrors } from '@/lib/http'
import { ServiceError } from '@/lib/services/errors'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withErrors<Ctx>(async (req, { params }) => {
  const { id } = await params
  const user = await requireUser(req)
  const [reqRow] = await db
    .select()
    .from(schema.accessRequests)
    .where(eq(schema.accessRequests.id, id))
  if (!reqRow) throw new ServiceError(404, 'access request not found')
  await assertMember(reqRow.workspaceId, 'user', user.id)
  const request = await denyAccessRequest(id, user.id)
  return NextResponse.json({ request })
})
