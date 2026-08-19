import type { AuthInfo } from '@modelcontextprotocol/server'
import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { z } from 'zod'
import { authenticateAgent, getMe, requestAccess } from '@/lib/services/agents'
import { assertMember, getChannel, listChannels } from '@/lib/services/workspaces'
import { getMentions, listMessages, postMessage } from '@/lib/services/messages'
import { ServiceError } from '@/lib/services/errors'

type ToolCtx = { http?: { authInfo?: AuthInfo } }

function agentId(ctx: ToolCtx): string {
  const id = ctx.http?.authInfo?.extra?.agentId
  if (typeof id !== 'string') throw new Error('unauthenticated')
  return id
}

function text(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

async function run<T>(fn: () => Promise<T>) {
  try {
    return text(await fn())
  } catch (err) {
    if (err instanceof ServiceError) {
      return { ...text({ error: err.message, status: err.status }), isError: true }
    }
    throw err
  }
}

const handler = createMcpHandler((server) => {
  server.registerTool(
    'list_workspaces',
    {
      description: 'List workspaces this agent has been approved for',
      inputSchema: z.object({}),
    },
    async (_args, ctx) =>
      run(async () => {
        const me = await getMe(agentId(ctx as ToolCtx))
        return me.memberships
      }),
  )

  server.registerTool(
    'list_channels',
    {
      description: 'List channels in a workspace',
      inputSchema: z.object({ workspace_id: z.string() }),
    },
    async ({ workspace_id }, ctx) =>
      run(async () => {
        const id = agentId(ctx as ToolCtx)
        await assertMember(workspace_id, 'agent', id)
        return listChannels(workspace_id)
      }),
  )

  server.registerTool(
    'read_messages',
    {
      description: 'Read messages in a channel or thread',
      inputSchema: z.object({
        channel_id: z.string(),
        parent_id: z.string().optional().describe('If set, only replies in this thread'),
        limit: z.number().optional(),
        before: z.string().optional().describe('Message id cursor — history, descending'),
        after: z.string().optional().describe('Message id cursor — tail/poll, ascending'),
      }),
    },
    async (args, ctx) =>
      run(async () => {
        const id = agentId(ctx as ToolCtx)
        const channel = await getChannel(args.channel_id)
        await assertMember(channel.workspaceId, 'agent', id)
        return listMessages({
          channelId: args.channel_id,
          parentId: args.parent_id,
          limit: args.limit,
          before: args.before,
          after: args.after,
        })
      }),
  )

  server.registerTool(
    'send_message',
    {
      description:
        'Post a message (or reply) in a channel. Use mentions for @agent / @user. Pass the same idempotency_key on retry to avoid duplicates.',
      inputSchema: z.object({
        channel_id: z.string(),
        content: z.string(),
        parent_id: z
          .string()
          .optional()
          .describe('Root message id — replies to replies re-parent to the root'),
        payload: z.record(z.string(), z.unknown()).optional().describe('Max 8 KB serialized'),
        idempotency_key: z
          .string()
          .optional()
          .describe('Client-generated uuid; duplicate returns the existing message'),
        mentions: z
          .array(z.object({ type: z.enum(['user', 'agent']), id: z.string() }))
          .optional(),
      }),
    },
    async (args, ctx) =>
      run(async () => {
        const id = agentId(ctx as ToolCtx)
        const channel = await getChannel(args.channel_id)
        await assertMember(channel.workspaceId, 'agent', id)
        return postMessage({
          channelId: args.channel_id,
          senderType: 'agent',
          senderId: id,
          content: args.content,
          parentId: args.parent_id,
          payload: args.payload,
          idempotencyKey: args.idempotency_key,
          mentions: args.mentions,
        })
      }),
  )

  server.registerTool(
    'get_mentions',
    {
      description:
        'Fetch messages that mention this agent, ascending from a cursor. Persist the last message id you processed and pass it as `after` next time.',
      inputSchema: z.object({
        after: z.string().optional().describe('Message id cursor — only newer mentions'),
        limit: z.number().optional(),
      }),
    },
    async (args, ctx) =>
      run(() =>
        getMentions({
          targetType: 'agent',
          targetId: agentId(ctx as ToolCtx),
          after: args.after,
          limit: args.limit,
        }),
      ),
  )

  server.registerTool(
    'request_workspace_access',
    {
      description: 'Ask the human owner for access to a workspace (slug is the human-shareable handle)',
      inputSchema: z.object({
        workspace_slug: z.string(),
        message: z.string().optional(),
      }),
    },
    async (args, ctx) =>
      run(() =>
        requestAccess({
          agentId: agentId(ctx as ToolCtx),
          workspaceSlug: args.workspace_slug,
          message: args.message,
        }),
      ),
  )
})

const verifyToken = async (_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> => {
  if (!bearerToken) return undefined
  const agent = await authenticateAgent(bearerToken)
  if (!agent) return undefined
  return {
    token: bearerToken,
    scopes: ['chamber'],
    clientId: agent.slug,
    extra: { agentId: agent.id },
  }
}

const authHandler = withMcpAuth(handler, verifyToken, { required: true })

export { authHandler as GET, authHandler as POST }
