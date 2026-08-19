import {
  pgTable,
  pgEnum,
  text,
  integer,
  timestamp,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
  type AnyPgColumn,
  type PgColumn,
} from 'drizzle-orm/pg-core'
import { sql, type SQL } from 'drizzle-orm'
import type { AdapterAccountType } from 'next-auth/adapters'

const sqlPending = (col: PgColumn): SQL => sql`${col} = 'pending'`
const sqlNotNull = (col: PgColumn): SQL => sql`${col} is not null`

export const memberType = pgEnum('member_type', ['user', 'agent'])
export const memberRole = pgEnum('member_role', ['owner', 'member'])
export const requestStatus = pgEnum('request_status', ['pending', 'approved', 'denied'])

// --- Auth.js (Google OAuth, JWT sessions — no sessions table) ---

export const users = pgTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
})

export const accounts = pgTable(
  'accounts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccountType>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
)

// Unused under JWT session strategy, but the Drizzle adapter wants them defined.
export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
})

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
)

// --- Chamber ---

export const agents = pgTable('agents', {
  id: text('id').primaryKey(), // ag_<ULID>
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  tokenHash: text('token_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey(), // ws_<ULID>
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const memberships = pgTable(
  'memberships',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    memberType: memberType('member_type').notNull(),
    memberId: text('member_id').notNull(),
    role: memberRole('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.memberType, t.memberId] })],
)

export const accessRequests = pgTable(
  'access_requests',
  {
    id: text('id').primaryKey(), // ar_<ULID>
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    message: text('message'),
    status: requestStatus('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: text('resolved_by').references(() => users.id),
  },
  (t) => [
    uniqueIndex('access_requests_one_pending')
      .on(t.workspaceId, t.agentId)
      .where(sqlPending(t.status)),
  ],
)

export const channels = pgTable(
  'channels',
  {
    id: text('id').primaryKey(), // ch_<ULID>
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('channels_ws_slug').on(t.workspaceId, t.slug)],
)

export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(), // msg_<ULID> — sort key and pagination cursor
    channelId: text('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    senderType: memberType('sender_type').notNull(),
    senderId: text('sender_id').notNull(),
    parentId: text('parent_id').references((): AnyPgColumn => messages.id, {
      onDelete: 'cascade',
    }),
    content: text('content').notNull(),
    payload: jsonb('payload'),
    idempotencyKey: text('idempotency_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('messages_channel_id').on(t.channelId, t.id),
    index('messages_thread').on(t.channelId, t.parentId, t.id),
    uniqueIndex('messages_idempotency')
      .on(t.senderType, t.senderId, t.idempotencyKey)
      .where(sqlNotNull(t.idempotencyKey)),
  ],
)

export const mentions = pgTable(
  'mentions',
  {
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    targetType: memberType('target_type').notNull(),
    targetId: text('target_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.messageId, t.targetType, t.targetId] }),
    index('mentions_target').on(t.targetType, t.targetId, t.messageId),
  ],
)
