'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Rnd } from 'react-rnd';
import { stackRef, stackDragged } from '@/lib/windowStack';
import { SHEET_ELEV_H, phoneLayout } from '@/lib/mobileSheet';
import { Share2, Ellipsis, Flag, Trash2, Star, Users, GripHorizontal, X, Check, SendHorizontal, Clock, MessageCircle, Pencil, CornerDownRight } from 'lucide-react';
import PeaceHand from '@/components/icons/PeaceHand';
import { shareUrl } from '@/lib/share';
import { allowInteraction, requireAccount } from '@/lib/signupWall';
import UserAvatar from '@/components/UserAvatar';
import { formatCommentTime, useCommentReports, useRouteComments, COMMENT_REPORT_REASONS, type RouteComment } from '@/lib/routeComments';
import { lockIframes, unlockIframes } from '@/lib/dragGuard';
import { useRouteInteractions, REPORT_REASONS, formatRating, type ReportReason } from '@/lib/routeInteractions';
import { t, useT } from '@/lib/i18n';
import ConfirmDialog from '@/components/ConfirmDialog';

interface Props {
  routeId: string;
  routeName: string;
  activeWindow?: string | null;
  setActiveWindow?: (w: 'community') => void;
  defaultY: number;
  currentSeconds: number;
  commentCount: number;
  onAddComment: (seconds: number, text: string, parentId?: string) => void;
  comments: RouteComment[];
  activeCommentIds: string[]; // comments the vehicle is currently passing – highlighted
  onSeekToSeconds: (seconds: number) => void;
  syncHref?: string | null; // own ride with GPS timestamps → "Video ausrichten" in the ⋯ menu
}

