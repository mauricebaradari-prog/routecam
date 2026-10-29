import { useEffect, useState } from 'react';
import { ROUTES, type RouteConfig } from '@/hooks/useEditorState';
import { simplifyTrack, sampleElevation, type TrackPoint } from '@/lib/track';
import { buildTimeline } from '@/lib/trackSync';
import { applyPlaceNamesAll } from '@/lib/placeNames';
import { withOwner } from '@/lib/channels';

// INTERIM STORAGE: routes created via "Anlegen" live in this browser's localStorage
// until accounts + database exist (see 07_TODO.md). Only visible in this browser.
const STORAGE_KEY = 'routecam.userRoutes';
const DELETED_KEY = 'routecam.deletedRoutes'; // ids of built-in routes hidden via "Löschen"
const CHANGE_EVENT = 'routecam:userRoutes';

function loadDeletedIds(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(DELETED_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// Built-in routes + routes created in this browser, minus deleted ones.
export function loadAllRoutes(): RouteConfig[] {
  const deleted = new Set(loadDeletedIds());
  return applyPlaceNamesAll([...ROUTES, ...loadUserRoutes()].filter(r => !deleted.has(r.id)));
}

// User routes are removed from storage; built-in routes (defined in code) can only be hidden.
export function deleteRoute(id: string) {
  try {
    if (loadUserRoutes().some(r => r.id === id)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(loadUserRoutes().filter(r => r.id !== id)));
    } else {
      localStorage.setItem(DELETED_KEY, JSON.stringify([...new Set([...loadDeletedIds(), id])]));
    }
  } catch {}
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function loadUserRoutes(): RouteConfig[] {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveUserRoute(input: RouteConfig) {
  const route = withOwner(input); // new rides belong to the signed-in account's channel
  const list = loadUserRoutes().filter(r => r.id !== route.id);
  list.push(route);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    throw new Error('Der lokale Speicher des Browsers ist voll.');
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// All visible routes (built-in + own, without deleted). Before mount: built-in only.
export function useAllRoutes(): RouteConfig[] {
  const [routes, setRoutes] = useState<RouteConfig[]>(ROUTES);
  useEffect(() => {
    const sync = () => setRoutes(loadAllRoutes());
    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return routes;
}

export function onUserRoutesChange(cb: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
    window.removeEventListener('storage', cb);
  };
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

// Update one field set of an own route (e.g. the sync offset from the sync editor)
export function updateUserRoute(id: string, patch: Partial<RouteConfig>) {
  const route = loadUserRoutes().find(r => r.id === id);
  if (!route) return;
  saveUserRoute({ ...route, ...patch });
}
