import { useCallback } from 'react';
import { db, dbError, setDb, useDb } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { t, locale, k } from '@/lib/i18n';

// Likes, star ratings and reports per route.
//
// Stored in the tables likes, ratings and route_reports. Counts are from everyone; who
// reported a ride is never shown – owners only see reason and note (my_route_reports()).

export const REPORT_REASONS = [
  { value: 'inappropriate', label: k('Unangemessener oder anstößiger Inhalt') },
  { value: 'privacy',       label: k('Datenschutz – z. B. Wohnadresse erkennbar') },
  { value: 'copyright',     label: k('Urheberrechtsverletzung') },
  { value: 'dangerous',     label: k('Gefährliches oder illegales Fahrverhalten') },
  { value: 'wrong-data',    label: k('Route oder Video stimmen nicht überein') },
  { value: 'spam',          label: k('Spam oder Werbung') },
  { value: 'other',         label: k('Sonstiges') },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['value'];

export interface Report {
  reason: ReportReason;
  note?: string;
  createdAt: string;
}

export interface RouteStats {
  liked: boolean;
  likeCount: number;
  myRating: number | null;
  avgRating: number | null;
  ratingCount: number;
  reportCount: number;   // reports on this ride (owner: all, others: their own)
  reports: Report[];
  reportedByMe: boolean;
}

export function useRouteInteractions() {
  const { me, likes, ratings, myRouteReports, reportsOnMine } = useDb();

  const statsOf = useCallback((routeId: string): RouteStats => {
    const rs = ratings.filter(r => r.route_id === routeId);
    const mine = rs.find(r => r.user_id === me?.id);
    const onMine = reportsOnMine.filter(r => r.route_id === routeId);
    const byMe = myRouteReports.filter(r => r.route_id === routeId);
    const reports = (onMine.length ? onMine : byMe).map(r => ({ reason: r.reason as ReportReason, note: r.note ?? undefined, createdAt: r.created_at }));
    return {
      liked: !!me && likes.some(l => l.route_id === routeId && l.user_id === me.id),
      likeCount: likes.filter(l => l.route_id === routeId).length,
      myRating: mine?.stars ?? null,
      avgRating: rs.length ? rs.reduce((s, r) => s + r.stars, 0) / rs.length : null,
      ratingCount: rs.length,
      reportCount: reports.length,
      reports,
      reportedByMe: byMe.length > 0,
    };
  }, [me, likes, ratings, myRouteReports, reportsOnMine]);

  /** seconds: Stelle im Video, an der geliked wurde (erscheint als Peace-Symbol auf der Route) */
  const toggleLike = useCallback(async (routeId: string, seconds?: number) => {
    const s = db();
    if (!s.me) return;
    const uid = s.me.id;
    const before = s.likes;
    const liked = before.some(l => l.route_id === routeId && l.user_id === uid);
    const at = seconds !== undefined && isFinite(seconds) ? Math.round(seconds * 10) / 10 : null;
    setDb({ likes: liked ? before.filter(l => !(l.route_id === routeId && l.user_id === uid)) : [...before, { route_id: routeId, user_id: uid, seconds: at }] });
    const q = supabase().from('likes');
    let { error } = liked ? await q.delete().eq('route_id', routeId).eq('user_id', uid) : await q.insert({ route_id: routeId, seconds: at });
    // Spalte „seconds“ noch nicht in der Datenbank → ohne Stelle speichern
    if (error && !liked && /seconds/.test(error.message)) ({ error } = await supabase().from('likes').insert({ route_id: routeId }));
    if (error) { setDb({ likes: before }); alert(dbError(error).message); }
  }, []);

  // Clicking the current rating again removes it
  const rate = useCallback(async (routeId: string, stars: number) => {
    const s = db();
    if (!s.me) return;
    const uid = s.me.id;
    const before = s.ratings;
    const current = before.find(r => r.route_id === routeId && r.user_id === uid)?.stars;
    const value = Math.max(1, Math.min(5, Math.round(stars)));
    const rest = before.filter(r => !(r.route_id === routeId && r.user_id === uid));
    setDb({ ratings: current === value ? rest : [...rest, { route_id: routeId, user_id: uid, stars: value }] });
    const q = supabase().from('ratings');
    const { error } = current === value
      ? await q.delete().eq('route_id', routeId).eq('user_id', uid)
      : await q.upsert({ route_id: routeId, user_id: uid, stars: value });
    if (error) { setDb({ ratings: before }); alert(dbError(error).message); }
  }, []);

  const report = useCallback(async (routeId: string, reason: ReportReason, note?: string) => {
    const s = db();
    if (!s.me) return;
    const row = { route_id: routeId, reason, note: note?.trim() || null };
    setDb({ myRouteReports: [...s.myRouteReports, { ...row, created_at: new Date().toISOString() }] });
    const { error } = await supabase().from('route_reports').insert(row);
    if (error) { setDb({ myRouteReports: s.myRouteReports }); alert(dbError(error, t('Die Meldung konnte nicht gesendet werden.')).message); }
  }, []);

  return { statsOf, toggleLike, rate, report };
}

export function formatRating(avg: number | null) {
  return avg === null ? '–' : avg.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
