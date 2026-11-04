-- Wumpus World Classroom — schema, indexes and row-level security.
-- ALL data access goes through Next.js server routes using the service-role key.
-- RLS is enabled on every table with NO policies for anon/authenticated => the browser can never read rows
-- (in particular hidden_worlds). Supabase Realtime is used in *Broadcast* mode only (no row data on the wire).

create extension if not exists pgcrypto;

create table if not exists instructors (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists classroom_sessions (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references instructors(id) on delete cascade,
  code text not null unique,
  title text not null default 'Wumpus World',
  status text not null default 'lobby' check (status in ('lobby','active','paused','finished')),
  mode text not null default 'guided' check (mode in ('guided','challenge')),
  difficulty text not null default 'normal' check (difficulty in ('easy','normal','hard')),
  pits int not null default 2 check (pits between 1 and 5),
  duration_minutes int not null default 20,
  started_at timestamptz,
  ends_at timestamptz,
  paused_at timestamptz,
  settings jsonb not null default '{}'::jsonb,  -- logic_enabled, logic_view, projected_record, revealed answers...
  created_at timestamptz not null default now()
);
create index if not exists classroom_sessions_instructor_idx on classroom_sessions(instructor_id, created_at desc);

create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references classroom_sessions(id) on delete cascade,
  display_name text not null,
  token_hash text not null,
  last_seen timestamptz not null default now(),
  summary jsonb not null default '{}'::jsonb,   -- denormalised dashboard row (kept in sync server-side)
  created_at timestamptz not null default now()
);
create index if not exists participants_session_idx on participants(session_id);

create table if not exists game_instances (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references classroom_sessions(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  mode text not null,
  status text not null default 'playing',
  version int not null default 0,               -- optimistic concurrency / duplicate protection
  state jsonb not null,                         -- everything the student may legitimately know
  score int not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists game_instances_participant_idx on game_instances(participant_id, started_at desc);
create index if not exists game_instances_session_idx on game_instances(session_id);

-- Actual pits / Wumpus / gold. Never readable by anon or authenticated roles.
create table if not exists hidden_worlds (
  game_id uuid primary key references game_instances(id) on delete cascade,
  world jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists knowledge_states (
  game_id uuid primary key references game_instances(id) on delete cascade,
  seq int not null default 0,
  knowledge jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists game_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references game_instances(id) on delete cascade,
  session_id uuid not null references classroom_sessions(id) on delete cascade,
  seq int not null,
  kind text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (game_id, seq, kind)
);
create index if not exists game_events_game_idx on game_events(game_id, seq);

create table if not exists inference_attempts (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references game_instances(id) on delete cascade,
  session_id uuid not null references classroom_sessions(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  checkpoint_id text not null,
  kind text not null,
  category text not null,
  step int not null,
  correct boolean not null,
  cells_correct int not null default 0,
  cells_relevant int not null default 0,
  misconceptions text[] not null default '{}',
  answer jsonb,
  evaluation jsonb,
  created_at timestamptz not null default now(),
  unique (game_id, checkpoint_id)
);
create index if not exists inference_attempts_session_idx on inference_attempts(session_id, kind);

create table if not exists inference_records (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references game_instances(id) on delete cascade,
  session_id uuid not null references classroom_sessions(id) on delete cascade,
  record_id text not null,
  step int not null,
  kind text not null,
  record jsonb not null,
  created_at timestamptz not null default now(),
  unique (game_id, record_id)
);
create index if not exists inference_records_game_idx on inference_records(game_id, step);

create table if not exists assessment_results (
  game_id uuid primary key references game_instances(id) on delete cascade,
  session_id uuid not null references classroom_sessions(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  report jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists assessment_results_session_idx on assessment_results(session_id);

-- ---- Row level security: deny by default for browser roles ------------------------------------
alter table instructors enable row level security;
alter table classroom_sessions enable row level security;
alter table participants enable row level security;
alter table game_instances enable row level security;
alter table hidden_worlds enable row level security;
alter table knowledge_states enable row level security;
alter table game_events enable row level security;
alter table inference_attempts enable row level security;
alter table inference_records enable row level security;
alter table assessment_results enable row level security;

revoke all on all tables in schema public from anon, authenticated;
-- The service role bypasses RLS; no policy is created for anon/authenticated on purpose.
-- Optional (instructors using Supabase Auth directly): add policies such as
--   create policy "own sessions" on classroom_sessions for select to authenticated using (instructor_id = auth.uid());
-- but NEVER add any policy to hidden_worlds.
