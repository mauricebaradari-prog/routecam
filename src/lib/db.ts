import { useSyncExternalStore } from 'react';
import type { RouteConfig } from '@/hooks/useEditorState';
import { supabase } from '@/lib/supabase';

// Central copy of the database in the browser.
//
// Everything the app shows (rides, likes, comments, groups …) is loaded from Supabase into
// this store once, refreshed when the tab gets focus and every minute, and kept in sync
// after own changes. The lib/* modules read from it synchronously – that is why their hook
// APIs didn't have to change when localStorage was replaced by the database.
// A snapshot of the last state is kept in localStorage, so a reload shows the rides at once.

export interface Profile { id: string; name: string; picture: string | null; slug: string | null; is_founder: boolean }
export interface PlaceNamesRow { start?: string; end?: string; title?: string }
export type VisibilityValue = 'public' | 'unlisted' | 'private';
export interface RouteRow {
  id: string; owner_id: string; visibility: VisibilityValue; config: RouteConfig;
  place_names: PlaceNamesRow | null; hidden: boolean; created_at: string; updated_at: string;
}
export interface LikeRow { route_id: string; user_id: string }
export interface RatingRow { route_id: string; user_id: string; stars: number }
export interface RouteReportRow { route_id: string; reason: string; note: string | null; created_at: string }
export interface CommentRow {
  id: string; route_id: string; author_id: string; parent_id: string | null; seconds: number;
  text: string; created_at: string; edited_at: string | null;
}
export interface CommentReportRow { id: string; comment_id: string | null }
export interface GroupRow {
  id: string; owner_id: string; name: string; route_ids: string[]; visibility: VisibilityValue;
  created_at: string; updated_at: string;
}
export interface NotificationRow {
  id: string; user_id: string; actor_id: string | null; kind: 'comment' | 'like' | 'rating'; route_id: string;
  seconds: number | null; text: string | null; stars: number | null; read: boolean; created_at: string;
}

export interface DbState {
  loaded: boolean;        // first load from the database finished
  authReady: boolean;     // the stored login has been checked
  me: Profile | null;     // signed-in account
  email: string;
  authError: string;
  profiles: Record<string, Profile>;
  routes: RouteRow[];
  likes: LikeRow[];
  ratings: RatingRow[];
  comments: CommentRow[];
  groups: GroupRow[];
  myRouteReports: RouteReportRow[];   // reports I made
  reportsOnMine: RouteReportRow[];    // reports on my rides (without reporter)
  myCommentReports: CommentReportRow[];
  notifications: NotificationRow[];
}

const EMPTY: DbState = {
  loaded: false, authReady: false, me: null, email: '', authError: '',
  profiles: {}, routes: [], likes: [], ratings: [], comments: [], groups: [],
  myRouteReports: [], reportsOnMine: [], myCommentReports: [], notifications: [],
};

export const DB_EVENT = 'routecam:db';
// events the app listened to before the database existed – fired for the parts that changed,
// so e.g. a new like doesn't make the map rebuild all ride markers
const LEGACY_EVENTS: Partial<Record<keyof DbState, string[]>> = {
  me: ['routecam:auth', 'routecam:userRoutes'],
  authReady: ['routecam:auth'],
  profiles: ['routecam:userRoutes'],
  routes: ['routecam:userRoutes', 'routecam:visibility'],
  likes: ['routecam:interactions'],
  ratings: ['routecam:interactions'],
  myRouteReports: ['routecam:interactions'],
  reportsOnMine: ['routecam:interactions'],
  comments: ['routecam:comments'],
  myCommentReports: ['routecam:commentReports'],
  groups: ['routecam:groups'],
  notifications: ['routecam:notifications'],
};
const SNAPSHOT_KEY = 'routecam.dbcache';
const SNAPSHOT_FIELDS = ['profiles', 'routes', 'likes', 'ratings', 'comments', 'groups'] as const;

let state: DbState = EMPTY;
const listeners = new Set<() => void>();
let started = false;

export function db(): DbState {
  if (typeof window !== 'undefined') start();
  return state;
}

export function setDb(patch: Partial<DbState>) {
  // leave out what didn't change (a refresh usually brings the same data again)
  const keys = (Object.keys(patch) as (keyof DbState)[]).filter(k => JSON.stringify(patch[k]) !== JSON.stringify(state[k]));
  if (!keys.length) return;
  const changed: Partial<DbState> = {};
  for (const k of keys) (changed as Record<string, unknown>)[k] = patch[k];
  state = { ...state, ...changed };
  if (SNAPSHOT_FIELDS.some(k => keys.includes(k))) saveSnapshot();
  listeners.forEach(l => l());
  window.dispatchEvent(new Event(DB_EVENT));
  for (const ev of new Set(keys.flatMap(k => LEGACY_EVENTS[k] ?? []))) window.dispatchEvent(new Event(ev));
}

