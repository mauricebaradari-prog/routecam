import { useCallback, useMemo } from 'react';
import { db, dbError, setDb, useDb, type CommentRow, type Profile } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { t, k } from '@/lib/i18n';
import { avatarColors, initials as avatarInitials } from '@/lib/avatar';

// Timed comments (SoundCloud-style): each comment sits at a point in the video,
// and therefore at a point on the route.
//
// Stored in the table `comments` (readable by everyone, written/edited/deleted by the author).

export interface RouteComment {
  id: string;
  routeId: string;
  seconds: number; // position in the video
  author: string;
  color: string;   // avatar colour (when there is no profile picture)
  picture?: string;
  text: string;
  createdAt: string;
  authorId?: string; // account that wrote it
  parentId?: string; // a reply: the comment it answers (one level – replies to a reply join the same thread)
  editedAt?: string; // set when the author changed the text
}

function toComment(c: CommentRow, profiles: Record<string, Profile>): RouteComment {
  const p = profiles[c.author_id];
  return {
    id: c.id, routeId: c.route_id, seconds: c.seconds, author: p?.name || t('RouteCam-Nutzer'), color: avatarColors(c.author_id).bg,
    picture: p?.picture ?? undefined, text: c.text, createdAt: c.created_at, authorId: c.author_id,
    ...(c.parent_id ? { parentId: c.parent_id } : {}), ...(c.edited_at ? { editedAt: c.edited_at } : {}),
  };
}

export const initials = avatarInitials;

export function formatCommentTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// All comments, optionally for one route, sorted by video position.
export function useRouteComments(routeId?: string) {
  const { comments: rows, profiles, me } = useDb();
  const all = useMemo(() => rows.map(c => toComment(c, profiles)), [rows, profiles]);
  const comments = useMemo(
    () => (routeId ? all.filter(c => c.routeId === routeId) : all).sort((a, b) => a.seconds - b.seconds),
    [all, routeId],
  );

  const countOf = useCallback((id: string) => all.filter(c => c.routeId === id).length, [all]);

  // the author name argument is kept for callers – the name now comes from the profile
  const addComment = useCallback(async (rId: string, seconds: number, text: string, _author = 'Du', parentId?: string) => {
    void _author;
    const s = db();
    if (!s.me) return;
    // a reply sits at its thread's video position and always hangs off the top comment
    const parent = parentId ? s.comments.find(c => c.id === parentId) : undefined;
    const root = parent?.parent_id ? s.comments.find(c => c.id === parent.parent_id) ?? parent : parent;
    const row = {
      id: crypto.randomUUID(),
      route_id: rId,
      seconds: root ? root.seconds : Math.max(0, Math.round(seconds)),
      text: text.trim(),
      parent_id: root?.id ?? null,
    };
    if (!row.text) return;
    setDb({ comments: [...s.comments, { ...row, author_id: s.me.id, created_at: new Date().toISOString(), edited_at: null }] });
    const { error } = await supabase().from('comments').insert(row);
    if (error) { setDb({ comments: db().comments.filter(c => c.id !== row.id) }); alert(dbError(error, t('Der Kommentar konnte nicht gespeichert werden.')).message); }
  }, []);

  // Change the text of an own comment
  const editComment = useCallback(async (id: string, text: string) => {
    const t = text.trim();
    if (!t) return;
    const before = db().comments;
    const edited_at = new Date().toISOString();
    setDb({ comments: before.map(c => (c.id === id ? { ...c, text: t, edited_at } : c)) });
    const { error } = await supabase().from('comments').update({ text: t, edited_at }).eq('id', id);
    if (error) { setDb({ comments: before }); alert(dbError(error).message); }
  }, []);

  // Delete an own comment – its replies go with it (database: on delete cascade).
  // Reports by others stay for moderation (they carry a copy of the comment).
  const deleteComment = useCallback(async (id: string) => {
    const before = db().comments;
    setDb({ comments: before.filter(c => c.id !== id && c.parent_id !== id) });
    const { error } = await supabase().from('comments').delete().eq('id', id);
    if (error) { setDb({ comments: before }); alert(dbError(error, t('Löschen hat nicht geklappt.')).message); }
  }, []);

  // own = written by the signed-in account
  const isOwn = useCallback((c: RouteComment) => !!me && c.authorId === me.id, [me]);

  return { comments, countOf, addComment, editComment, deleteComment, isOwn };
}

// ── Reporting comments ───────────────────────────────────────────────────────
// Anyone can flag a comment; reports are kept for the admin/moderation view (DSA: notice &
// action). Each report carries a copy of the comment, so it can still be judged after the
// comment was edited or deleted.
// Stored in `comment_reports`: everyone signed in can report, nobody but the reporter (and
// the admin in the Supabase dashboard) can read a report.

export const COMMENT_REPORT_REASONS = [
  { value: 'insulting', label: k('Beleidigend, hetzerisch oder bedrohlich') },
  { value: 'spam',      label: k('Spam oder Werbung') },
  { value: 'dangerous', label: k('Ruft zu gefährlichem oder illegalem Fahren auf') },
  { value: 'privacy',   label: k('Verrät private Daten, z. B. eine Adresse') },
  { value: 'other',     label: k('Sonstiges') },
] as const;

export type CommentReportReason = (typeof COMMENT_REPORT_REASONS)[number]['value'];

export function useCommentReports() {
  const { myCommentReports } = useDb();

  const reportComment = useCallback(async (c: RouteComment, reason: CommentReportReason, note?: string) => {
    const s = db();
    if (!s.me) return;
    const row = {
      id: crypto.randomUUID(),
      comment_id: c.id,
      route_id: c.routeId,
      reason,
      note: note?.trim() || null,
      snapshot: { author: c.author, authorId: c.authorId, text: c.text, seconds: c.seconds, createdAt: c.createdAt },
    };
    setDb({ myCommentReports: [...s.myCommentReports, { id: row.id, comment_id: c.id }] });
    const { error } = await supabase().from('comment_reports').insert(row);
    if (error) { setDb({ myCommentReports: s.myCommentReports }); alert(dbError(error, t('Die Meldung konnte nicht gesendet werden.')).message); }
  }, []);

  // already reported by this account → show it as reported, don't offer it again
  const reportedByMe = useCallback((commentId: string) => myCommentReports.some(r => r.comment_id === commentId), [myCommentReports]);

  return { reportComment, reportedByMe };
}
