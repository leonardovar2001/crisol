-- Instance accounts. One organisation per instance: there is no public sign-up,
-- the owner is created from the environment on first boot and invites the rest.
create table users (
  id            text primary key,
  email         text not null unique,
  display_name  text not null,
  password_hash text not null,
  role          text not null check (role in ('owner', 'author', 'facilitator')),
  locale        text not null default 'es',
  -- Reserved for the self-guided mode, when participants get real accounts.
  totp_secret   text,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);

-- Server-side sessions. The cookie carries an opaque token and nothing else, so
-- signing out actually revokes access instead of waiting for a token to expire.
create table auth_sessions (
  token      text primary key,
  user_id    text not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index auth_sessions_user_idx on auth_sessions (user_id);
create index auth_sessions_expiry_idx on auth_sessions (expires_at);

-- A scenario is a document, not a set of rows.
--
-- It is authored, exported, imported and read as a whole; nothing ever queries
-- across scenarios for a phase or an option. Storing it as one validated JSONB
-- payload keeps the portable format as the single source of truth — the same
-- bytes that go into the .zip live here.
--
-- Live sessions are the opposite and will be properly relational: append-only
-- events, votes with real uniqueness constraints.
create table scenarios (
  id             text primary key,
  slug           text not null unique,
  title          text not null,
  schema_version integer not null,
  status         text not null default 'draft' check (status in ('draft', 'published')),
  document       jsonb not null,
  created_by     text references users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index scenarios_updated_idx on scenarios (updated_at desc);

-- Uploaded files. `storage_key` is the path under MEDIA_DIR; the bytes never go
-- in the database. `sha256` lets an import skip files it already has.
create table media_assets (
  id          text primary key,
  scenario_id text not null references scenarios (id) on delete cascade,
  filename    text not null,
  mime_type   text not null,
  size_bytes  bigint not null,
  sha256      text not null,
  storage_key text not null,
  created_at  timestamptz not null default now()
);

create index media_scenario_idx on media_assets (scenario_id);
