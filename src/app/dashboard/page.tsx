'use client';

import AccountGate from '@/components/AccountGate';
import { useAuth } from '@/lib/auth';
import { ownerOf } from '@/lib/channels';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LayoutGrid, List, Search, Play, ExternalLink, Clock, ArrowUpDown, ChevronDown, Trash2, Heart, Star, Flag, MessageCircle, X, MapPin, FolderPlus, Folder, Plus, Check, ListVideo, EllipsisVertical, Pencil, ThumbsUp } from 'lucide-react';
import sparklinesData from '../../data/sparklines.json';
import type { RouteConfig } from '@/hooks/useEditorState';
import { haversineDistance } from '@/lib/geo';
import { useAllRoutes, deleteRoute, routeFromTrack, saveUserRoute } from '@/lib/userRoutes';
import { placeNamesOf, setPlaceNames, originalPlaceNames } from '@/lib/placeNames';
import AppHeader from '@/components/AppHeader';
import CreateRideModal, { type NewRide } from '@/components/CreateRideModal';
import { useRouteGroups, relativeTime, type RouteGroup } from '@/lib/routeGroups';
import { useRouteInteractions, formatRating, REPORT_REASONS } from '@/lib/routeInteractions';
import { useRouteComments, initials, formatCommentTime, type RouteComment } from '@/lib/routeComments';
import { useRouteVisibility, VISIBILITY_OPTIONS, type Visibility } from '@/lib/routeVisibility';
import { VisibilityBadge, VisibilityIcon, visibilityLabel } from '@/components/Visibility';

type ViewMode = 'table' | 'cards';
type SortKey = 'index' | 'name' | 'visibility' | 'date' | 'distance' | 'duration' | 'climb' | 'likes' | 'rating' | 'comments' | 'reports';

const VIEW_KEY = 'routecam.dashboard.view';
function formatDate(iso?: string) {
  return iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–';
}

