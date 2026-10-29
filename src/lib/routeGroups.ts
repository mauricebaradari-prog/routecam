import { useCallback, useEffect, useState } from 'react';
import type { Visibility } from '@/lib/routeVisibility';

// Groups of routes (e.g. a trip "Zypern 2026" made of several rides).
//
// INTERIM STORAGE: localStorage until Supabase exists (see 07_TODO.md).

export interface RouteGroup {
  id: string;
  name: string;
  routeIds: string[];
  createdAt: string;
  updatedAt?: string;
  visibility?: Visibility; // default 'public'
}

const STORAGE_KEY = 'routecam.groups';
const CHANGE_EVENT = 'routecam:groups';

function load(): RouteGroup[] {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

const touch = (g: RouteGroup, patch: Partial<RouteGroup>): RouteGroup => ({ ...g, ...patch, updatedAt: new Date().toISOString() });

function save(groups: RouteGroup[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
  } catch {}
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// "vor 2 Tagen aktualisiert"
export function relativeTime(iso?: string): string {
  if (!iso) return '';
  const sec = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const units: [number, string, string][] = [
    [60, 'Sekunde', 'Sekunden'], [60, 'Minute', 'Minuten'], [24, 'Stunde', 'Stunden'],
    [7, 'Tag', 'Tagen'], [4.35, 'Woche', 'Wochen'], [12, 'Monat', 'Monaten'], [Infinity, 'Jahr', 'Jahren'],
  ];
  if (sec < 60) return 'gerade eben';
  let v = sec;
  for (let i = 0; i < units.length; i++) {
    const [size] = units[i];
    if (v < size || i === units.length - 1) {
      const n = Math.floor(v);
      const [, one, many] = units[i];
      return `vor ${n} ${n === 1 ? one : many}`;
    }
    v /= size;
  }
  return '';
}

export function useRouteGroups() {
  const [groups, setGroups] = useState<RouteGroup[]>([]);

  useEffect(() => {
    const sync = () => setGroups(load());
    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const createGroup = useCallback((name: string, routeIds: string[]): RouteGroup => {
    const group: RouteGroup = {
      id: `g-${Date.now().toString(36)}`,
      name: name.trim(),
      routeIds: [...new Set(routeIds)],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      visibility: 'public',
    };
    save([...load(), group]);
    return group;
  }, []);

  const addToGroup = useCallback((groupId: string, routeIds: string[]) => {
    save(load().map(g => (g.id === groupId ? touch(g, { routeIds: [...new Set([...g.routeIds, ...routeIds])] }) : g)));
  }, []);

  const removeFromGroup = useCallback((groupId: string, routeIds: string[]) => {
    save(load().map(g => (g.id === groupId ? touch(g, { routeIds: g.routeIds.filter(id => !routeIds.includes(id)) }) : g)));
  }, []);

  const renameGroup = useCallback((groupId: string, name: string) => {
    save(load().map(g => (g.id === groupId ? touch(g, { name: name.trim() }) : g)));
  }, []);

  const setGroupVisibility = useCallback((groupId: string, visibility: Visibility) => {
    save(load().map(g => (g.id === groupId ? touch(g, { visibility }) : g)));
  }, []);

  const deleteGroup = useCallback((groupId: string) => {
    save(load().filter(g => g.id !== groupId));
  }, []);

  const groupsOf = useCallback((routeId: string) => groups.filter(g => g.routeIds.includes(routeId)), [groups]);

  return { groups, groupsOf, createGroup, addToGroup, removeFromGroup, renameGroup, setGroupVisibility, deleteGroup };
}