// Floating "Community" window on the map: like, share, rate (1–5 stars), report (behind ⋯).
export default function CommunityWidget({ routeId, routeName, activeWindow, setActiveWindow, defaultY, currentSeconds, commentCount, onAddComment, comments, activeCommentIds, onSeekToSeconds, syncHref }: Props) {
  useT();
  const { statsOf, toggleLike, rate, report } = useRouteInteractions();
  const stats = statsOf(routeId);
  const [isMobile, setIsMobile] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportComment, setReportComment] = useState<RouteComment | null>(null);
  const { reportComment: sendCommentReport, reportedByMe } = useCommentReports();
  const { deleteComment, editComment, isOwn } = useRouteComments();
  // inline reply / edit (one at a time)
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; replies: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [hoverStars, setHoverStars] = useState(0);
  const [mobileStars, setMobileStars] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');

  // Keep the comment being passed in view inside the list (scroll the list only, not the page)
  const listRef = useRef<HTMLOListElement>(null);
  const activeKey = activeCommentIds.join(',');
  useEffect(() => {
    if (!activeCommentIds.length) return;
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-comment-id="${activeCommentIds[activeCommentIds.length - 1]}"]`);
    if (list && row) list.scrollTo({ top: row.offsetTop - list.clientHeight / 2 + row.clientHeight / 2, behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  // The comment list fills the space down to the bottom of the screen (window is draggable → re-measure).
  const formRef = useRef<HTMLFormElement>(null);
  const [listMax, setListMax] = useState(240);
  const fitList = () => {
    const list = listRef.current;
    if (!list) return;
    const top = list.getBoundingClientRect().top;
    const below = (formRef.current?.offsetHeight ?? 60) + 16 /* card padding */ + 16 /* gap to screen edge */;
    setListMax(Math.max(140, Math.floor(window.innerHeight - top - below)));
  };
  useEffect(() => {
    if (isMobile) return;
    const t = setTimeout(fitList, 50);
    window.addEventListener('resize', fitList);
    return () => { clearTimeout(t); window.removeEventListener('resize', fitList); };
  }, [isMobile, comments.length]);

  useEffect(() => {
    const onResize = () => { const l = phoneLayout(); setIsMobile(l.phone); setLandscape(l.landscape); };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(t => (t === msg ? null : t)), 2200);
  };

  async function share() {
    const url = shareUrl({ ride: routeId });
    if (navigator.share && isMobile) {
      try { await navigator.share({ title: `${routeName} – RouteCam`, url }); } catch {}
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    showToast(t('Link kopiert'));
  }

  const shownStars = hoverStars || stats.myRating || 0;
  const stars = (size: number) => (
    <div className="flex items-center" onMouseLeave={() => setHoverStars(0)}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onMouseEnter={() => setHoverStars(n)}
          onClick={() => { if (stats.myRating === n || allowInteraction()) rate(routeId, n); setMobileStars(false); }}
          title={n === 1 ? t('1 Stern') : t('{n} Sterne', { n })}
          className="p-0.5 transition-transform hover:scale-110"
        >
          <Star size={size} className={n <= shownStars ? 'text-[#CCFF00]' : 'text-white/25'} fill={n <= shownStars ? 'currentColor' : 'none'} />
        </button>
      ))}
    </div>
  );

  const likeBtn = (compact: boolean) => (
    <button
      type="button"
      onClick={() => { if (stats.liked || allowInteraction()) toggleLike(routeId, currentSeconds > 0 ? currentSeconds : undefined); }}
      title={stats.liked ? t('Gefällt mir nicht mehr') : t('Gefällt mir')}
      className={`inline-flex items-center gap-1.5 rounded-full transition-colors ${compact ? 'h-8 px-2.5' : 'h-9 px-3.5'} ${
        stats.liked ? 'bg-[#CCFF00]/15 text-[#CCFF00]' : 'bg-white/10 text-white hover:bg-white/20'
      }`}
    >
      <PeaceHand size={compact ? 16 : 17} />
      <span className="text-sm font-medium tabular-nums">{stats.likeCount}</span>
    </button>
  );

  const moreMenu = (
    <div ref={menuRef} className="relative">
      <button type="button" onClick={() => setMenuOpen(o => !o)} title={t('Mehr')} className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white">
        <Ellipsis size={18} />
      </button>
      {menuOpen && (
        <div className="absolute right-0 top-full mt-2 z-20 w-48 rounded-lg border border-white/10 bg-[#212121] shadow-2xl py-1.5">
          {syncHref && (
            <a href={syncHref} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white hover:bg-white/10">
              <Clock size={16} /> {t('Video ausrichten')}
            </a>
          )}
          <button
            type="button"
            onClick={() => { setMenuOpen(false); setReportOpen(true); }}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white hover:bg-white/10"
          >
            <Flag size={16} /> {t('Melden')}
          </button>
        </div>
      )}
    </div>
  );

  const toastEl = toast && (
    <div className="absolute left-1/2 -translate-x-1/2 -top-10 whitespace-nowrap rounded-lg bg-[#282828] px-3 py-1.5 text-xs text-white shadow-xl inline-flex items-center gap-1.5">
      <Check size={14} className="text-[#CCFF00]" /> {toast}
    </div>
  );

  const dialog = (reportOpen && (
    <ReportDialog
      eyebrow={t('Route melden')}
      title={routeName}
      question={t('Was stimmt mit dieser Route nicht?')}
      reasons={REPORT_REASONS}
      onCancel={() => setReportOpen(false)}
      onSubmit={(reason, note) => { report(routeId, reason as ReportReason, note); setReportOpen(false); showToast(t('Danke – deine Meldung ist eingegangen')); }}
    />
  )) || (reportComment && (
    <ReportDialog
      eyebrow={t('Kommentar melden')}
      title={`${reportComment.author} · ${formatCommentTime(reportComment.seconds)}`}
      quote={reportComment.text}
      question={t('Was stimmt mit diesem Kommentar nicht?')}
      reasons={COMMENT_REPORT_REASONS}
      onCancel={() => setReportComment(null)}
      onSubmit={(reason, note) => {
        sendCommentReport(reportComment, reason as (typeof COMMENT_REPORT_REASONS)[number]['value'], note);
        setReportComment(null);
        showToast(t('Danke – der Kommentar wurde gemeldet'));
      }}
    />
  ));

  // Kommentarliste + Eingabe: am Desktop im Fenster, auf dem Smartphone im Kommentar-Panel
  const commentsSection = (
    <>
      {confirmDelete && (
        <ConfirmDialog
          title={t('Kommentar löschen?')}
          text={confirmDelete.replies === 0 ? undefined : confirmDelete.replies === 1 ? t('Die Antwort darauf wird mitgelöscht.') : t('Die {n} Antworten darauf werden mitgelöscht.', { n: confirmDelete.replies })}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => { deleteComment(confirmDelete.id); setConfirmDelete(null); showToast(t('Kommentar gelöscht')); }}
        />
      )}
          {/* Comments */}
          <div className="mt-3 pt-3 border-t border-white/10">
            <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-white/50">
              <MessageCircle size={12} /> {t('Kommentare')} <span className="font-mono text-white/35">· {commentCount}</span>
            </div>
            <ol ref={listRef} className="no-scrollbar relative overflow-y-auto flex flex-col gap-1" style={{ maxHeight: isMobile ? undefined : listMax }}>
              {comments.length === 0 && <li className="text-xs text-white/40 py-4 text-center">{t('Noch keine Kommentare auf dieser Route.')}</li>}
              {comments.filter(c => !c.parentId).map(top => {
                const thread = [top, ...comments.filter(c => c.parentId === top.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))];
                return (
                  <li key={top.id} data-comment-id={top.id} className="flex flex-col gap-0.5">
                    {thread.map(c => {
                      const reply = !!c.parentId;
                      const active = !reply && activeCommentIds.includes(c.id);
                      const passed = !active && c.seconds < currentSeconds;
                      const flagged = reportedByMe(c.id);
                      const own = isOwn(c);
                      if (editing === c.id) {
                        return (
                          <form
                            key={c.id}
                            className={`rounded-lg border border-[#CCFF00]/40 bg-white/[0.03] p-2 ${reply ? 'ml-8' : ''}`}
                            onSubmit={e => { e.preventDefault(); if (editDraft.trim()) { editComment(c.id, editDraft); setEditing(null); showToast(t('Kommentar geändert')); } }}
                          >
                            <textarea
                              autoFocus
                              value={editDraft}
                              onChange={e => setEditDraft(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); } if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
                              maxLength={280}
                              rows={2}
                              className="w-full resize-none rounded-md bg-[#121212] border border-white/15 focus:border-[#CCFF00]/60 outline-none px-2.5 py-1.5 text-xs text-white"
                            />
                            <div className="mt-1.5 flex justify-end gap-1.5">
                              <button type="button" onClick={() => setEditing(null)} className="h-7 px-2.5 rounded-full text-[11px] hover:bg-white/10">{t('Abbrechen')}</button>
                              <button type="submit" disabled={!editDraft.trim()} className="h-7 px-3 rounded-full text-[11px] font-semibold bg-[#CCFF00] text-black disabled:bg-white/10 disabled:text-white/30">{t('Speichern')}</button>
                            </div>
                          </form>
                        );
                      }
                      return (
                        <div key={c.id} className={`group/c relative ${reply ? 'ml-8' : ''}`}>
                          <button
                            type="button"
                            onClick={() => onSeekToSeconds(c.seconds)}
                            title={t('Zu dieser Stelle springen')}
                            className={`w-full text-left flex gap-2.5 rounded-lg p-2 border transition-all duration-300 ${
                              active ? 'border-[#CCFF00]/60 bg-[#CCFF00]/10 shadow-[0_0_16px_rgba(204,255,0,0.15)]' : 'border-transparent hover:bg-white/5'
                            } ${passed ? 'opacity-50' : ''}`}
                          >
                            <UserAvatar name={c.author} picture={c.picture} seed={c.authorId} size={reply ? 20 : 24} />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-baseline gap-2 text-[11px]">
                                <span className="font-semibold text-white">{c.author}</span>
                                {!reply && <span className="font-mono text-[#CCFF00]">{formatCommentTime(c.seconds)}</span>}
                                {c.editedAt && <span className="text-white/35">bearbeitet</span>}
                              </span>
                              <span className="block text-xs text-white/80 leading-snug mt-0.5 break-words pr-12">{c.text}</span>
                              {flagged && <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-amber-300/80"><Flag size={10} /> {t('Von dir gemeldet')}</span>}
                            </span>
                          </button>
                          {/* actions: answer (everyone), edit + delete (own), report (others) */}
                          <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5">
                            {(
                              <button
                                type="button"
                                onClick={() => { setReplyTo(top.id); setReplyDraft(''); setEditing(null); }}
                                title={t('Antworten')}
                                aria-label={`${c.author} antworten`}
                                className="w-6 h-6 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 opacity-0 group-hover/c:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity"
                              >
                                <CornerDownRight size={12} />
                              </button>
                            )}
                            {own && (
                              <button
                                type="button"
                                onClick={() => { setEditing(c.id); setEditDraft(c.text); setReplyTo(null); }}
                                title={t('Bearbeiten')}
                                aria-label={t('Eigenen Kommentar bearbeiten')}
                                className="w-6 h-6 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 opacity-0 group-hover/c:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity"
                              >
                                <Pencil size={11} />
                              </button>
                            )}
                            {own ? (
                              <button
                                type="button"
                                onClick={() => setConfirmDelete({ id: c.id, replies: reply ? 0 : thread.length - 1 })}
                                title={!reply && thread.length > 1 ? t('Löschen – die Antworten gehen mit') : t('Eigenen Kommentar löschen')}
                                aria-label={t('Eigenen Kommentar löschen')}
                                className="w-6 h-6 rounded-full flex items-center justify-center text-white/40 hover:text-red-300 hover:bg-white/10 opacity-0 group-hover/c:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity"
                              >
                                <Trash2 size={12} />
                              </button>
                            ) : !flagged && (
                              <button
                                type="button"
                                onClick={() => setReportComment(c)}
                                title={t('Kommentar melden')}
                                aria-label={t('Kommentar von {name} melden', { name: c.author })}
                                className="w-6 h-6 rounded-full flex items-center justify-center text-white/40 hover:text-amber-300 hover:bg-white/10 opacity-0 group-hover/c:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity"
                              >
                                <Flag size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {replyTo === top.id && (
                      <form
                        className="ml-8 flex items-center gap-1.5 py-1"
                        onSubmit={e => {
                          e.preventDefault();
                          if (!replyDraft.trim()) return;
                          if (!requireAccount('comment')) return; // the typed reply stays
                          onAddComment(top.seconds, replyDraft, top.id);
                          setReplyDraft(''); setReplyTo(null);
                          showToast(t('Antwort gesendet'));
                        }}
                      >
                        <input
                          autoFocus
                          value={replyDraft}
                          onChange={e => setReplyDraft(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setReplyTo(null); } }}
                          maxLength={280}
                          placeholder={t('Antwort an {name} …', { name: top.author })}
                          className="flex-1 min-w-0 h-8 rounded-full bg-[#121212] border border-white/15 focus:border-[#CCFF00]/60 outline-none px-3 text-xs text-white placeholder:text-white/35"
                        />
                        <button type="submit" disabled={!replyDraft.trim()} title={t('Antwort senden')} className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center bg-[#CCFF00] text-black disabled:bg-white/10 disabled:text-white/30">
                          <SendHorizontal size={14} />
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Comment at the current video position – appears as an avatar on the route */}
          <form
            ref={formRef}
            className="mt-3 pt-3 border-t border-white/10"
            onSubmit={e => {
              e.preventDefault();
              if (!draft.trim()) return;
              if (!requireAccount('comment')) return; // the typed text stays in the field
              onAddComment(currentSeconds, draft);
              setDraft('');
              showToast(t('Kommentar bei {time} gesetzt', { time: formatCommentTime(currentSeconds) }));
            }}
          >
            <div className="flex items-center gap-2">
              <input
                value={draft}
                onChange={e => setDraft(e.target.value)}
                maxLength={280}
                placeholder={t('Kommentar bei {time} …', { time: formatCommentTime(currentSeconds) })}
                className="flex-1 min-w-0 h-9 rounded-full bg-[#121212] border border-white/15 focus:border-[#CCFF00]/60 outline-none px-3.5 text-sm text-white placeholder:text-white/35"
              />
              <button type="submit" disabled={!draft.trim()} title={t('Kommentar senden')} className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center bg-[#CCFF00] text-black disabled:bg-white/10 disabled:text-white/30">
                <SendHorizontal size={16} />
              </button>
            </div>
          </form>
    </>
  );
  const [mobileComments, setMobileCommentsRaw] = useState(false);
  const [commentsClosing, setCommentsClosing] = useState(false);
  // Schließen mit Animation nach unten
  const setMobileComments = (open: boolean) => {
    if (open) { setCommentsClosing(false); setMobileCommentsRaw(true); return; }
    setCommentsClosing(true);
    window.setTimeout(() => { setMobileCommentsRaw(false); setCommentsClosing(false); }, 270);
  };

  // ── Mobile: compact pill on the top edge of the elevation pane ──
  if (isMobile) {
    return (
      <>
        {/* oben rechts im Höhenprofil des Fahrt-Fensters */}
        <div className={`${landscape ? 'rc-sheet-left left-3' : 'rc-sheet-up right-2'} fixed z-[82] flex items-center gap-1.5 pointer-events-auto`}
          style={{ bottom: landscape ? 'calc(12px + env(safe-area-inset-bottom))' : `calc(${SHEET_ELEV_H} - 40px)` }}>
          {toastEl}
          <button type="button" onClick={() => setMobileComments(true)} aria-label={t('Kommentare')} className="inline-flex items-center gap-1 h-8 px-2.5 rounded-full bg-white/10 text-white">
            <MessageCircle size={15} />
            <span className="text-sm tabular-nums">{commentCount}</span>
          </button>
          {likeBtn(true)}
          <div className="relative">
            <button type="button" onClick={() => setMobileStars(s => !s)} className="inline-flex items-center gap-1 h-8 px-2.5 rounded-full bg-white/10 text-white">
              <Star size={15} className={stats.myRating ? 'text-[#CCFF00]' : ''} fill={stats.myRating ? 'currentColor' : 'none'} />
              <span className="text-sm tabular-nums">{formatRating(stats.avgRating)}</span>
            </button>
            {mobileStars && <div className="absolute right-0 top-full mt-2 rounded-full bg-[#212121] border border-white/10 px-2 py-1 shadow-2xl">{stars(22)}</div>}
          </div>
          <button type="button" onClick={share} title={t('Teilen')} className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 text-white"><Share2 size={15} /></button>
          {moreMenu}
        </div>
        {mobileComments && (
          <div className="fixed inset-0 z-[95]" role="dialog" aria-modal="true" aria-label={t('Kommentare')}>
            <div className="absolute inset-0" onClick={() => setMobileComments(false)} />
            <div className={`${commentsClosing ? 'rc-sheet-down' : 'rc-sheet-up'} absolute inset-x-0 bottom-0 flex flex-col rounded-t-[20px] border-t border-white/10 bg-[#0b0d10] px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]`} style={{ height: '72dvh' }}>
              <div className="flex items-center justify-between pb-2">
                <div className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.05em] text-white/70">
                  <MessageCircle size={14} /> {t('Kommentare')} <span className="font-mono text-white/40">· {commentCount}</span>
                </div>
                <button type="button" onClick={() => setMobileComments(false)} aria-label={t('Schließen')} className="w-10 h-10 -mr-2 rounded-full flex items-center justify-center text-white/70">
                  <X size={22} />
                </button>
              </div>
              <div className="rc-mobile-comments flex-1 min-h-0 flex flex-col [&>div:first-child]:mt-0 [&>div:first-child]:pt-0 [&>div:first-child]:border-t-0 [&>div:first-child]:flex-1 [&>div:first-child]:min-h-0 [&>div:first-child]:flex [&>div:first-child]:flex-col [&>div:first-child>div]:hidden [&_ol]:flex-1 [&_ol]:min-h-0">
                {commentsSection}
              </div>
            </div>
          </div>
        )}
        {dialog}
      </>
    );
  }

  // ── Desktop: draggable window like Elevation / Heading ──
  return (
    <>
      <Rnd
        ref={stackRef(3)}
        default={{ x: typeof window !== 'undefined' ? window.innerWidth - 344 : 0, y: defaultY, width: 320, height: 'auto' }}
        bounds="parent"
        enableResizing={false}
        dragHandleClassName="community-drag"
        style={{ zIndex: activeWindow === 'community' ? 60 : 50 }}
        onDragStart={() => { lockIframes(); setActiveWindow?.('community'); }}
        onDragStop={(_, d) => { unlockIframes(); stackDragged(3, d); setTimeout(fitList, 0); }}
        onMouseDown={() => setActiveWindow?.('community')}
      >
        <div className="relative w-full rounded-xl border border-white/[0.08] p-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl" style={{ background: 'linear-gradient(180deg, rgba(17,17,17,0.6) 0%, rgba(17,17,17,0.4) 100%)' }}>
          {toastEl}
          <div className="community-drag flex items-center justify-between mb-4 cursor-grab active:cursor-grabbing select-none">
            <div className="flex items-center gap-2">
              <Users size={14} className="text-[#CCFF00]" />
              <h3 className="text-[11px] font-bold tracking-[0.05em] uppercase text-white">Community</h3>
            </div>
            <GripHorizontal size={14} className="text-gray-400" />
          </div>

          <div className="flex items-center gap-2">
            {likeBtn(false)}
            <button type="button" onClick={share} title={t('Teilen')} aria-label={t('Teilen')} className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white transition-colors">
              <Share2 size={16} />
            </button>
            <div className="ml-auto">{moreMenu}</div>
          </div>

          {/* Rating – always visible */}
          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between gap-2">
              {stars(20)}
              <div className="text-right leading-tight">
                <div className="text-sm font-semibold font-mono text-white">Ø {formatRating(stats.avgRating)}</div>
                <div className="text-[10px] text-white/40">
                  {stats.ratingCount === 0 ? t('noch keine Bewertung') : stats.ratingCount === 1 ? t('1 Bewertung') : t('{n} Bewertungen', { n: stats.ratingCount })}
                </div>
              </div>
          </div>

          {commentsSection}
        </div>
      </Rnd>
      {dialog}
    </>
  );
}

function ReportDialog({ eyebrow, title, quote, question, reasons, onCancel, onSubmit }: {
  eyebrow: string;
  title: string;
  quote?: string;
  question: string;
  reasons: readonly { value: string; label: string }[];
  onCancel: () => void;
  onSubmit: (reason: string, note: string) => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <form
        role="dialog"
        aria-modal="true"
        onSubmit={e => { e.preventDefault(); if (reason) onSubmit(reason, note); }}
        className="relative w-full max-w-md rounded-2xl bg-[#1f1f1f] border border-white/10 shadow-2xl text-white"
      >
        <div className="flex items-center justify-between gap-4 px-6 h-16 border-b border-white/10">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-widest text-white/40">{eyebrow}</div>
            <h2 className="text-lg font-semibold truncate">{title}</h2>
          </div>
          <button type="button" onClick={onCancel} aria-label={t('Schließen')} className="w-10 h-10 -mr-2 rounded-full flex items-center justify-center hover:bg-white/10"><X size={22} /></button>
        </div>
        <div className="px-6 py-4 flex flex-col gap-1">
          {quote && <blockquote className="mb-3 rounded-lg bg-white/5 border-l-2 border-white/20 px-3 py-2 text-sm text-white/70 break-words">{quote}</blockquote>}
          <p className="text-sm text-white/60 mb-2">{question}</p>
          {reasons.map(r => (
            <label key={r.value} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer border transition-colors ${reason === r.value ? 'border-white/15 bg-white/[0.05]' : 'border-transparent hover:bg-white/5'}`}>
              <input type="radio" name="report-reason" checked={reason === r.value} onChange={() => setReason(r.value)} className="accent-[#CCFF00]" />
              <span className="text-sm">{t(r.label)}</span>
            </label>
          ))}
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={t('Details (optional)')}
            className="mt-3 w-full rounded-lg bg-[#121212] border border-white/15 focus:border-[#CCFF00]/60 outline-none px-3 py-2 text-sm text-white placeholder:text-white/30 resize-none"
          />
          <p className="mt-2 text-[11px] text-white/35">{t('Wir prüfen jede Meldung und entfernen Inhalte, die gegen unsere Regeln oder geltendes Recht verstoßen.')}</p>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-white/10">
          <button type="button" onClick={onCancel} className="h-10 px-4 rounded-full text-sm font-medium hover:bg-white/10">{t('Abbrechen')}</button>
          <button type="submit" disabled={!reason} className="h-10 px-5 rounded-full text-sm font-semibold bg-white text-black disabled:bg-white/10 disabled:text-white/30 disabled:cursor-not-allowed">{t('Melden')}</button>
        </div>
      </form>
    </div>
  );
}
