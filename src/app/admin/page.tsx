'use client';

// Admin dashboard – only for the founder account.
//
// Everything comes from the admin_* functions in the database (supabase/migrations/0003_admin.sql).
// They check the account themselves, so this page can't leak anything: for everyone else the
// database answers "forbidden" and the page only shows "Kein Zugriff".
//
// Look: light and plain. Black = primary action, white with black outline = secondary.
// Geist for text, Geist Mono for every number.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Moon, Sun } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useDb } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { timeAgo } from '@/lib/notifications';
import { REPORT_REASONS } from '@/lib/routeInteractions';
import { COMMENT_REPORT_REASONS, formatCommentTime } from '@/lib/routeComments';
import { channelHref } from '@/lib/channels';
import { ROUTES } from '@/data/routes';

// ── Data shapes (as the admin_* functions return them) ──────────────────────
type Period = 'today' | 'd7' | 'd30' | 'all';
type Metric = 'users' | 'rides' | 'comments' | 'likes' | 'ratings' | 'reports';
interface Overview {
  counts: Record<Period, Record<Metric, number>>;
  openReports: number;
  daily: { day: string; users: number; rides: number; comments: number }[];
}
interface Report {
  kind: 'route' | 'comment'; id: string; routeId: string; reason: string; note: string | null;
  status: 'open' | 'resolved'; createdAt: string; reporter: string | null; routeTitle: string | null;
  routeVisibility?: string | null; owner?: string | null;
  commentId?: string | null; commentExists?: boolean; commentNow?: string | null;
  snapshot?: { author?: string; text?: string; seconds?: number; createdAt?: string };
}
interface Activity {
  type: 'user' | 'ride' | 'comment'; at: string; who: string | null; userId: string;
  routeId?: string; title?: string; visibility?: string; text?: string; seconds?: number; reply?: boolean;
}
interface AdminUser {
  id: string; name: string; picture: string | null; slug: string | null; founder: boolean; email: string;
  createdAt: string; lastSignIn: string | null; rides: number; comments: number; likes: number;
}
interface AdminRoute {
  id: string; title: string | null; videoId: string | null; durationSeconds: number | null;
  visibility: 'public' | 'unlisted' | 'private'; hidden: boolean; createdAt: string;
  ownerId: string; owner: string | null; likes: number; comments: number; rating: number | null; reports: number;
}

