-- RouteCam – admin dashboard (routecam.app/admin)
--
-- Everything the dashboard reads or changes goes through these functions. They run with
-- the database owner's rights (security definer) and refuse anyone who is not the founder
-- account, so the admin data never reaches other visitors – no matter what the page does.

create or replace function public.assert_founder() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_founder() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

-- ── Key figures + daily curve ───────────────────────────────────────────────
create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
begin
  perform public.assert_founder();
  with periods(name, since) as (
    values ('today', date_trunc('day', now())), ('d7', now() - interval '7 days'), ('d30', now() - interval '30 days'), ('all', '-infinity'::timestamptz)
  ),
  counts as (
    select p.name,
      (select count(*) from public.profiles x where x.created_at >= p.since) as users,
      (select count(*) from public.routes x where x.created_at >= p.since and x.id like 'user-%') as rides,
      (select count(*) from public.comments x where x.created_at >= p.since) as comments,
      (select count(*) from public.likes x where x.created_at >= p.since) as likes,
      (select count(*) from public.ratings x where x.updated_at >= p.since) as ratings,
      (select count(*) from public.route_reports x where x.created_at >= p.since)
        + (select count(*) from public.comment_reports x where x.created_at >= p.since) as reports
    from periods p
  ),
  days as (
    select d::date as day from generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') d
  )
  select jsonb_build_object(
    'counts', (select jsonb_object_agg(name, to_jsonb(c) - 'name') from counts c),
    'openReports', (select count(*) from public.route_reports where status = 'open')
                 + (select count(*) from public.comment_reports where status = 'open'),
    'daily', (select jsonb_agg(jsonb_build_object(
        'day', day,
        'users', (select count(*) from public.profiles x where x.created_at::date = day),
        'rides', (select count(*) from public.routes x where x.created_at::date = day and x.id like 'user-%'),
        'comments', (select count(*) from public.comments x where x.created_at::date = day)
      ) order by day) from days)
  ) into result;
  return result;
end $$;

-- ── Reports on rides and comments ───────────────────────────────────────────
create or replace function public.admin_reports() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_founder();
  return coalesce((
    select jsonb_agg(r order by (r->>'status') = 'open' desc, r->>'createdAt' desc)
    from (
      select jsonb_build_object(
        'kind', 'route', 'id', rr.id, 'routeId', rr.route_id, 'reason', rr.reason, 'note', rr.note,
        'status', rr.status, 'createdAt', rr.created_at,
        'reporter', rp.name,
        'routeTitle', coalesce(ro.place_names->>'title', ro.config->>'name'),
        'routeVisibility', ro.visibility,
        'owner', op.name
      ) as r
      from public.route_reports rr
      left join public.profiles rp on rp.id = rr.reporter_id
      left join public.routes ro on ro.id = rr.route_id
      left join public.profiles op on op.id = public.route_owner(rr.route_id)
      union all
      select jsonb_build_object(
        'kind', 'comment', 'id', cr.id, 'routeId', cr.route_id, 'reason', cr.reason, 'note', cr.note,
        'status', cr.status, 'createdAt', cr.created_at,
        'reporter', rp.name,
        'commentId', cr.comment_id,
        'commentExists', c.id is not null,
        'commentNow', c.text,
        'snapshot', cr.snapshot,
        'routeTitle', coalesce(ro.place_names->>'title', ro.config->>'name')
      )
      from public.comment_reports cr
      left join public.profiles rp on rp.id = cr.reporter_id
      left join public.comments c on c.id = cr.comment_id
      left join public.routes ro on ro.id = cr.route_id
    ) s
  ), '[]'::jsonb);
end $$;