function subscribe(l: () => void) {
  start();
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useDb(): DbState {
  return useSyncExternalStore(subscribe, () => state, () => EMPTY);
}

function saveSnapshot() {
  try {
    const snap: Partial<DbState> = {};
    for (const k of SNAPSHOT_FIELDS) (snap as Record<string, unknown>)[k] = state[k];
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
  } catch {}
}

function loadSnapshot(): Partial<DbState> {
  try {
    const s = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || 'null');
    return s && typeof s === 'object' ? s : {};
  } catch {
    return {};
  }
}

// German message for a failed database call
export function dbError(e: unknown, fallback = 'Speichern hat nicht geklappt. Bitte versuch es noch einmal.'): Error {
  const msg = (e as { message?: string })?.message || '';
  console.error('[db]', msg || e);
  if (/JWT|not authenticated|permission denied|row-level security/i.test(msg)) return new Error('Bitte melde dich erneut an – deine Sitzung ist abgelaufen.');
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return new Error('Keine Verbindung zum Server. Bitte prüfe dein Internet.');
  return new Error(fallback);
}

// ── Loading ─────────────────────────────────────────────────────────────────
let refreshing: Promise<void> | null = null;

export function refresh(): Promise<void> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const sb = supabase();
    const me = state.me;
    const [profiles, routes, likes, ratings, comments, groups, mine] = await Promise.all([
      sb.from('profiles').select('id,name,picture,slug,is_founder'),
      sb.from('routes').select('*'),
      sb.from('likes').select('route_id,user_id'),
      sb.from('ratings').select('route_id,user_id,stars'),
      sb.from('comments').select('*').order('seconds'),
      sb.from('route_groups').select('*').order('created_at'),
      me ? Promise.all([
        sb.from('route_reports').select('route_id,reason,note,created_at'),
        sb.rpc('my_route_reports'),
        sb.from('comment_reports').select('id,comment_id'),
        sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(200),
      ]) : null,
    ]);
    const firstError = [profiles, routes, likes, ratings, comments, groups, ...(mine ?? [])].find(r => r.error)?.error;
    if (firstError) throw firstError;
    const map: Record<string, Profile> = {};
    for (const p of (profiles.data ?? []) as Profile[]) map[p.id] = p;
    setDb({
      loaded: true,
      profiles: map,
      me: me ? map[me.id] ?? me : null,
      routes: (routes.data ?? []) as RouteRow[],
      likes: (likes.data ?? []) as LikeRow[],
      ratings: (ratings.data ?? []) as RatingRow[],
      comments: (comments.data ?? []) as CommentRow[],
      groups: (groups.data ?? []) as GroupRow[],
      myRouteReports: (mine?.[0].data ?? []) as RouteReportRow[],
      reportsOnMine: (mine?.[1].data ?? []) as RouteReportRow[],
      myCommentReports: (mine?.[2].data ?? []) as CommentReportRow[],
      notifications: (mine?.[3].data ?? []) as NotificationRow[],
    });
  })()
    .catch(e => { console.error('[db] refresh failed', e); setDb({ loaded: true }); })
    .finally(() => { refreshing = null; });
  return refreshing;
}

async function applySession(user: { id: string; email?: string } | null) {
  if (!user) {
    setDb({ me: null, email: '', authReady: true, myRouteReports: [], reportsOnMine: [], myCommentReports: [], notifications: [] });
    await refresh(); // private rides of the previous account disappear
    return;
  }
  const { data } = await supabase().from('profiles').select('id,name,picture,slug,is_founder').eq('id', user.id).maybeSingle();
  const me: Profile = (data as Profile | null) ?? { id: user.id, name: user.email?.split('@')[0] ?? '', picture: null, slug: null, is_founder: false };
  setDb({ me, email: user.email ?? '', authReady: true, authError: '' });
  await refresh();
  // rides, comments … saved in this browser before the database existed
  import('@/lib/importLocal').then(m => m.importLocalData()).catch(e => console.error('[import]', e));
}

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  state = { ...state, ...loadSnapshot() };
  const sb = supabase();
  let lastUser: string | null | undefined;
  sb.auth.onAuthStateChange((_event, session) => {
    const u = session?.user ?? null;
    if ((u?.id ?? null) === lastUser) return; // token refresh – same account
    lastUser = u?.id ?? null;
    // (callbacks must not await Supabase calls directly – run them after the event)
    setTimeout(() => { applySession(u ? { id: u.id, email: u.email } : null); }, 0);
  });
  window.addEventListener('focus', () => { if (state.loaded) refresh(); });
  setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 60_000);
}
