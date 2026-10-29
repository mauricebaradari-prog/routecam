'use client';

import React, { useRef, useEffect, useState } from 'react';
import { GripHorizontal, Gauge, Mountain, LocateFixed } from 'lucide-react';
//  { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { Rnd } from 'react-rnd';
import { lockIframes, unlockIframes } from '@/lib/dragGuard';
type MaplibreMap = maplibregl.Map;
type GeoJSONSource = maplibregl.GeoJSONSource;
import { City, VehicleConfig, MapStyleId } from '@/hooks/useEditorState';
import { greatCircleArc } from '@/lib/geo';
import { buildMapStyle } from '@/lib/mapStyles';
import { initials, formatCommentTime, type RouteComment } from '@/lib/routeComments';

function getDistance(p1: [number, number], p2: [number, number]) {
  const R = 6371e3;
  const rad = Math.PI / 180;
  const lat1 = p1[1] * rad;
  const lat2 = p2[1] * rad;
  const dLat = (p2[1] - p1[1]) * rad;
  const dLon = (p2[0] - p1[0]) * rad;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}


interface GlobeMapProps {
  cities: City[];
  routes?: { id: string; name: string; cities: City[]; videoId?: string; forceStraight?: boolean; source?: 'track'; }[];
  vehicle: VehicleConfig;
  mapStyle: MapStyleId;
  animationProgress: number; // 0-1
  isAnimating: boolean;
  cameraMode: 'static' | 'follow' | 'orbit';
  globeAtmosphere: boolean;
  routeColor: string;
  routeWidth: number;
  durationSeconds: number;
  /** start of the active route on screen + a point a little further along it (for the video window), key = route geometry */
  onPoint1Projected?: (x: number, y: number, dirX: number, dirY: number, key: string) => void;
  showElevation?: boolean;
  showVelocity?: boolean;
  useGpsTrace?: boolean;
  onSeek?: (progress: number) => void;
  comments?: RouteComment[]; // timed comments of the active route, shown as avatars on the line
  activeCommentIds?: string[]; // comments the vehicle is near – their bubbles are shown
  overlapBadges?: { progress: number; count: number; names: string[] }[]; // stretches other rides share
  onOverlapBadgeClick?: (progress: number) => void;
  focus?: { routeId: string; progress: number } | null; // fly the camera to this point of that route once its geometry is loaded (deep link ?t=)
  activeWindow?: 'video' | 'elevation' | 'velocity' | 'compass' | 'community' | null;
  setActiveWindow?: (w: 'video' | 'elevation' | 'velocity' | 'compass' | 'community') => void;
  onPlayRoute?: (routeId: string) => void;
  onStopRoute?: () => void;
  /** Click on empty map (not on the route, a marker or a badge) */
  onBackgroundClick?: () => void;
  // video ↔ route mapping (src/lib/trackSync.ts); identity when the ride isn't synced.
  // animationProgress already arrives as a route fraction – these convert comment times and hovers.
  timeToRoute?: (videoFraction: number) => number;
  routeToTime?: (routeFraction: number) => number;
  speedAt?: ((routeFraction: number) => number) | null; // real GPS speed, km/h
}


// Below this zoom the other rides are shown as count bubbles instead of lines + pins
const CLUSTER_ZOOM = 9;
const CLUSTER_RADIUS_PX = 72;

// Start view without a selected route: Paphos region, western Cyprus
const OVERVIEW_VIEW = { center: [32.47, 34.83] as [number, number], zoom: 10.2, pitch: 30, bearing: 0 };

// Smooths a polyline using Chaikin's algorithm
function smoothCoords(coords: [number, number][], iterations = 2): [number, number][] {
  if (coords.length < 3) return coords;
  let current = [...coords];
  for (let iter = 0; iter < iterations; iter++) {
    const next: [number, number][] = [];
    next.push(current[0]);
    for (let i = 0; i < current.length - 1; i++) {
      const p0 = current[i];
      const p1 = current[i + 1];
      const q = [0.75 * p0[0] + 0.25 * p1[0], 0.75 * p0[1] + 0.25 * p1[1]] as [number, number];
      const r = [0.25 * p0[0] + 0.75 * p1[0], 0.25 * p0[1] + 0.75 * p1[1]] as [number, number];
      next.push(q);
      next.push(r);
    }
    next.push(current[current.length - 1]);
    current = next;
  }
  return current;
}


function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;  
  const dLon = (lon2 - lon1) * Math.PI / 180; 
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
}