-- ── What happened lately ────────────────────────────────────────────────────
create or replace function public.admin_activity(max_items int default 60) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_founder();
  return coalesce((
    select jsonb_agg(a order by a->>'at' desc) from (
      (select jsonb_build_object('type', 'user', 'at', p.created_at, 'who', p.name, 'userId', p.id) a
         from public.profiles p order by p.created_at desc limit max_items)
      union all
      (select jsonb_build_object('type', 'ride', 'at', r.created_at, 'who', p.name, 'userId', r.owner_id,
              'routeId', r.id, 'title', coalesce(r.place_names->>'title', r.config->>'name'), 'visibility', r.visibility)
         from public.routes r left join public.profiles p on p.id = r.owner_id
        where r.id like 'user-%' order by r.created_at desc limit max_items)
      union all
      (select jsonb_build_object('type', 'comment', 'at', c.created_at, 'who', p.name, 'userId', c.author_id,
              'routeId', c.route_id, 'text', left(c.text, 200), 'seconds', c.seconds, 'reply', c.parent_id is not null)
         from public.comments c left join public.profiles p on p.id = c.author_id order by c.created_at desc limit max_items)
    ) s
  ), '[]'::jsonb);
end $$;

-- ── Accounts ────────────────────────────────────────────────────────────────
create or replace function public.admin_users() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_founder();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'picture', p.picture, 'slug', p.slug, 'founder', p.is_founder,
      'email', u.email, 'createdAt', p.created_at, 'lastSignIn', u.last_sign_in_at,
      'rides', (select count(*) from public.routes r where r.owner_id = p.id and r.id like 'user-%'),
      'comments', (select count(*) from public.comments c where c.author_id = p.id),
      'likes', (select count(*) from public.likes l where l.user_id = p.id)
    ) order by p.created_at desc)
    from public.profiles p join auth.users u on u.id = p.id
  ), '[]'::jsonb);
end $$;

-- ── Rides in the database (incl. private and unlisted) ──────────────────────
create or replace function public.admin_routes() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_founder();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'title', coalesce(r.place_names->>'title', r.config->>'name'),
      'videoId', r.config->>'videoId', 'durationSeconds', (r.config->>'durationSeconds')::numeric,
      'visibility', r.visibility, 'hidden', r.hidden, 'createdAt', r.created_at,
      'ownerId', r.owner_id, 'owner', p.name,
      'likes', (select count(*) from public.likes l where l.route_id = r.id),
      'comments', (select count(*) from public.comments c where c.route_id = r.id),
      'rating', (select round(avg(stars)::numeric, 1) from public.ratings x where x.route_id = r.id),
      'reports', (select count(*) from public.route_reports x where x.route_id = r.id)
                + (select count(*) from public.comment_reports x where x.route_id = r.id)
    ) order by r.created_at desc)
    from public.routes r left join public.profiles p on p.id = r.owner_id
  ), '[]'::jsonb);
end $$;

-- ── Actions ─────────────────────────────────────────────────────────────────
create or replace function public.admin_set_report_status(report_kind text, report_id uuid, new_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_founder();
  if new_status not in ('open', 'resolved') then raise exception 'bad status'; end if;
  if report_kind = 'route' then
    update public.route_reports set status = new_status where id = report_id;
  elsif report_kind = 'comment' then
    update public.comment_reports set status = new_status where id = report_id;
  else
    raise exception 'bad kind';
  end if;
end $$;

-- remove a reported comment (its replies go with it); the report keeps its copy
create or replace function public.admin_delete_comment(comment uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_founder();
  delete from public.comments where id = comment;
end $$;

create or replace function public.admin_set_route_visibility(route text, new_visibility text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_founder();
  if new_visibility not in ('public', 'unlisted', 'private') then raise exception 'bad visibility'; end if;
  update public.routes set visibility = new_visibility where id = route;
  if not found then raise exception 'ride not in database'; end if;
end $$;

-- only signed-in accounts may even call them (and inside, only the founder gets through)
do $$
declare f text;
begin
  foreach f in array array[
    'assert_founder()', 'admin_overview()', 'admin_reports()', 'admin_activity(int)', 'admin_users()', 'admin_routes()',
    'admin_set_report_status(text, uuid, text)', 'admin_delete_comment(uuid)', 'admin_set_route_visibility(text, text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
