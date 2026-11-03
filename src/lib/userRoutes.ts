import { useEffect, useState } from 'react';
import { ROUTES, type RouteConfig } from '@/hooks/useEditorState';
import { simplifyTrack, sampleElevation, type TrackPoint } from '@/lib/track';
import { buildTimeline } from '@/lib/trackSync';
import { applyPlaceNamesAll } from '@/lib/placeNames';
import { ownerFromId } from '@/lib/channels';
import { db, dbError, setDb, type RouteRow } from '@/lib/db';
import { supabase } from '@/lib/supabase';

// Rides: the built-in rides (src/data/routes.ts) plus the rides in the database (table
// `routes`). A database row with a built-in id overrides that ride (the founder renamed,
// hid or re-sync'ed it). Reads are synchronous from the store in lib/db.ts.
const CHANGE_EVENT = 'routecam:userRoutes';

const isBuiltIn = (id: string) => ROUTES.some(r => r.id === id);

function rowToRoute(r: RouteRow): RouteConfig {
  return { ...r.config, id: r.id, visibility: r.visibility, owner: ownerFromId(r.owner_id), createdAt: r.config.createdAt ?? r.created_at };
}

// What goes into routes.config: the ride without the parts that live in their own columns
export function configOf(route: RouteConfig): RouteConfig {
  const { owner: _o, visibility: _v, originalName: _n, placeOriginal: _p, ...rest } = route;
  void _o; void _v; void _n; void _p;
  return rest as RouteConfig;
}

// Built-in rides + rides from the database, minus hidden ones.
export function loadAllRoutes(): RouteConfig[] {
  const rows = new Map(db().routes.map(r => [r.id, r]));
  const builtIn = ROUTES.map(b => { const row = rows.get(b.id); return row ? rowToRoute(row) : b; });
  const created = db().routes.filter(r => !isBuiltIn(r.id)).map(rowToRoute);
  return applyPlaceNamesAll([...builtIn, ...created].filter(r => !rows.get(r.id)?.hidden));
}

// Rides of the signed-in account that were created in the app
export function loadUserRoutes(): RouteConfig[] {
  const me = db().me?.id;
  return me ? db().routes.filter(r => r.owner_id === me && !isBuiltIn(r.id)).map(rowToRoute) : [];
}

// Change the database row of a ride. A built-in ride gets its row on the first change –
// only the founder may do that (the database refuses everyone else).
export async function patchRouteRow(id: string, patch: Partial<Pick<RouteRow, 'visibility' | 'config' | 'place_names' | 'hidden'>>) {
  const me = db().me;
  if (!me) throw new Error('Bitte melde dich an.');
  const before = db().routes;
  const row = before.find(r => r.id === id);
  const sb = supabase();
  if (row) {
    setDb({ routes: before.map(r => (r.id === id ? { ...r, ...patch } : r)) });
    const { error } = await sb.from('routes').update(patch).eq('id', id);
    if (error) { setDb({ routes: before }); throw dbError(error); }
    return;
  }
  const builtIn = ROUTES.find(r => r.id === id);
  if (!builtIn || !me.is_founder) throw new Error('Diese Fahrt gehört nicht zu deinem Konto.');
  const now = new Date().toISOString();
  const fresh: RouteRow = { id, owner_id: me.id, visibility: 'public', config: configOf(builtIn), place_names: null, hidden: false, created_at: now, updated_at: now, ...patch };
  setDb({ routes: [...before, fresh] });
  const { error } = await sb.from('routes').insert({ id, visibility: fresh.visibility, config: fresh.config, place_names: fresh.place_names, hidden: fresh.hidden });
  if (error) { setDb({ routes: before }); throw dbError(error); }
}

// Delete a ride. Comments, likes, ratings and notifications go with it (database trigger);
// a built-in ride is only hidden.
export async function deleteRoute(id: string) {
  if (isBuiltIn(id)) return patchRouteRow(id, { hidden: true });
  const before = db().routes;
  setDb({
    routes: before.filter(r => r.id !== id),
    comments: db().comments.filter(c => c.route_id !== id),
    likes: db().likes.filter(l => l.route_id !== id),
    ratings: db().ratings.filter(r => r.route_id !== id),
    groups: db().groups.map(g => (g.route_ids.includes(id) ? { ...g, route_ids: g.route_ids.filter(x => x !== id) } : g)),
  });
  const { error } = await supabase().from('routes').delete().eq('id', id);
  if (error) { setDb({ routes: before }); throw dbError(error, 'Löschen hat nicht geklappt. Bitte versuch es noch einmal.'); }
}

// Save a new ride (or replace an own one) – belongs to the signed-in account.
export async function saveUserRoute(input: RouteConfig) {
  const me = db().me;
  if (!me) throw new Error('Bitte melde dich an, um eine Fahrt anzulegen.');
  const before = db().routes;
  const existing = before.find(r => r.id === input.id);
  const now = new Date().toISOString();
  const row: RouteRow = {
    id: input.id, owner_id: me.id, visibility: input.visibility ?? existing?.visibility ?? 'public',
    config: configOf(input), place_names: existing?.place_names ?? null, hidden: false,
    created_at: existing?.created_at ?? now, updated_at: now,
  };
  setDb({ routes: [...before.filter(r => r.id !== row.id), row] });
  const { error } = await supabase().from('routes').upsert({ id: row.id, visibility: row.visibility, config: row.config, place_names: row.place_names });
  if (error) { setDb({ routes: before }); throw dbError(error); }
}

// All visible routes (built-in + database, without hidden). Before mount: built-in only.
export function useAllRoutes(): RouteConfig[] {
  const [routes, setRoutes] = useState<RouteConfig[]>(ROUTES);
  useEffect(() => {
    const sync = () => setRoutes(loadAllRoutes());
    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    return () => window.removeEventListener(CHANGE_EVENT, sync);
  }, []);
  return routes;
}

export function onUserRoutesChange(cb: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, cb);
  return () => window.removeEventListener(CHANGE_EVENT, cb);
}

// A track becomes a route whose "cities" are the (simplified) track points, drawn
// as straight segments (no road routing) – the recorded line is already the road.
export function routeFromTrack(opts: {
  title: string;
  videoId: string;
  durationSeconds: number;
  points: TrackPoint[];
  syncOffset?: number;
}): RouteConfig {
  const id = `user-${Date.now().toString(36)}`;
  const pts = simplifyTrack(opts.points, 400);
  return {
    id,
    name: opts.title,
    cities: pts.map((p, i) => ({
      id: `${id}-p${i}`,
      name: i === 0 ? 'Start' : i === pts.length - 1 ? 'Ziel' : `P${i}`,
      country: '',
      lat: +p.lat.toFixed(6),
      lng: +p.lng.toFixed(6),
    })),
    videoId: opts.videoId,
    durationSeconds: opts.durationSeconds,
    routeColor: '#CCFF00',
    forceStraight: true,
    source: 'track',
    elevationSample: sampleElevation(opts.points),
    createdAt: new Date().toISOString(),
    timeline: buildTimeline(opts.points), // undefined when the file has no timestamps
    syncOffset: opts.syncOffset ?? 0,
    synced: false,
  };
}

// Update fields of an own ride (e.g. the sync offset from the sync editor)
export async function updateUserRoute(id: string, patch: Partial<RouteConfig>) {
  // the stored ride, without own place names applied (those live in their own column)
  const raw = db().routes.find(r => r.id === id)?.config ?? ROUTES.find(r => r.id === id);
  if (!raw) return;
  await patchRouteRow(id, { config: configOf({ ...raw, ...patch }) });
}