export default function GlobeMap({

  cities,
  routes,
  vehicle,
  mapStyle,
  animationProgress,
  isAnimating,
  cameraMode,
  globeAtmosphere,
  routeColor,
  routeWidth,
  durationSeconds,
  onPoint1Projected,
  showElevation = true,
  showVelocity = true,
  useGpsTrace = false,
  onSeek,
  comments = [],
  focus = null,
  activeCommentIds = [],
  overlapBadges = [],
  onOverlapBadgeClick,
  activeWindow,
  setActiveWindow,
  onPlayRoute,
  onStopRoute,
  onBackgroundClick,
  timeToRoute = (p: number) => p,
  routeToTime = (p: number) => p,
  speedAt = null,
}: GlobeMapProps) {
  const timeToRouteRef = useRef(timeToRoute);
  const routeToTimeRef = useRef(routeToTime);
  const speedAtRef = useRef(speedAt);
  timeToRouteRef.current = timeToRoute;
  routeToTimeRef.current = routeToTime;
  speedAtRef.current = speedAt;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const prevStyleRef = useRef<string | null>(null);
  const routeInitializedRef = useRef(false);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const routeMarkersRef = useRef<maplibregl.Marker[]>([]);
  const inactiveMarkersRef = useRef<maplibregl.Marker[]>([]);
  // per inactive ride: id, centre and bounds – used for the zoomed-out count bubbles
  const inactiveInfoRef = useRef<{ id: string; center: [number, number]; bbox: [[number, number], [number, number]] }[]>([]);
  const clusterMarkersRef = useRef<maplibregl.Marker[]>([]);
  const clusteredRef = useRef(false);
  const updateClustersRef = useRef<() => void>(() => {});
  const clusterPassRef = useRef(0);
  const initialCameraRef = useRef<{center: {lng: number, lat: number}, zoom: number, pitch: number, bearing: number, timestamp: number} | null>(null);
  // follow camera: last target + pending glide frame, so jumps (seek in the elevation profile,
  // click on the route, comments) animate instead of snapping
  const lastFollowTargetRef = useRef<[number, number] | null>(null);
  const glideFrameRef = useRef<number | null>(null);
  
  const renderPassRef = useRef<number>(0);
  const [elevationProfile, setElevationProfile] = React.useState<number[] | null>(null);
  const inactiveRouteCoordsRef = useRef<[number, number][][]>([]);
  const animProgressRef = useRef(animationProgress);

  // "Detached" = the user moved the map themselves. While detached, the camera stops
  // following the vehicle, and a button offers the way back to the current position.
  const [followDetached, setFollowDetachedState] = useState(false);
  const followDetachedRef = useRef(false);
  const setFollowDetached = (v: boolean) => {
    if (followDetachedRef.current === v) return;
    followDetachedRef.current = v;
    setFollowDetachedState(v);
  };
  const durationRef = useRef(durationSeconds);

  // ── Timed comments on the route (SoundCloud-style) ──
  const commentsRef = useRef<RouteComment[]>(comments);
  const onSeekRef = useRef(onSeek);
  const onBackgroundClickRef = useRef(onBackgroundClick);
  const onPoint1ProjectedRef = useRef(onPoint1Projected);
  onPoint1ProjectedRef.current = onPoint1Projected;
  onBackgroundClickRef.current = onBackgroundClick;
  // deselecting by clicking the map keeps the current camera (no fly-out to the overview)
  const keepCameraRef = useRef(false);
  onSeekRef.current = onSeek;
  const commentMarkersRef = useRef<{ id: string; marker: maplibregl.Marker; el: HTMLDivElement; progress: number }[]>([]);
  const activeCommentIdsRef = useRef<string[]>(activeCommentIds);

  // Position on the drawn route line at a fraction (0–1) of its length – the same
  // distance-linear mapping the vehicle uses.
  function pointOnRoute(p: number): [number, number] | null {
    const pts = fullRouteCoordsRef.current;
    if (pts.length < 2) return null;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + distance(pts[i - 1], pts[i]));
    const target = Math.max(0, Math.min(1, p)) * cum[cum.length - 1];
    let i = 1;
    while (i < cum.length - 1 && cum[i] < target) i++;
    const seg = cum[i] - cum[i - 1] || 1;
    const t = (target - cum[i - 1]) / seg;
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
  }

  function rebuildCommentMarkers() {
    const map = mapRef.current;
    commentMarkersRef.current.forEach(m => m.marker.remove());
    commentMarkersRef.current = [];
    const duration = durationRef.current;
    if (!map || !duration) return;
    for (const c of commentsRef.current) {
      const progress = timeToRouteRef.current(Math.min(1, c.seconds / duration));
      const at = pointOnRoute(progress);
      if (!at) continue;

      const el = document.createElement('div');
      el.className = 'rc-comment';
      const avatar = document.createElement('div');
      avatar.className = 'rc-avatar';
      avatar.style.background = c.color;
      avatar.textContent = initials(c.author);
      const bubble = document.createElement('div');
      bubble.className = 'rc-bubble';
      const head = document.createElement('div');
      head.className = 'rc-head';
      const who = document.createElement('span');
      who.textContent = c.author;
      const when = document.createElement('span');
      when.className = 'rc-time';
      when.textContent = formatCommentTime(c.seconds);
      head.append(who, when);
      const body = document.createElement('div');
      body.textContent = c.text;
      bubble.append(head, body);
      el.append(bubble, avatar);
      // Click: jump video + map to this moment
      el.addEventListener('click', e => { e.stopPropagation(); onSeekRef.current?.(progress); });

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(at).addTo(map);
      if (activeCommentIdsRef.current.includes(c.id)) el.classList.add('is-active');
      commentMarkersRef.current.push({ id: c.id, marker, el, progress });
    }
  }

  // Deep link focus: remembered until the route geometry is ready, then the camera flies there
  const focusRef = useRef<{ routeId: string; progress: number } | null>(null);
  useEffect(() => {
    if (!focus) return;
    focusRef.current = focus;
    // route already on screen (e.g. next comment of the same ride) → fly right away
    tryFocus(cities, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);
  function tryFocus(cs: City[], delay = 1300) {
    const f = focusRef.current;
    const map = mapRef.current;
    if (!f || !map) return;
    // only once the geometry on screen is the target route's
    const target = routes?.find(r => r.id === f.routeId);
    if (!target || target.cities[0]?.id !== cs[0]?.id || target.cities.length !== cs.length) return;
    if (!fullRouteCoordsRef.current.length || geometryKeyRef.current !== `${cs[0]?.id}:${cs.length}`) return;
    const at = pointOnRoute(f.progress);
    if (!at) return;
    focusRef.current = null;
    // after the initial fitBounds of the route has finished (delay 0: same route, fly now)
    setTimeout(() => {
      setFollowDetached(false);
      map.flyTo({ center: at, zoom: 15, pitch: 50, duration: 1800 });
    }, delay);
  }

  // ── Badges where other rides share the road ("⧉ 2") ──
  const overlapBadgesRef = useRef(overlapBadges);
  const onOverlapBadgeClickRef = useRef(onOverlapBadgeClick);
  onOverlapBadgeClickRef.current = onOverlapBadgeClick;
  const overlapMarkersRef = useRef<maplibregl.Marker[]>([]);
  function rebuildOverlapMarkers() {
    const map = mapRef.current;
    overlapMarkersRef.current.forEach(m => m.remove());
    overlapMarkersRef.current = [];
    if (!map) return;
    for (const b of overlapBadgesRef.current) {
      const at = pointOnRoute(b.progress);
      if (!at) continue;
      const el = document.createElement('button');
      el.className = 'rc-overlap';
      el.title = `Auch gefahren: ${b.names.join(', ')} – hierhin springen`;
      el.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>';
      const label = document.createElement('span');
      label.textContent = String(b.count + 1); // incl. the active ride
      el.appendChild(label);
      el.addEventListener('click', e => { e.stopPropagation(); onOverlapBadgeClickRef.current?.(b.progress); });
      overlapMarkersRef.current.push(new maplibregl.Marker({ element: el, anchor: 'center', offset: [0, -22] }).setLngLat(at).addTo(map));
    }
  }
  const overlapKey = overlapBadges.map(b => `${b.progress.toFixed(3)}:${b.count}`).join('|');
  useEffect(() => {
    overlapBadgesRef.current = overlapBadges;
    rebuildOverlapMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlapKey]);

  useEffect(() => {
    commentsRef.current = comments;
    durationRef.current = durationSeconds;
    rebuildCommentMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comments, durationSeconds, timeToRoute]);

  // Show the bubbles of the comments the vehicle is currently near (decided by the page)
  const activeKey = activeCommentIds.join(',');
  useEffect(() => {
    activeCommentIdsRef.current = activeCommentIds;
    for (const m of commentMarkersRef.current) m.el.classList.toggle('is-active', activeCommentIds.includes(m.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);
  
  const [isMobile, setIsMobile] = React.useState(false);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  useEffect(() => {
    animProgressRef.current = animationProgress;
    durationRef.current = durationSeconds;
  }, [animationProgress, durationSeconds]);

    const velocityTextRef = React.useRef<HTMLSpanElement>(null);
  const velocityNeedleRef = React.useRef<SVGGElement>(null);
  const headingTextRef = React.useRef<HTMLSpanElement>(null);
  const compassNeedleRef = React.useRef<SVGGElement>(null);
  const vehicleDotRef = React.useRef<HTMLDivElement>(null);
  const distanceBadgeRef = React.useRef<HTMLDivElement>(null);
  const distanceTextRef = React.useRef<HTMLSpanElement>(null);
  const distanceTimeRef = React.useRef<HTMLSpanElement>(null);
  const fullSvgPathRef = React.useRef<SVGPathElement>(null);
  const inactiveSvgPathRef = React.useRef<SVGPathElement>(null);
  const svgPathRef = React.useRef<SVGPathElement>(null);
  const osrmCacheRef = useRef<Record<string, [number, number][]>>({});
  
  useEffect(() => {
    try {
      const stored = localStorage.getItem('osrmCache');
      if (stored) {
        const parsed: Record<string, [number, number][]> = JSON.parse(stored);
        // drop broken single-point segments cached by an older greatCircleArc (see lib/geo.ts)
        for (const k of Object.keys(parsed)) if (!Array.isArray(parsed[k]) || parsed[k].length < 2) delete parsed[k];
        osrmCacheRef.current = parsed;
      }
    } catch(e) {}
  }, []);
  
  const saveOsrmCache = () => {
    try {
      localStorage.setItem('osrmCache', JSON.stringify(osrmCacheRef.current));
      window.dispatchEvent(new Event('routecam:geometry')); // lets the route-overlap detection recompute
    } catch(e) {}
  };

  const osrmDistCacheRef = useRef<Record<string, number[]>>({});
  const midLngLatRef = useRef<[number, number] | null>(null);
  const vehicleLngLatRef = useRef<[number, number] | null>(null);
  const totalDistRef = useRef<number>(0);
  const legDistancesRef = useRef<number[]>([]);
  
  const routeCoordsRef = useRef<GeoJSON.Feature[]>([]);
  const fullRouteCoordsRef = useRef<[number, number][]>([]);
  const geometryKeyRef = useRef(''); // which route the geometry above belongs to

  // Map event handlers (style.load) are registered once and would otherwise keep the
  // functions/values of the render they were created in. When the active route changes
  // while the style is still loading (e.g. returning to the map page in-app), the stale
  // closure drew the previous route. These always point to the latest render.
  const latestRef = useRef<{ cities: City[]; updateRouteData: typeof updateRouteData; rebuildMarkers: typeof rebuildMarkers; updateInactiveRoutes: typeof updateInactiveRoutes; fitAllRoutes: (map: MaplibreMap, duration: number) => void } | null>(null);

  // ── 1. Init Map ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    if (!mapRef.current) {
      let mapInstance: MaplibreMap;

      const styleUrl = buildMapStyle(mapStyle);

      // worker is served from public/ (see scripts/copy-maplibre-worker.mjs)
      maplibregl.setWorkerUrl('/routecam/maplibre/maplibre-gl-worker.mjs');
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: styleUrl,
        center: cities[0] ? [cities[0].lng, cities[0].lat] : OVERVIEW_VIEW.center,
        zoom: cities[0] ? 4 : OVERVIEW_VIEW.zoom,
        pitch: cities[0] ? 45 : OVERVIEW_VIEW.pitch,
        interactive: true,
      });

      // Zoom/compass control removed (not needed – zoom via scroll/pinch, compass lives in the Heading window)

      // Only user gestures carry an originalEvent – programmatic camera moves (follow cam, fitBounds) don't.
      const onUserMove = (e: any) => { if (e.originalEvent) setFollowDetached(true); };
      map.on('movestart', onUserMove);
      map.on('zoomstart', onUserMove);
      map.on('rotatestart', onUserMove);
      map.on('pitchstart', onUserMove);
      // While the follow cam moves the map every frame, MapLibre cancels drag gestures before
      // 'dragstart' fires – so pressing on the map is already the signal to let go.
      map.on('mousedown', () => setFollowDetached(true));
      map.on('touchstart', () => setFollowDetached(true));
      map.on('wheel', () => setFollowDetached(true));

      // ── Click anywhere on the active route → jump video + vehicle there ──
      // Nearest point on the drawn line in screen space; hovering shows a dot with the target time.
      const hoverEl = document.createElement('div');
      hoverEl.className = 'rc-route-hover';
      hoverEl.innerHTML = '<span class="rc-route-hover-dot"></span><span class="rc-route-hover-time"></span>';
      map.getContainer().appendChild(hoverEl);
      const hoverTime = hoverEl.querySelector('.rc-route-hover-time') as HTMLSpanElement;

      const nearestOnRoute = (pt: { x: number; y: number }, tolerancePx = 14) => {
        const coords = fullRouteCoordsRef.current;
        if (coords.length < 2) return null;
        const step = Math.max(1, Math.floor(coords.length / 1500));
        let best: { d: number; x: number; y: number; dist: number } | null = null;
        let acc = 0;
        let prev = coords[0];
        let prevPx = map.project(prev as [number, number]);
        for (let i = step; i < coords.length + step - 1; i += step) {
          const cur = coords[Math.min(i, coords.length - 1)];
          const curPx = map.project(cur as [number, number]);
          const segLen = distance(prev, cur);
          const dx = curPx.x - prevPx.x, dy = curPx.y - prevPx.y;
          const len2 = dx * dx + dy * dy;
          // skip segments wrapped across the globe's horizon
          if (len2 < (window.innerWidth / 2) ** 2) {
            const t = len2 ? Math.max(0, Math.min(1, ((pt.x - prevPx.x) * dx + (pt.y - prevPx.y) * dy) / len2)) : 0;
            const x = prevPx.x + t * dx, y = prevPx.y + t * dy;
            const d = Math.hypot(pt.x - x, pt.y - y);
            if (d <= tolerancePx && (!best || d < best.d)) best = { d, x, y, dist: acc + t * segLen };
          }
          acc += segLen;
          prev = cur;
          prevPx = curPx;
          if (i >= coords.length - 1) break;
        }
        return best && acc > 0 ? { x: best.x, y: best.y, progress: best.dist / acc } : null;
      };

      let hoverFrame = 0;
      map.on('mousemove', e => {
        cancelAnimationFrame(hoverFrame);
        hoverFrame = requestAnimationFrame(() => {
          const hit = nearestOnRoute(e.point);
          if (hit) {
            hoverEl.style.display = 'block';
            hoverEl.style.transform = `translate(${hit.x}px, ${hit.y}px)`;
            hoverTime.textContent = formatCommentTime(routeToTimeRef.current(hit.progress) * (durationRef.current || 0));
            map.getCanvas().style.cursor = 'pointer';
          } else {
            hoverEl.style.display = 'none';
            map.getCanvas().style.cursor = '';
          }
        });
      });
      map.on('mouseout', () => { hoverEl.style.display = 'none'; map.getCanvas().style.cursor = ''; });
      map.on('click', e => {
        const hit = nearestOnRoute(e.point, (e.originalEvent as any)?.pointerType === 'touch' ? 24 : 14);
        if (!hit) {
          // only real clicks on the map canvas – marker / badge clicks bubble up here too
          if ((e.originalEvent as any)?.target === map.getCanvas() && onBackgroundClickRef.current) {
            keepCameraRef.current = true;
            onBackgroundClickRef.current();
            setTimeout(() => { keepCameraRef.current = false; }, 500); // if nothing was deselected
          }
          return;
        }
        if (!onSeekRef.current) return;
        // follow the vehicle again (pressing the map had detached the camera)
        setFollowDetached(false);
        initialCameraRef.current = null;
        onSeekRef.current(hit.progress);
      });
      map.on('zoomend', () => updateClustersRef.current());
      map.on('moveend', () => updateClustersRef.current());
      mapInstance = map;
      mapRef.current = map;
      if (process.env.NODE_ENV !== "production") (window as any).__MAP = map;
      prevStyleRef.current = mapStyle;

      const updateSvgOverlay = () => {
        try {
          if (!mapRef.current) return;
          
          let fullPts = fullRouteCoordsRef.current;
          const currentProgress = animProgressRef.current;
          const currentDuration = durationRef.current;
          
          const onP1 = onPoint1ProjectedRef.current;
          if (currentProgress === 0 && fullPts.length > 0 && onP1) {
             const p1 = mapRef.current.project([fullPts[0][0], fullPts[0][1]]);
             // a point ~20 % along the route → in which direction the ride leaves the start
             const ahead = fullPts[Math.min(fullPts.length - 1, Math.max(1, Math.floor(fullPts.length * 0.2)))];
             const pa = mapRef.current.project([ahead[0], ahead[1]]);
             const key = geometryKeyRef.current;
             const last = (window as any)._lastP1;
             if (!last || last.key !== key || Math.abs(last.x - p1.x) > 10 || Math.abs(last.y - p1.y) > 10) {
               (window as any)._lastP1 = { x: p1.x, y: p1.y, key };
               Promise.resolve().then(() => onP1(p1.x, p1.y, pa.x, pa.y, key));
             }
          }
          
          // Decimate for performance
          const step = Math.max(1, Math.floor(fullPts.length / 500));
          const screenPts: string[] = [];
          let lastP: any = null;
          const pushPt = (p: any, arr: string[]) => {
              if (!lastP) arr.push(`M ${p.x},${p.y}`);
              else if (Math.hypot(p.x - lastP.x, p.y - lastP.y) > window.innerWidth / 2) arr.push(`M ${p.x},${p.y}`);
              else arr.push(`L ${p.x},${p.y}`);
              lastP = p;
          };
          for (let i = 0; i < fullPts.length; i += step) {
             const p = mapRef.current.project([fullPts[i][0], fullPts[i][1]]);
             pushPt(p, screenPts);
          }
          if (fullPts.length > 0 && (fullPts.length - 1) % step !== 0) {
             const p = mapRef.current.project([fullPts[fullPts.length - 1][0], fullPts[fullPts.length - 1][1]]);
             pushPt(p, screenPts);
          }
          if (fullSvgPathRef.current) {
             if (screenPts.length > 0) {
               fullSvgPathRef.current.setAttribute('d', screenPts.join(' '));
             } else {
               fullSvgPathRef.current.setAttribute('d', '');
             }
          }

          const inactiveSegments: string[] = [];
          for (const seg of (clusteredRef.current ? [] : inactiveRouteCoordsRef.current)) {
            const segPts: string[] = [];
            let lastP: any = null;
            for (const c of seg) {
              if (!mapRef.current) continue;
              const p = mapRef.current.project([c[0], c[1]]);
              if (!lastP) segPts.push(`M ${p.x},${p.y}`);
              else if (Math.hypot(p.x - lastP.x, p.y - lastP.y) > window.innerWidth / 2) segPts.push(`M ${p.x},${p.y}`);
              else segPts.push(`L ${p.x},${p.y}`);
              lastP = p;
            }
            if (segPts.length > 0) inactiveSegments.push(segPts.join(' '));
          }
          if (inactiveSvgPathRef.current) {
             inactiveSvgPathRef.current.setAttribute('d', inactiveSegments.join(' '));
          }

          const pts: string[] = [];
          let lastActiveP: any = null;
          routeCoordsRef.current.forEach((feat) => {
            if (feat.geometry.type === 'LineString') {
               const coords = feat.geometry.coordinates as [number, number][];
               const rStep = Math.max(1, Math.floor(coords.length / 500));
               for (let i = 0; i < coords.length; i += rStep) {
                 const p = mapRef.current!.project([coords[i][0], coords[i][1]]);
                 if (!lastActiveP) pts.push(`M ${p.x},${p.y}`);
                 else if (Math.hypot(p.x - lastActiveP.x, p.y - lastActiveP.y) > window.innerWidth / 2) pts.push(`M ${p.x},${p.y}`);
                 else pts.push(`L ${p.x},${p.y}`);
                 lastActiveP = p;
               }
               if (coords.length > 0 && (coords.length - 1) % rStep !== 0) {
                 const p = mapRef.current!.project([coords[coords.length - 1][0], coords[coords.length - 1][1]]);
                 if (!lastActiveP) pts.push(`M ${p.x},${p.y}`);
                 else if (Math.hypot(p.x - lastActiveP.x, p.y - lastActiveP.y) > window.innerWidth / 2) pts.push(`M ${p.x},${p.y}`);
                 else pts.push(`L ${p.x},${p.y}`);
                 lastActiveP = p;
               }
            }
          });
          if (svgPathRef.current) {
            if (pts.length > 0) {
              svgPathRef.current.setAttribute('d', pts.join(' '));
            } else {
              svgPathRef.current.setAttribute('d', '');
            }
          }

          if (vehicleLngLatRef.current) {
             const p = mapRef.current.project(vehicleLngLatRef.current);
             
             if (vehicleDotRef.current) {
                 vehicleDotRef.current.style.transform = `translate(${p.x}px, ${p.y}px)`;
                 vehicleDotRef.current.style.display = 'block';
             }
             
             let displayDist = totalDistRef.current / 1000;
             let displaySecs = currentDuration;
             
             if (currentProgress > 0) {
               displayDist = displayDist * currentProgress;
               displaySecs = currentDuration * (1 - routeToTimeRef.current(currentProgress));
             }
             
             const distKm = displayDist.toFixed(0);
             const m = Math.floor(displaySecs / 60);
             const s = Math.floor(displaySecs % 60);

             if (velocityTextRef.current) {
                const exactIdx = currentProgress * (fullPts.length - 1);
                const pIdx = Math.min(Math.floor(exactIdx), fullPts.length - 2);
                const wp1 = fullPts[pIdx];
                const wp2 = fullPts[pIdx + 1];
                let segDistKm = 0;
                if (wp1 && wp2) {
                   segDistKm = getDistanceKm(wp1[1], wp1[0], wp2[1], wp2[0]);
                }
                const timeSecs = currentDuration / Math.max(1, fullPts.length - 1);
                let speedKmh = speedAtRef.current ? speedAtRef.current(currentProgress) : (segDistKm / timeSecs) * 3600;
                
                 // Extremely simple low-pass filter for smooth velocity numbers
                 if (!(window as any)._smoothSpeed || Math.abs((window as any)._smoothSpeed - speedKmh) > 50) {
                     (window as any)._smoothSpeed = speedKmh;
                 } else {
                     (window as any)._smoothSpeed = (window as any)._smoothSpeed * 0.95 + speedKmh * 0.05;
                 }
                 
                 const currentSpeed = (window as any)._smoothSpeed;
                 velocityTextRef.current.textContent = `${Math.round(currentSpeed)}`;
                 if (velocityNeedleRef.current) {
                     // Map 0 - 150 km/h to -90 to +90 degrees
                     const clampedSpeed = Math.max(0, Math.min(150, currentSpeed));
                     const angle = -90 + (clampedSpeed / 150) * 180;
                     velocityNeedleRef.current.style.transform = `rotate(${angle}deg)`;
                 }
             }

             if (headingTextRef.current || compassNeedleRef.current) {
                 const exactIdx = currentProgress * (fullPts.length - 1);
                 const pIdx = Math.min(Math.floor(exactIdx), fullPts.length - 2);
                 const wp1 = fullPts[pIdx];
                 const wp2 = fullPts[pIdx + 1];
                 if (wp1 && wp2) {
                     const rawHeading = headingOnPath(fullPts, currentProgress);
                     let normalized = rawHeading < 0 ? rawHeading + 360 : rawHeading;
                     
                     if ((window as any)._smoothHeading === undefined) {
                         (window as any)._smoothHeading = normalized;
                     } else {
                         let diff = normalized - (window as any)._smoothHeading;
                         // Handle wraparound for shortest path
                         while (diff > 180) diff -= 360;
                         while (diff < -180) diff += 360;
                         (window as any)._smoothHeading += diff * 0.05;
                     }
                     
                     const currentHeading = (window as any)._smoothHeading;

                     if (compassNeedleRef.current) {
                         compassNeedleRef.current.style.transform = `rotate(${currentHeading}deg)`;
                     }
                     if (headingTextRef.current) {
                         const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"];
                         let displayHeading = Math.round(currentHeading) % 360;
                         if (displayHeading < 0) displayHeading += 360;
                         const idx = Math.round(displayHeading / 45) % 8;
                         headingTextRef.current.textContent = `${dirs[idx]} ${displayHeading}°`;
                     }
                 }
             }
             
             if (distanceBadgeRef.current && distanceTextRef.current && distanceTimeRef.current) {
                 distanceBadgeRef.current.style.transform = `translate(${p.x}px, ${p.y}px)`;
                 distanceBadgeRef.current.style.display = 'flex';
                 distanceTextRef.current.textContent = `${distKm} km`;
                 distanceTimeRef.current.textContent = `${m}m ${s}s`;
             }
          } else {
             if (velocityTextRef.current) velocityTextRef.current.textContent = "0";
             if (velocityNeedleRef.current) velocityNeedleRef.current.style.transform = 'rotate(-90deg)';
             if (vehicleDotRef.current) vehicleDotRef.current.style.display = 'none';
             if (distanceBadgeRef.current) distanceBadgeRef.current.style.display = 'none';
          }
        } catch (e) {
           console.error(e);
        }
      };
      (window as any)._updateSvgOverlay = updateSvgOverlay;

      map.on('move', updateSvgOverlay);
      map.on('zoom', updateSvgOverlay);
      map.on('pitch', updateSvgOverlay);
      // map.on('render', updateSvgOverlay); removed to prevent infinite loops

      map.once('style.load', () => {
        (map as any).setProjection({ type: 'globe' });
        try {
          if (globeAtmosphere && (map as any).setFog) {
             (map as any).setFog({
               color: 'rgba(255, 255, 255, 0.2)',
               'high-color': 'rgba(0, 0, 0, 0.8)',
               'space-color': 'rgba(0, 0, 0, 1)'
             });
          }
        } catch (e) {}

        initRouteLayers(map, routeColor, routeWidth);
        routeInitializedRef.current = true;
        const L = latestRef.current!;
        const cs = L.cities;
        L.updateRouteData(map, ++renderPassRef.current);
        L.rebuildMarkers(map, cs);
        L.updateInactiveRoutes(map);
        if (cs.length >= 2) {
          const lats = cs.map((c) => c.lat);
          const lngs = cs.map((c) => c.lng);
          const minLat = Math.min(...lats);
          const maxLat = Math.max(...lats);
          const minLng = Math.min(...lngs);
          const maxLng = Math.max(...lngs);
          map.fitBounds(
            [
              [minLng, minLat],
              [maxLng, maxLat],
            ],
            { padding: 50, duration: 1200, maxZoom: 13 }
          );
        } else {
          latestRef.current?.fitAllRoutes(map, 0);
        }
      });

      return () => {
        map.remove();
        mapRef.current = null;
      };
    }
  }, []);

  function initRouteLayers(map: MaplibreMap, color: string, width: number) {
    if (!map.getSource('route')) {
      map.addSource('route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
    }
    if (!map.getSource('inactive-routes')) {
      map.addSource('inactive-routes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
    }
    if (!map.getLayer('inactive-routes-line')) {
      map.addLayer({
        id: 'inactive-routes-line',
        type: 'line',
        source: 'inactive-routes',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#ffffff',
          'line-width': 3,
          'line-opacity': 0.6,
          'line-dasharray': [3, 3],
        },
      });
    }
  }

  // ── 2. Style update ──────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (map && mapStyle && routeInitializedRef.current) {
      const styleUrl = buildMapStyle(mapStyle);

      map.setStyle(styleUrl);
      map.once('style.load', () => {
        (map as any).setProjection({ type: 'globe' });
        try {
          if (globeAtmosphere && (map as any).setFog) {
             (map as any).setFog({
               color: 'rgba(255, 255, 255, 0.2)',
               'high-color': 'rgba(0, 0, 0, 0.8)',
               'space-color': 'rgba(0, 0, 0, 1)'
             });
          }
        } catch (e) {}

        initRouteLayers(map, routeColor, routeWidth);
        const L = latestRef.current!;
        L.updateRouteData(map, ++renderPassRef.current); // Reset to full line
        L.rebuildMarkers(map, L.cities);
      });
    }
  }, [mapStyle, globeAtmosphere]);

  // ── Fetch Inactive Routes ──────────────────────────────────────────────────

  async function updateInactiveRoutes(map: MaplibreMap) {
    if (!routes) return;
    const allFeatures: GeoJSON.Feature[] = [];
    const allCoordSegments: [number, number][][] = [];
    
    let didFetch = false;
    const fetchPromises = [];

    // First pass: collect missing fetches
    for (const route of routes) {
      const isActive = route.cities.length === cities.length && route.cities.every((c, i) => c.id === cities[i].id);
      if (isActive) continue;
      for (let i = 0; i < route.cities.length - 1; i++) {
        const cacheKey = `${route.cities[i].id}-${route.cities[i+1].id}`;
        if (!osrmCacheRef.current[cacheKey] && !route.forceStraight) {
          const p = fetch(`https://router.project-osrm.org/route/v1/driving/${route.cities[i].lng},${route.cities[i].lat};${route.cities[i+1].lng},${route.cities[i+1].lat}?geometries=geojson`)
            .then(res => res.json())
            .then(data => {
               if (data.routes && data.routes[0]) {
                 osrmCacheRef.current[cacheKey] = data.routes[0].geometry.coordinates;
                 didFetch = true;
               }
            }).catch(() => {});
          fetchPromises.push(p);
        }
      }
    }
    
    // Wait for all fetches in parallel
    if (fetchPromises.length > 0) {
      await Promise.all(fetchPromises);
      if (didFetch) saveOsrmCache();
    }

    // Second pass: build segments
    const info: { id: string; center: [number, number]; bbox: [[number, number], [number, number]] }[] = [];
    for (const route of routes) {
      const isActive = route.cities.length === cities.length && route.cities.every((c, i) => c.id === cities[i].id);
      if (isActive) continue;
      let minX = 180, minY = 90, maxX = -180, maxY = -90;
      for (const c of route.cities) { minX = Math.min(minX, c.lng); maxX = Math.max(maxX, c.lng); minY = Math.min(minY, c.lat); maxY = Math.max(maxY, c.lat); }
      if (route.cities.length) info.push({ id: route.id, center: [(minX + maxX) / 2, (minY + maxY) / 2], bbox: [[minX, minY], [maxX, maxY]] });
      for (let i = 0; i < route.cities.length - 1; i++) {
        const cacheKey = `${route.cities[i].id}-${route.cities[i+1].id}`;
        const coords = osrmCacheRef.current[cacheKey] || greatCircleArc(route.cities[i], route.cities[i + 1], route.source === 'track' ? 1 : 120);
        const finalCoords = route.forceStraight ? smoothCoords(coords, 3) : coords;
        allCoordSegments.push(finalCoords);
        allFeatures.push({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: coords }
        });
      }
    }
    // Store for SVG rendering
    inactiveRouteCoordsRef.current = allCoordSegments;
    inactiveInfoRef.current = info;
    // Also update MapLibre source (as backup)
    if (map.getSource('inactive-routes')) {
      (map.getSource('inactive-routes') as GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: allFeatures,
      });
    }
    // Add start/end markers AND YouTube preview markers for inactive routes
    inactiveMarkersRef.current.forEach(m => m.remove());
    inactiveMarkersRef.current = [];
    import('maplibre-gl').then(({ Marker }) => {
      for (const route of routes) {
        const isActive = route.cities.length === cities.length && route.cities.every((c, i) => c.id === cities[i].id);
        if (isActive) continue;
        
        // --- YOUTUBE PREVIEW MARKER ON EXACT ROUTE MIDPOINT ---
        let allRouteCoords: [number, number][] = [];
        for (let i = 0; i < route.cities.length - 1; i++) {
            const cacheKey = `${route.cities[i].id}-${route.cities[i+1].id}`;
            const coords = osrmCacheRef.current[cacheKey] || greatCircleArc(route.cities[i], route.cities[i + 1], route.source === 'track' ? 1 : 120);
            allRouteCoords = allRouteCoords.concat(coords);
        }
        
        if (allRouteCoords.length > 0) {
            const exactMidCoord = allRouteCoords[Math.floor(allRouteCoords.length / 2)];
            
            const ytEl = document.createElement('div');
            ytEl.className = 'route-preview-marker-container cursor-pointer';
            ytEl.style.zIndex = '40';
            
            const inner = document.createElement('div');
            inner.className = 'relative group transition-transform hover:scale-110 hover:z-50';
            inner.style.width = '90px';
            inner.style.height = '60px';
            inner.style.borderRadius = '8px';
            inner.style.overflow = 'hidden';
            inner.style.border = '2px solid rgba(255, 255, 255, 0.4)';
            inner.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.5)';
            
            const img = document.createElement('img');
            img.src = route.videoId ? `https://img.youtube.com/vi/${route.videoId}/mqdefault.jpg` : 'https://images.unsplash.com/photo-1542281286-9e0a16bb7366?auto=format&fit=crop&w=300&q=80';
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            inner.appendChild(img);

            const overlay = document.createElement('div');
            overlay.className = 'absolute inset-0 bg-black/40 flex items-center justify-center opacity-70 group-hover:opacity-100 transition-opacity';
            overlay.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
            inner.appendChild(overlay);
            
            const title = document.createElement('div');
            title.className = 'absolute bottom-0 w-full bg-black/70 text-white text-[9px] font-bold px-1 py-0.5 truncate text-center';
            title.innerText = route.name || 'Route';
            inner.appendChild(title);
            
            ytEl.appendChild(inner);
            
            ytEl.onclick = (e) => {
              e.stopPropagation();
              if (onPlayRoute) onPlayRoute(route.id);
            };

            const ytMarker = new Marker({ element: ytEl })
              .setLngLat(exactMidCoord)
              .addTo(map);
            inactiveMarkersRef.current.push(ytMarker);
        }

        const startCity = route.cities[0];
        const endCity = route.cities[route.cities.length - 1];
        [startCity, endCity].forEach((city, idx) => {
          const el = document.createElement('div');
          el.innerHTML = getCityMarkerHTML(idx === 0 ? 'A' : 'B', city.name, idx === 0, idx === 1, route.id, false);
          el.style.opacity = '0.5';
          el.style.transition = 'opacity 0.2s';
          el.addEventListener('mouseenter', () => el.style.opacity = '1');
          el.addEventListener('mouseleave', () => el.style.opacity = '0.5');
          if (idx === 0) {
            el.style.cursor = 'pointer';
            el.addEventListener('click', () => {
              onPlayRoute && onPlayRoute(route.id);
            });
          }
          const marker = new Marker({ element: el, anchor: 'bottom' })
            .setLngLat([city.lng, city.lat])
            .addTo(map);
          inactiveMarkersRef.current.push(marker);
        });
      }
      updateClustersRef.current();
    });
    // Trigger SVG update
    if ((window as any)._updateSvgOverlay) {
      (window as any)._updateSvgOverlay();
    }
  }

  useEffect(() => {
    if (mapRef.current && routeInitializedRef.current) {
      updateInactiveRoutes(mapRef.current);
    }
  }, [routes, cities, mapStyle]);

  // Zoomed out: replace the other rides (lines, pins, previews) by bubbles with the number of rides.
  // Clicking a bubble zooms in until its rides are visible again.
  updateClustersRef.current = () => {
    const map = mapRef.current;
    if (!map) return;
    const clustered = map.getZoom() < CLUSTER_ZOOM && inactiveInfoRef.current.length > 0;
    const changed = clustered !== clusteredRef.current;
    clusteredRef.current = clustered;
    inactiveMarkersRef.current.forEach(m => { m.getElement().style.display = clustered ? 'none' : ''; });
    clusterMarkersRef.current.forEach(m => m.remove());
    clusterMarkersRef.current = [];
    if (changed && (window as any)._updateSvgOverlay) (window as any)._updateSvgOverlay();
    if (!clustered) return;

    // greedy clustering in screen space
    const groups: { pts: { x: number; y: number }[]; items: typeof inactiveInfoRef.current }[] = [];
    for (const r of inactiveInfoRef.current) {
      const p = map.project(r.center);
      let g = groups.find(gr => {
        const cx = gr.pts.reduce((a, q) => a + q.x, 0) / gr.pts.length;
        const cy = gr.pts.reduce((a, q) => a + q.y, 0) / gr.pts.length;
        return Math.hypot(cx - p.x, cy - p.y) < CLUSTER_RADIUS_PX;
      });
      if (!g) { g = { pts: [], items: [] }; groups.push(g); }
      g.pts.push({ x: p.x, y: p.y });
      g.items.push(r);
    }

    const pass = ++clusterPassRef.current; // zoomend + moveend fire together → only the latest pass draws
    import('maplibre-gl').then(({ Marker }) => {
      if (pass !== clusterPassRef.current || !clusteredRef.current || !mapRef.current) return;
      for (const g of groups) {
        const n = g.items.length;
        let minX = 180, minY = 90, maxX = -180, maxY = -90;
        for (const it of g.items) {
          minX = Math.min(minX, it.bbox[0][0]); minY = Math.min(minY, it.bbox[0][1]);
          maxX = Math.max(maxX, it.bbox[1][0]); maxY = Math.max(maxY, it.bbox[1][1]);
        }
        const size = Math.min(56, 34 + Math.log2(n) * 7);
        const el = document.createElement('button');
        el.type = 'button';
        el.title = `${n} ${n === 1 ? 'Fahrt' : 'Fahrten'} – heranzoomen`;
        el.className = 'rc-cluster';
        el.style.width = el.style.height = `${size}px`;
        el.textContent = String(n);
        el.addEventListener('click', e => {
          e.stopPropagation();
          const m = mapRef.current;
          if (!m) return;
          const cam = m.cameraForBounds([[minX, minY], [maxX, maxY]], { padding: 120, maxZoom: 13 });
          const zoom = Math.max(cam?.zoom ?? CLUSTER_ZOOM, CLUSTER_ZOOM + 0.5);
          m.flyTo({ center: (cam?.center as any) ?? [(minX + maxX) / 2, (minY + maxY) / 2], zoom, duration: 1200 });
        });
        const marker = new Marker({ element: el })
          .setLngLat([(minX + maxX) / 2, (minY + maxY) / 2])
          .addTo(mapRef.current);
        clusterMarkersRef.current.push(marker);
      }
    });
  };

  // Rebuild markers when animation state changes (play/pause icon toggle)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routeInitializedRef.current) return;
    // Find the active route ID
    const activeRoute = routes?.find(r => r.cities.length === cities.length && r.cities.every((c, i) => c.id === cities[i].id));
    rebuildMarkers(map, cities, activeRoute?.id);
  }, [isAnimating]);

  // ── 3. Cities update ─────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routeInitializedRef.current) return;
    setFollowDetached(false);
    renderPassRef.current += 1;
    legDistancesRef.current = [];
    updateRouteData(map, renderPassRef.current);
    rebuildMarkers(map, cities);

    if (cities.length >= 2) {
      const lats = cities.map((c) => c.lat);
      const lngs = cities.map((c) => c.lng);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      map.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        { padding: 50, duration: 1200, maxZoom: 13 }
      );
    } else {
      // no route selected → overview of all rides
      setElevationProfile(null);
      if (keepCameraRef.current) keepCameraRef.current = false;
      else fitAllRoutes(map, 1200);
    }
  }, [cities]);

  // Overview without a selected route (first load): Cyprus, Paphos region
  function fitAllRoutes(map: MaplibreMap, duration: number) {
    map.flyTo({ ...OVERVIEW_VIEW, duration });
  }

  async function updateRouteData(map: MaplibreMap, passId: number) {
    if (!map.getSource('route')) return;
    
    let totalPathDist = 0;
    const lDists: number[] = [];
    const allFeatures: GeoJSON.Feature[] = [];

    let didFetch = false;
    const fetchPromises = [];
    
    const activeRoute = routes?.find(r => r.cities.length === cities.length && r.cities.every((c, idx) => c.id === cities[idx].id));

    for (let i = 0; i < cities.length - 1; i++) {
      const cacheKey = `${cities[i].id}-${cities[i+1].id}`;
      if (!osrmCacheRef.current[cacheKey] && !activeRoute?.forceStraight) {
        const p = fetch(`https://router.project-osrm.org/route/v1/driving/${cities[i].lng},${cities[i].lat};${cities[i+1].lng},${cities[i+1].lat}?geometries=geojson`)
          .then(res => res.json())
          .then(data => {
            if (data.routes && data.routes[0]) {
              osrmCacheRef.current[cacheKey] = data.routes[0].geometry.coordinates;
              didFetch = true;
            }
          }).catch(() => {});
        fetchPromises.push(p);
      }
    }

    if (fetchPromises.length > 0) {
      await Promise.all(fetchPromises);
      if (didFetch) saveOsrmCache();
    }

    if (renderPassRef.current !== passId) return;

    let routeFullCoords: [number, number][] = [];
    const segmentIndices: number[] = [0];

    for (let i = 0; i < cities.length - 1; i++) {
      const cacheKey = `${cities[i].id}-${cities[i+1].id}`;
      let coords = osrmCacheRef.current[cacheKey] || greatCircleArc(cities[i], cities[i + 1], activeRoute?.source === 'track' ? 1 : 120);
      osrmCacheRef.current[cacheKey] = coords; // cache original
      if (i > 0 && coords.length > 0) coords = coords.slice(1);
      routeFullCoords.push(...coords);
      segmentIndices.push(routeFullCoords.length - 1);
    }

    if (activeRoute?.forceStraight) {
      routeFullCoords = smoothCoords(routeFullCoords, 3);
      // Re-map segment distances roughly (smoothing shrinks distance slightly, but close enough for animation)
    }

    let legDist = 0;
    for (let j = 0; j < routeFullCoords.length - 1; j++) {
      legDist += distance(routeFullCoords[j], routeFullCoords[j+1]);
    }
    
    if (activeRoute?.forceStraight && cities.length > 0) {
       // Treat as a single segment for progress animation
       const fullKey = `${cities[0].id}-${cities[cities.length-1].id}`;
       osrmCacheRef.current[fullKey] = routeFullCoords;
       lDists.push(legDist);
    } else {
       // Restore original lDists for non-smoothed segmented routes
       for (let i = 0; i < cities.length - 1; i++) {
          const cacheKey = `${cities[i].id}-${cities[i+1].id}`;
          const segCoords = osrmCacheRef.current[cacheKey];
          let d = 0;
          for(let k=0; k<segCoords.length-1; k++) d += distance(segCoords[k], segCoords[k+1]);
          lDists.push(d);
       }
    }
    totalPathDist = legDist;

    allFeatures.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: routeFullCoords }
    });

    if (allFeatures.length > 0) {
      const allCoords = allFeatures.flatMap(f => (f.geometry as any).coordinates);
      fullRouteCoordsRef.current = allCoords;
      geometryKeyRef.current = `${cities[0]?.id}:${cities.length}`;
      rebuildCommentMarkers();
      rebuildOverlapMarkers();
      tryFocus(cities);
      if (allCoords.length > 0) {
        midLngLatRef.current = allCoords[Math.floor(allCoords.length / 2)];
      }
    }
    
    totalDistRef.current = totalPathDist;
    legDistancesRef.current = lDists;
    
    if (map.getSource('route')) {
      (map.getSource('route') as GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: allFeatures,
      });
    }
    
    updateRouteProgress(map, cities, animProgressRef.current, totalPathDist, lDists);
    if ((window as any)._updateSvgOverlay) {
      (window as any)._updateSvgOverlay();
    }
    

    
    // Fetch elevation profile (not in the overview without a route)
    if (allFeatures.length > 0 && cities.length >= 2) {
      const allCoords = allFeatures.flatMap(f => (f.geometry as any).coordinates);
      const sampledPts = [];
      const numSamples = 60;
      for (let i = 0; i < numSamples; i++) {
        const idx = Math.floor((i / (numSamples - 1)) * (allCoords.length - 1));
        sampledPts.push(allCoords[idx]);
      }
      const lats = sampledPts.map(p => p[1].toFixed(5)).join(',');
      const lngs = sampledPts.map(p => p[0].toFixed(5)).join(',');
      fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`)
        .then(r => r.json())
        .then(d => {
          if (d.elevation) setElevationProfile(d.elevation);
        })
        .catch(e => console.error("Elevation fetch failed", e));
    }

    updateRouteProgress(map, (useGpsTrace || activeRoute?.forceStraight) && cities.length > 0 ? [cities[0], cities[cities.length-1]] : cities, animProgressRef.current, totalPathDist, lDists); // ref, not the closure value – progress may have been set (deep link) while the route was loading
  }

  function updateRouteProgress(
    map: MaplibreMap,
    cs: City[],
    progress: number,
    totalDist: number,
    legDists: number[]
  ) {
    
    if (!map.getSource('route') || legDists.length !== cs.length - 1) {
      console.log('Progress abort:', { hasSource: !!map.getSource('route'), legDistsLen: legDists.length, expected: cs.length - 1 });
      return;
    }

    let remaining = progress;
    let vehiclePoint = (progress === 0 && midLngLatRef.current) ? midLngLatRef.current : (cs[0] ? [cs[0].lng, cs[0].lat] : [0,0]);
    const newActiveFeatures: GeoJSON.Feature[] = [];

    for (let i = 0; i < cs.length - 1; i++) {
      const legFrac = legDists[i] / totalDist;
      const legProgress = Math.min(1, remaining / legFrac);
      remaining -= legFrac;

      const cacheKey = `${cs[i].id}-${cs[i+1].id}`;
      const fullArc = osrmCacheRef.current[cacheKey] || greatCircleArc(cs[i], cs[i + 1], 120);
      
      let accDists = osrmDistCacheRef.current[cacheKey];
      if (!accDists) {
         accDists = [0];
         let total = 0;
         for(let k = 1; k < fullArc.length; k++) {
            total += getDistance(fullArc[k-1], fullArc[k]);
            accDists.push(total);
         }
         osrmDistCacheRef.current[cacheKey] = accDists;
      }
      
      const arcTotalDist = accDists[accDists.length - 1];
      const targetDist = legProgress * arcTotalDist;
      
      let numCompletePoints = 1;
      for (let k = 1; k < accDists.length; k++) {
         if (accDists[k] <= targetDist) {
            numCompletePoints = k + 1;
         } else {
            break;
         }
      }
      
      const partialArc = fullArc.slice(0, numCompletePoints);
      
      if (legProgress > 0 && legProgress < 1 && numCompletePoints < fullArc.length) {
         const p1 = fullArc[numCompletePoints - 1];
         const p2 = fullArc[numCompletePoints];
         const d1 = accDists[numCompletePoints - 1];
         const d2 = accDists[numCompletePoints];
         const frac = (d2 - d1) === 0 ? 0 : (targetDist - d1) / (d2 - d1);
         vehiclePoint = [
           p1[0] + (p2[0] - p1[0]) * frac,
           p1[1] + (p2[1] - p1[1]) * frac
         ];
         partialArc.push(vehiclePoint as [number, number]);
      } else if (legProgress === 1) {
         vehiclePoint = fullArc[fullArc.length - 1];
      }

      if (partialArc.length > 1) {
         newActiveFeatures.push({
           type: 'Feature',
           properties: {},
           geometry: { type: 'LineString', coordinates: partialArc }
         });
      }

      if (remaining <= 0) break;
    }

    vehicleLngLatRef.current = vehiclePoint as [number, number];
    routeCoordsRef.current = newActiveFeatures;

    
    if (cameraMode !== 'static' && progress > 0 && progress < 1 && !followDetachedRef.current) {
      let targetBearing = map.getBearing();
      if (cameraMode === 'orbit') {
        targetBearing = progress * 360;
      } else if (cameraMode === 'follow') {
        // User requested no rotation for Follow mode, keep the current bearing or reset to 0
        // targetBearing = map.getBearing(); 
      }
      
      // Zoom significantly closer to the pin
      const targetZoom = Math.max(map.getZoom(), 14);
      const targetPitch = Math.max(map.getPitch(), 45);
      const targetCenter = vehiclePoint as [number, number];
      
      const TRANSITION_DURATION = 1.5; // 1.5 seconds smooth transition
      const currentRealTime = Date.now() / 1000;

      // Jump detected (target moved far since the last frame) → glide from the current view
      const last = lastFollowTargetRef.current;
      lastFollowTargetRef.current = targetCenter;
      if (last && initialCameraRef.current) {
        const a = map.project(last as [number, number]);
        const b = map.project(targetCenter);
        if (Math.hypot(a.x - b.x, a.y - b.y) > 80) initialCameraRef.current = null;
      }
      
      if (!initialCameraRef.current) {
        initialCameraRef.current = {
          center: map.getCenter(),
          zoom: map.getZoom(),
          pitch: map.getPitch(),
          bearing: map.getBearing(),
          timestamp: currentRealTime
        };
      }
      
      const tElapsed = currentRealTime - initialCameraRef.current.timestamp;
      const t = Math.min(1, tElapsed / TRANSITION_DURATION);
      
      // smoothstep easing
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      
      if (t < 1) {
        const init = initialCameraRef.current;
        const cZoom = init.zoom + (targetZoom - init.zoom) * ease;
        const cPitch = init.pitch + (targetPitch - init.pitch) * ease;
        
        let db = targetBearing - init.bearing;
        while (db > 180) db -= 360;
        while (db < -180) db += 360;
        const cBearing = init.bearing + db * ease;
        
        const cLng = init.center.lng + (targetCenter[0] - init.center.lng) * ease;
        const cLat = init.center.lat + (targetCenter[1] - init.center.lat) * ease;
        
        map.jumpTo({
          center: [cLng, cLat],
          zoom: cZoom,
          pitch: cPitch,
          bearing: cBearing
        });
        // keep gliding even when paused (no animation loop drives this function then)
        if (glideFrameRef.current === null) {
          glideFrameRef.current = requestAnimationFrame(() => {
            glideFrameRef.current = null;
            updateRouteProgress(map, cs, animProgressRef.current, totalDist, legDists);
          });
        }
      } else {
        map.jumpTo({
          center: targetCenter,
          bearing: targetBearing,
          pitch: targetPitch,
          zoom: targetZoom
        });
      }
    } else {
      initialCameraRef.current = null;
      lastFollowTargetRef.current = null;
    }

    if ((window as any)._updateSvgOverlay) {
      (window as any)._updateSvgOverlay();
    }
  }

  function rebuildMarkers(map: MaplibreMap, cs: City[], activeRouteId?: string) {
    // Callers often pass no id – without it the play pin would call onPlayRoute(''), which
    // deselects the ride and flies the camera back to the overview (Cyprus).
    if (!activeRouteId) activeRouteId = routes?.find(r => r.cities.length === cs.length && r.cities.every((c, i) => c.id === cs[i]?.id))?.id;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    import('maplibre-gl').then(({ Marker }) => {
      cs.forEach((city, i) => {
        if (i !== 0 && i !== cs.length - 1) return;
        const label = i === 0 ? 'A' : 'B';
        const el = document.createElement('div');
        el.innerHTML = getCityMarkerHTML(label, city.name, i === 0, i === cs.length - 1, activeRouteId, isAnimating);
        if (i === 0) {
          el.style.cursor = 'pointer';
          el.addEventListener('click', () => {
            if (isAnimating) {
              onStopRoute && onStopRoute();
            } else {
              onPlayRoute && onPlayRoute(activeRouteId || '');
            }
          });
        }
        const marker = new Marker({ element: el, anchor: 'bottom' })
          .setLngLat([city.lng, city.lat])
          .addTo(map);
        markersRef.current.push(marker);
      });
    });
  }

  useEffect(() => {
    if (mapRef.current && routeInitializedRef.current) {
      const activeRoute = routes?.find(r => r.cities.length === cities.length && r.cities.every((c, idx) => c.id === cities[idx].id));
      const cs = (useGpsTrace || activeRoute?.forceStraight) && cities.length > 0 ? [cities[0], cities[cities.length-1]] : cities;
      updateRouteProgress(mapRef.current, cs, animationProgress, totalDistRef.current, legDistancesRef.current);
      if ((window as any)._updateSvgOverlay) {
        (window as any)._updateSvgOverlay();
      }
    }
  }, [animationProgress]);


  // Back to the current video position (or the whole route if playback hasn't started)
  function recenter() {
    const map = mapRef.current;
    if (!map) return;
    setFollowDetached(false);
    initialCameraRef.current = null;
    const vehicle = vehicleLngLatRef.current;
    const progress = animProgressRef.current;
    if (progress > 0 && vehicle) {
      // While playing with a moving camera, the follow cam glides back by itself
      if (isAnimating && cameraMode !== 'static') return;
      map.flyTo({ center: vehicle, zoom: Math.max(map.getZoom(), 14), pitch: Math.max(map.getPitch(), 45), duration: 1200 });
    } else if (cities.length >= 2) {
      const lats = cities.map(c => c.lat), lngs = cities.map(c => c.lng);
      map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 50, duration: 1200, maxZoom: 13 });
    }
  }

  latestRef.current = { cities, updateRouteData, rebuildMarkers, updateInactiveRoutes, fitAllRoutes };

  return (
    <div className="w-full h-full absolute inset-0 pointer-events-none z-0">
      <div className="w-full relative pointer-events-auto" style={{ height: isMobile ? "40vh" : "100%" }} ref={containerRef}>
            
      <svg xmlns="http://www.w3.org/2000/svg" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10 }}>
        <defs>
          <linearGradient id="routeGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#CCFF00" />
          </linearGradient>
        </defs>
        <path ref={fullSvgPathRef} fill="none" stroke={animationProgress === 0 ? routeColor : 'rgba(255, 255, 255, 0.3)'} strokeWidth={routeWidth * 1.5 + 2} strokeLinecap="round" strokeLinejoin="round" />
        <path ref={inactiveSvgPathRef} fill="none" stroke={routeColor} strokeWidth={routeWidth * 1.5 + 2} strokeLinecap="round" strokeLinejoin="round" opacity={0.5} />
        <path ref={svgPathRef} fill="none" stroke="url(#routeGrad)" strokeWidth={routeWidth * 1.5} strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 8px rgba(204,255,0,0.8))' }} />
      </svg>
      <div 
        ref={vehicleDotRef}
        className="absolute w-4 h-4 bg-[#CCFF00] rounded-full border-2 border-black pointer-events-none z-20"
        style={{ 
          top: 0, left: 0,
          marginLeft: '-8px', marginTop: '-8px',
          display: 'none',
          boxShadow: '0 0 10px rgba(204,255,0,0.5)',
          willChange: 'transform'
        }}
      />
      
      <div 
        ref={distanceBadgeRef}
        className="absolute pointer-events-none z-20 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md rounded-lg border border-white/10 shadow-xl"
        style={{
          top: 0, left: 0,
          marginLeft: '-35px', marginTop: '-50px',
          width: '70px', padding: '4px',
          display: 'none',
          willChange: 'transform'
        }}
      >
        <span ref={distanceTextRef} className="text-[#CCFF00] font-bold text-xs">0 km</span>
        <span ref={distanceTimeRef} className="text-white/70 text-[10px] font-medium uppercase tracking-wider">0m 0s</span>
      </div>

      {followDetached && cities.length >= 2 && (
        <button
          onClick={recenter}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 inline-flex items-center gap-2 h-10 pl-3 pr-4 rounded-full bg-black/75 backdrop-blur-md border border-white/15 text-sm font-medium text-white shadow-xl hover:bg-black/90 hover:border-[#CCFF00]/50 transition-colors"
        >
          <LocateFixed size={18} className="text-[#CCFF00]" />
          {animationProgress > 0 ? 'Zurück zum Video' : 'Zurück zur Route'}
        </button>
      )}

      </div>
      {showElevation && elevationProfile && (() => {
        const content = (
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(180deg, rgba(17,17,17,0.6) 0%, rgba(17,17,17,0.4) 100%)', borderRadius: isMobile ? '0' : '12px', border: isMobile ? 'none' : '1px solid rgba(255,255,255,0.08)', padding: '16px', backdropFilter: 'blur(12px)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', pointerEvents: 'auto', cursor: isMobile ? 'default' : 'grab' }} className={isMobile ? "" : "active:cursor-grabbing"}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }} className="pointer-events-none">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <Mountain size={14} className="text-[#CCFF00]" />
                <h3 style={{ color: '#fff', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', margin: 0, fontFamily: 'sans-serif', textTransform: 'uppercase' }}>Elevation Profile</h3>
              </div>
              <div style={{ color: '#9ca3af', fontSize: '10px', fontWeight: 500, fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>{(totalDistRef.current / 1000).toFixed(0)} KM</span>
                <span style={{ color: '#4b5563' }}>•</span>
                <span>{Math.floor(durationSeconds / 60)}M {durationSeconds % 60}S</span>
              </div>
            </div>
            {!isMobile && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* Mini compass (replaces the former Heading window) */}
                <svg width="26" height="26" viewBox="0 0 26 26" style={{ overflow: 'visible' }} aria-label="Fahrtrichtung">
                  <circle cx="13" cy="13" r="11.5" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
                  <text x="13" y="5.2" fill="#9ca3af" fontSize="5" fontWeight="700" fontFamily="sans-serif" textAnchor="middle">N</text>
                  <g ref={compassNeedleRef} style={{ transformOrigin: '13px 13px', transform: 'rotate(0deg)', willChange: 'transform' }}>
                    <polygon points="13,6 17,18 13,15.5 9,18" fill="#ef4444" stroke="#ffffff" strokeWidth="1" strokeLinejoin="round" />
                  </g>
                </svg>
                <span ref={headingTextRef} style={{ color: '#fff', fontSize: '12px', fontWeight: 800, fontFamily: 'monospace', letterSpacing: '-0.03em', minWidth: '52px', textAlign: 'right' }}>N 0°</span>
                <button style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '4px' }}>
                  <GripHorizontal size={14} />
                </button>
              </div>
            )}
          </div>
          
          <div style={{ position: 'relative', height: '60px', width: '100%' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' }}>
              <div style={{ borderBottom: '1px dashed rgba(255,255,255,0.1)', height: '1px', width: '100%' }} />
              <div style={{ borderBottom: '1px dashed rgba(255,255,255,0.1)', height: '1px', width: '100%' }} />
              <div style={{ borderBottom: '1px solid rgba(255,255,255,0.2)', height: '1px', width: '100%' }} />
            </div>
            <div style={{ position: 'absolute', left: 0, bottom: '-16px', color: '#6b7280', fontSize: '9px', fontWeight: 600, fontFamily: 'sans-serif' }}>
              0m
            </div>
            {(() => {
              if (!elevationProfile || elevationProfile.length === 0) return null;
              const max = Math.max(...elevationProfile);
              const min = Math.min(...elevationProfile);
              const range = max - min || 1;
              
              const exactIdx = animationProgress * (elevationProfile.length - 1);
              const i1 = Math.floor(exactIdx);
              const i2 = Math.min(Math.ceil(exactIdx), elevationProfile.length - 1);
              const frac = exactIdx - i1;
              const currentElev = elevationProfile[i1] + frac * (elevationProfile[i2] - elevationProfile[i1]);
              
              const leftPct = animationProgress * 100;
              const bottomPct = ((currentElev - min) / range) * 100;
              
              const elevAt = (p: number) => {
                const x = Math.max(0, Math.min(1, p)) * (elevationProfile.length - 1);
                const a = Math.floor(x), b = Math.min(a + 1, elevationProfile.length - 1);
                return elevationProfile[a] + (x - a) * (elevationProfile[b] - elevationProfile[a]);
              };

              return (
                <>
                  {/* comment positions – dots in the commenter's colour, ringed while the vehicle passes them */}
                  {durationSeconds > 0 && comments.map(c => {
                    const p = timeToRoute(Math.min(1, c.seconds / durationSeconds));
                    const active = activeCommentIds.includes(c.id);
                    return (
                      <div key={c.id} style={{
                        position: 'absolute', left: `${p * 100}%`, bottom: `${((elevAt(p) - min) / range) * 100}%`,
                        transform: 'translate(-50%, 50%)', width: active ? '10px' : '7px', height: active ? '10px' : '7px',
                        borderRadius: '50%', background: c.color, border: '1px solid rgba(0,0,0,0.85)',
                        boxShadow: active ? `0 0 0 2px #CCFF00, 0 0 10px ${c.color}` : 'none',
                        zIndex: 19, pointerEvents: 'none', transition: 'width 150ms, height 150ms, box-shadow 150ms',
                      }} />
                    );
                  })}
                  <div style={{
                    position: 'absolute', left: `${leftPct}%`, bottom: `${bottomPct}%`,
                    transform: 'translate(-50%, 50%)',
                    width: '10px', height: '10px', backgroundColor: '#CCFF00', borderRadius: '50%', border: '2px solid black', zIndex: 21, pointerEvents: 'none', transition: 'none'
                  }} />
                  <div style={{ 
                    position: 'absolute', left: `${leftPct}%`, bottom: `${bottomPct}%`, 
                    transform: 'translate(-50%, -12px)',
                    color: '#fff', fontSize: '9px', fontWeight: 700, fontFamily: 'sans-serif', 
                    background: 'rgba(0,0,0,0.8)', padding: '2px 4px', borderRadius: '4px',
                    zIndex: 20, pointerEvents: 'none', transition: 'none'
                  }}>
                    {Math.round(currentElev)}m
                  </div>
                </>
              );
            })()}
            
            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
              <div style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: '100%' }}>
                {(() => {
                  const max = Math.max(...elevationProfile);
                  const min = Math.min(...elevationProfile);
                  const range = max - min || 1;
                  const pts = elevationProfile.map((v, i) => `${(i / (elevationProfile.length - 1)) * 100},${100 - ((v - min) / range) * 100}`);
                  const path = `M 0,100 L ${pts.map(p => { const [x,y] = p.split(','); return `${x},${y}`; }).join(' L ')} L 100,100 Z`;
                  
                  return (
                    <svg 
                      width="100%" 
                      height="100%" 
                      viewBox="0 0 100 100" 
                      preserveAspectRatio="none" 
                      className="cancel-drag"
                      style={{ overflow: 'visible', cursor: onSeek ? 'pointer' : 'default', pointerEvents: 'auto', touchAction: 'none' }}
                      onClick={(e) => {
                        if (!onSeek) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        let p = (e.clientX - rect.left) / rect.width;
                        p = Math.max(0, Math.min(1, p));
                        onSeek(p);
                      }}
                      onTouchEnd={(e) => {
                        if (!onSeek) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const touch = e.changedTouches[0];
                        if (touch) {
                          let p = (touch.clientX - rect.left) / rect.width;
                          p = Math.max(0, Math.min(1, p));
                          onSeek(p);
                        }
                      }}
                    >
                      <defs>
                        <linearGradient id="elevGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.3} />
                          <stop offset="100%" stopColor={routeColor} stopOpacity={0.6} />
                        </linearGradient>
                        <linearGradient id="elevLineGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#FFFFFF" />
                          <stop offset="100%" stopColor={routeColor} />
                        </linearGradient>
                      </defs>
                      <path d={path} fill="url(#elevGrad)" opacity={0.5} />
                      <path d={path.replace(' L 100,100 Z', '').replace('M 0,100 L ', 'M ')} fill="none" stroke="url(#elevLineGrad)" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
        );
        if (isMobile) {
          return (
            <div className="absolute left-0 w-full pointer-events-auto bg-black/90 z-50 border-t border-white/10" style={{ top: '75vh', height: '25vh' }}>
              {content}
            </div>
          );
        }
        return (
          <Rnd
            default={{ x: typeof window !== 'undefined' ? window.innerWidth - 344 : 0, y: 80, width: 320, height: 'auto' }}
            bounds="parent"
            enableResizing={false}
            className="z-50"
            style={{ zIndex: activeWindow === 'elevation' ? 60 : 50 }}
            onDragStart={() => { lockIframes(); setActiveWindow && setActiveWindow('elevation'); }}
            onDragStop={unlockIframes}
            onMouseDown={() => setActiveWindow && setActiveWindow('elevation')}
          >
            {content}
          </Rnd>
        );
      })()}
      {showVelocity && (
        <Rnd
          default={{ x: typeof window !== 'undefined' ? window.innerWidth - 344 : 0, y: 248, width: 320, height: 'auto' }}
          bounds="parent"
          enableResizing={false}
          className="z-50"
          style={{ zIndex: activeWindow === 'velocity' ? 60 : 50 }}
          onDragStart={() => { lockIframes(); setActiveWindow && setActiveWindow('velocity'); }}
            onDragStop={unlockIframes}
          onMouseDown={() => setActiveWindow && setActiveWindow('velocity')}
        >
        <div style={{ width: '100%', height: '100%', background: 'linear-gradient(180deg, rgba(17,17,17,0.6) 0%, rgba(17,17,17,0.4) 100%)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', padding: '16px', backdropFilter: 'blur(12px)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', pointerEvents: 'auto', cursor: 'grab' }} className="active:cursor-grabbing">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }} className="pointer-events-none">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Gauge size={14} className="text-[#CCFF00]" />
              <h3 style={{ color: '#fff', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', margin: 0, fontFamily: 'sans-serif', textTransform: 'uppercase' }}>Velocity</h3>
            </div>
            <button style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '4px' }}>
              <GripHorizontal size={14} />
            </button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', height: '170px' }} className="pointer-events-none">
            <svg width="220" height="115" viewBox="0 0 220 115" style={{ overflow: 'visible' }}>
              <defs>
                <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#ef4444" />
                  <stop offset="50%" stopColor="#eab308" />
                  <stop offset="100%" stopColor="#22c55e" />
                </linearGradient>
              </defs>
              <path d="M 30 90 A 80 80 0 0 1 190 90" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12" strokeLinecap="round" />
              <path d="M 30 90 A 80 80 0 0 1 190 90" fill="none" stroke="url(#gaugeGrad)" strokeWidth="12" strokeLinecap="round" />
              
              <g ref={velocityNeedleRef} style={{ transformOrigin: '110px 90px', transform: 'rotate(-90deg)', willChange: 'transform', transition: 'transform 0.1s linear' }}>
                <polygon points="107,90 113,90 110,25" fill="#ffffff" />
                <circle cx="110" cy="90" r="5" fill="#111" stroke="#ffffff" strokeWidth="2" />
              </g>
              
              <text x="30" y="112" fill="#6b7280" fontSize="11" fontFamily="sans-serif" fontWeight="700" textAnchor="middle">0</text>
              <text x="110" y="32" fill="#6b7280" fontSize="11" fontFamily="sans-serif" fontWeight="700" textAnchor="middle">75</text>
              <text x="190" y="112" fill="#6b7280" fontSize="11" fontFamily="sans-serif" fontWeight="700" textAnchor="middle">150</text>
            </svg>
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', marginTop: '4px' }}>
              <span ref={velocityTextRef} style={{ color: '#fff', fontSize: '36px', fontWeight: 800, fontFamily: 'monospace', letterSpacing: '-0.05em', lineHeight: '36px' }}>0</span>
              <span style={{ color: '#9ca3af', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '2px' }}>km/h</span>
            </div>
          </div>
        </div>
        </Rnd>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function distance(p1: [number, number], p2: [number, number]) {
  const R = 6371e3;
  const φ1 = (p1[1] * Math.PI) / 180;
  const φ2 = (p2[1] * Math.PI) / 180;
  const Δφ = ((p2[1] - p1[1]) * Math.PI) / 180;
  const Δλ = ((p2[0] - p1[0]) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getCityMarkerHTML(label: string, name: string, isFirst: boolean, isLast: boolean, routeId?: string, isPlaying?: boolean): string {
  let color = '#4ade80';
  let innerHtml = label;
  
  if (isFirst) {
    color = '#CCFF00';
    if (isPlaying) {
      // Stop icon (two vertical bars)
      innerHtml = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#111">
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
      `;
    } else {
      // Play icon (triangle)
      innerHtml = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#111" style="transform: translateX(1px)">
          <path d="M8 5v14l11-7z"/>
        </svg>
      `;
    }
  } else if (isLast) {
    color = '#ffffff';
    innerHtml = `
      <svg width="18" height="18" viewBox="0 0 24 24" style="transform: translateX(1px)">
        <rect x="4" y="2" width="2.5" height="20" fill="#111" rx="1" />
        <rect x="6.5" y="3" width="12" height="12" fill="none" stroke="#111" stroke-width="1.5" />
        <rect x="6.5" y="3" width="4" height="4" fill="#111" />
        <rect x="14.5" y="3" width="4" height="4" fill="#111" />
        <rect x="10.5" y="7" width="4" height="4" fill="#111" />
        <rect x="6.5" y="11" width="4" height="4" fill="#111" />
        <rect x="14.5" y="11" width="4" height="4" fill="#111" />
      </svg>
    `;
  } else {
    color = '#CCFF00';
  }
  
  const cursorStyle = isFirst ? 'cursor:pointer;' : '';
  const dataAttr = isFirst && routeId ? `data-route-id="${routeId}" data-play-btn="true"` : '';
  
  return `
    <div style="display:flex; flex-direction:column; align-items:center; transform:translateY(-4px);">
      <div ${dataAttr} style="background:${color}; color:#111; font-weight:bold; font-family:sans-serif; width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius:50%; border:3px solid #1a1a1a; box-shadow:0 4px 6px rgba(0,0,0,0.3); z-index:10; ${cursorStyle} transition: transform 0.15s ease;" onmouseover="this.style.transform='scale(1.15)'" onmouseout="this.style.transform='scale(1)'">
        ${innerHtml}
      </div>
      <div style="margin-top:4px; background:#1a1a1a; color:#f3f4f6; padding:2px 8px; border-radius:4px; font-size:12px; font-family:sans-serif; font-weight:600; border:1px solid #333; box-shadow:0 2px 4px rgba(0,0,0,0.3); white-space:nowrap;">
        ${name}
      </div>
    </div>
  `;
}

function headingOnPath(path: [number, number][], t: number) {
  if (!path || path.length < 2) return 0;
  let exactIdx = t * (path.length - 1);
  if (exactIdx < path.length - 2) exactIdx += 0.5;
  const idx = Math.min(Math.floor(exactIdx), path.length - 2);
  const p1 = path[idx];
  const p2 = path[idx + 1];
  return Math.atan2(p2[0] - p1[0], p2[1] - p1[1]) * (180 / Math.PI);
}
