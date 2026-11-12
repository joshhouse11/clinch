-- Clinch: group trash-talk chat. Run once in Supabase SQL Editor. Safe to re-run.

create table if not exists public.group_messages (
  id           bigint generated always as identity primary key,
  group_id     uuid not null references public.bgroups (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade default auth.uid(),
  display_name text not null default '' check (char_length(display_name) <= 40),
  body         text not null check (char_length(body) between 1 and 500),
  created_at   timestamptz not null default now()
);
create index if not exists group_messages_group_idx on public.group_messages (group_id, created_at desc);

alter table public.group_messages enable row level security;
drop policy if exists "chat: read" on public.group_messages;
drop policy if exists "chat: post" on public.group_messages;
drop policy if exists "chat: delete" on public.group_messages;
create policy "chat: read"   on public.group_messages for select using (public.is_group_member(group_id));
create policy "chat: post"   on public.group_messages for insert with check (user_id = auth.uid() and public.is_group_member(group_id));
create policy "chat: delete" on public.group_messages for delete using (user_id = auth.uid() or public.is_group_owner(group_id));
grant select, insert, delete on public.group_messages to authenticated;

-- The name shown is always your name in that group (no impersonating), and no more than one message every 2 seconds.
create or replace function public.chat_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select m.display_name into new.display_name from public.group_members m where m.group_id = new.group_id and m.user_id = new.user_id;
  if new.display_name is null then raise exception 'Join the group to chat'; end if;
  if exists (select 1 from public.group_messages where group_id = new.group_id and user_id = new.user_id and created_at > now() - interval '2 seconds') then
    raise exception 'Slow down a little';
  end if;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists group_messages_guard on public.group_messages;
create trigger group_messages_guard before insert on public.group_messages for each row execute function public.chat_before_insert();

-- Live updates
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_messages') then
    alter publication supabase_realtime add table public.group_messages;
  end if;
end $$;
