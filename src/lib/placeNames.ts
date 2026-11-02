import type { RouteConfig } from '@/hooks/useEditorState';

// Own names for the start and end point of a ride ("Start" → "Ouarzazate"), and an own title.
// Start/end replace the first/last waypoint name everywhere (map pins, search) and the
// "A → B" part of the route name shown in the navigation. A title, when set, is the ride's
// name everywhere (it wins over the "A → B" name).
//
// INTERIM STORAGE: like visibility and user routes this lives in this browser's
// localStorage until accounts + database exist.
const STORAGE_KEY = 'routecam.placeNames';
export const PLACE_NAMES_EVENT = 'routecam:userRoutes'; // same event as user routes → every route list refreshes

export interface PlaceNames { start?: string; end?: string; title?: string }
type PlaceNameMap = Record<string, PlaceNames>;

function load(): PlaceNameMap {
  try {
    const m = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return m && typeof m === 'object' ? m : {};
  } catch {
    return {};
  }
}

export function placeNamesOf(routeId: string): PlaceNames {
  return load()[routeId] ?? {};
}

/** Save own start/end names and title; empty strings reset to the original. */
export function setPlaceNames(routeId: string, names: PlaceNames) {
  const map = load();
  const start = names.start?.trim() || undefined;
  const end = names.end?.trim() || undefined;
  const title = names.title?.trim() || undefined;
  if (start || end || title) map[routeId] = { start, end, title };
  else delete map[routeId];
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch {}
  window.dispatchEvent(new Event(PLACE_NAMES_EVENT));
}

/** Route with the own start/end names applied (returns the same object when there are none). */
export function applyPlaceNames(route: RouteConfig, map: PlaceNameMap = load()): RouteConfig {
  const o = map[route.id];
  if (!o || (!o.start && !o.end && !o.title) || route.cities.length === 0) return route;
  const cities = route.cities.map(c => ({ ...c }));
  const first = cities[0], last = cities[cities.length - 1];
  const oldStart = first.name, oldEnd = last.name;
  if (o.start) first.name = o.start;
  if (o.end) last.name = o.end;

  // Name: keep a suffix like " (Fahrt 2)" when the name was built from the old place names,
  // otherwise (e.g. a YouTube title) the navigation shows "Start → Ziel".
  const prefix = `${oldStart} → ${oldEnd}`;
  const label = `${first.name} → ${last.name}`;
  const name = o.title
    ? o.title
    : !o.start && !o.end
      ? route.name
      : route.name.startsWith(prefix) ? label + route.name.slice(prefix.length) : label;
  return { ...route, cities, name, originalName: route.name, placeOriginal: { start: oldStart, end: oldEnd } };
}

export function applyPlaceNamesAll(routes: RouteConfig[]): RouteConfig[] {
  const map = load();
  return routes.map(r => applyPlaceNames(r, map));
}

/** Original (unchanged) start/end names of a route – for placeholders in the edit dialog. */
export function originalPlaceNames(route: RouteConfig): { start: string; end: string } {
  return route.placeOriginal ?? { start: route.cities[0]?.name ?? '', end: route.cities[route.cities.length - 1]?.name ?? '' };
}
