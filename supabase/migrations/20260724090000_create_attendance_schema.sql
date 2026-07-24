create extension if not exists pgcrypto;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default false
);

create unique index if not exists events_one_active_idx
  on public.events (is_active)
  where is_active = true;

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  phone text not null check (phone ~ '^010[0-9]{8}$'),
  is_flagged boolean not null default false,
  unique (event_id, phone)
);

create table if not exists public.attendances (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  phone text not null check (phone ~ '^010[0-9]{8}$'),
  is_flagged boolean not null default false,
  is_new_registration boolean not null default false,
  checked_at timestamptz not null default now(),
  checked_on date not null default (timezone('Asia/Seoul', now())::date),
  unique (event_id, phone, checked_on)
);

create or replace function public.set_active_event(target_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.events set is_active = false where is_active = true;
  update public.events set is_active = true where id = target_event_id;
  if not found then
    raise exception 'Event not found';
  end if;
end;
$$;

alter table public.events enable row level security;
alter table public.members enable row level security;
alter table public.attendances enable row level security;

create policy "Public events access" on public.events
  for all to anon using (true) with check (true);
create policy "Public members access" on public.members
  for all to anon using (true) with check (true);
create policy "Public attendances access" on public.attendances
  for all to anon using (true) with check (true);

grant select, insert, update, delete on public.events to anon;
grant select, insert, update, delete on public.members to anon;
grant select, insert, update, delete on public.attendances to anon;
grant execute on function public.set_active_event(uuid) to anon;

alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.members;
alter publication supabase_realtime add table public.attendances;

insert into public.events (name, is_active)
values ('기본 행사', true)
on conflict (name) do nothing;
