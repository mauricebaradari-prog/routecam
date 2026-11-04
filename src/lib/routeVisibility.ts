import { k } from '@/lib/i18nKey';
import { useCallback } from 'react';
import { useDb } from '@/lib/db';
import { patchRouteRow } from '@/lib/userRoutes';

// Visibility of a route on RouteCam itself (not the YouTube video):
//   public   – listed in the route menu and on the map
//   unlisted – hidden from the menu/map, but reachable via direct link (/?route=<id>)
//   private  – only visible to the owner (dashboard)
export type Visibility = 'public' | 'unlisted' | 'private';

export const VISIBILITY_OPTIONS: { value: Visibility; label: string; hint: string }[] = [
  { value: 'private',  label: k('Privat'),         hint: k('Nur du kannst die Route sehen') },
  { value: 'unlisted', label: k('Nicht gelistet'), hint: k('Jeder mit dem Link kann die Route sehen') },
  { value: 'public',   label: k('Öffentlich'),     hint: k('Für alle sichtbar') },
];

export const DEFAULT_VISIBILITY: Visibility = 'public';

// Stored in routes.visibility (database). The database enforces it too: private rides are
// only delivered to their owner (Row Level Security).
export function useRouteVisibility() {
  const { routes } = useDb();

  const visibilityOf = useCallback(
    (routeId: string, fallback?: Visibility): Visibility => routes.find(r => r.id === routeId)?.visibility ?? fallback ?? DEFAULT_VISIBILITY,
    [routes],
  );

  const setVisibility = useCallback((routeId: string, v: Visibility) => {
    patchRouteRow(routeId, { visibility: v }).catch(e => alert(e.message));
  }, []);

  return { visibilityOf, setVisibility };
}
