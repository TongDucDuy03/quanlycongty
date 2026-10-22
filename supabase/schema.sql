-- Mechanic workshop demo: one private workspace snapshot per Auth account.
-- Run in the SQL Editor of your own Supabase project before enabling cloud sync.
-- This schema does NOT implement shared workspaces or employee roles.

create table if not exists public.workshop_snapshots (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

alter table public.workshop_snapshots enable row level security;
alter table public.workshop_snapshots force row level security;

-- Explicit grants matter in addition to RLS. Anonymous visitors get no access.
revoke all on table public.workshop_snapshots from anon, authenticated;
grant select, insert, update on table public.workshop_snapshots to authenticated;

drop policy if exists workshop_owner_select on public.workshop_snapshots;
create policy workshop_owner_select on public.workshop_snapshots
  for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists workshop_owner_insert on public.workshop_snapshots;
create policy workshop_owner_insert on public.workshop_snapshots
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists workshop_owner_update on public.workshop_snapshots;
create policy workshop_owner_update on public.workshop_snapshots
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- Clients must submit revision = the previously loaded revision + 1.
-- The UPDATE must ALSO filter by the previously loaded revision; the trigger
-- prevents accidental revision reuse, including from an incorrectly built client.
create or replace function public.guard_workshop_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.revision <> 1 then
      raise exception 'A new workspace must start at revision 1'
        using errcode = '23514';
    end if;
  else
    if new.owner_id <> old.owner_id then
      raise exception 'The workspace owner cannot be changed'
        using errcode = '23514';
    end if;
    if new.revision <> old.revision + 1 then
      raise exception 'Workspace revision conflict; reload before saving'
        using errcode = '23514';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.guard_workshop_snapshot() from public;
drop trigger if exists workshop_snapshot_guard on public.workshop_snapshots;
create trigger workshop_snapshot_guard
before insert or update on public.workshop_snapshots
for each row execute function public.guard_workshop_snapshot();

comment on table public.workshop_snapshots is
  'Private owner-only demo snapshots. No shared employee workspace or audit log.';
