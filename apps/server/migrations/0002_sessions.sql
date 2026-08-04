-- Live sessions.
--
-- The opposite of scenarios: those are one document read whole, these are
-- append-only history with real uniqueness constraints. The scenario document
-- is copied in at launch on purpose — editing a scenario must never change what
-- happened in a session that already ran.
create table sessions (
  id           text primary key,
  scenario_id  text references scenarios (id) on delete set null,
  document     jsonb not null,
  join_code    text not null,
  status       text not null default 'draft'
               check (status in ('draft', 'live', 'paused', 'ended')),
  locale       text not null default 'es',
  created_by   text references users (id) on delete set null,
  created_at   timestamptz not null default now(),
  ended_at     timestamptz
);

-- Only one live session can hold a given code; ended ones release it so codes
-- stay short and speakable instead of growing forever.
create unique index sessions_active_code_idx
  on sessions (join_code)
  where status <> 'ended';

-- Codes for roles that are not the general one. Whoever runs the exercise hands
-- these out privately: they are what makes a participant a CISO and not an
-- observer.
create table session_role_access (
  session_id  text not null references sessions (id) on delete cascade,
  role_id     text not null,
  access_code text not null,
  primary key (session_id, role_id)
);

create unique index session_role_access_code_idx on session_role_access (session_id, access_code);

create table participants (
  id            text primary key,
  session_id    text not null references sessions (id) on delete cascade,
  display_name  text not null,
  role_id       text not null,
  -- Lives on the device. Losing signal or locking the phone must not cost a
  -- participant their seat or their vote.
  rejoin_token  text not null unique,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create index participants_session_idx on participants (session_id);

create table votes (
  session_id     text not null references sessions (id) on delete cascade,
  decision_id    text not null,
  participant_id text not null references participants (id) on delete cascade,
  option_id      text not null,
  created_at     timestamptz not null default now(),
  -- One live vote per person per decision. Changing your mind updates this row.
  primary key (session_id, decision_id, participant_id)
);

-- The source of truth for a run. Never updated, never deleted: state is derived
-- by folding these through the engine, which is what makes reconnection, crash
-- recovery and the after-action report the same mechanism.
create table session_events (
  session_id text not null references sessions (id) on delete cascade,
  seq        integer not null,
  at         timestamptz not null default now(),
  kind       text not null,
  actor      jsonb not null,
  payload    jsonb not null default '{}'::jsonb,
  primary key (session_id, seq)
);
