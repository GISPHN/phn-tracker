create table if not exists public.location_logs (
  id uuid primary key,
  session_id text not null,
  user_id text,
  display_name text,
  team_id text,
  latitude double precision not null,
  longitude double precision not null,
  accuracy double precision,
  speed double precision,
  heading double precision,
  status text,
  source text,
  created_at timestamptz not null default now()
);

create table if not exists public.memos (
  id uuid primary key,
  session_id text not null,
  user_id text,
  display_name text,
  team_id text,
  latitude double precision not null,
  longitude double precision not null,
  accuracy double precision,
  status text,
  memo_text text not null,
  created_at timestamptz not null default now()
);

alter table public.location_logs enable row level security;
alter table public.memos enable row level security;

drop policy if exists "prototype read location logs" on public.location_logs;
drop policy if exists "prototype insert location logs" on public.location_logs;
drop policy if exists "prototype update location logs" on public.location_logs;
drop policy if exists "prototype read memos" on public.memos;
drop policy if exists "prototype insert memos" on public.memos;
drop policy if exists "prototype update memos" on public.memos;

create policy "prototype read location logs" on public.location_logs for select using (true);
create policy "prototype insert location logs" on public.location_logs for insert with check (true);
create policy "prototype update location logs" on public.location_logs for update using (true);
create policy "prototype read memos" on public.memos for select using (true);
create policy "prototype insert memos" on public.memos for insert with check (true);
create policy "prototype update memos" on public.memos for update using (true);
