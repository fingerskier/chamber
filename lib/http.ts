import { NextResponse } from 'next/server'
import { ServiceError } from '@/lib/services/errors'

type Handler<Ctx> = (req: Request, ctx: Ctx) => Promise<NextResponse | Response>

export function withErrors<Ctx>(handler: Handler<Ctx>): Handler<Ctx> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx)
    } catch (err) {
      if (err instanceof ServiceError) {
        return NextResponse.json({ error: err.message }, { status: err.status })
      }
      console.error(err)
      return NextResponse.json({ error: 'internal error' }, { status: 500 })
    }
  }
}
