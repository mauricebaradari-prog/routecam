-- RouteCam – owner tools
-- 1. Deleting a ride removes everything that hangs off it (comments, likes, ratings,
--    notifications, its place in groups). Comment/ride reports stay for moderation.
-- 2. The founder's account is recognised when it signs in for the first time.
-- 3. Ride owners can see what their rides were reported for – without who reported them.

create or replace function public.cleanup_route() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.comments      where route_id = old.id;
  delete from public.likes         where route_id = old.id;
  delete from public.ratings       where route_id = old.id;
  delete from public.notifications where route_id = old.id;
  update public.route_groups set route_ids = array_remove(route_ids, old.id) where old.id = any(route_ids);
  return old;
end $$;

create trigger routes_cleanup after delete on public.routes
  for each row execute function public.cleanup_route();

-- founder: built-in rides belong to this account, its channel is reachable as "maurice"
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  founder boolean := lower(new.email) = 'maurice.baradari@gmail.com';
begin
  insert into public.profiles (id, name, picture, slug, is_founder)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1), ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
    case when founder then 'maurice' end,
    founder
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- reports on the caller's own rides (reason, note, date – never the reporter)
create or replace function public.my_route_reports()
returns table (route_id text, reason text, note text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.route_id, r.reason, r.note, r.created_at
  from public.route_reports r
  where auth.uid() is not null and public.route_owner(r.route_id) = auth.uid()
  order by r.created_at desc
$$;

revoke execute on function public.my_route_reports() from public, anon;
grant execute on function public.my_route_reports() to authenticated;
