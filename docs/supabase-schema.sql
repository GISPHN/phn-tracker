create table if not exists public.sessions (
  id text primary key,
  name text not null,
  target_area text not null default '奈良県',
  started_at timestamptz default now(),
  ended_at timestamptz
);

create table if not exists public.teams (
  id text primary key,
  name text not null,
  color text not null,
  organization_type text not null default 'public_health_nurse'
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  municipality text not null,
  surname text not null,
  role_type text not null default 'public_health_nurse',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.location_logs (
  id uuid primary key default gen_random_uuid(),
  session_id text references public.sessions(id),
  participant_id uuid references public.participants(id),
  team_id text references public.teams(id),
  latitude double precision not null,
  longitude double precision not null,
  accuracy double precision,
  speed double precision,
  heading double precision,
  status text,
  source text,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.memos (
  id uuid primary key default gen_random_uuid(),
  session_id text references public.sessions(id),
  participant_id uuid references public.participants(id),
  team_id text references public.teams(id),
  latitude double precision not null,
  longitude double precision not null,
  memo_text text not null,
  status text,
  created_at timestamptz not null default now()
);
