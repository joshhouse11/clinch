-- Clinch Playoff Bracket Challenge: brackets, groups, and a dues tracker (no money moves through Clinch).
-- Run once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run. Safe to re-run.

-- When brackets lock for each season (first wild card kickoff). Update when the NFL sets the time.
create table if not exists public.challenge_settings (
  season  int primary key,
  lock_at timestamptz
);
alter table public.challenge_settings enable row level security;
drop policy if exists "settings: read" on public.challenge_settings;
create policy "settings: read" on public.challenge_settings for select using (true);
insert into public.challenge_settings (season, lock_at) values (2026, '2027-01-16 21:30:00+00')
  on conflict (season) do nothing;

create or replace function public.challenge_locked(s int) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select now() >= lock_at from public.challenge_settings where season = s), false)
$$;

-- One bracket per user per season.
create table if not exists public.brackets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade default auth.uid(),
  season       int  not null,
  display_name text not null check (char_length(display_name) between 1 and 40),
  seeds        jsonb not null,                     -- [[AFC seeds 1-7], [NFC seeds 1-7]] as team indices
  picks        jsonb not null default '{}'::jsonb, -- { "WC:3-17": 17, ... } matchup -> winner index
  tiebreak     int check (tiebreak between 0 and 200), -- Super Bowl total points
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, season),
  constraint brackets_size check (pg_column_size(picks) + pg_column_size(seeds) < 6000)
);
alter table public.brackets enable row level security;
drop policy if exists "brackets: read" on public.brackets;
drop policy if exists "brackets: insert" on public.brackets;
drop policy if exists "brackets: update" on public.brackets;
drop policy if exists "brackets: delete" on public.brackets;
-- Your own bracket any time; everyone's once brackets lock (that is when leaderboards open).
create policy "brackets: read"   on public.brackets for select using (auth.uid() = user_id or public.challenge_locked(season));
create policy "brackets: insert" on public.brackets for insert with check (auth.uid() = user_id and not public.challenge_locked(season));
create policy "brackets: update" on public.brackets for update using (auth.uid() = user_id and not public.challenge_locked(season)) with check (auth.uid() = user_id and not public.challenge_locked(season));
create policy "brackets: delete" on public.brackets for delete using (auth.uid() = user_id and not public.challenge_locked(season));
drop trigger if exists brackets_touch on public.brackets;
create trigger brackets_touch before update on public.brackets for each row execute function public.touch_updated_at();

-- Groups ("leagues") with an invite code and an optional dues amount the commissioner tracks.
create table if not exists public.bgroups (
  id         uuid primary key default gen_random_uuid(),
  season     int  not null,
  name       text not null check (char_length(name) between 1 and 60),
  code       text not null unique default lower(substr(md5(gen_random_uuid()::text), 1, 8)),
  owner      uuid not null references auth.users (id) on delete cascade default auth.uid(),
  dues       int  not null default 0 check (dues between 0 and 10000),
  dues_note  text check (char_length(dues_note) <= 200),
  created_at timestamptz not null default now()
);
create table if not exists public.group_members (
  group_id     uuid not null references public.bgroups (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade default auth.uid(),
  display_name text not null check (char_length(display_name) between 1 and 40),
  paid         boolean not null default false,
  joined_at    timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on public.group_members (user_id);

create or replace function public.is_group_member(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = g and user_id = auth.uid())
$$;
create or replace function public.is_group_owner(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bgroups where id = g and owner = auth.uid())
$$;

alter table public.bgroups enable row level security;
drop policy if exists "groups: read" on public.bgroups;
drop policy if exists "groups: insert" on public.bgroups;
drop policy if exists "groups: update" on public.bgroups;
drop policy if exists "groups: delete" on public.bgroups;
create policy "groups: read"   on public.bgroups for select using (owner = auth.uid() or public.is_group_member(id));
create policy "groups: insert" on public.bgroups for insert with check (owner = auth.uid());
create policy "groups: update" on public.bgroups for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy "groups: delete" on public.bgroups for delete using (owner = auth.uid());

alter table public.group_members enable row level security;
drop policy if exists "members: read" on public.group_members;
drop policy if exists "members: update" on public.group_members;
drop policy if exists "members: delete" on public.group_members;
create policy "members: read"   on public.group_members for select using (public.is_group_member(group_id));
create policy "members: update" on public.group_members for update using (user_id = auth.uid() or public.is_group_owner(group_id));
create policy "members: delete" on public.group_members for delete using (user_id = auth.uid() or public.is_group_owner(group_id));
-- Joining only happens through join_group() below, so there is no insert policy.

-- Only the commissioner can mark dues paid; nobody can move a row to another group or user.
create or replace function public.guard_member_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.group_id <> old.group_id or new.user_id <> old.user_id then raise exception 'Not allowed'; end if;
  if new.paid is distinct from old.paid and not public.is_group_owner(new.group_id) then
    raise exception 'Only the commissioner can mark dues';
  end if;
  return new;
end $$;
drop trigger if exists group_members_guard on public.group_members;
create trigger group_members_guard before update on public.group_members for each row execute function public.guard_member_update();

-- The creator joins their own group automatically.
create or replace function public.group_owner_joins() returns trigger
language plpgsql security definer set search_path = public as $$
declare nm text;
begin
  select coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1), 'Commissioner') into nm from auth.users where id = new.owner;
  insert into public.group_members (group_id, user_id, display_name) values (new.id, new.owner, left(nm, 40))
    on conflict do nothing;
  return new;
end $$;
drop trigger if exists bgroups_owner_joins on public.bgroups;
create trigger bgroups_owner_joins after insert on public.bgroups for each row execute function public.group_owner_joins();

-- What someone sees on an invite link before joining.
create or replace function public.peek_group(c text)
returns table (id uuid, name text, season int, dues int, members bigint, commissioner text)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.season, g.dues,
         (select count(*) from public.group_members m where m.group_id = g.id),
         (select m.display_name from public.group_members m where m.group_id = g.id and m.user_id = g.owner)
  from public.bgroups g where g.code = lower(c)
$$;

create or replace function public.join_group(c text, nm text) returns uuid
language plpgsql security definer set search_path = public as $$
declare g uuid; n int;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select id into g from public.bgroups where code = lower(c);
  if g is null then raise exception 'That invite code does not exist'; end if;
  select count(*) into n from public.group_members where group_id = g;
  if n >= 500 then raise exception 'This group is full'; end if;
  insert into public.group_members (group_id, user_id, display_name)
    values (g, auth.uid(), left(coalesce(nullif(trim(nm), ''), 'Player'), 40))
    on conflict (group_id, user_id) do nothing;
  return g;
end $$;

-- Which members have a bracket in (shown before lock without revealing picks).
create or replace function public.group_bracket_status(g uuid)
returns table (user_id uuid)
language sql stable security definer set search_path = public as $$
  select b.user_id from public.brackets b
  join public.group_members m on m.user_id = b.user_id and m.group_id = g
  join public.bgroups gr on gr.id = g and gr.season = b.season
  where public.is_group_member(g)
$$;

grant usage on schema public to anon, authenticated;
grant select on public.challenge_settings to anon, authenticated;
grant select on public.brackets to anon;
grant select, insert, update, delete on public.brackets to authenticated;
grant select, insert, update, delete on public.bgroups to authenticated;
grant select, update, delete on public.group_members to authenticated;
grant execute on function public.peek_group(text) to anon, authenticated;
grant execute on function public.join_group(text, text) to authenticated;
grant execute on function public.group_bracket_status(uuid) to authenticated;
grant execute on function public.challenge_locked(int) to anon, authenticated;
