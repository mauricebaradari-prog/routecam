-- RouteCam – launch list (routecam.app/admin → tab "Launchliste")
--
-- The founder's own to-do list for the launch. Only the founder account can read or change it;
-- for everyone else the table looks empty and every write is refused.

create table if not exists public.launch_todos (
  id          text primary key,                       -- section short name + number, e.g. 'feat-27'
  section     text not null,                          -- infra | login | pflicht | cleanup | test | features | spaeter
  ord         numeric not null default 0,             -- order inside the section (steps of 10)
  text        text not null check (length(text) between 1 and 2000),
  done        boolean not null default false,
  done_at     timestamptz,
  priority    text check (priority in ('high', 'medium', 'low')),
  read        boolean not null default false,         -- "gelesen" eye
  later       boolean not null default false,         -- "für später gemerkt" bookmark
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists launch_todos_section_idx on public.launch_todos (section, ord);

create or replace function public.launch_todos_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists launch_todos_touch on public.launch_todos;
create trigger launch_todos_touch before update on public.launch_todos
  for each row execute function public.launch_todos_touch();

alter table public.launch_todos enable row level security;

drop policy if exists "founder reads launch list" on public.launch_todos;
create policy "founder reads launch list" on public.launch_todos
  for select to authenticated using ((select public.is_founder()));

drop policy if exists "founder writes launch list" on public.launch_todos;
create policy "founder writes launch list" on public.launch_todos
  for all to authenticated using ((select public.is_founder())) with check ((select public.is_founder()));

revoke all on public.launch_todos from anon;
grant select, insert, update, delete on public.launch_todos to authenticated;
