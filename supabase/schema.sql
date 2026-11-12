-- Clinch database: saved scenarios (private, per user). Share links need no database; they carry the picks in the URL.
-- Run once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Picks are stored by nflverse game_id (e.g. "2026_12_GB_LA"), so they survive schedule changes.

create table if not exists public.scenarios (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  season      int  not null,
  name        text not null check (char_length(name) between 1 and 80),
  team        text check (char_length(team) <= 4),
  picks       jsonb not null default '{}'::jsonb,   -- future games: { game_id: 1 home win | -1 away win | 0 tie }
  flips       jsonb not null default '{}'::jsonb,   -- do-overs on played games, same shape
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint scenarios_size check (pg_column_size(picks) + pg_column_size(flips) < 20000)
);
create index if not exists scenarios_user_idx on public.scenarios (user_id, season, updated_at desc);

alter table public.scenarios enable row level security;

drop policy if exists "own scenarios: read" on public.scenarios;
drop policy if exists "own scenarios: insert" on public.scenarios;
drop policy if exists "own scenarios: update" on public.scenarios;
drop policy if exists "own scenarios: delete" on public.scenarios;
create policy "own scenarios: read"   on public.scenarios for select using (auth.uid() = user_id);
create policy "own scenarios: insert" on public.scenarios for insert with check (auth.uid() = user_id);
create policy "own scenarios: update" on public.scenarios for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own scenarios: delete" on public.scenarios for delete using (auth.uid() = user_id);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists scenarios_touch on public.scenarios;
create trigger scenarios_touch before update on public.scenarios for each row execute function public.touch_updated_at();

-- Table privileges for the API roles. Row-level security above still decides which rows each user can touch.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.scenarios to authenticated;
