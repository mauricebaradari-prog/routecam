import { useCallback, useEffect, useState } from 'react';

// Likes, star ratings and reports per route.
//
// INTERIM STORAGE: until the Supabase backend exists (see 07_TODO.md) everything is kept in
// this browser's localStorage – so the counts only contain *this* browser's own actions.
// The hook's API (counts + actions) is what the UI uses; swapping the storage for database
// calls later doesn't change the components.

export const REPORT_REASONS = [
  { value: 'inappropriate', label: 'Unangemessener oder anstößiger Inhalt' },
  { value: 'privacy',       label: 'Datenschutz – z. B. Wohnadresse erkennbar' },
  { value: 'copyright',     label: 'Urheberrechtsverletzung' },
  { value: 'dangerous',     label: 'Gefährliches oder illegales Fahrverhalten' },
  { value: 'wrong-data',    label: 'Route oder Video stimmen nicht überein' },
  { value: 'spam',          label: 'Spam oder Werbung' },
  { value: 'other',         label: 'Sonstiges' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['value'];

export interface Report {
  reason: ReportReason;
  note?: string;
  createdAt: string;
}

interface StoredEntry {
  liked?: boolean;
  rating?: number; // 1–5, absent = not rated
  reports?: Report[];
}

export interface RouteStats {
  liked: boolean;
  likeCount: number;
  myRating: number | null;
  avgRating: number | null;
  ratingCount: number;
  reportCount: number;
  reports: Report[];
}

const STORAGE_KEY = 'routecam.interactions';
const CHANGE_EVENT = 'routecam:interactions';

type Store = Record<string, StoredEntry>;

function load(): Store {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return s && typeof s === 'object' ? s : {};
  } catch {
    return {};
  }
}

function update(routeId: string, fn: (e: StoredEntry) => StoredEntry) {
  const store = load();
  store[routeId] = fn(store[routeId] ?? {});
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {}
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function toStats(e: StoredEntry | undefined): RouteStats {
  const liked = !!e?.liked;
  const rating = e?.rating ?? null;
  const reports = e?.reports ?? [];
  return {
    liked,
    likeCount: liked ? 1 : 0,
    myRating: rating,
    avgRating: rating,
    ratingCount: rating ? 1 : 0,
    reportCount: reports.length,
    reports,
  };
}

export function useRouteInteractions() {
  const [store, setStore] = useState<Store>({});

  useEffect(() => {
    const sync = () => setStore(load());
    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const statsOf = useCallback((routeId: string) => toStats(store[routeId]), [store]);

  const toggleLike = useCallback((routeId: string) => {
    update(routeId, e => ({ ...e, liked: !e.liked }));
  }, []);

  // Clicking the current rating again removes it
  const rate = useCallback((routeId: string, stars: number) => {
    update(routeId, e => ({ ...e, rating: e.rating === stars ? undefined : Math.max(1, Math.min(5, Math.round(stars))) }));
  }, []);

  const report = useCallback((routeId: string, reason: ReportReason, note?: string) => {
    update(routeId, e => ({
      ...e,
      reports: [...(e.reports ?? []), { reason, note: note?.trim() || undefined, createdAt: new Date().toISOString() }],
    }));
  }, []);

  return { statsOf, toggleLike, rate, report };
}

export function formatRating(avg: number | null) {
  return avg === null ? '–' : avg.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
