import { useCallback, useEffect, useState } from 'react';

// Notifications for the owner of a ride: someone commented, liked or rated it.
//
// INTERIM: no backend yet, so the list stays empty until real activity exists.
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
  dummy?: boolean;        // old example data – removed on load
}

const STORAGE_KEY = 'routecam.notifications';
const SEEDED_KEY = 'routecam.notifications.seeded';
const CHANGE_EVENT = 'routecam:notifications';

function load(): AppNotification[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const list: AppNotification[] = Array.isArray(raw) ? raw : [];
    // remove the example notifications earlier versions seeded into this browser
    if (list.some(n => n.dummy) || localStorage.getItem(SEEDED_KEY)) {
      const real = list.filter(n => !n.dummy);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(real));
      localStorage.removeItem(SEEDED_KEY);
      return real;
    }
    return list;
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
