'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, Heart, MessageCircle, Star, Settings as SettingsIcon, CheckCheck, X } from 'lucide-react';
import { useNotifications, timeAgo, type AppNotification, type NotificationKind } from '@/lib/notifications';
import { useAllRoutes } from '@/lib/userRoutes';
import { useSettings } from '@/lib/settings';
import { formatCommentTime } from '@/lib/routeComments';
import UserAvatar from '@/components/UserAvatar';
import { t, rich, useT, k } from '@/lib/i18n';

const FILTERS: { value: 'all' | NotificationKind; label: string }[] = [
  { value: 'all', label: k('Alle') },
  { value: 'comment', label: k('Kommentare') },
  { value: 'like', label: k('Likes') },
  { value: 'rating', label: k('Bewertungen') },
];

const KIND_ICON = {
  comment: { Icon: MessageCircle, cls: 'bg-sky-500 text-white' },
  like: { Icon: Heart, cls: 'bg-pink-500 text-white' },
  rating: { Icon: Star, cls: 'bg-[#CCFF00] text-black' },
} as const;

// Bell in the top bar: unread badge + YouTube-style panel with the latest activity on own rides
export default function NotificationBell() {
  useT();
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
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full page load on purpose: the map page reads ?route/&t when it starts
    if (!handled) window.location.assign(`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/?route=${n.routeId}${seconds ? `&t=${seconds}` : ''}`);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={unread ? t('Benachrichtigungen, {n} ungelesen', { n: unread }) : t('Benachrichtigungen')}
        title={t('Benachrichtigungen')}
        className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-colors ${open ? 'bg-white/15' : 'hover:bg-white/10'}`}
      >
        <Bell size={20} />
        {unread > 0 && (
          // Flex statt line-height: so steht die Zahl mittig, auch mit Rand. Ab 100 „99+“, die Pille wächst nach links über die Glocke.
          <span className={`absolute top-0.5 -right-1 min-w-[20px] h-[20px] box-border rounded-full bg-[#CCFF00] text-black font-bold ${unread > 99 ? 'px-[4px] text-[9.5px]' : 'px-[5px] text-[10.5px]'} leading-none tabular-nums tracking-[-0.3px] flex items-center justify-center border-2 border-[#0f0f0f]`}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed md:absolute inset-x-2 md:inset-x-auto md:right-0 top-14 md:top-full md:mt-2 z-[95] md:w-[440px] rounded-xl border border-white/10 bg-[#212121] shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 h-14 border-b border-white/10">
            <h2 className="text-base font-semibold flex-1">{t('Benachrichtigungen')}</h2>
            <button
              onClick={() => markAllRead(shown.map(n => n.id))}
              disabled={!shown.some(n => !n.read)}
              title={t('Alle als gelesen markieren')}
              className="h-8 px-2.5 rounded-full text-xs text-white/70 hover:bg-white/10 disabled:opacity-30 flex items-center gap-1.5"
            ><CheckCheck size={15} /> {t('Alle gelesen')}</button>
            <Link href="/settings#benachrichtigungen" onClick={() => setOpen(false)} title={t('Einstellungen')} className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:bg-white/10">
              <SettingsIcon size={16} />
            </Link>
            <button onClick={() => setOpen(false)} className="md:hidden w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:bg-white/10" aria-label={t('Schließen')}><X size={16} /></button>
          </div>

          <div className="flex gap-1.5 px-3 py-2 border-b border-white/5 overflow-x-auto no-scrollbar">
            {FILTERS.filter(f => f.value === 'all' || settings.notify[f.value]).map(f => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`h-7 px-3 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${filter === f.value ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/15'}`}
              >{t(f.label)}</button>
            ))}
          </div>

          <ul className="max-h-[min(70vh,560px)] overflow-y-auto no-scrollbar py-1">
            {shown.length === 0 && (
              <li className="px-6 py-12 text-center text-sm text-white/50">
                <Bell size={28} className="mx-auto mb-3 text-white/20" />
                {t('Noch keine Benachrichtigungen.')}
                <span className="block text-xs text-white/35 mt-1">{t('Hier erscheinen Kommentare, Likes und Bewertungen zu deinen Fahrten.')}</span>
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
                      <UserAvatar name={n.actor} picture={n.picture} seed={n.actorId} size={40} />
                      <span className={`absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] rounded-full flex items-center justify-center border-2 border-[#212121] ${cls}`}>
                        <Icon size={9} fill={n.kind === 'comment' ? 'none' : 'currentColor'} strokeWidth={n.kind === 'comment' ? 3 : 2} />
                      </span>
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm leading-snug text-white/90">
                        {(() => {
                          const vars = { actor: n.actor, route: route?.name ?? t('deine Fahrt'), time: n.seconds !== undefined ? formatCommentTime(n.seconds) : '' };
                          const parts = [
                            (s: string) => <b className="font-semibold text-white">{s}</b>,
                            (s: string) => <b className="font-medium text-white">{s}</b>,
                            (s: string) => <span className="font-mono text-[#CCFF00]">{s}</span>,
                          ];
                          if (n.kind === 'comment') return n.seconds !== undefined
                            ? rich('<0>{actor}</0> hat <1>{route}</1> bei <2>{time}</2> kommentiert:', parts, vars)
                            : rich('<0>{actor}</0> hat <1>{route}</1> kommentiert:', parts, vars);
                          if (n.kind === 'like') return rich('<0>{actor}</0> gefällt <1>{route}</1>', parts, vars);
                          const stars = <span className="text-[#CCFF00]">{'★'.repeat(n.stars ?? 0)}<span className="text-white/25">{'★'.repeat(5 - (n.stars ?? 0))}</span></span>;
                          return rich('<0>{actor}</0> hat <1>{route}</1> mit <2>Sternen</2> bewertet', [parts[0], parts[1], () => stars], vars);
                        })()}
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
