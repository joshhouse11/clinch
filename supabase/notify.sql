-- Clinch: Bracket Challenge emails. Run once in Supabase SQL Editor. Safe to re-run.

-- Who turned bracket emails off (no row = on).
create table if not exists public.email_prefs (
  user_id        uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  bracket_emails boolean not null default true,
  updated_at     timestamptz not null default now()
);
alter table public.email_prefs enable row level security;
drop policy if exists "prefs: read" on public.email_prefs;
drop policy if exists "prefs: insert" on public.email_prefs;
drop policy if exists "prefs: update" on public.email_prefs;
create policy "prefs: read"   on public.email_prefs for select using (auth.uid() = user_id);
create policy "prefs: insert" on public.email_prefs for insert with check (auth.uid() = user_id);
create policy "prefs: update" on public.email_prefs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update on public.email_prefs to authenticated;

-- What has been sent, so nobody gets the same email twice. Only the server (service key) touches this.
create table if not exists public.notify_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  sport   text not null,
  season  int  not null,
  event   text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, sport, season, event)
);
alter table public.notify_log enable row level security;
