import { useCallback, useMemo } from 'react';
import { db, setDb, useDb, type NotificationRow, type Profile } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { t, locale } from '@/lib/i18n';

// Notifications for the owner of a ride: someone commented, liked or rated it.
//
// Written by a database trigger (notify_owner) into `notifications` for the ride owner on
// every like / rating / comment by someone else. Loaded with the rest of the data (lib/db.ts).

export type NotificationKind = 'comment' | 'like' | 'rating';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  routeId: string;
  actor: string;          // display name
  color: string;          // avatar colour
  createdAt: string;      // ISO
  read: boolean;
  seconds?: number;       // comment: position in the video
  text?: string;          // comment text
  stars?: number;         // rating 1–5
}

function toNotification(n: NotificationRow, profiles: Record<string, Profile>): AppNotification {
  return {
    id: n.id, kind: n.kind, routeId: n.route_id, actor: (n.actor_id && profiles[n.actor_id]?.name) || t('Jemand'),
    color: '#CCFF00', createdAt: n.created_at, read: n.read,
    ...(n.seconds != null ? { seconds: n.seconds } : {}), ...(n.text ? { text: n.text } : {}), ...(n.stars ? { stars: n.stars } : {}),
  };
}

async function patchNotifications(ids: string[] | null, patch: { read: boolean } | 'delete') {
  const s = db();
  const hit = (id: string) => !ids || ids.includes(id);
  const before = s.notifications;
  setDb({ notifications: patch === 'delete' ? before.filter(n => !hit(n.id)) : before.map(n => (hit(n.id) ? { ...n, ...patch } : n)) });
  let q = patch === 'delete' ? supabase().from('notifications').delete() : supabase().from('notifications').update(patch);
  q = ids ? q.in('id', ids) : q.eq('user_id', s.me?.id ?? '');
  const { error } = await q;
  if (error) { setDb({ notifications: before }); console.error('[notifications]', error.message); }
}

export function useNotifications() {
  const { notifications, profiles } = useDb();
  const items = useMemo(() => notifications.map(n => toNotification(n, profiles)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [notifications, profiles]);
  const markRead = useCallback((id: string) => { patchNotifications([id], { read: true }); }, []);
  const markAllRead = useCallback((ids?: string[]) => { patchNotifications(ids ?? null, { read: true }); }, []);
  const remove = useCallback((id: string) => { patchNotifications([id], 'delete'); }, []);
  return { items, markRead, markAllRead, remove };
}

// "vor 5 Min." / "vor 3 Std." / "vor 2 Tagen" / Datum – in der Oberflächensprache
export function timeAgo(iso: string): string {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return t('gerade eben');
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto', style: 'short' });
  if (s < 3600) return rtf.format(-Math.floor(s / 60), 'minute');
  if (s < 86400) return rtf.format(-Math.floor(s / 3600), 'hour');
  const d = Math.floor(s / 86400);
  if (d < 7) return rtf.format(-d, 'day');
  if (d < 30) return rtf.format(-Math.floor(d / 7), 'week');
  return new Date(iso).toLocaleDateString(locale());
}
