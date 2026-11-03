-- RouteCam – first database schema (Supabase / Postgres)
--
-- Run once in the Supabase SQL editor (project "routecam", Frankfurt).
-- New tables are NOT exposed automatically (project setting), so every table gets explicit
-- grants below, and RLS is on for all of them.
--
-- Ids: rides keep their text ids ("route-1" = built-in rides from src/data/routes.ts,
-- "user-…" = rides created in the app), so links that are already shared keep working.
-- Likes, ratings, comments etc. point at the ride id without a foreign key, because the
-- built-in rides live in the code and only get a database row when the founder changes them.

-- ── Profiles (one per account = one channel) ────────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  name        text not null default '',
  picture     text,
  slug        text unique check (slug ~ '^[a-z0-9-]{3,30}$'), -- short channel address, e.g. "maurice"
  is_founder  boolean not null default false,                -- owns the built-in rides
  created_at  timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name, picture)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1), ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_founder() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_founder from public.profiles where id = auth.uid()), false)
$$;

-- the founder's account (built-in rides belong to it); null until he has signed in once
create or replace function public.founder_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.profiles where is_founder order by created_at limit 1
$$;

-- ── Rides ───────────────────────────────────────────────────────────────────
create table public.routes (
  id           text primary key check (id ~ '^(user|route)-[A-Za-z0-9-]{1,60}$'),
  owner_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  visibility   text not null default 'public' check (visibility in ('public', 'unlisted', 'private')),
  config       jsonb not null,           -- the RouteConfig (track points, video id, timeline …)
  place_names  jsonb,                    -- own title / start / end name
  hidden       boolean not null default false, -- built-in ride removed by the founder
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index routes_owner_idx on public.routes (owner_id);

-- ── Likes, ratings, reports on rides ────────────────────────────────────────
create table public.likes (
  route_id    text not null,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (route_id, user_id)
);

create table public.ratings (
  route_id    text not null,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  stars       smallint not null check (stars between 1 and 5),
  updated_at  timestamptz not null default now(),
  primary key (route_id, user_id)
);

create table public.route_reports (
  id           uuid primary key default gen_random_uuid(),
  route_id     text not null,
  reporter_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  reason       text not null check (reason in ('inappropriate','privacy','copyright','dangerous','wrong-data','spam','other')),
  note         text check (char_length(note) <= 2000),
  status       text not null default 'open' check (status in ('open', 'resolved')),
  created_at   timestamptz not null default now()
);

-- ── Timed comments ──────────────────────────────────────────────────────────
create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  route_id    text not null,
  author_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  parent_id   uuid references public.comments(id) on delete cascade, -- reply (one level)
  seconds     integer not null check (seconds >= 0),
  text        text not null check (char_length(text) between 1 and 2000),
  created_at  timestamptz not null default now(),
  edited_at   timestamptz
);
create index comments_route_idx on public.comments (route_id);

create table public.comment_reports (
  id           uuid primary key default gen_random_uuid(),
  comment_id   uuid references public.comments(id) on delete set null,
  route_id     text not null,
  reporter_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  reason       text not null check (reason in ('insulting','spam','dangerous','privacy','other')),
  note         text check (char_length(note) <= 2000),
  snapshot     jsonb not null,  -- copy of the comment (author, text, seconds, createdAt)
  status       text not null default 'open' check (status in ('open', 'resolved')),
  created_at   timestamptz not null default now()
);

-- ── Groups of rides ─────────────────────────────────────────────────────────
create table public.route_groups (
  id          text primary key default ('g-' || replace(gen_random_uuid()::text, '-', '')),
  owner_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  route_ids   text[] not null default '{}',
  visibility  text not null default 'public' check (visibility in ('public', 'unlisted', 'private')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── Notifications for ride owners ───────────────────────────────────────────
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade, -- recipient
  actor_id    uuid references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('comment', 'like', 'rating')),
  route_id    text not null,
  seconds     integer,
  text        text,
  stars       smallint,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create or replace function public.route_owner(rid text) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select owner_id from public.routes where id = rid),
    case when rid like 'route-%' then public.founder_id() end
  )
$$;

create or replace function public.notify_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  owner uuid := public.route_owner(new.route_id);
  actor uuid;
