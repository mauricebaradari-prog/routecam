'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Heart, Play, X, Layers, Share2, Check } from 'lucide-react';
import { shareUrl } from '@/lib/share';
import AppHeader from '@/components/AppHeader';
import { useAllRoutes } from '@/lib/userRoutes';
import { useRouteVisibility } from '@/lib/routeVisibility';
import { useRouteInteractions } from '@/lib/routeInteractions';
import { VisibilityIcon, visibilityLabel } from '@/components/Visibility';
import { useAuth } from '@/lib/auth';
import { ownerOf, distanceKm, FOUNDER, founderId, publicChannelId, type RouteOwner } from '@/lib/channels';
import { useRouteGroups, relativeTime, type RouteGroup } from '@/lib/routeGroups';
import ChannelAvatar from '@/components/ChannelAvatar';
import sparklinesData from '@/data/sparklines.json';

// A RouteCam channel: one account's rides. /channel?u=<account id>
// (query param instead of a path segment: the app is a static export)
export default function ChannelPage() {
  const router = useRouter();
  const routes = useAllRoutes();
  const { user } = useAuth();
  const { visibilityOf } = useRouteVisibility();
  const { statsOf } = useRouteInteractions();
  const [channelId, setChannelId] = useState<string | null>(null);

  useEffect(() => {
    // ?u=maurice is the founder channel; it resolves to his account when he is signed in
    const read = () => {
      const u = new URLSearchParams(window.location.search).get('u') || (user?.id ?? FOUNDER.id);
      setChannelId(u === FOUNDER.id ? founderId() : u);
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, [user?.id]);

  const own = !!user && channelId === user.id;
  const all = useMemo(() => routes.filter(r => ownerOf(r).id === channelId), [routes, channelId]);
  // visitors only see public rides; on your own channel you see everything, with its visibility
  const rides = useMemo(
    () => all
      .filter(r => own || visibilityOf(r.id, r.visibility) === 'public')
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
    [all, own, visibilityOf],
  );

  // groups: a group belongs to the channel that owns its rides
  const { groups } = useRouteGroups();
  const [tab, setTab] = useState<'rides' | 'groups'>('rides');
  const [groupFilter, setGroupFilter] = useState<RouteGroup | null>(null);
  const channelGroups = useMemo(() => {
    const byId = new Map(routes.map(r => [r.id, r]));
    return groups
      .map(g => ({ group: g, rides: g.routeIds.map(id => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r && rides.includes(r)) }))
      .filter(({ group, rides: rs }) => rs.length > 0 && rs.every(r => ownerOf(r).id === channelId) && (own || (group.visibility ?? 'public') === 'public'))
      .sort((a, b) => (b.group.updatedAt ?? b.group.createdAt).localeCompare(a.group.updatedAt ?? a.group.createdAt));
  }, [groups, routes, rides, channelId, own]);
  const shownRides = groupFilter ? rides.filter(r => groupFilter.routeIds.includes(r.id)) : rides;

  const owner: RouteOwner | null = own && user
    ? { id: user.id, name: user.name, picture: user.picture }
    : all[0] ? ownerOf(all[0]) : channelId === FOUNDER.id ? FOUNDER : null;

  const totals = useMemo(() => ({
    km: rides.reduce((s, r) => s + distanceKm(r), 0),
    seconds: rides.reduce((s, r) => s + (r.durationSeconds || 0), 0),
    likes: rides.reduce((s, r) => s + (statsOf(r.id).likeCount || 0), 0),
  }), [rides, statsOf]);

  return (
    <div className="no-scrollbar h-screen overflow-y-auto w-full bg-[#0b0d10] text-white font-sans">
      <AppHeader
        routes={routes}
        activeRouteId=""
        onSelectRoute={id => router.push(`/?route=${id}`)}
        onCreate={() => router.push('/dashboard?create=1')}
        current="other"
        showSearch={false}
        sticky
      />

      {channelId === null ? null : !owner ? (
        <main className="max-w-5xl mx-auto px-4 md:px-8 py-16 text-center">
          <h1 className="text-xl font-semibold">Kanal nicht gefunden</h1>
          <p className="text-sm text-white/50 mt-2">Diesen Kanal gibt es nicht oder er hat noch keine öffentlichen Fahrten.</p>
          <Link href="/" className="inline-block mt-6 text-sm text-[#CCFF00] hover:underline">Zur Karte</Link>
        </main>
      ) : (
        <main className="max-w-5xl mx-auto px-4 md:px-8 py-8 md:py-12">
          {/* channel head */}
          <section className="flex flex-col sm:flex-row sm:items-center gap-5">
            <ChannelAvatar owner={owner} size={88} />
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight truncate">{owner.name}</h1>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/50 tabular-nums">
                <span>{rides.length} {rides.length === 1 ? 'Fahrt' : 'Fahrten'}</span>
                <span>{Math.round(totals.km).toLocaleString('de-DE')} km</span>
                <span>{formatHours(totals.seconds)} Video</span>
                {totals.likes > 0 && <span className="inline-flex items-center gap-1"><Heart size={13} className="text-[#CCFF00]" fill="currentColor" /> {totals.likes}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
            <ShareButton channelId={publicChannelId(owner.id)} title={`${owner.name} auf RouteCam`} />
            {own && (
              <button onClick={() => router.push('/dashboard?create=1')} className="inline-flex items-center gap-1.5 h-10 pl-3 pr-4 rounded-full bg-[#CCFF00] text-black text-sm font-semibold hover:brightness-110">
                <Plus size={18} /> Fahrt anlegen
              </button>
            )}
            </div>
          </section>

          <div className="mt-8 border-b border-white/10 flex gap-6 text-sm" role="tablist">
            {([['rides', 'Fahrten', rides.length], ['groups', 'Gruppen', channelGroups.length]] as const).map(([k, label, n]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={`pb-3 -mb-px border-b-2 transition-colors ${tab === k ? 'border-white text-white font-medium' : 'border-transparent text-white/50 hover:text-white/80'}`}>
                {label} <span className="text-white/40 tabular-nums">{n}</span>
              </button>
            ))}
          </div>

          {tab === 'groups' ? (
            channelGroups.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-sm text-white/60">{own ? 'Du hast noch keine Gruppen.' : 'Keine öffentlichen Gruppen.'}</p>
                {own && <p className="text-xs text-white/40 mt-1">Im Dashboard mehrere Fahrten auswählen und zu einer Gruppe zusammenfassen, zum Beispiel eine Reise.</p>}
              </div>
            ) : (
              <ul className="mt-6 grid gap-x-4 gap-y-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {channelGroups.map(({ group, rides: rs }) => {
                  const vis = group.visibility ?? 'public';
                  const km = rs.reduce((s, r) => s + distanceKm(r), 0);
                  return (
                    <li key={group.id}>
                      <button onClick={() => { setGroupFilter(group); setTab('rides'); }} className="group block w-full text-left">
                        {/* stacked covers: a group reads as a pile of rides */}
                        <div className="relative pt-2.5">
                          <div className="absolute inset-x-4 top-0 h-4 rounded-t-xl bg-white/10" />
                          <div className="absolute inset-x-2 top-1 h-4 rounded-t-xl bg-white/15" />
                          <div className="relative aspect-video rounded-xl overflow-hidden bg-white/5">
                            <img src={`https://img.youtube.com/vi/${rs[0].videoId}/mqdefault.jpg`} alt="" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300" />
                            <span className="absolute right-0 top-0 bottom-0 w-2/5 bg-black/75 flex flex-col items-center justify-center gap-1 text-white">
                              <Layers size={20} />
                              <span className="text-sm font-semibold tabular-nums">{rs.length}</span>
                              <span className="text-[10px] text-white/60">{rs.length === 1 ? 'Fahrt' : 'Fahrten'}</span>
                            </span>
                          </div>
                        </div>
                        <div className="mt-2.5 flex items-start gap-2">
                          <h2 className="flex-1 min-w-0 text-sm font-medium leading-snug line-clamp-2 group-hover:text-[#CCFF00] transition-colors">{group.name}</h2>
                          {own && vis !== 'public' && <span title={visibilityLabel(vis)} className="text-white/50 mt-0.5"><VisibilityIcon v={vis} size={14} /></span>}
                        </div>
                        <p className="mt-1 text-xs text-white/45 tabular-nums">{Math.round(km)} km · {relativeTime(group.updatedAt ?? group.createdAt)} aktualisiert</p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )
          ) : (<>
          {groupFilter && (
            <div className="mt-5 flex items-center gap-2 text-sm">
              <span className="text-white/50">Gruppe</span>
              <button onClick={() => setGroupFilter(null)} className="inline-flex items-center gap-1.5 h-8 pl-3 pr-2 rounded-full bg-[#CCFF00]/15 text-[#CCFF00] hover:bg-[#CCFF00]/25" title="Filter entfernen">
                <Layers size={14} /> {groupFilter.name} <X size={14} />
              </button>
            </div>
          )}
          {shownRides.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-white/60">{own ? 'Dein Kanal ist noch leer.' : 'Noch keine öffentlichen Fahrten.'}</p>
              {own && <p className="text-xs text-white/40 mt-1">Leg deine erste Fahrt an: YouTube-Link plus GPX- oder KML-Datei.</p>}
            </div>
          ) : (
            <ul className="mt-6 grid gap-x-4 gap-y-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {shownRides.map(r => {
                const vis = visibilityOf(r.id, r.visibility);
                const ele: number[] = (sparklinesData as Record<string, number[]>)[r.id] || r.elevationSample || [];
                return (
                  <li key={r.id}>
                    <Link href={`/?route=${r.id}`} className="group block">
                      <div className="relative aspect-video rounded-xl overflow-hidden bg-white/5">
                        <img src={`https://img.youtube.com/vi/${r.videoId}/mqdefault.jpg`} alt="" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300" />
                        <span className="absolute right-1.5 bottom-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-medium tabular-nums">{formatDuration(r.durationSeconds)}</span>
                        <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="w-11 h-11 rounded-full bg-[#CCFF00] flex items-center justify-center"><Play size={18} className="text-black ml-0.5" fill="currentColor" /></span>
                        </span>
                        {ele.length > 1 && <Sparkline values={ele} />}
                      </div>
                      <div className="mt-2.5 flex items-start gap-2">
                        <h2 className="flex-1 min-w-0 text-sm font-medium leading-snug line-clamp-2 group-hover:text-[#CCFF00] transition-colors">{r.name}</h2>
                        {own && vis !== 'public' && <span title={visibilityLabel(vis)} className="text-white/50 mt-0.5"><VisibilityIcon v={vis} size={14} /></span>}
                      </div>
                      <p className="mt-1 text-xs text-white/45 tabular-nums">
                        {Math.round(distanceKm(r))} km{r.createdAt ? ` · ${new Date(r.createdAt).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          </>)}
        </main>
      )}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / span) * 24}`).join(' ');
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="absolute left-0 right-0 bottom-0 h-8 w-full pointer-events-none" aria-hidden="true">
      <polygon points={`0,30 ${pts} 100,30`} fill="url(#ch-ele)" />
      <polyline points={pts} fill="none" stroke="#CCFF00" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      <defs>
        <linearGradient id="ch-ele" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#CCFF00" stopOpacity=".25" /><stop offset="1" stopColor="#CCFF00" stopOpacity="0" /></linearGradient>
      </defs>
    </svg>
  );
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = Math.round(seconds % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
function formatHours(seconds: number) {
  const h = Math.floor(seconds / 3600), m = Math.round((seconds % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

function ShareButton({ channelId, title }: { channelId: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = shareUrl({ channel: channelId });
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title, url }); } catch {}
      return;
    }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
  };
  return (
    <button onClick={share} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-white/10 hover:bg-white/20 text-sm font-medium">
      {copied ? <><Check size={16} className="text-[#CCFF00]" /> Link kopiert</> : <><Share2 size={16} /> Teilen</>}
    </button>
  );
}