// Click the badge to open a small radio menu (like YouTube Studio).
function VisibilityPicker({ value, onChange }: { value: Visibility; onChange: (v: Visibility) => void }) {
  // The table wrapper scrolls horizontally (which clips overflow), so the menu is
  // positioned `fixed` at the button's screen position instead of `absolute`.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const open = pos !== null;
  const ref = useRef<HTMLDivElement>(null);
  const setOpen = (next: boolean | ((o: boolean) => boolean)) => {
    const want = typeof next === 'function' ? next(open) : next;
    if (!want) return setPos(null);
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const menuH = 190;
    const top = r.bottom + 8 + menuH > window.innerHeight ? r.top - 8 - menuH : r.bottom + 8;
    setPos({ top, left: Math.min(r.left, window.innerWidth - 272) });
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const dismiss = () => setPos(null);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button onClick={() => setOpen(o => !o)} className="inline-flex items-center gap-1 hover:opacity-80 transition-opacity" title="Sichtbarkeit ändern">
        <VisibilityBadge v={value} />
        <ChevronDown size={12} className="text-white/40" />
      </button>
      {pos && (
        <div style={{ top: pos.top, left: pos.left }} className="fixed z-50 w-64 rounded-lg border border-white/10 bg-[#1a1d21] shadow-xl p-2">
          {VISIBILITY_OPTIONS.map(o => (
            <label key={o.value} className="flex items-start gap-3 px-2 py-2 rounded-md cursor-pointer hover:bg-white/5">
              <input
                type="radio"
                name="visibility"
                checked={value === o.value}
                onChange={() => { onChange(o.value); setOpen(false); }}
                className="mt-0.5 accent-[#CCFF00]"
              />
              <VisibilityIcon v={o.value} className="mt-0.5 shrink-0" />
              <span>
                <span className="block text-sm text-white">{o.label}</span>
                <span className="block text-xs text-white/40">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

interface RouteRow {
  index: number;
  route: RouteConfig;
  start: string;
  end: string;
  distanceKm: number; // straight lines between waypoints, so a lower bound of the road distance
  climbM: number;
  minEle: number;
  maxEle: number;
}

function buildRows(routes: RouteConfig[]): RouteRow[] {
  return routes.map((route, index) => {
    const { cities } = route;
    let distanceKm = 0;
    for (let i = 1; i < cities.length; i++) distanceKm += haversineDistance(cities[i - 1], cities[i]);

    const ele: number[] = (sparklinesData as Record<string, number[]>)[route.id] || route.elevationSample || [];
    let climbM = 0;
    for (let i = 1; i < ele.length; i++) climbM += Math.max(0, ele[i] - ele[i - 1]);

    return {
      index: index + 1,
      route,
      start: cities[0]?.name ?? '–',
      end: cities[cities.length - 1]?.name ?? '–',
      distanceKm,
      climbM,
      minEle: ele.length ? Math.min(...ele) : 0,
      maxEle: ele.length ? Math.max(...ele) : 0,
    };
  });
}


function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return h ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${mm}:${String(s).padStart(2, '0')}`;
}

function thumbnail(videoId: string) {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}

// `fluid`: stretch to the container width (cards) instead of a fixed pixel width (table)
function Sparkline({ routeId, width, height, sample, fluid }: { routeId: string; width: number; height: number; sample?: number[]; fluid?: boolean }) {
  const ele: number[] = (sparklinesData as Record<string, number[]>)[routeId] || sample || [];
  if (ele.length < 2) return null;
  const min = Math.min(...ele);
  const max = Math.max(...ele) === min ? min + 10 : Math.max(...ele);
  const pts = ele.map((v, i) => `${(i / (ele.length - 1)) * width},${height - 1 - ((v - min) / (max - min)) * (height - 2)}`);
  return (
    <svg
      width={fluid ? '100%' : width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={fluid ? 'none' : undefined}
      className="block"
    >
      <path d={`M 0,${height} L ${pts.join(' L ')} L ${width},${height} Z`} fill="rgba(204,255,0,0.1)" />
      <path d={`M ${pts.join(' L ')}`} fill="none" stroke="rgba(204,255,0,0.7)" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

type Sort = { key: SortKey; dir: 1 | -1 };

// Sort options for the card view – same keys as the sortable table columns
const SORT_LABELS: [SortKey, string][] = [
  ['index', '#'], ['name', 'Route'], ['visibility', 'Sichtbarkeit'], ['date', 'Datum'],
  ['distance', 'Distanz'], ['duration', 'Dauer'], ['climb', 'Höhe ↑'],
  ['likes', 'Likes'], ['rating', 'Bewertung'], ['comments', 'Kommentare'], ['reports', 'Meldungen'],
];

// Table grid: check · # · video · route · 4 stat columns (route value on top, community value below) · actions
const TABLE_GRID = 'grid grid-cols-[28px_36px_136px_minmax(260px,1fr)_92px_104px_100px_96px_212px] gap-x-3';

function SortLabel({ k, sort, onSort, children }: { k: SortKey; sort: Sort; onSort: (k: SortKey) => void; children: React.ReactNode }) {
  return (
    <button onClick={() => onSort(k)} className={`inline-flex items-center gap-1 font-medium hover:text-white transition-colors ${sort.key === k ? 'text-[#CCFF00]' : ''}`}>
      {children}
      <ArrowUpDown size={11} className="opacity-50" />
    </button>
  );
}

function StatHeader({ top, bottom }: { top: React.ReactNode; bottom: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div>{top}</div>
      <div className="text-white/35">{bottom}</div>
    </div>
  );
}

// one stat column of a row: route value (bright) above, community value (muted) below
function StatCell({ top, bottom }: { top: React.ReactNode; bottom: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="text-white h-[22px] flex items-center">{top}</div>
      <div className="text-xs text-white/60 h-5 flex items-center">{bottom}</div>
    </div>
  );
}

function RatingInline({ avg, count }: { avg: number | null; count: number }) {
  if (avg === null) return <span className="text-white/30">–</span>;
  return (
    <span className="inline-flex items-center gap-1 font-mono" title={`Ø ${formatRating(avg)} aus ${count} ${count === 1 ? 'Bewertung' : 'Bewertungen'}`}>
      <Star size={12} className="text-[#CCFF00]" fill="currentColor" />
      {formatRating(avg)}
      <span className="text-white/35">· {count}</span>
    </span>
  );
}

function Dashboard() {
  const allRoutes = useAllRoutes();
  // The dashboard manages your own rides only – never other people's (they could be deleted here)
  const { user: me } = useAuth();
  const ownRoutes = useMemo(() => allRoutes.filter(r => !!me && ownerOf(r).id === me.id), [allRoutes, me]);
  const rows = useMemo(() => buildRows(ownRoutes), [ownRoutes]);
  const [toDelete, setToDelete] = useState<RouteConfig | null>(null);
  const [toRename, setToRename] = useState<RouteConfig | null>(null);
  const { statsOf: interactionsOf } = useRouteInteractions();
  const { comments: allComments, countOf: commentsOf } = useRouteComments();
  const [commentsFor, setCommentsFor] = useState<RouteConfig | null>(null);
  const router = useRouter();

  // "Anlegen" in the header – same flow as on the map page, the new ride appears in the list
  const [createOpen, setCreateOpen] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('create') === '1') setCreateOpen(true);
  }, []);
  function handleCreateRide(ride: NewRide) {
    const route = routeFromTrack(ride);
    saveUserRoute(route); // throws if storage is full – the modal shows the error
    setVisibility(route.id, ride.visibility);
    setCreateOpen(false);
    if (ride.align && route.timeline) router.push(`/sync?route=${route.id}`);
  }

  // Multi-selection + groups
  const { groups, groupsOf, createGroup, addToGroup, removeFromGroup, renameGroup, setGroupVisibility, deleteGroup } = useRouteGroups();
  const [selected, setSelected] = useState<string[]>([]);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const activeGroup = groups.find(g => g.id === groupFilter) ?? null;
  const toggleSelected = (id: string) => setSelected(sel => (sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]));
  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(t => (t === msg ? null : t)), 2500);
  };
  // a deleted group must not stay active as filter
  useEffect(() => { if (groupFilter && !groups.some(g => g.id === groupFilter)) setGroupFilter(null); }, [groups, groupFilter]);
  const [view, setView] = useState<ViewMode>('table');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>({ key: 'index', dir: 1 });
  const { visibilityOf, setVisibility } = useRouteVisibility();

  // Restored after mount (not in the initial state) so the static HTML and the first client render match.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === 'table' || saved === 'cards') setView(saved);
    } catch {}
  }, []);

  function changeView(v: ViewMode) {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch {}
  }

  function toggleSort(key: SortKey) {
    setSort(s => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'date' ? -1 : 1 }));
  }
  const sortProps = { sort, onSort: toggleSort };

  const q = query.trim().toLowerCase();
  const inGroup = activeGroup ? rows.filter(r => activeGroup.routeIds.includes(r.route.id)) : rows;
  const filtered = q
    ? inGroup.filter(r => [r.route.name, r.start, r.end, r.route.videoId].some(f => f.toLowerCase().includes(q)))
    : inGroup;
  const sortValue = (r: RouteRow): number | string => {
    switch (sort.key) {
      case 'name': return r.route.name.toLowerCase();
      case 'visibility': return ['public', 'unlisted', 'private'].indexOf(visibilityOf(r.route.id, r.route.visibility));
      case 'date': return r.route.createdAt ?? '';
      case 'distance': return r.distanceKm;
      case 'duration': return r.route.durationSeconds;
      case 'climb': return r.climbM;
      case 'likes': return interactionsOf(r.route.id).likeCount;
      case 'rating': return interactionsOf(r.route.id).avgRating ?? -1;
      case 'comments': return commentsOf(r.route.id);
      case 'reports': return interactionsOf(r.route.id).reportCount;
      default: return r.index;
    }
  };
  const visible = [...filtered].sort((a, b) => {
    const va = sortValue(a), vb = sortValue(b);
    return (va > vb ? 1 : va < vb ? -1 : 0) * sort.dir;
  });

  const totals = {
    count: rows.length,
    distanceKm: rows.reduce((sum, r) => sum + r.distanceKm, 0),
    seconds: rows.reduce((sum, r) => sum + r.route.durationSeconds, 0),
    climbM: rows.reduce((sum, r) => sum + r.climbM, 0),
    likes: rows.reduce((sum, r) => sum + interactionsOf(r.route.id).likeCount, 0),
    reports: rows.reduce((sum, r) => sum + interactionsOf(r.route.id).reportCount, 0),
    comments: rows.reduce((sum, r) => sum + commentsOf(r.route.id), 0),
    // average over all individual ratings, weighted by count
    rating: (() => {
      let sum = 0, n = 0;
      for (const r of rows) {
        const st = interactionsOf(r.route.id);
        if (st.avgRating !== null) { sum += st.avgRating * st.ratingCount; n += st.ratingCount; }
      }
      return n ? sum / n : null;
    })(),
  };

  return (
    // html/body are overflow:hidden for the map, so this page scrolls its own container
    <div className="no-scrollbar h-screen overflow-y-auto w-full bg-[#0b0d10] text-white font-sans">
      {/* Same top bar as the map page, without search (the dashboard has its own) */}
      <AppHeader
        routes={allRoutes}
        activeRouteId=""
        onSelectRoute={id => router.push(`/?route=${id}`)}
        onCreate={() => setCreateOpen(true)}
        current="dashboard"
        showSearch={false}
        sticky
      />
      {createOpen && <CreateRideModal onClose={() => setCreateOpen(false)} onCreate={handleCreateRide} />}

      <div className="w-full px-4 md:px-8 py-6 md:py-10">

        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Meine Routen</h1>
              <p className="text-sm text-white/50">Alle Fahrten und Videos auf einen Blick</p>
            </div>
          </div>
        </header>

        {/* Stats */}
        <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 mb-8">
          {[
            { label: 'Fahrten', value: String(totals.count) },
            { label: 'Videozeit', value: formatDuration(totals.seconds) },
            { label: 'Distanz (Luftlinie)', value: `${Math.round(totals.distanceKm)} km` },
            { label: 'Höhenmeter ↑', value: `${Math.round(totals.climbM).toLocaleString('de-DE')} m` },
            { label: 'Likes', value: String(totals.likes) },
            { label: 'Ø Bewertung', value: formatRating(totals.rating) },
            { label: 'Kommentare', value: String(totals.comments) },
            { label: 'Meldungen', value: String(totals.reports) },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="text-[10px] uppercase tracking-widest text-white/40">{s.label}</div>
              <div className="text-xl font-semibold mt-1 font-mono">{s.value}</div>
            </div>
          ))}
        </section>


        {/* Groups as playlist cards (YouTube style) */}
        {groups.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold mb-3">Gruppen</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-x-4 gap-y-6">
              {groups.map(g => (
                <GroupCard
                  key={g.id}
                  group={g}
                  coverVideoId={allRoutes.find(r => g.routeIds.includes(r.id))?.videoId}
                  count={g.routeIds.filter(id => allRoutes.some(r => r.id === id)).length}
                  active={groupFilter === g.id}
                  onOpen={() => { setGroupFilter(g.id); setSelected([]); }}
                  onRename={name => renameGroup(g.id, name)}
                  onVisibility={v => setGroupVisibility(g.id, v)}
                  onDelete={() => { deleteGroup(g.id); showToast(`Gruppe „${g.name}“ gelöscht`); }}
                />
              ))}
            </div>
          </section>
        )}

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between mb-4">
          <label className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Route, Ort oder Video-ID suchen…"
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm placeholder:text-white/30 focus:outline-none focus:border-[#CCFF00]/50"
            />
          </label>
          <div className="flex items-center gap-2 self-start flex-wrap">
          {/* Group filter */}
          <div className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 h-[42px]">
            <Folder size={15} className="ml-3 text-white/40" />
            <select
              value={groupFilter ?? ''}
              onChange={e => { setGroupFilter(e.target.value || null); setSelected([]); }}
              className="bg-transparent text-sm text-white pl-2 pr-2 h-full outline-none cursor-pointer max-w-[200px]"
              title="Nach Gruppe filtern"
            >
              <option value="" className="bg-[#1a1d21]">Alle Routen</option>
              {groups.map(g => <option key={g.id} value={g.id} className="bg-[#1a1d21]">{g.name} ({g.routeIds.length})</option>)}
            </select>
            {activeGroup && (
              <button
                onClick={() => { deleteGroup(activeGroup.id); showToast(`Gruppe „${activeGroup.name}“ gelöscht`); }}
                title="Gruppe löschen (die Routen bleiben erhalten)"
                className="h-full px-3 border-l border-white/10 text-white/50 hover:text-red-300"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
          {view === 'cards' && (
            <div className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 h-[42px]">
              <select
                value={sort.key}
                onChange={e => setSort(s => ({ key: e.target.value as SortKey, dir: s.dir }))}
                className="bg-transparent text-sm text-white pl-3 pr-2 h-full outline-none cursor-pointer"
                title="Sortieren nach"
              >
                {SORT_LABELS.map(([k, label]) => <option key={k} value={k} className="bg-[#1a1d21]">{label}</option>)}
              </select>
              <button
                onClick={() => setSort(s => ({ ...s, dir: s.dir === 1 ? -1 : 1 }))}
                title={sort.dir === 1 ? 'Aufsteigend' : 'Absteigend'}
                className="h-full px-3 border-l border-white/10 text-white/60 hover:text-white"
              >
                {sort.dir === 1 ? '↑' : '↓'}
              </button>
            </div>
          )}
          <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-1">
            {([['table', List, 'Tabelle'], ['cards', LayoutGrid, 'Karten']] as const).map(([v, Icon, label]) => (
              <button
                key={v}
                onClick={() => changeView(v)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${view === v ? 'bg-[#CCFF00] text-black font-medium' : 'text-white/60 hover:text-white'}`}
              >
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>
          </div>
        </div>

        {visible.length === 0 && (
          <div className="rounded-xl border border-white/10 py-16 text-center text-white/40 text-sm">Keine Route gefunden.</div>
        )}

        {/* Table view – two lines per ride: route data on top, community below.
            Each stat column carries one value of each line, the header shows both labels stacked. */}
        {view === 'table' && visible.length > 0 && (
          <div className="rounded-xl border border-white/10 overflow-x-auto">
            <div className="min-w-[1080px] text-sm">
              <div className={`${TABLE_GRID} items-end bg-white/[0.03] text-white/50 text-[11px] uppercase tracking-wider px-4 py-2.5`}>
                <div className="pb-0.5">
                  <SelectAll ids={visible.map(r => r.route.id)} selected={selected} onChange={setSelected} />
                </div>
                <SortLabel {...sortProps} k="index">#</SortLabel>
                <div />
                <div className="flex flex-col gap-1">
                  <SortLabel {...sortProps} k="name">Route</SortLabel>
                  <div className="flex gap-3 normal-case tracking-normal text-[11px]">
                    <SortLabel {...sortProps} k="visibility">Sichtbarkeit</SortLabel>
                    <SortLabel {...sortProps} k="date">Datum</SortLabel>
                  </div>
                </div>
                <StatHeader top={<SortLabel {...sortProps} k="distance">Distanz*</SortLabel>} bottom={<SortLabel {...sortProps} k="likes">Likes</SortLabel>} />
                <StatHeader top={<SortLabel {...sortProps} k="duration">Dauer</SortLabel>} bottom={<SortLabel {...sortProps} k="rating">Bewertung</SortLabel>} />
                <StatHeader top={<SortLabel {...sortProps} k="climb">Höhe ↑</SortLabel>} bottom={<SortLabel {...sortProps} k="comments">Kommentare</SortLabel>} />
                <StatHeader top={<span>Profil</span>} bottom={<SortLabel {...sortProps} k="reports">Meldungen</SortLabel>} />
                <div />
              </div>

              {visible.map(r => {
                const st = interactionsOf(r.route.id);
                const isSel = selected.includes(r.route.id);
                return (
                  <div key={r.route.id} className={`${TABLE_GRID} items-center px-4 py-3 border-t border-white/5 transition-colors ${isSel ? 'bg-[#CCFF00]/[0.06]' : 'hover:bg-white/[0.03]'}`}>
                    <div>
                      <input type="checkbox" checked={isSel} onChange={() => toggleSelected(r.route.id)} aria-label={`${r.route.name} auswählen`} className="w-4 h-4 accent-[#CCFF00] cursor-pointer" />
                    </div>
                    <div className="text-white/40 font-mono">{r.index}</div>
                    <Link href={`/?route=${r.route.id}`} title="Auf der Karte abspielen" className="group relative block w-[120px] aspect-video rounded-md overflow-hidden bg-white/5">
                      <img src={thumbnail(r.route.videoId)} alt="" loading="lazy" className="w-full h-full object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play size={18} fill="#CCFF00" className="text-[#CCFF00] ml-0.5" />
                      </span>
                      <span className="absolute bottom-1 right-1 text-[10px] font-mono bg-black/80 rounded px-1">{formatDuration(r.route.durationSeconds)}</span>
                    </Link>

                    {/* route: title on top, status line below */}
                    <div className="min-w-0 pr-2">
                      <div className="font-medium leading-snug line-clamp-2" title={r.route.originalName ?? r.route.name}>{r.route.name}</div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-white/40">
                        <VisibilityPicker value={visibilityOf(r.route.id, r.route.visibility)} onChange={v => setVisibility(r.route.id, v)} />
                        <span className="font-mono" title="Angelegt">{formatDate(r.route.createdAt)}</span>
                        <span>{r.route.cities.length} Wegpunkte{r.route.forceStraight ? ' · gerade Linie' : ''}</span>
                        <SyncHint route={r.route} />
                        <GroupChips groups={groupsOf(r.route.id)} onSelect={setGroupFilter} />
                      </div>
                    </div>

                    <StatCell
                      top={<span className="font-mono">{r.distanceKm.toFixed(1)} km</span>}
                      bottom={<span className="inline-flex items-center gap-1.5 font-mono"><ThumbsUp size={12} className="text-white/40" />{st.likeCount}</span>}
                    />
                    <StatCell
                      top={<span className="font-mono">{formatDuration(r.route.durationSeconds)}</span>}
                      bottom={<RatingInline avg={st.avgRating} count={st.ratingCount} />}
                    />
                    <StatCell
                      top={<span className="font-mono" title={`${Math.round(r.minEle)}–${Math.round(r.maxEle)} m`}>{Math.round(r.climbM)} m</span>}
                      bottom={<CommentsButton count={commentsOf(r.route.id)} onClick={() => setCommentsFor(r.route)} />}
                    />
                    <StatCell
                      top={<Sparkline routeId={r.route.id} sample={r.route.elevationSample} width={80} height={22} />}
                      bottom={<ReportsCell reports={st.reports} />}
                    />

                    <div className="flex items-center justify-end gap-1.5 pl-2">
                      <Link href={`/?route=${r.route.id}`} title="Auf der Karte abspielen" className="w-8 h-8 rounded-full flex items-center justify-center bg-[#CCFF00]/15 text-[#CCFF00] hover:bg-[#CCFF00]/30 transition-colors">
                        <Play size={14} fill="currentColor" className="ml-0.5" />
                      </Link>
                      <a href={`https://youtu.be/${r.route.videoId}`} target="_blank" rel="noreferrer" title="Auf YouTube öffnen" className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-colors">
                        <ExternalLink size={14} />
                      </a>
                      <SyncButton route={r.route} />
                      <button onClick={() => setToRename(r.route)} title="Start & Ziel umbenennen" className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-colors">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setToDelete(r.route)} title="Route löschen" className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 text-white/60 hover:text-red-300 hover:bg-red-500/15 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Card view */}
        {view === 'cards' && visible.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {visible.map(r => {
              const st = interactionsOf(r.route.id);
              return (
              <article key={r.route.id} className={`group relative min-w-0 rounded-xl border bg-white/[0.03] transition-colors ${
                selected.includes(r.route.id) ? 'border-[#CCFF00]/70' : 'border-white/10 hover:border-[#CCFF00]/40'
              }`}>
                {/* selection checkbox (outside the link, so it doesn't navigate) */}
                <label className="absolute top-2 left-2 z-10 w-7 h-7 rounded-md bg-black/70 flex items-center justify-center cursor-pointer">
                  <input type="checkbox" checked={selected.includes(r.route.id)} onChange={() => toggleSelected(r.route.id)} aria-label={`${r.route.name} auswählen`} className="w-4 h-4 accent-[#CCFF00] cursor-pointer" />
                </label>
                <Link href={`/?route=${r.route.id}`} title="Auf der Karte abspielen" className="block relative aspect-video bg-white/5 rounded-t-xl overflow-hidden">
                  <img src={thumbnail(r.route.videoId)} alt="" loading="lazy" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="w-12 h-12 rounded-full bg-[#CCFF00] text-black flex items-center justify-center">
                      <Play size={20} fill="currentColor" className="ml-0.5" />
                    </span>
                  </div>
                  <span className="absolute bottom-2 right-2 text-xs font-mono bg-black/80 rounded px-1.5 py-0.5">{formatDuration(r.route.durationSeconds)}</span>
                  <span className="absolute top-2 left-11 text-xs font-mono bg-black/70 rounded px-1.5 py-0.5 text-white/70">#{r.index}</span>
                </Link>
                <div className="p-4">
                  {/* Route + actions (same as the table's first/last columns) */}
                  {/* title over the full card width, the action buttons in a row below it */}
                  <div className="flex flex-col gap-3">
                    <div className="min-w-0">
                      <h2 className="font-medium leading-snug">{r.route.name}</h2>
                      <div className="text-xs text-white/40 mt-0.5">
                        {r.route.cities.length} Wegpunkte{r.route.forceStraight ? ' · gerade Linie' : ''}
                      </div>
                      <SyncHint route={r.route} />
                      <GroupChips groups={groupsOf(r.route.id)} onSelect={setGroupFilter} />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Link href={`/?route=${r.route.id}`} title="Auf der Karte abspielen" className="w-8 h-8 rounded-full flex items-center justify-center bg-[#CCFF00]/15 text-[#CCFF00] hover:bg-[#CCFF00]/30 transition-colors">
                        <Play size={14} fill="currentColor" className="ml-0.5" />
                      </Link>
                      <a href={`https://youtu.be/${r.route.videoId}`} target="_blank" rel="noreferrer" title="Auf YouTube öffnen" className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-colors">
                        <ExternalLink size={14} />
                      </a>
                      <SyncButton route={r.route} />
                      <button onClick={() => setToRename(r.route)} title="Start & Ziel umbenennen" className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-colors">
                        <Pencil size={14} />
                      </button>
                        <button onClick={() => setToDelete(r.route)} title="Route löschen" className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 text-white/60 hover:text-red-300 hover:bg-red-500/15 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Sichtbarkeit (editable) + Datum */}
                  <div className="flex items-center justify-between gap-2 mt-3">
                    <VisibilityPicker value={visibilityOf(r.route.id, r.route.visibility)} onChange={v => setVisibility(r.route.id, v)} />
                    <span className="text-xs text-white/40 font-mono" title="Angelegt">{formatDate(r.route.createdAt)}</span>
                  </div>

                  <div className="mt-3 mb-3"><Sparkline routeId={r.route.id} sample={r.route.elevationSample} width={300} height={36} fluid /></div>

                  {/* Same figures as the table columns */}
                  <dl className="grid grid-cols-3 gap-x-2 gap-y-3 text-xs">
                    <div><dt className="text-white/40">Distanz*</dt><dd className="font-mono mt-0.5">{r.distanceKm.toFixed(1)} km</dd></div>
                    <div><dt className="text-white/40">Dauer</dt><dd className="font-mono mt-0.5">{formatDuration(r.route.durationSeconds)}</dd></div>
                    <div>
                      <dt className="text-white/40">Höhe ↑</dt>
                      <dd className="font-mono mt-0.5">{Math.round(r.climbM)} m</dd>
                      <dd className="text-[10px] text-white/40 font-mono">{Math.round(r.minEle)}–{Math.round(r.maxEle)} m</dd>
                    </div>
                    <div><dt className="text-white/40">Likes</dt><dd className="font-mono mt-0.5 inline-flex items-center gap-1.5"><Heart size={12} className="text-white/40" />{st.likeCount}</dd></div>
                    <div><dt className="text-white/40">Bewertung</dt><dd className="mt-0.5"><RatingCell avg={st.avgRating} count={st.ratingCount} /></dd></div>
                    <div><dt className="text-white/40">Kommentare</dt><dd className="font-mono mt-0.5"><CommentsButton count={commentsOf(r.route.id)} onClick={() => setCommentsFor(r.route)} /></dd></div>
                    <div><dt className="text-white/40">Meldungen</dt><dd className="font-mono mt-0.5"><ReportsCell reports={st.reports} /></dd></div>
                  </dl>
                </div>
              </article>
              );
            })}
          </div>
        )}

        <p className="text-[11px] text-white/30 mt-6">
          * Distanz als Luftlinie zwischen den Wegpunkten – die tatsächliche Straßenstrecke ist länger. Höhenmeter aus dem vereinfachten Höhenprofil.
        </p>
      </div>

      {selected.length > 0 && (
        <BulkBar
          count={selected.length}
          groups={groups}
          activeGroup={activeGroup}
          onClear={() => setSelected([])}
          onAddTo={g => { addToGroup(g.id, selected); showToast(`${selected.length} ${selected.length === 1 ? 'Route' : 'Routen'} zu „${g.name}“ hinzugefügt`); setSelected([]); }}
          onCreate={name => { const g = createGroup(name, selected); showToast(`Gruppe „${g.name}“ mit ${selected.length} ${selected.length === 1 ? 'Route' : 'Routen'} erstellt`); setSelected([]); }}
          onRemoveFromActive={() => { if (!activeGroup) return; removeFromGroup(activeGroup.id, selected); showToast(`${selected.length} aus „${activeGroup.name}“ entfernt`); setSelected([]); }}
        />
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-[#282828] px-3 py-2 text-sm text-white shadow-xl inline-flex items-center gap-2">
          <Check size={16} className="text-[#CCFF00]" /> {toast}
        </div>
      )}

      {commentsFor && (
        <CommentsDrawer
          route={commentsFor}
          comments={allComments.filter(c => c.routeId === commentsFor.id)}
          onClose={() => setCommentsFor(null)}
        />
      )}

      {toRename && (
        <PlaceNamesDialog
          route={toRename}
          onCancel={() => setToRename(null)}
          onSave={names => { setPlaceNames(toRename.id, names); setToRename(null); showToast('Start & Ziel gespeichert'); }}
        />
      )}

      {toDelete && (
        <ConfirmDelete
          name={toDelete.name}
          onCancel={() => setToDelete(null)}
          onConfirm={() => { deleteRoute(toDelete.id); setToDelete(null); }}
        />
      )}
    </div>
  );
}

function RatingCell({ avg, count }: { avg: number | null; count: number }) {
  if (avg === null) return <span className="text-white/30">–</span>;
  return (
    <div title={`Ø ${formatRating(avg)} aus ${count} ${count === 1 ? 'Bewertung' : 'Bewertungen'}`}>
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map(n => (
          <Star key={n} size={13} className={n <= Math.round(avg) ? 'text-[#CCFF00]' : 'text-white/20'} fill={n <= Math.round(avg) ? 'currentColor' : 'none'} />
        ))}
      </div>
      <div className="text-[10px] text-white/40 mt-0.5 font-mono">{formatRating(avg)} · {count}</div>
    </div>
  );
}

function ReportsCell({ reports }: { reports: { reason: string; note?: string }[] }) {
  if (!reports.length) return <span className="text-white/30">0</span>;
  const label = (v: string) => REPORT_REASONS.find(r => r.value === v)?.label ?? v;
  return (
    <span
      title={reports.map(r => `• ${label(r.reason)}${r.note ? ` – ${r.note}` : ''}`).join('\n')}
      className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 text-red-300 px-2 py-0.5 cursor-help"
    >
      <Flag size={12} /> {reports.length}
    </span>
  );
}

function GroupCard({ group, coverVideoId, count, active, onOpen, onRename, onVisibility, onDelete }: {
  group: RouteGroup;
  coverVideoId?: string;
  count: number;
  active: boolean;
  onOpen: () => void;
  onRename: (name: string) => void;
  onVisibility: (v: Visibility) => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const ref = useRef<HTMLDivElement>(null);
  const visibility = group.visibility ?? 'public';

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  return (
    <article className="min-w-0">
      {/* stacked cover: two layers peeking out above the thumbnail */}
      <button onClick={onOpen} className="group block w-full text-left" title="Komplette Gruppe ansehen">
        <div className="relative pt-[10px]">
          <div className="absolute top-0 left-4 right-4 h-6 rounded-t-lg bg-white/20" />
          <div className="absolute top-[5px] left-2 right-2 h-6 rounded-t-lg bg-white/40" />
          <div className={`relative aspect-video rounded-xl overflow-hidden bg-white/5 border-2 transition-colors ${active ? 'border-[#CCFF00]' : 'border-transparent group-hover:border-[#CCFF00]/50'}`}>
            {coverVideoId
              ? <img src={thumbnail(coverVideoId)} alt="" loading="lazy" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-white/20"><Folder size={36} /></div>}
            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium">
              <ListVideo size={14} /> {count} {count === 1 ? 'Video' : 'Videos'}
            </span>
          </div>
        </div>
      </button>

      <div className="flex items-start gap-2 mt-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <form onSubmit={e => { e.preventDefault(); if (name.trim()) onRename(name); setEditing(false); }}>
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                onBlur={() => { if (name.trim()) onRename(name); setEditing(false); }}
                maxLength={60}
                className="w-full h-8 rounded-md bg-[#121212] border border-[#CCFF00]/60 outline-none px-2 text-sm font-semibold text-white"
              />
            </form>
          ) : (
            <h3 className="font-semibold leading-snug truncate">{group.name}</h3>
          )}
          <div className="mt-1 text-xs text-white/50 flex items-center gap-1.5">
            <VisibilityIcon v={visibility} size={12} />
            <span>{visibilityLabel(visibility)}</span>
            <span className="text-white/30">·</span>
            <span>Gruppe</span>
          </div>
          <div className="text-xs text-white/40 mt-0.5">{relativeTime(group.updatedAt ?? group.createdAt)} aktualisiert</div>
          <button onClick={onOpen} className="mt-1 text-xs font-semibold text-white/80 hover:text-[#CCFF00]">
            Komplette Gruppe ansehen
          </button>
        </div>

        {/* ⋮ menu */}
        <div ref={ref} className="relative shrink-0">
          <button onClick={() => setMenuOpen(o => !o)} title="Mehr" className="w-8 h-8 -mr-1 rounded-full flex items-center justify-center text-white/70 hover:bg-white/10">
            <EllipsisVertical size={18} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-20 w-56 rounded-lg border border-white/10 bg-[#212121] shadow-2xl py-1.5">
              <button onClick={() => { setMenuOpen(false); setName(group.name); setEditing(true); }} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white hover:bg-white/10">
                <Pencil size={15} /> Umbenennen
              </button>
              <div className="my-1 border-t border-white/10" />
              <div className="px-3 pt-1 pb-1 text-[10px] uppercase tracking-widest text-white/40">Sichtbarkeit</div>
              {VISIBILITY_OPTIONS.map(o => (
                <button key={o.value} onClick={() => { onVisibility(o.value); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white hover:bg-white/10">
                  <VisibilityIcon v={o.value} size={15} />
                  <span className="flex-1 text-left">{o.label}</span>
                  {visibility === o.value && <Check size={15} className="text-[#CCFF00]" />}
                </button>
              ))}
              <div className="my-1 border-t border-white/10" />
              <button onClick={() => { setMenuOpen(false); onDelete(); }} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-300 hover:bg-red-500/10">
                <Trash2 size={15} /> Gruppe löschen
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function SelectAll({ ids, selected, onChange }: { ids: string[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const count = ids.filter(id => selected.includes(id)).length;
  const all = ids.length > 0 && count === ids.length;
  useEffect(() => { if (ref.current) ref.current.indeterminate = count > 0 && !all; }, [count, all]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={all}
      onChange={() => onChange(all ? selected.filter(id => !ids.includes(id)) : [...new Set([...selected, ...ids])])}
      aria-label="Alle auswählen"
      title="Alle auswählen"
      className="w-4 h-4 accent-[#CCFF00] cursor-pointer"
    />
  );
}

function GroupChips({ groups, onSelect }: { groups: RouteGroup[]; onSelect: (id: string) => void }) {
  if (!groups.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {groups.map(g => (
        <button
          key={g.id}
          onClick={() => onSelect(g.id)}
          title={`Nur Gruppe „${g.name}“ anzeigen`}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-white/[0.07] hover:bg-white/15 px-2 py-0.5 text-[10px] text-white/70"
        >
          <Folder size={10} /> {g.name}
        </button>
      ))}
    </div>
  );
}

// Floating action bar for the current selection: add to (new or existing) group
function BulkBar({ count, groups, activeGroup, onClear, onAddTo, onCreate, onRemoveFromActive }: {
  count: number;
  groups: RouteGroup[];
  activeGroup: RouteGroup | null;
  onClear: () => void;
  onAddTo: (g: RouteGroup) => void;
  onCreate: (name: string) => void;
  onRemoveFromActive: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  return (
    <div ref={ref} className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full border border-white/15 bg-[#1f1f1f]/95 backdrop-blur-md shadow-2xl pl-5 pr-2 py-2">
      <span className="text-sm font-medium whitespace-nowrap">{count} ausgewählt</span>
      <div className="relative">
        <button
          onClick={() => setMenuOpen(o => !o)}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-full bg-[#CCFF00] text-black text-sm font-semibold hover:brightness-110"
        >
          <FolderPlus size={16} /> Zu Gruppe hinzufügen
        </button>
        {menuOpen && (
          <div className="absolute bottom-full mb-2 left-0 w-72 rounded-xl border border-white/10 bg-[#212121] shadow-2xl p-2">
            {groups.length > 0 && (
              <>
                <div className="px-2 pt-1 pb-1.5 text-[10px] uppercase tracking-widest text-white/40">Bestehende Gruppe</div>
                <div className="max-h-56 overflow-y-auto no-scrollbar flex flex-col">
                  {groups.map(g => (
                    <button key={g.id} onClick={() => { onAddTo(g); setMenuOpen(false); }} className="flex items-center gap-2 px-2 py-2 rounded-md text-sm text-white hover:bg-white/10 text-left">
                      <Folder size={15} className="text-white/50 shrink-0" />
                      <span className="truncate flex-1">{g.name}</span>
                      <span className="text-xs font-mono text-white/40">{g.routeIds.length}</span>
                    </button>
                  ))}
                </div>
                <div className="my-2 border-t border-white/10" />
              </>
            )}
            <div className="px-2 pt-1 pb-1.5 text-[10px] uppercase tracking-widest text-white/40">Neue Gruppe</div>
            <form
              className="flex items-center gap-2 px-1"
              onSubmit={e => { e.preventDefault(); if (!newName.trim()) return; onCreate(newName); setNewName(''); setMenuOpen(false); }}
            >
              <input
                autoFocus={groups.length === 0}
                value={newName}
                onChange={e => setNewName(e.target.value)}
                maxLength={60}
                placeholder="z. B. Zypern Herbst 2026"
                className="flex-1 min-w-0 h-9 rounded-lg bg-[#121212] border border-white/15 focus:border-[#CCFF00]/60 outline-none px-3 text-sm text-white placeholder:text-white/30"
              />
              <button type="submit" disabled={!newName.trim()} title="Gruppe erstellen" className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center bg-[#CCFF00] text-black disabled:bg-white/10 disabled:text-white/30">
                <Plus size={16} />
              </button>
            </form>
          </div>
        )}
      </div>
      {activeGroup && (
        <button onClick={onRemoveFromActive} className="h-9 px-4 rounded-full text-sm text-white/80 hover:bg-white/10 whitespace-nowrap">
          Aus „{activeGroup.name}“ entfernen
        </button>
      )}
      <button onClick={onClear} title="Auswahl aufheben" className="w-9 h-9 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10">
        <X size={18} />
      </button>
    </div>
  );
}

function CommentsButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={count === 0}
      title={count ? 'Kommentare lesen' : 'Keine Kommentare'}
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 -mx-2 font-mono text-white hover:bg-white/10 hover:text-[#CCFF00] disabled:text-white/30 disabled:hover:bg-transparent transition-colors"
    >
      <MessageCircle size={13} className="opacity-60" />{count}
    </button>
  );
}

// Elevation of a route at a fraction (0–1) of its length, interpolated from the sparkline samples.
function elevationsOf(route: RouteConfig): number[] {
  return (sparklinesData as Record<string, number[]>)[route.id] || route.elevationSample || [];
}
function elevationAt(ele: number[], p: number): number | null {
  if (ele.length < 2) return null;
  const x = Math.max(0, Math.min(1, p)) * (ele.length - 1);
  const i = Math.floor(x);
  const j = Math.min(ele.length - 1, i + 1);
  return ele[i] + (ele[j] - ele[i]) * (x - i);
}

// Right-hand panel listing all comments of a route in video order, with the elevation
// profile on top showing where along the route each comment sits.
function CommentsDrawer({ route, comments, onClose }: { route: RouteConfig; comments: RouteComment[]; onClose: () => void }) {
  const router = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);
  const ele = elevationsOf(route);
  const duration = route.durationSeconds || 1;
  const mapHref = (c: RouteComment) => `/?route=${route.id}&t=${c.seconds}`;

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  // Profile geometry
  const W = 400, H = 110, PAD_TOP = 34, PAD_BOTTOM = 6;
  const min = ele.length ? Math.min(...ele) : 0;
  const max = ele.length ? Math.max(...ele) : 1;
  const span = max - min || 1;
  const y = (v: number) => PAD_TOP + (1 - (v - min) / span) * (H - PAD_TOP - PAD_BOTTOM);
  const line = ele.map((v, i) => `${(i / (ele.length - 1)) * W},${y(v).toFixed(1)}`).join(' L ');

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside className="absolute top-0 right-0 bottom-0 w-full max-w-md bg-[#141619] border-l border-white/10 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between gap-4 px-5 h-16 border-b border-white/10 shrink-0">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-widest text-white/40">{comments.length} {comments.length === 1 ? 'Kommentar' : 'Kommentare'}</div>
            <h2 className="text-lg font-semibold truncate">{route.name}</h2>
          </div>
          <button onClick={onClose} aria-label="Schließen" className="w-10 h-10 -mr-2 rounded-full flex items-center justify-center hover:bg-white/10"><X size={22} /></button>
        </div>

        {/* Elevation profile with a pin per comment – click a pin to open the map there */}
        {ele.length > 1 && (
          <div className="px-5 pt-4 pb-3 border-b border-white/10 shrink-0">
            <div className="flex justify-between text-[10px] uppercase tracking-widest text-white/40 mb-1">
              <span>Höhenprofil</span>
              <span className="font-mono normal-case tracking-normal">{Math.round(min)}–{Math.round(max)} m</span>
            </div>
            <div className="relative" style={{ height: H }}>
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
                <path d={`M 0,${H} L ${line} L ${W},${H} Z`} fill="rgba(204,255,0,0.10)" />
                <path d={`M ${line}`} fill="none" stroke="rgba(204,255,0,0.75)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                {comments.map(c => {
                  const p = Math.min(1, c.seconds / duration);
                  const e = elevationAt(ele, p);
                  if (e === null) return null;
                  return (
                    <line key={c.id} x1={p * W} x2={p * W} y1={PAD_TOP - 6} y2={y(e)}
                      stroke={hovered === c.id ? '#CCFF00' : 'rgba(255,255,255,0.35)'} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                  );
                })}
              </svg>
              {comments.map(c => {
                const p = Math.min(1, c.seconds / duration);
                const e = elevationAt(ele, p);
                if (e === null) return null;
                return (
                  <React.Fragment key={c.id}>
                    {/* point on the profile */}
                    <span className="absolute w-2 h-2 -ml-1 -mt-1 rounded-full border border-[#141619] pointer-events-none"
                      style={{ left: `${p * 100}%`, top: y(e), background: c.color, boxShadow: hovered === c.id ? '0 0 0 2px #CCFF00' : 'none' }} />
                    {/* avatar pin above the profile */}
                    <button
                      onClick={() => router.push(mapHref(c))}
                      onMouseEnter={() => setHovered(c.id)}
                      onMouseLeave={() => setHovered(null)}
                      title={`${c.author} · ${formatCommentTime(c.seconds)} · ${Math.round(e)} m – auf der Karte öffnen`}
                      className={`absolute top-0 -ml-[11px] w-[22px] h-[22px] rounded-full flex items-center justify-center text-[8px] font-bold text-[#0b0d10] border-2 transition-transform ${
                        hovered === c.id ? 'scale-125 border-[#CCFF00] z-10' : 'border-[#141619]'
                      }`}
                      style={{ left: `${p * 100}%`, background: c.color }}
                    >
                      {initials(c.author)}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] font-mono text-white/30 mt-1">
              <span>0:00</span>
              <span>{formatCommentTime(duration)}</span>
            </div>
          </div>
        )}

        <ol className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-1">
          {comments.map(c => {
            const e = elevationAt(ele, Math.min(1, c.seconds / duration));
            return (
              <li
                key={c.id}
                onMouseEnter={() => setHovered(c.id)}
                onMouseLeave={() => setHovered(null)}
                className={`group flex gap-3 rounded-lg p-2 -mx-2 transition-colors ${hovered === c.id ? 'bg-white/[0.06]' : ''}`}
              >
                <span className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold text-[#0b0d10]" style={{ background: c.color }}>
                  {initials(c.author)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 text-xs">
                    <span className="font-semibold text-white">{c.author}</span>
                    <span className="font-mono text-[#CCFF00]">{formatCommentTime(c.seconds)}</span>
                    {e !== null && <span className="font-mono text-white/50" title="Höhe an dieser Stelle">{Math.round(e)} m</span>}
                    <span className="ml-auto text-white/30">{formatDate(c.createdAt)}</span>
                  </div>
                  <p className="text-sm text-white/80 mt-0.5 break-words">{c.text}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <Link href={mapHref(c)} className="inline-flex items-center gap-1 text-[11px] text-white/50 hover:text-[#CCFF00] transition-colors">
                      <MapPin size={12} /> Auf der Karte zeigen
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </aside>
    </div>
  );
}

function ConfirmDelete({ name, onCancel, onConfirm }: { name: string; onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div role="alertdialog" aria-modal="true" className="relative w-full max-w-sm rounded-2xl bg-[#1f1f1f] border border-white/10 shadow-2xl p-6">
        <h2 className="text-lg font-semibold">Route löschen?</h2>
        <p className="mt-2 text-sm text-white/60">
          „{name}“ wird aus deinen Routen und von der Karte entfernt. Das kann nicht rückgängig gemacht werden.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button autoFocus onClick={onCancel} className="h-10 px-4 rounded-full text-sm font-medium hover:bg-white/10">Abbrechen</button>
          <button onClick={onConfirm} className="h-10 px-5 rounded-full text-sm font-semibold bg-red-500 text-white hover:bg-red-400 transition-colors">Löschen</button>
        </div>
      </div>
    </div>
  );
}

// Own names for start and end point – also changes the "A → B" name in the navigation
function PlaceNamesDialog({ route, onCancel, onSave }: {
  route: RouteConfig;
  onCancel: () => void;
  onSave: (names: { start: string; end: string }) => void;
}) {
  const orig = originalPlaceNames(route);
  const own = placeNamesOf(route.id);
  const [start, setStart] = useState(own.start ?? '');
  const [end, setEnd] = useState(own.end ?? '');
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onCancel]);
  const preview = `${start.trim() || orig.start} → ${end.trim() || orig.end}`;
  const field = (label: string, value: string, set: (v: string) => void, placeholder: string, auto = false) => (
    <label className="block">
      <span className="text-xs text-white/50">{label}</span>
      <input
        autoFocus={auto}
        value={value}
        onChange={e => set(e.target.value)}
        maxLength={60}
        placeholder={placeholder}
        className="mt-1 w-full h-10 rounded-lg bg-[#121212] border border-white/15 focus:border-[#CCFF00]/60 outline-none px-3 text-sm text-white placeholder:text-white/30"
      />
    </label>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <form
        role="dialog"
        aria-modal="true"
        onSubmit={e => { e.preventDefault(); onSave({ start, end }); }}
        className="relative w-full max-w-md rounded-2xl bg-[#1f1f1f] border border-white/10 shadow-2xl p-6"
      >
        <h2 className="text-lg font-semibold">Start & Ziel umbenennen</h2>
        <p className="mt-1 text-sm text-white/50 truncate">{route.originalName ?? route.name}</p>
        <div className="mt-5 flex flex-col gap-3">
          {field('Startpunkt', start, setStart, orig.start, true)}
          {field('Endpunkt', end, setEnd, orig.end)}
        </div>
        <div className="mt-4 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-white/40">In der Navigation</div>
          <div className="mt-0.5 text-sm font-medium text-white truncate">{preview}</div>
        </div>
        <p className="mt-2 text-[11px] text-white/35">Leeres Feld = ursprünglicher Name. Gilt auch für die Pins auf der Karte und die Suche.</p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="h-10 px-4 rounded-full text-sm font-medium hover:bg-white/10">Abbrechen</button>
          <button type="submit" className="h-10 px-5 rounded-full text-sm font-semibold bg-[#CCFF00] text-black hover:brightness-110 transition">Speichern</button>
        </div>
      </form>
    </div>
  );
}

// Sync editor entry (own rides with GPS timestamps only)
function SyncButton({ route }: { route: RouteConfig }) {
  if (!route.timeline) return null;
  return (
    <Link href={`/sync?route=${route.id}`} title="Video mit der Route ausrichten" className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-colors">
      <Clock size={14} />
    </Link>
  );
}

// Shown until the rider confirmed the alignment once ("Fertig" in the sync editor)
function SyncHint({ route }: { route: RouteConfig }) {
  if (!route.timeline || route.synced) return null;
  return (
    <Link href={`/sync?route=${route.id}`} className="mt-1.5 mr-1.5 inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-300 hover:bg-amber-400/20 whitespace-nowrap">
      <Clock size={11} /> Nicht ausgerichtet
    </Link>
  );
}


export default function GatedDashboardPage() {
  return <AccountGate><Dashboard /></AccountGate>;
}
