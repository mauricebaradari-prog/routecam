import { useCallback, useMemo } from 'react';
import { db, dbError, setDb, useDb, type GroupRow } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import type { Visibility } from '@/lib/routeVisibility';
import { t, locale } from '@/lib/i18n';

// Groups of routes (e.g. a trip "Zypern 2026" made of several rides).
//
// Stored in the table `route_groups` (public/unlisted groups are readable by everyone,
// changed only by their owner).

export interface RouteGroup {
  id: string;
  ownerId: string;
  name: string;
  routeIds: string[];
  createdAt: string;
  updatedAt?: string;
  visibility?: Visibility; // default 'public'
}

const toGroup = (g: GroupRow): RouteGroup => ({
  id: g.id, ownerId: g.owner_id, name: g.name, routeIds: g.route_ids, createdAt: g.created_at, updatedAt: g.updated_at, visibility: g.visibility,
});

// Change one own group: shown at once, saved in the background, undone if saving fails
async function patchGroup(id: string, patch: Partial<Pick<GroupRow, 'name' | 'route_ids' | 'visibility'>>) {
  const before = db().groups;
  setDb({ groups: before.map(g => (g.id === id ? { ...g, ...patch, updated_at: new Date().toISOString() } : g)) });
  const { error } = await supabase().from('route_groups').update(patch).eq('id', id);
  if (error) { setDb({ groups: before }); alert(dbError(error).message); }
}

// "vor 2 Tagen" – in der Oberflächensprache (Aufrufer hängt „aktualisiert“ an)
export function relativeTime(iso?: string): string {
  if (!iso) return '';
  const sec = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return t('gerade eben');
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'second'], [60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Infinity, 'year'],
  ];
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  let v = sec;
  for (let i = 0; i < units.length; i++) {
    const [size, unit] = units[i];
    if (v < size || i === units.length - 1) return rtf.format(-Math.floor(v), unit);
    v /= size;
  }
  return '';
}

// groups = the signed-in account's own groups (menu, dashboard);
// allGroups = every group this visitor may see (channel pages).
export function useRouteGroups() {
  const { groups: rows, me } = useDb();
  const allGroups = useMemo(() => rows.map(toGroup), [rows]);
  const groups = useMemo(() => allGroups.filter(g => !!me && g.ownerId === me.id), [allGroups, me]);

  const createGroup = useCallback((name: string, routeIds: string[]): RouteGroup => {
    const s = db();
    const now = new Date().toISOString();
    const row: GroupRow = {
      id: `g-${crypto.randomUUID().replace(/-/g, '')}`, owner_id: s.me?.id ?? '', name: name.trim(),
      route_ids: [...new Set(routeIds)], visibility: 'public', created_at: now, updated_at: now,
    };
    if (s.me) {
      setDb({ groups: [...s.groups, row] });
      supabase().from('route_groups').insert({ id: row.id, name: row.name, route_ids: row.route_ids, visibility: row.visibility })
        .then(({ error }) => { if (error) { setDb({ groups: db().groups.filter(g => g.id !== row.id) }); alert(dbError(error).message); } });
    }
    return toGroup(row);
  }, []);

  const routeIdsOf = (groupId: string) => db().groups.find(g => g.id === groupId)?.route_ids ?? [];

  const addToGroup = useCallback((groupId: string, routeIds: string[]) => {
    patchGroup(groupId, { route_ids: [...new Set([...routeIdsOf(groupId), ...routeIds])] });
  }, []);

  const removeFromGroup = useCallback((groupId: string, routeIds: string[]) => {
    patchGroup(groupId, { route_ids: routeIdsOf(groupId).filter(id => !routeIds.includes(id)) });
  }, []);

  const renameGroup = useCallback((groupId: string, name: string) => {
    patchGroup(groupId, { name: name.trim() });
  }, []);

  const setGroupVisibility = useCallback((groupId: string, visibility: Visibility) => {
    patchGroup(groupId, { visibility });
  }, []);

  const deleteGroup = useCallback(async (groupId: string) => {
    const before = db().groups;
    setDb({ groups: before.filter(g => g.id !== groupId) });
    const { error } = await supabase().from('route_groups').delete().eq('id', groupId);
    if (error) { setDb({ groups: before }); alert(dbError(error).message); }
  }, []);

  const groupsOf = useCallback((routeId: string) => groups.filter(g => g.routeIds.includes(routeId)), [groups]);

  return { groups, allGroups, groupsOf, createGroup, addToGroup, removeFromGroup, renameGroup, setGroupVisibility, deleteGroup };
}
