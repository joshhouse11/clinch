-- Clinch: let the Bracket Challenge run for more than one sport (NFL + NBA).
-- Run once in Supabase after challenge.sql: Dashboard -> SQL Editor -> New query -> paste -> Run. Safe to re-run.
-- Existing NFL rows keep working: every new column defaults to 'nfl'.

-- 1) Lock times per sport + season
alter table public.challenge_settings add column if not exists sport text not null default 'nfl';
alter table public.challenge_settings drop constraint if exists challenge_settings_pkey;
alter table public.challenge_settings add primary key (sport, season);
insert into public.challenge_settings (sport, season, lock_at) values ('nba', 2027, '2027-04-13 23:00:00+00')
  on conflict (sport, season) do nothing;

create or replace function public.challenge_locked(sp text, s int) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select now() >= lock_at from public.challenge_settings where sport = sp and season = s), false)
$$;
-- old one-argument version stays for anything still calling it (NFL)
create or replace function public.challenge_locked(s int) returns boolean
language sql stable security definer set search_path = public as $$
  select public.challenge_locked('nfl', s)
$$;

-- 2) Brackets: one per user per sport per season
alter table public.brackets add column if not exists sport text not null default 'nfl';
alter table public.brackets drop constraint if exists brackets_user_id_season_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'brackets_user_sport_season_key') then
    alter table public.brackets add constraint brackets_user_sport_season_key unique (user_id, sport, season);
  end if;
end $$;
alter table public.brackets drop constraint if exists brackets_size;
alter table public.brackets add constraint brackets_size check (pg_column_size(picks) + pg_column_size(seeds) < 8000);

drop policy if exists "brackets: read" on public.brackets;
drop policy if exists "brackets: insert" on public.brackets;
drop policy if exists "brackets: update" on public.brackets;
drop policy if exists "brackets: delete" on public.brackets;
create policy "brackets: read"   on public.brackets for select using (auth.uid() = user_id or public.challenge_locked(sport, season));
create policy "brackets: insert" on public.brackets for insert with check (auth.uid() = user_id and not public.challenge_locked(sport, season));
create policy "brackets: update" on public.brackets for update using (auth.uid() = user_id and not public.challenge_locked(sport, season)) with check (auth.uid() = user_id and not public.challenge_locked(sport, season));
create policy "brackets: delete" on public.brackets for delete using (auth.uid() = user_id and not public.challenge_locked(sport, season));

-- 3) Groups belong to a sport
alter table public.bgroups add column if not exists sport text not null default 'nfl';

drop function if exists public.peek_group(text);
create function public.peek_group(c text)
returns table (id uuid, name text, season int, dues int, members bigint, commissioner text, sport text)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.season, g.dues,
         (select count(*) from public.group_members m where m.group_id = g.id),
         (select m.display_name from public.group_members m where m.group_id = g.id and m.user_id = g.owner),
         g.sport
  from public.bgroups g where g.code = lower(c)
$$;

create or replace function public.group_bracket_status(g uuid)
returns table (user_id uuid)
language sql stable security definer set search_path = public as $$
  select b.user_id from public.brackets b
  join public.group_members m on m.user_id = b.user_id and m.group_id = g
  join public.bgroups gr on gr.id = g and gr.season = b.season and gr.sport = b.sport
  where public.is_group_member(g)
$$;

grant execute on function public.peek_group(text) to anon, authenticated;
grant execute on function public.challenge_locked(text, int) to anon, authenticated;
