'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, Heart, MessageCircle, Star, Settings as SettingsIcon, CheckCheck, X } from 'lucide-react';
import { useNotifications, timeAgo, type AppNotification, type NotificationKind } from '@/lib/notifications';
import { useAllRoutes } from '@/lib/userRoutes';
import { useSettings } from '@/lib/settings';
import { initials, formatCommentTime } from '@/lib/routeComments';

const FILTERS: { value: 'all' | NotificationKind; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'comment', label: 'Kommentare' },
  { value: 'like', label: 'Likes' },
  { value: 'rating', label: 'Bewertungen' },
];

const KIND_ICON = {
  comment: { Icon: MessageCircle, cls: 'bg-sky-500 text-white' },
  like: { Icon: Heart, cls: 'bg-pink-500 text-white' },
  rating: { Icon: Star, cls: 'bg-[#CCFF00] text-black' },
} as const;

// Bell in the top bar: unread badge + YouTube-style panel with the latest activity on own rides
export default function NotificationBell() {
  const { items, markRead, markAllRead } = useNotifications();
  const { settings } = useSettings();
  const routes = useAllRoutes();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | NotificationKind>('all');
  const ref = useRef<HTMLDivElement>(null);

  // only kinds switched on in the settings
  const enabled = useMemo(() => items.filter(n => settings.notify[n.kind]), [items, settings.notify]);
  const shown = filter === 'all' ? enabled : enabled.filter(n => n.kind === filter);
  const unread = enabled.filter(n => !n.read).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('keydown', onKey); };
  }, [open]);

  function openItem(n: AppNotification) {
    markRead(n.id);
    setOpen(false);
    const seconds = n.kind === 'comment' ? n.seconds : undefined;
    // On the map page: handled in place, the camera flies from where it is (no reload).
    // Elsewhere nobody listens → open the map with ?route / ?t.
    const handled = !window.dispatchEvent(new CustomEvent('routecam:open-ride', { detail: { routeId: n.routeId, seconds }, cancelable: true }));
    if (!handled) window.location.assign(`/routecam/?route=${n.routeId}${seconds ? `&t=${seconds}` : ''}`);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={unread ? `Benachrichtigungen, ${unread} ungelesen` : 'Benachrichtigungen'}
        title="Benachrichtigungen"
        className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-colors ${open ? 'bg-white/15' : 'hover:bg-white/10'}`}
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute top-1 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#CCFF00] text-black text-[10px] font-bold leading-[18px] text-center border-2 border-[#0f0f0f]">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed md:absolute inset-x-2 md:inset-x-auto md:right-0 top-14 md:top-full md:mt-2 z-[95] md:w-[440px] rounded-xl border border-white/10 bg-[#212121] shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 h-14 border-b border-white/10">
            <h2 className="text-base font-semibold flex-1">Benachrichtigungen</h2>
            <button
              onClick={() => markAllRead(shown.map(n => n.id))}
              disabled={!shown.some(n => !n.read)}
              title="Alle als gelesen markieren"
              className="h-8 px-2.5 rounded-full text-xs text-white/70 hover:bg-white/10 disabled:opacity-30 flex items-center gap-1.5"
            ><CheckCheck size={15} /> Alle gelesen</button>
            <Link href="/settings#benachrichtigungen" onClick={() => setOpen(false)} title="Einstellungen" className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:bg-white/10">
              <SettingsIcon size={16} />
            </Link>
            <button onClick={() => setOpen(false)} className="md:hidden w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:bg-white/10" aria-label="Schließen"><X size={16} /></button>
          </div>

          <div className="flex gap-1.5 px-3 py-2 border-b border-white/5 overflow-x-auto no-scrollbar">
            {FILTERS.filter(f => f.value === 'all' || settings.notify[f.value]).map(f => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`h-7 px-3 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${filter === f.value ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/15'}`}
              >{f.label}</button>
            ))}
          </div>

          <ul className="max-h-[min(70vh,560px)] overflow-y-auto no-scrollbar py-1">
            {shown.length === 0 && (
              <li className="px-6 py-12 text-center text-sm text-white/50">
                <Bell size={28} className="mx-auto mb-3 text-white/20" />
                Noch keine Benachrichtigungen.
                <span className="block text-xs text-white/35 mt-1">Hier erscheinen Kommentare, Likes und Bewertungen zu deinen Fahrten.</span>
              </li>
            )}
            {shown.map(n => {
              const route = routes.find(r => r.id === n.routeId);
              const { Icon, cls } = KIND_ICON[n.kind];
              return (
                <li key={n.id}>
                  <button onClick={() => openItem(n)} className={`w-full text-left flex gap-3 px-4 py-3 transition-colors ${n.read ? 'hover:bg-white/5' : 'bg-white/[0.04] hover:bg-white/[0.08]'}`}>
                    {/* unread dot */}
                    <span className={`mt-4 w-1.5 h-1.5 rounded-full shrink-0 ${n.read ? 'bg-transparent' : 'bg-[#CCFF00]'}`} />
                    {/* avatar + kind badge */}
                    <span className="relative shrink-0">
                      <span className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: n.color }}>{initials(n.actor)}</span>
                      <span className={`absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] rounded-full flex items-center justify-center border-2 border-[#212121] ${cls}`}>
                        <Icon size={9} fill={n.kind === 'comment' ? 'none' : 'currentColor'} strokeWidth={n.kind === 'comment' ? 3 : 2} />
                      </span>
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm leading-snug text-white/90">
                        <b className="font-semibold text-white">{n.actor}</b>{' '}
                        {n.kind === 'comment' && <>hat <b className="font-medium text-white">{route?.name ?? 'deine Fahrt'}</b> kommentiert{n.seconds !== undefined && <> bei <span className="font-mono text-[#CCFF00]">{formatCommentTime(n.seconds)}</span></>}:</>}
                        {n.kind === 'like' && <>gefällt <b className="font-medium text-white">{route?.name ?? 'deine Fahrt'}</b></>}
                        {n.kind === 'rating' && <>hat <b className="font-medium text-white">{route?.name ?? 'deine Fahrt'}</b> mit <span className="text-[#CCFF00]">{'★'.repeat(n.stars ?? 0)}<span className="text-white/25">{'★'.repeat(5 - (n.stars ?? 0))}</span></span> bewertet</>}
                      </span>
                      {n.kind === 'comment' && n.text && <span className="block mt-1 text-sm text-white/60 line-clamp-2">„{n.text}“</span>}
                      <span className="block mt-1 text-xs text-white/40">{timeAgo(n.createdAt)}</span>
                    </span>
                    {route && (
                      <img src={`https://img.youtube.com/vi/${route.videoId}/mqdefault.jpg`} alt="" loading="lazy" className="w-[86px] h-[48px] self-start rounded-md object-cover shrink-0 bg-white/5" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
