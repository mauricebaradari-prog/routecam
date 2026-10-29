import { useCallback, useEffect, useMemo, useState } from 'react';

// Timed comments (SoundCloud-style): each comment sits at a point in the video,
// and therefore at a point on the route.
//
// INTERIM STORAGE: comments live in localStorage until Supabase exists (see 07_TODO.md).

export interface RouteComment {
  id: string;
  routeId: string;
  seconds: number; // position in the video
  author: string;
  color: string;   // avatar colour (no profile pictures yet)
  text: string;
  createdAt: string;
  authorId?: string; // account that wrote it (missing on comments from before accounts)
}

const STORAGE_KEY = 'routecam.comments';
const CHANGE_EVENT = 'routecam:comments';

function loadOwn(): RouteComment[] {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join('');
}

export function formatCommentTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// All comments, optionally for one route, sorted by video position.
export function useRouteComments(routeId?: string) {
  const [own, setOwn] = useState<RouteComment[]>([]);

  useEffect(() => {
    const sync = () => setOwn(loadOwn());
    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const all = own;
  const comments = useMemo(
    () => (routeId ? all.filter(c => c.routeId === routeId) : all).sort((a, b) => a.seconds - b.seconds),
    [all, routeId],
  );

  const countOf = useCallback((id: string) => all.filter(c => c.routeId === id).length, [all]);

  const addComment = useCallback((rId: string, seconds: number, text: string, author = 'Du') => {
    const comment: RouteComment = {
      id: `c-${Date.now().toString(36)}`,
      routeId: rId,
      seconds: Math.max(0, Math.round(seconds)),
      author,
      color: '#CCFF00',
      text: text.trim(),
      createdAt: new Date().toISOString(),
      authorId: currentUserId(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...loadOwn(), comment]));
    } catch {}
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  // Delete an own comment. Reports this browser made on it go too (reporting your own comment
  // means nothing); reports by others stay for moderation once a database exists.
  const deleteComment = useCallback((id: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(loadOwn().filter(c => c.id !== id)));
      const me = currentUserId();
      localStorage.setItem(REPORTS_KEY, JSON.stringify(loadReports().filter(r => !(r.commentId === id && r.reporterId === me))));
    } catch {}
    window.dispatchEvent(new Event(CHANGE_EVENT));
    window.dispatchEvent(new Event(REPORTS_EVENT));
  }, []);

  // own = written by the signed-in account, or (no accounts yet) written in this browser
  const isOwn = useCallback((c: RouteComment) => !c.authorId || c.authorId === currentUserId(), []);

  return { comments, countOf, addComment, deleteComment, isOwn };
}

// ── Reporting comments ───────────────────────────────────────────────────────
// Anyone can flag a comment; reports are kept for the admin/moderation view (DSA: notice &
// action). Each report carries a copy of the comment, so it can still be judged after the
// comment was edited or deleted.
// INTERIM: stored in this browser. With Supabase: table `comment_reports` (reporter = auth user,
// insert-only for users, readable only by admins via RLS).

export const COMMENT_REPORT_REASONS = [
  { value: 'insulting', label: 'Beleidigend, hetzerisch oder bedrohlich' },
  { value: 'spam',      label: 'Spam oder Werbung' },
  { value: 'dangerous', label: 'Ruft zu gefährlichem oder illegalem Fahren auf' },
  { value: 'privacy',   label: 'Verrät private Daten, z. B. eine Adresse' },
  { value: 'other',     label: 'Sonstiges' },
] as const;

export type CommentReportReason = (typeof COMMENT_REPORT_REASONS)[number]['value'];

export interface CommentReport {
  id: string;
  commentId: string;
  routeId: string;
  reason: CommentReportReason;
  note?: string;
  reporterId?: string;    // account id of whoever reported (if signed in)
  createdAt: string;
  status: 'open' | 'resolved';
  comment: { author: string; text: string; seconds: number; createdAt: string };
}

const REPORTS_KEY = 'routecam.commentReports';
const REPORTS_EVENT = 'routecam:commentReports';

function loadReports(): CommentReport[] {
  try {
    const list = JSON.parse(localStorage.getItem(REPORTS_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function currentUserId(): string | undefined {
  try { return JSON.parse(localStorage.getItem('routecam.user') || 'null')?.id || undefined; } catch { return undefined; }
}

export function useCommentReports() {
  const [reports, setReports] = useState<CommentReport[]>([]);
  useEffect(() => {
    const sync = () => setReports(loadReports());
    sync();
    window.addEventListener(REPORTS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(REPORTS_EVENT, sync); window.removeEventListener('storage', sync); };
  }, []);

  const reportComment = useCallback((c: RouteComment, reason: CommentReportReason, note?: string) => {
    const report: CommentReport = {
      id: `cr-${Date.now().toString(36)}`,
      commentId: c.id,
      routeId: c.routeId,
      reason,
      note: note?.trim() || undefined,
      reporterId: currentUserId(),
      createdAt: new Date().toISOString(),
      status: 'open',
      comment: { author: c.author, text: c.text, seconds: c.seconds, createdAt: c.createdAt },
    };
    try { localStorage.setItem(REPORTS_KEY, JSON.stringify([...loadReports(), report])); } catch {}
    window.dispatchEvent(new Event(REPORTS_EVENT));
  }, []);

  // this browser already reported the comment → show it as reported, don't offer it again
  const reportedByMe = useCallback((commentId: string) => reports.some(r => r.commentId === commentId), [reports]);

  return { reports, reportComment, reportedByMe };
}