begin
  -- (separate statements: a record field that the table doesn't have must never be touched)
  if tg_table_name = 'comments' then actor := new.author_id; else actor := new.user_id; end if;
  if owner is null or owner = actor then return new; end if;
  if tg_table_name = 'comments' then
    insert into public.notifications (user_id, actor_id, kind, route_id, seconds, text)
    values (owner, actor, 'comment', new.route_id, new.seconds, left(new.text, 280));
  elsif tg_table_name = 'likes' then
    insert into public.notifications (user_id, actor_id, kind, route_id)
    values (owner, actor, 'like', new.route_id);
  else
    -- one notification per person and ride: a changed rating replaces the old one
    delete from public.notifications where user_id = owner and actor_id = actor and kind = 'rating' and route_id = new.route_id;
    insert into public.notifications (user_id, actor_id, kind, route_id, stars)
    values (owner, actor, 'rating', new.route_id, new.stars);
  end if;
  return new;
end $$;

create trigger notify_comment after insert on public.comments for each row execute function public.notify_owner();
create trigger notify_like    after insert on public.likes    for each row execute function public.notify_owner();
create trigger notify_rating  after insert or update of stars on public.ratings for each row execute function public.notify_owner();

-- keep updated_at fresh
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger routes_touch  before update on public.routes       for each row execute function public.touch_updated_at();
create trigger groups_touch  before update on public.route_groups for each row execute function public.touch_updated_at();
create trigger ratings_touch before update on public.ratings      for each row execute function public.touch_updated_at();

-- ── Row Level Security ──────────────────────────────────────────────────────
alter table public.profiles        enable row level security;
alter table public.routes          enable row level security;
alter table public.likes           enable row level security;
alter table public.ratings         enable row level security;
alter table public.route_reports   enable row level security;
alter table public.comments        enable row level security;
alter table public.comment_reports enable row level security;
alter table public.route_groups    enable row level security;
alter table public.notifications   enable row level security;

-- profiles: public (channel pages); everyone edits only their own name/picture (not slug/founder)
create policy "profiles readable" on public.profiles for select using (true);
create policy "own profile editable" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- rides: public + unlisted readable by everyone (unlisted are simply not listed by the app),
-- private only by the owner. Built-in ids ("route-…") may only be written by the founder.
create policy "rides readable" on public.routes for select
  using (visibility <> 'private' or owner_id = auth.uid());
create policy "own rides insertable" on public.routes for insert to authenticated
  with check (owner_id = auth.uid() and (id like 'user-%' or public.is_founder()));
create policy "own rides editable" on public.routes for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own rides deletable" on public.routes for delete to authenticated
  using (owner_id = auth.uid());

-- likes & ratings: counts are public; each account manages its own
create policy "likes readable" on public.likes for select using (true);
create policy "own likes" on public.likes for insert to authenticated with check (user_id = auth.uid());
create policy "own likes removable" on public.likes for delete to authenticated using (user_id = auth.uid());

create policy "ratings readable" on public.ratings for select using (true);
create policy "own ratings" on public.ratings for insert to authenticated with check (user_id = auth.uid());
create policy "own ratings editable" on public.ratings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own ratings removable" on public.ratings for delete to authenticated using (user_id = auth.uid());

-- reports: anyone signed in can report; reporters see only their own reports (moderation via dashboard)
create policy "report rides" on public.route_reports for insert to authenticated with check (reporter_id = auth.uid());
create policy "own ride reports" on public.route_reports for select to authenticated using (reporter_id = auth.uid());

create policy "report comments" on public.comment_reports for insert to authenticated with check (reporter_id = auth.uid());
create policy "own comment reports" on public.comment_reports for select to authenticated using (reporter_id = auth.uid());
create policy "own comment reports removable" on public.comment_reports for delete to authenticated using (reporter_id = auth.uid());

-- comments: public; written, edited and deleted by their author
create policy "comments readable" on public.comments for select using (true);
create policy "write comments" on public.comments for insert to authenticated with check (author_id = auth.uid());
create policy "own comments editable" on public.comments for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "own comments deletable" on public.comments for delete to authenticated using (author_id = auth.uid());

-- groups: like rides
create policy "groups readable" on public.route_groups for select
  using (visibility <> 'private' or owner_id = auth.uid());
create policy "own groups insertable" on public.route_groups for insert to authenticated with check (owner_id = auth.uid());
create policy "own groups editable" on public.route_groups for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own groups deletable" on public.route_groups for delete to authenticated using (owner_id = auth.uid());

-- notifications: only the recipient; created by the trigger above
create policy "own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "own notifications editable" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own notifications deletable" on public.notifications for delete to authenticated using (user_id = auth.uid());

-- ── Grants (tables are not exposed automatically in this project) ───────────
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.routes, public.likes, public.ratings, public.comments, public.route_groups to anon, authenticated;
grant update (name, picture) on public.profiles to authenticated;
grant insert, update, delete on public.routes, public.ratings, public.comments, public.route_groups to authenticated;
grant insert, delete on public.likes to authenticated;
grant select, insert on public.route_reports to authenticated;
grant select, insert, delete on public.comment_reports to authenticated;
grant select, update, delete on public.notifications to authenticated;
grant execute on function public.is_founder(), public.founder_id(), public.route_owner(text) to anon, authenticated;
