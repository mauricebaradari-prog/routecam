-- Beliebig viele Likes pro Person und Fahrt (wie Reaktionen im Live-Stream): jeder Klick ist ein
-- eigener Like mit eigener Stelle im Video. Bisher war (route_id, user_id) der Schlüssel – also nur
-- ein Like pro Person.
alter table public.likes add column if not exists id uuid not null default gen_random_uuid();
alter table public.likes drop constraint if exists likes_pkey;
alter table public.likes add primary key (id);
create index if not exists likes_route_user_idx on public.likes (route_id, user_id);

-- Benachrichtigung an den Besitzer nur beim ersten Like einer Person – sonst flutet jeder Klick
-- die Glocke.
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
    if exists (select 1 from public.notifications where user_id = owner and actor_id = actor and kind = 'like' and route_id = new.route_id) then
      return new;
    end if;
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
