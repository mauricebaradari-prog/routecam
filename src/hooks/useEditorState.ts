import { useState, useCallback, useRef, useEffect } from 'react';
import type { Visibility } from '@/lib/routeVisibility';
import type { TrackTimeline } from '@/lib/trackSync';
import { loadAllRoutes, onUserRoutesChange } from '@/lib/userRoutes';

export interface City {
  id: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
}

export type VehicleType = 'plane' | 'car' | 'boat' | 'walk';
export type { MapStyleId } from '@/lib/mapStyles';
import type { MapStyleId } from '@/lib/mapStyles';

export interface VehicleConfig {
  type: VehicleType;
  color: string;
  size: number; // 1-3
}

export interface RouteConfig {
  id: string;
  name: string;
  cities: City[];
  videoId: string;
  durationSeconds: number;
  routeColor: string;
  forceStraight?: boolean;
  visibility?: Visibility; // default: 'public'
  source?: 'track';          // created from an uploaded GPS file: points are drawn as straight segments
  elevationSample?: number[]; // for sparklines when the route is not in sparklines.json
  createdAt?: string;
  owner?: import('@/lib/channels').RouteOwner; // account whose channel the ride belongs to
  // video ↔ track sync (see src/lib/trackSync.ts): track time = video time + syncOffset
  timeline?: TrackTimeline;
  syncOffset?: number;
  synced?: boolean;
  // set by lib/placeNames.ts when own start/end names are applied (not stored)
  originalName?: string;
  placeOriginal?: { start: string; end: string };
}

export interface EditorState {
  routes: RouteConfig[];
  activeRouteId: string;
  // Derived from active route for backward compat
  cities: City[];
  vehicle: VehicleConfig;
  mapStyle: MapStyleId;
  animSpeed: number; // 0.5 – 4
  cameraMode: 'static' | 'follow' | 'orbit';
  durationSeconds: number;
  isAnimating: boolean;
  animationProgress: number; // 0-1 global across all legs
  globeAtmosphere: boolean;
  routeColor: string;
  forceStraight?: boolean;
  routeWidth: number;
  videoId: string;
  activeWindow: 'video' | 'elevation' | 'velocity' | 'compass' | 'community' | null;
}

export { ROUTES } from '@/data/routes';
import { ROUTES } from '@/data/routes';

// '' = no route selected (overview of all rides on the globe)
export const NO_ROUTE = '';
const EMPTY_ROUTE_FIELDS = { activeRouteId: NO_ROUTE, cities: [] as City[], durationSeconds: 0, videoId: '', routeColor: '#CCFF00' };


export function useEditorState() {
  const [state, setState] = useState<EditorState>(() => {
    // First load: no route selected – the map shows all rides, the user picks one
    const active = EMPTY_ROUTE_FIELDS;
    return {
      routes: ROUTES,
      activeRouteId: active.activeRouteId,
      cities: active.cities,
      vehicle: { type: 'plane', color: '#CCFF00', size: 2 },
      mapStyle: 'satellite',
      animSpeed: 1,
    cameraMode: 'orbit',
      durationSeconds: active.durationSeconds,
      isAnimating: false,
      animationProgress: 0,
      globeAtmosphere: true,
      routeColor: active.routeColor,
      routeWidth: 2,
      videoId: active.videoId,
      activeWindow: 'video',
    };
  });

  // Merge routes created in this browser ("Anlegen") into the built-in list
  useEffect(() => {
    const sync = () => setState(prev => {
      const routes = loadAllRoutes();
      if (prev.activeRouteId === NO_ROUTE) return { ...prev, routes };
      const act = routes.find(r => r.id === prev.activeRouteId);
      if (act) {
        // own start/end names (lib/placeNames.ts) → refresh the shown ride's waypoint names too
        const renamed = act.cities.length === prev.cities.length && act.cities.some((c, i) => c.name !== prev.cities[i].name);
        return renamed ? { ...prev, routes, cities: act.cities } : { ...prev, routes };
      }
      // active route was deleted → back to the overview
      return { ...prev, routes, ...EMPTY_ROUTE_FIELDS, isAnimating: false, animationProgress: 0 };
    });
    sync();
    return onUserRoutesChange(sync);
  }, []);

  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  const setMapStyle = useCallback((s: MapStyleId) => {
    setState((prev) => ({ ...prev, mapStyle: s }));
  }, []);

  const set = useCallback(<K extends keyof EditorState>(key: K, value: EditorState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setActiveWindow = useCallback((w: 'video' | 'elevation' | 'velocity' | 'compass' | 'community') => {
    setState((prev) => ({ ...prev, activeWindow: w }));
  }, []);

  const setActiveRoute = useCallback((routeId: string) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setState((prev) => {
      const route = prev.routes.find(r => r.id === routeId);
      if (!route) return { ...prev, ...EMPTY_ROUTE_FIELDS, isAnimating: false, animationProgress: 0 };
      return {
        ...prev,
        activeRouteId: routeId,
        cities: route.cities,
        durationSeconds: route.durationSeconds,
        routeColor: route.routeColor,
        videoId: route.videoId,
        isAnimating: false,
        animationProgress: 0,
      };
    });
  }, []);

  // Animation loop
  const startAnimation = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setState((prev) => {
      const progress = prev.animationProgress >= 1 ? 0 : prev.animationProgress;
      return { ...prev, isAnimating: true, animationProgress: progress };
    });
    lastTimeRef.current = null;

    const tick = (now: number) => {
      if (lastTimeRef.current === null) lastTimeRef.current = now;
      const dt = (now - lastTimeRef.current) / 1000;
      
      // Safety hatch: if dt is 0 or extremely small (e.g. synchronous call bug), ignore
      if (dt > 0.001) {
        lastTimeRef.current = now;
        setState((prev) => {
          if (!prev.isAnimating) return prev;
          const speed = prev.animSpeed / (prev.durationSeconds || 2056); // progress units per second
          const next = Math.min(1, prev.animationProgress + dt * speed);
          if (next >= 1) {
            return { ...prev, animationProgress: 1, isAnimating: false };
          }
          // Prevent React state thrashing if progress barely changed
          // Removed threshold check because long routes move less than 0.0001 per frame
          return { ...prev, animationProgress: next };
        });
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopAnimation = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setState((prev) => ({ ...prev, isAnimating: false }));
  }, []);

  const resetAnimation = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setState((prev) => ({ ...prev, isAnimating: false, animationProgress: 0 }));
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return {
    state,
    setMapStyle,
    set,
    setActiveRoute,
    setActiveWindow,
    startAnimation,
    stopAnimation,
    resetAnimation,
  };
}
