-- RouteCam – alert mail to the founder for every new report
--
-- After a ride or comment report is saved, the database sends {kind, id} to the Worker at
-- https://routecam.app/api/notify (workers/notify). The Worker asks claim_report_notification()
-- for the details: each report is handed out once, and only within 10 minutes – so nobody can
-- use the public address to trigger extra mails, and no secret is needed anywhere.

create extension if not exists pg_net with schema extensions;

alter table public.route_reports   add column if not exists notified_at timestamptz;
alter table public.comment_reports add column if not exists notified_at timestamptz;

create or replace function public.notify_report() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://routecam.app/api/notify',
    body := jsonb_build_object('kind', case tg_table_name when 'comment_reports' then 'comment' else 'route' end, 'id', new.id),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
exception when others then
  return new; -- a failed mail must never block the report itself
end $$;

create trigger notify_route_report   after insert on public.route_reports   for each row execute function public.notify_report();
create trigger notify_comment_report after insert on public.comment_reports for each row execute function public.notify_report();

create or replace function public.claim_report_notification(report_kind text, report_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  rr public.route_reports;
  cr public.comment_reports;
  route text;
  payload jsonb;
begin
  if report_kind = 'route' then
    update public.route_reports set notified_at = now()
     where id = report_id and notified_at is null and created_at > now() - interval '10 minutes'
     returning * into rr;
    if rr.id is null then return null; end if;
    route := rr.route_id;
    payload := jsonb_build_object('kind', 'route', 'reason', rr.reason, 'note', rr.note,
      'reporter', (select name from public.profiles where id = rr.reporter_id));
  elsif report_kind = 'comment' then
    update public.comment_reports set notified_at = now()
     where id = report_id and notified_at is null and created_at > now() - interval '10 minutes'
     returning * into cr;
    if cr.id is null then return null; end if;
    route := cr.route_id;
    payload := jsonb_build_object('kind', 'comment', 'reason', cr.reason, 'note', cr.note, 'snapshot', cr.snapshot,
      'reporter', (select name from public.profiles where id = cr.reporter_id));
  else
    return null;
  end if;
  return payload || jsonb_build_object(
    'routeId', route,
    'routeTitle', (select coalesce(place_names->>'title', config->>'name') from public.routes where id = route),
    'owner', (select name from public.profiles where id = public.route_owner(route)),
    'openCount', (select count(*) from public.route_reports where status = 'open')
               + (select count(*) from public.comment_reports where status = 'open')
  );
end $$;

revoke execute on function public.claim_report_notification(text, uuid) from public;
grant execute on function public.claim_report_notification(text, uuid) to anon, authenticated;