const TABS = [
  { id: 'overview', label: 'Überblick' },
  { id: 'reports', label: 'Meldungen' },
  { id: 'activity', label: 'Aktivität' },
  { id: 'users', label: 'Nutzer' },
  { id: 'routes', label: 'Fahrten' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const REASON_LABEL: Record<string, string> = Object.fromEntries(
  [...REPORT_REASONS, ...COMMENT_REPORT_REASONS].map(r => [r.value, r.label]),
);
const VISIBILITY_LABEL: Record<string, string> = { public: 'Öffentlich', unlisted: 'Nicht gelistet', private: 'Privat' };

const nf = new Intl.NumberFormat('de-DE');
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–');

// ── Small building blocks ───────────────────────────────────────────────────
const btnPrimary = 'inline-flex items-center justify-center h-9 px-4 rounded-lg bg-black adark:bg-white text-white adark:text-black text-sm font-medium hover:bg-neutral-800 adark:hover:bg-neutral-200 disabled:opacity-40 transition-colors';
const btnSecondary = 'inline-flex items-center justify-center h-9 px-4 rounded-lg bg-white adark:bg-neutral-900 text-black adark:text-white border border-black adark:border-white text-sm font-medium hover:bg-neutral-100 adark:hover:bg-neutral-800 disabled:opacity-40 transition-colors';

function Num({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`font-mono tabular-nums ${className}`}>{children}</span>;
}

function StatusDot({ status }: { status: 'open' | 'resolved' }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span className={`w-2 h-2 rounded-full ${status === 'open' ? 'bg-red-600' : 'bg-green-600'}`} />
      {status === 'open' ? 'Offen' : 'Erledigt'}
    </span>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white adark:bg-neutral-900 border border-neutral-200 adark:border-neutral-800 rounded-xl ${className}`}>{children}</div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-neutral-500 adark:text-neutral-400 py-10 text-center">{children}</p>;
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex p-0.5 rounded-lg border border-neutral-300 adark:border-neutral-700 bg-white adark:bg-neutral-900">
      {options.map(o => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`h-8 px-3 rounded-md text-sm transition-colors ${value === o.id ? 'bg-black adark:bg-white text-white adark:text-black' : 'text-neutral-600 adark:text-neutral-400 hover:text-black adark:hover:text-white'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { user, ready, renderSignInButton } = useAuth();
  const { me } = useDb();
  const isFounder = !!me?.is_founder;

  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [routes, setRoutes] = useState<AdminRoute[]>([]);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const sb = supabase();
    const [o, r, a, u, ro] = await Promise.all([
      sb.rpc('admin_overview'), sb.rpc('admin_reports'), sb.rpc('admin_activity', { max_items: 60 }), sb.rpc('admin_users'), sb.rpc('admin_routes'),
    ]);
    const failed = [o, r, a, u, ro].find(x => x.error);
    if (failed?.error) {
      setError(failed.error.message === 'forbidden' ? 'Kein Zugriff.' : `Laden hat nicht geklappt: ${failed.error.message}`);
    } else {
      setOverview(o.data as Overview);
      setReports(r.data as Report[]);
      setActivity(a.data as Activity[]);
      setUsers(u.data as AdminUser[]);
      setRoutes(ro.data as AdminRoute[]);
      setLoadedAt(new Date().toISOString());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isFounder) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data comes from the database once the founder's login is known
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60_000);
    return () => clearInterval(t);
  }, [isFounder, load]);

  // sign-in button for the signed-out case
  const signInRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ready && !user && signInRef.current) renderSignInButton(signInRef.current, 'outline').catch(() => {});
  }, [ready, user, renderSignInButton]);

  const openReports = reports.filter(r => r.status === 'open').length;

  // ── Gate ──
  if (!ready) return <Shell />;
  if (!user || !isFounder) {
    return (
      <Shell>
        <div className="max-w-sm mx-auto mt-24 text-center">
          <h1 className="text-xl font-semibold">{user ? 'Kein Zugriff' : 'RouteCam Admin'}</h1>
          <p className="text-sm text-neutral-500 adark:text-neutral-400 mt-2">
            {user ? 'Dieser Bereich ist nur für den Betreiber von RouteCam.' : 'Bitte mit dem Betreiber-Konto anmelden.'}
          </p>
          {!user && <div ref={signInRef} className="mt-6 flex justify-center min-h-[44px]" />}
          <Link href="/" className={`${btnSecondary} mt-6`}>Zur App</Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      right={
        <>
          <span className="hidden sm:inline text-xs text-neutral-500 adark:text-neutral-400">
            {loading ? 'Lädt …' : loadedAt ? <>Stand {new Date(loadedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</> : null}
          </span>
          <button onClick={load} disabled={loading} className={btnSecondary}>Aktualisieren</button>
          <Link href="/" className={btnPrimary}>Zur App</Link>
        </>
      }
    >
      <nav className="flex gap-1 border-b border-neutral-200 adark:border-neutral-800 mb-6 overflow-x-auto overflow-y-hidden [scrollbar-width:none]">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative h-10 px-3 text-sm whitespace-nowrap ${tab === t.id ? 'text-black adark:text-white font-medium' : 'text-neutral-500 adark:text-neutral-400 hover:text-black adark:hover:text-white'}`}
          >
            {t.label}
            {t.id === 'reports' && openReports > 0 && (
              <Num className="ml-1.5 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-red-600 text-white text-[11px]">{openReports}</Num>
            )}
            {tab === t.id && <span className="absolute left-0 right-0 bottom-0 h-0.5 bg-black adark:bg-white" />}
          </button>
        ))}
      </nav>

      {error && <p className="mb-6 text-sm text-red-700 adark:text-red-400">{error}</p>}

      {tab === 'overview' && <OverviewTab data={overview} openReports={openReports} onShowReports={() => setTab('reports')} />}
      {tab === 'reports' && <ReportsTab reports={reports} routes={routes} onChanged={load} />}
      {tab === 'activity' && <ActivityTab items={activity} />}
      {tab === 'users' && <UsersTab users={users} />}
      {tab === 'routes' && <RoutesTab routes={routes} onChanged={load} />}
    </Shell>
  );
}

// Light / dark: remembered per browser; the first visit follows the system setting.
const THEME_KEY = 'routecam.adminTheme';
function useAdminTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the saved choice / system setting is only known in the browser
    setTheme(saved === 'dark' || saved === 'light' ? saved : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }, []);
  const toggle = useCallback(() => {
    setTheme(t => {
      const next = t === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(THEME_KEY, next); } catch {}
      return next;
    });
  }, []);
  return { theme, toggle };
}

function Shell({ children, right }: { children?: React.ReactNode; right?: React.ReactNode }) {
  const { theme, toggle } = useAdminTheme();
  return (
    <div data-admin-theme={theme} className="min-h-screen bg-neutral-50 adark:bg-neutral-950 text-neutral-900 adark:text-neutral-100">
      <header className="sticky top-0 z-10 bg-white/90 adark:bg-neutral-900/90 backdrop-blur border-b border-neutral-200 adark:border-neutral-800">
        <div className="w-full px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-3">
          <span className="font-semibold">RouteCam</span>
          <span className="text-neutral-400">/</span>
          <span className="text-neutral-600 adark:text-neutral-400">Admin</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={toggle}
              title={theme === 'dark' ? 'Helles Design' : 'Dunkles Design'}
              aria-label={theme === 'dark' ? 'Helles Design' : 'Dunkles Design'}
              className="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-neutral-300 adark:border-neutral-700 hover:bg-neutral-100 adark:hover:bg-neutral-800 transition-colors"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            {right}
          </div>
        </div>
      </header>
      <main className="w-full px-4 sm:px-6 lg:px-8 py-6">{children}</main>
    </div>
  );
}

// ── Überblick ───────────────────────────────────────────────────────────────
const KPIS: { key: Metric; label: string }[] = [
  { key: 'users', label: 'Nutzer' },
  { key: 'rides', label: 'Fahrten' },
  { key: 'comments', label: 'Kommentare' },
  { key: 'likes', label: 'Likes' },
  { key: 'ratings', label: 'Bewertungen' },
  { key: 'reports', label: 'Meldungen' },
];

function OverviewTab({ data, openReports, onShowReports }: { data: Overview | null; openReports: number; onShowReports: () => void }) {
  const [metric, setMetric] = useState<'users' | 'rides' | 'comments'>('users');
  if (!data) return <Empty>Lädt …</Empty>;
  return (
    <div className="space-y-6">
      {openReports > 0 && (
        <Card className="p-4 flex items-center gap-4 border-red-200 adark:border-red-900">
          <span className="w-2 h-2 rounded-full bg-red-600 shrink-0" />
          <p className="text-sm flex-1">
            <Num className="font-semibold">{openReports}</Num> {openReports === 1 ? 'offene Meldung wartet' : 'offene Meldungen warten'} auf dich.
          </p>
          <button onClick={onShowReports} className={btnPrimary}>Ansehen</button>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {KPIS.map(k => (
          <Card key={k.key} className="p-4">
            <div className="text-xs text-neutral-500 adark:text-neutral-400">{k.label}</div>
            <Num className="block text-3xl font-medium mt-1">{nf.format(data.counts.all[k.key])}</Num>
            <div className="mt-2 text-[11px] text-neutral-500 adark:text-neutral-400 leading-5">
              heute <Num className="text-neutral-900 adark:text-neutral-100">+{data.counts.today[k.key]}</Num>
              <span className="mx-1 text-neutral-300">·</span>7 T <Num className="text-neutral-900 adark:text-neutral-100">+{data.counts.d7[k.key]}</Num>
              <span className="mx-1 text-neutral-300">·</span>30 T <Num className="text-neutral-900 adark:text-neutral-100">+{data.counts.d30[k.key]}</Num>
            </div>
          </Card>
        ))}
      </div>
      <p className="text-xs text-neutral-500 adark:text-neutral-400 -mt-3">
        Fahrten = von Nutzern angelegt. Dazu kommen <Num>{ROUTES.length}</Num> eingebaute Zypern-Fahrten.
      </p>

      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <h2 className="font-medium mr-auto">Letzte 30 Tage</h2>
          <Segmented
            value={metric}
            onChange={setMetric}
            options={[{ id: 'users', label: 'Neue Nutzer' }, { id: 'rides', label: 'Neue Fahrten' }, { id: 'comments', label: 'Kommentare' }]}
          />
        </div>
        <DailyBars days={data.daily} metric={metric} />
      </Card>
    </div>
  );
}

// One series, black bars, a tooltip per day. Recessive axis: only the max and a few dates.
function DailyBars({ days, metric }: { days: Overview['daily']; metric: 'users' | 'rides' | 'comments' }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map(d => d[metric]));
  const label = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  return (
    <div>
      <div className="relative h-40 flex items-end gap-0.5 border-b border-neutral-300 adark:border-neutral-700">
        <Num className="absolute -top-1 left-0 text-[10px] text-neutral-400">{max}</Num>
        <div className="absolute left-0 right-0 top-2 border-t border-dashed border-neutral-200 adark:border-neutral-800" />
        {days.map((d, i) => {
          const v = d[metric];
          return (
            <div
              key={d.day}
              className="relative flex-1 h-full flex items-end cursor-default"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(h => (h === i ? null : h))}
            >
              <div
                className={`w-full rounded-t ${hover === i ? 'bg-neutral-600 adark:bg-neutral-300' : 'bg-black adark:bg-white'}`}
                style={{ height: v ? `${Math.max(3, (v / max) * 92)}%` : 0 }}
              />
              {hover === i && (
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap rounded-md bg-black adark:bg-white text-white adark:text-black px-2 py-1 text-xs shadow">
                  {label(d.day)}: <Num>{v}</Num>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1.5 text-[10px] text-neutral-400">
        <Num>{label(days[0].day)}</Num>
        <Num>{label(days[Math.floor(days.length / 2)].day)}</Num>
        <Num>heute</Num>
      </div>
    </div>
  );
}

// ── Meldungen ───────────────────────────────────────────────────────────────
function ReportsTab({ reports, routes, onChanged }: { reports: Report[]; routes: AdminRoute[]; onChanged: () => void }) {
  const [filter, setFilter] = useState<'open' | 'resolved' | 'all'>('open');
  const [busy, setBusy] = useState<string | null>(null);
  const shown = reports.filter(r => filter === 'all' || r.status === filter);
  const inDb = useMemo(() => new Map(routes.map(r => [r.id, r])), [routes]);

  async function run(key: string, fn: () => PromiseLike<{ error: { message: string } | null }>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(key);
    const { error } = await fn();
    setBusy(null);
    if (error) alert(`Hat nicht geklappt: ${error.message}`);
    else onChanged();
  }

  return (
    <div>
      <div className="mb-4">
        <Segmented value={filter} onChange={setFilter} options={[{ id: 'open', label: 'Offen' }, { id: 'resolved', label: 'Erledigt' }, { id: 'all', label: 'Alle' }]} />
      </div>
      {shown.length === 0 ? (
        <Empty>{filter === 'open' ? 'Keine offenen Meldungen.' : 'Keine Meldungen.'}</Empty>
      ) : (
        <div className="space-y-3">
          {shown.map(r => {
            const key = `${r.kind}:${r.id}`;
            const sb = supabase();
            const ride = inDb.get(r.routeId);
            const seconds = r.snapshot?.seconds;
            return (
              <Card key={key} className="p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500 adark:text-neutral-400">
                  <StatusDot status={r.status} />
                  <span className="px-1.5 py-0.5 rounded border border-neutral-300 adark:border-neutral-700 text-neutral-700 adark:text-neutral-300">{r.kind === 'route' ? 'Fahrt' : 'Kommentar'}</span>
                  <span>{REASON_LABEL[r.reason] ?? r.reason}</span>
                  <span className="ml-auto"><Num>{fmtDate(r.createdAt)}</Num> · {timeAgo(r.createdAt)}</span>
                </div>

                <div className="mt-3 text-sm">
                  {r.kind === 'comment' ? (
                    <>
                      <blockquote className="border-l-2 border-black adark:border-white pl-3">
                        <span className="text-neutral-500 adark:text-neutral-400">{r.snapshot?.author ?? 'Unbekannt'}{seconds != null && <> bei <Num>{formatCommentTime(seconds)}</Num></>}:</span>{' '}
                        {r.snapshot?.text}
                      </blockquote>
                      <p className="mt-1.5 text-xs text-neutral-500 adark:text-neutral-400">
                        {r.commentExists
                          ? r.commentNow !== r.snapshot?.text ? 'Kommentar wurde seitdem geändert.' : 'Kommentar ist noch online.'
                          : 'Kommentar ist nicht mehr online.'}
                        {' '}Fahrt: {r.routeTitle ?? r.routeId}
                      </p>
                    </>
                  ) : (
                    <p>
                      <span className="font-medium">{r.routeTitle ?? r.routeId}</span>
                      <span className="text-neutral-500 adark:text-neutral-400"> · von {r.owner ?? 'Gründer'}{r.routeVisibility && <> · {VISIBILITY_LABEL[r.routeVisibility]}</>}</span>
                    </p>
                  )}
                  {r.note && <p className="mt-2 text-neutral-700 adark:text-neutral-300">Notiz: „{r.note}“</p>}
                  <p className="mt-1 text-xs text-neutral-500 adark:text-neutral-400">Gemeldet von {r.reporter ?? 'gelöschtem Konto'}</p>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {r.status === 'open' ? (
                    <button disabled={busy === key} className={btnPrimary}
                      onClick={() => run(key, () => sb.rpc('admin_set_report_status', { report_kind: r.kind, report_id: r.id, new_status: 'resolved' }))}>
                      Erledigt
                    </button>
                  ) : (
                    <button disabled={busy === key} className={btnSecondary}
                      onClick={() => run(key, () => sb.rpc('admin_set_report_status', { report_kind: r.kind, report_id: r.id, new_status: 'open' }))}>
                      Wieder öffnen
                    </button>
                  )}
                  {r.kind === 'comment' && r.commentExists && r.commentId && (
                    <button disabled={busy === key} className={btnSecondary}
                      onClick={() => run(key, () => sb.rpc('admin_delete_comment', { comment: r.commentId }), 'Kommentar (mit Antworten) endgültig entfernen?')}>
                      Kommentar entfernen
                    </button>
                  )}
                  {ride && ride.visibility !== 'private' && (
                    <button disabled={busy === key} className={btnSecondary}
                      onClick={() => run(key, () => sb.rpc('admin_set_route_visibility', { route: r.routeId, new_visibility: 'private' }), 'Fahrt auf „Privat“ setzen? Dann sieht sie nur noch der Besitzer.')}>
                      Fahrt auf privat
                    </button>
                  )}
                  <a href={`/?route=${encodeURIComponent(r.routeId)}${seconds != null ? `&t=${seconds}` : ''}`} target="_blank" rel="noreferrer" className={btnSecondary}>
                    Ansehen
                  </a>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Aktivität ───────────────────────────────────────────────────────────────
function ActivityTab({ items }: { items: Activity[] }) {
  if (!items.length) return <Empty>Noch nichts passiert.</Empty>;
  return (
    <Card className="divide-y divide-neutral-100 adark:divide-neutral-800">
      {items.map((a, i) => (
        <div key={i} className="px-4 py-3 flex items-start gap-3 text-sm">
          <span className="w-20 shrink-0 text-xs text-neutral-500 adark:text-neutral-400 pt-0.5">
            {a.type === 'user' ? 'Neues Konto' : a.type === 'ride' ? 'Neue Fahrt' : a.reply ? 'Antwort' : 'Kommentar'}
          </span>
          <div className="flex-1 min-w-0">
            <Link href={channelHref(a.userId)} className="font-medium hover:underline">{a.who || 'Unbekannt'}</Link>
            {a.type === 'ride' && (
              <> hat <a href={`/?route=${encodeURIComponent(a.routeId!)}`} target="_blank" rel="noreferrer" className="hover:underline">„{a.title}“</a> angelegt
                {a.visibility && a.visibility !== 'public' && <span className="text-neutral-500 adark:text-neutral-400"> ({VISIBILITY_LABEL[a.visibility]})</span>}</>
            )}
            {a.type === 'comment' && (
              <>
                {' '}bei <Num>{formatCommentTime(a.seconds ?? 0)}</Num>:{' '}
                <a href={`/?route=${encodeURIComponent(a.routeId!)}&t=${a.seconds ?? 0}`} target="_blank" rel="noreferrer" className="text-neutral-700 adark:text-neutral-300 hover:underline">„{a.text}“</a>
              </>
            )}
            {a.type === 'user' && <> hat sich angemeldet</>}
          </div>
          <span className="shrink-0 text-xs text-neutral-500 adark:text-neutral-400">{timeAgo(a.at)}</span>
        </div>
      ))}
    </Card>
  );
}

// ── Nutzer ──────────────────────────────────────────────────────────────────
function UsersTab({ users }: { users: AdminUser[] }) {
  if (!users.length) return <Empty>Noch keine Konten.</Empty>;
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-neutral-500 adark:text-neutral-400 border-b border-neutral-200 adark:border-neutral-800">
          <tr>
            <th className="px-4 py-2.5 font-normal">Konto</th>
            <th className="px-4 py-2.5 font-normal">E-Mail</th>
            <th className="px-4 py-2.5 font-normal">Dabei seit</th>
            <th className="px-4 py-2.5 font-normal">Zuletzt angemeldet</th>
            <th className="px-4 py-2.5 font-normal text-right">Fahrten</th>
            <th className="px-4 py-2.5 font-normal text-right">Kommentare</th>
            <th className="px-4 py-2.5 font-normal text-right">Likes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 adark:divide-neutral-800">
          {users.map(u => (
            <tr key={u.id}>
              <td className="px-4 py-2.5">
                <Link href={channelHref(u.id)} className="flex items-center gap-2 hover:underline">
                  {u.picture ? <img src={u.picture} alt="" className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" /> : <span className="w-6 h-6 rounded-full bg-neutral-200 adark:bg-neutral-700" />}
                  <span className="font-medium">{u.name || 'Ohne Namen'}</span>
                  {u.founder && <span className="text-[10px] px-1.5 py-0.5 rounded border border-black adark:border-white">Betreiber</span>}
                </Link>
              </td>
              <td className="px-4 py-2.5 text-neutral-600 adark:text-neutral-400">{u.email}</td>
              <td className="px-4 py-2.5"><Num>{fmtDate(u.createdAt)}</Num></td>
              <td className="px-4 py-2.5 text-neutral-600 adark:text-neutral-400">{u.lastSignIn ? timeAgo(u.lastSignIn) : '–'}</td>
              <td className="px-4 py-2.5 text-right"><Num>{u.rides}</Num></td>
              <td className="px-4 py-2.5 text-right"><Num>{u.comments}</Num></td>
              <td className="px-4 py-2.5 text-right"><Num>{u.likes}</Num></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ── Fahrten ─────────────────────────────────────────────────────────────────
function RoutesTab({ routes, onChanged }: { routes: AdminRoute[]; onChanged: () => void }) {
  const [filter, setFilter] = useState<'all' | 'public' | 'unlisted' | 'private'>('all');
  const shown = routes.filter(r => !r.hidden && (filter === 'all' || r.visibility === filter));

  async function setVisibility(id: string, v: string) {
    const { error } = await supabase().rpc('admin_set_route_visibility', { route: id, new_visibility: v });
    if (error) alert(`Hat nicht geklappt: ${error.message}`);
    else onChanged();
  }

  return (
    <div>
      <div className="mb-4">
        <Segmented value={filter} onChange={setFilter} options={[
          { id: 'all', label: 'Alle' }, { id: 'public', label: 'Öffentlich' }, { id: 'unlisted', label: 'Nicht gelistet' }, { id: 'private', label: 'Privat' },
        ]} />
      </div>
      {shown.length === 0 ? <Empty>Keine Fahrten.</Empty> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-500 adark:text-neutral-400 border-b border-neutral-200 adark:border-neutral-800">
              <tr>
                <th className="px-4 py-2.5 font-normal">Fahrt</th>
                <th className="px-4 py-2.5 font-normal">Von</th>
                <th className="px-4 py-2.5 font-normal">Angelegt</th>
                <th className="px-4 py-2.5 font-normal text-right">Likes</th>
                <th className="px-4 py-2.5 font-normal text-right">Komm.</th>
                <th className="px-4 py-2.5 font-normal text-right">Bewertung</th>
                <th className="px-4 py-2.5 font-normal text-right">Meldungen</th>
                <th className="px-4 py-2.5 font-normal">Sichtbarkeit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 adark:divide-neutral-800">
              {shown.map(r => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 max-w-[22rem]">
                    <a href={`/?route=${encodeURIComponent(r.id)}`} target="_blank" rel="noreferrer" className="block truncate font-medium hover:underline">{r.title ?? r.id}</a>
                  </td>
                  <td className="px-4 py-2.5 text-neutral-600 adark:text-neutral-400 whitespace-nowrap">{r.owner ?? '–'}</td>
                  <td className="px-4 py-2.5"><Num>{fmtDate(r.createdAt)}</Num></td>
                  <td className="px-4 py-2.5 text-right"><Num>{r.likes}</Num></td>
                  <td className="px-4 py-2.5 text-right"><Num>{r.comments}</Num></td>
                  <td className="px-4 py-2.5 text-right"><Num>{r.rating != null ? r.rating.toLocaleString('de-DE', { minimumFractionDigits: 1 }) : '–'}</Num></td>
                  <td className="px-4 py-2.5 text-right"><Num className={r.reports ? 'text-red-700 font-semibold' : ''}>{r.reports}</Num></td>
                  <td className="px-4 py-2.5">
                    <select
                      value={r.visibility}
                      onChange={e => setVisibility(r.id, e.target.value)}
                      className="h-8 px-2 rounded-md border border-neutral-300 adark:border-neutral-700 bg-white adark:bg-neutral-900 text-sm"
                    >
                      <option value="public">Öffentlich</option>
                      <option value="unlisted">Nicht gelistet</option>
                      <option value="private">Privat</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
