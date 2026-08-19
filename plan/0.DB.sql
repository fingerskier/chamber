-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Humans (OAuth)
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  name          TEXT,
  avatar_url    TEXT,
  provider      TEXT NOT NULL,          -- 'github', 'google', etc.
  provider_id   TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_id)
);

-- Agents (registered identities that can request access)
CREATE TABLE agents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,   -- stable handle, e.g. "hermes", "osteowaddle"
  description   TEXT,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- optional human owner
  client_id     TEXT NOT NULL UNIQUE,   -- public identifier agents use when requesting access
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Workspaces
CREATE TABLE workspaces (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  owner_id      UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Membership (users + agents)
CREATE TABLE workspace_members (
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  member_type   TEXT NOT NULL CHECK (member_type IN ('user', 'agent')),
  member_id     UUID NOT NULL,          -- users.id or agents.id
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, member_type, member_id)
);

-- Agent access requests (user must approve)
CREATE TABLE agent_access_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  message       TEXT,                   -- optional note from the agent
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ,
  resolved_by   UUID REFERENCES users(id),
  UNIQUE (agent_id, workspace_id)       -- one active request per pair
);

-- Channels
CREATE TABLE channels (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'public' CHECK (type IN ('public', 'private', 'dm')),
  topic         TEXT,
  created_by_type TEXT NOT NULL CHECK (created_by_type IN ('user', 'agent')),
  created_by_id UUID NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, slug)
);

-- Optional explicit membership for private channels / DMs
CREATE TABLE channel_members (
  channel_id    UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  member_type   TEXT NOT NULL CHECK (member_type IN ('user', 'agent')),
  member_id     UUID NOT NULL,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, member_type, member_id)
);

-- Messages (threads via parent_id)
CREATE TABLE messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id    UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  parent_id     UUID REFERENCES messages(id) ON DELETE CASCADE,  -- NULL = top-level
  author_type   TEXT NOT NULL CHECK (author_type IN ('user', 'agent')),
  author_id     UUID NOT NULL,
  content       TEXT NOT NULL,           -- human-readable body
  payload       JSONB DEFAULT '{}',     -- structured data agents can attach
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_channel_created ON messages (channel_id, created_at DESC);
CREATE INDEX idx_messages_parent ON messages (parent_id) WHERE parent_id IS NOT NULL;

-- Mentions
CREATE TABLE mentions (
  message_id    UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  mentioned_type TEXT NOT NULL CHECK (mentioned_type IN ('user', 'agent')),
  mentioned_id  UUID NOT NULL,
  PRIMARY KEY (message_id, mentioned_type, mentioned_id)
);

CREATE INDEX idx_mentions_target ON mentions (mentioned_type, mentioned_id);

-- Simple agent API tokens (issued after approval)
CREATE TABLE agent_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,    -- store hash only
  label         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);
