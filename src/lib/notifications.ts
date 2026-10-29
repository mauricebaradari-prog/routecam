import { useCallback, useEffect, useState } from 'react';
import { DUMMY_COMMENTS } from '@/data/dummyComments';
import { ROUTES } from '@/hooks/useEditorState';

// Notifications for the owner of a ride: someone commented, liked or rated it.
//
// INTERIM: there are no other users yet (no backend), so the list is seeded ONCE with
// example notifications from the same fictional people as the dummy comments.
// With Supabase: a database trigger writes a row into `notifications` for the ride owner
// on every like / rating / comment (not for own actions); the app subscribes via Realtime
// and calls pushNotification(). The hook API stays the same.

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
  dummy?: boolean;        // ⚠️ example data – delete together with the dummy comments
}

const STORAGE_KEY = 'routecam.notifications';
const SEEDED_KEY = 'routecam.notifications.seeded';
const CHANGE_EVENT = 'routecam:notifications';

const EXAMPLE_PEOPLE = [
  { name: 'Nikos K.', color: '#3B82F6' }, { name: 'Lena R.', color: '#EC4899' },
  { name: 'Tom B.', color: '#F59E0B' }, { name: 'Sofia M.', color: '#10B981' },
  { name: 'Jan W.', color: '#8B5CF6' }, { name: 'Andreas P.', color: '#EF4444' },
  { name: 'Mia S.', color: '#06B6D4' },
];

// ⚠️ DUMMY: comments from dummyComments.ts + some likes and ratings, spread over the last two weeks
function exampleNotifications(): AppNotification[] {
  const now = Date.now();
  const out: AppNotification[] = [];
  let k = 0;
  const ago = (hours: number) => new Date(now - hours * 3600_000).toISOString();
  DUMMY_COMMENTS.slice(0, 14).forEach((c, i) => {
    out.push({ id: `n-dummy-c${i}`, kind: 'comment', routeId: c.routeId, actor: c.author, color: c.color ?? '#888',
      createdAt: ago(1.5 + i * 9), read: i > 3, seconds: c.seconds, text: c.text, dummy: true });
  });
  const routes = ROUTES.slice(0, 8);
  routes.forEach((r, i) => {
    const p = EXAMPLE_PEOPLE[(i * 3) % EXAMPLE_PEOPLE.length];
    out.push({ id: `n-dummy-l${k++}`, kind: 'like', routeId: r.id, actor: p.name, color: p.color,
      createdAt: ago(0.4 + i * 13), read: i > 2, dummy: true });
    if (i % 2 === 0) {
      const q = EXAMPLE_PEOPLE[(i * 5 + 2) % EXAMPLE_PEOPLE.length];
      out.push({ id: `n-dummy-r${k++}`, kind: 'rating', routeId: r.id, actor: q.name, color: q.color,
        createdAt: ago(3 + i * 17), read: i > 1, stars: [5, 4, 5, 3][(i / 2) % 4], dummy: true });
    }
  });
  return out;
}

function load(): AppNotification[] {
  try {
    if (!localStorage.getItem(SEEDED_KEY)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(exampleNotifications()));
      localStorage.setItem(SEEDED_KEY, '1');
    }
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function save(list: AppNotification[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// Entry point for real notifications later (Supabase Realtime)
export function pushNotification(n: Omit<AppNotification, 'id' | 'read' | 'createdAt'> & { createdAt?: string }) {
  const item: AppNotification = { ...n, id: `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, read: false, createdAt: n.createdAt ?? new Date().toISOString() };
  save([item, ...load()]);
}

export function useNotifications() {
  const [items, setItems] = useState<AppNotification[]>([]);
  useEffect(() => {
    const sync = () => setItems(load().sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(CHANGE_EVENT, sync); window.removeEventListener('storage', sync); };
  }, []);
  const markRead = useCallback((id: string) => save(load().map(n => (n.id === id ? { ...n, read: true } : n))), []);
  const markAllRead = useCallback((ids?: string[]) => save(load().map(n => (!ids || ids.includes(n.id) ? { ...n, read: true } : n))), []);
  const remove = useCallback((id: string) => save(load().filter(n => n.id !== id)), []);
  return { items, markRead, markAllRead, remove };
}

// "vor 5 Min." / "vor 3 Std." / "vor 2 Tagen" / date
export function timeAgo(iso: string): string {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'gerade eben';
  if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.floor(s / 3600)} Std.`;
  const d = Math.floor(s / 86400);
  if (d < 7) return d === 1 ? 'gestern' : `vor ${d} Tagen`;
  if (d < 30) return `vor ${Math.floor(d / 7)} ${Math.floor(d / 7) === 1 ? 'Woche' : 'Wochen'}`;
  return new Date(iso).toLocaleDateString('de-DE');
}
