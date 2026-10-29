import { useCallback, useEffect, useState } from 'react';

// Visibility of a route on RouteCam itself (not the YouTube video):
//   public   – listed in the route menu and on the map
//   unlisted – hidden from the menu/map, but reachable via direct link (/?route=<id>)
//   private  – only visible to the owner (dashboard)
export type Visibility = 'public' | 'unlisted' | 'private';

export const VISIBILITY_OPTIONS: { value: Visibility; label: string; hint: string }[] = [
  { value: 'private',  label: 'Privat',         hint: 'Nur du kannst die Route sehen' },
  { value: 'unlisted', label: 'Nicht gelistet', hint: 'Jeder mit dem Link kann die Route sehen' },
  { value: 'public',   label: 'Öffentlich',     hint: 'Für alle sichtbar' },
];

export const DEFAULT_VISIBILITY: Visibility = 'public';

// INTERIM STORAGE: until accounts + database exist, the setting lives in this
// browser's localStorage. It therefore only affects this browser, not other visitors.
// Swap load/save for a database call later; the hook's API stays the same.
const STORAGE_KEY = 'routecam.visibility';
const CHANGE_EVENT = 'routecam:visibility';

type VisibilityMap = Record<string, Visibility>;

function load(): VisibilityMap {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as VisibilityMap;
  } catch {
    return {};
  }
}

function save(map: VisibilityMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {}
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useRouteVisibility() {
  const [map, setMap] = useState<VisibilityMap>({});

  useEffect(() => {
    const sync = () => setMap(load());
    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync); // other tabs
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const visibilityOf = useCallback(
    (routeId: string, fallback?: Visibility): Visibility => map[routeId] ?? fallback ?? DEFAULT_VISIBILITY,
    [map],
  );

  const setVisibility = useCallback((routeId: string, v: Visibility) => {
    save({ ...load(), [routeId]: v });
  }, []);

  return { visibilityOf, setVisibility };
}
