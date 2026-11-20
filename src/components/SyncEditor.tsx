'use client';

// Sync editor: align ONE continuous YouTube video with a recorded GPS track.
// Edited values: the offset (track time = video time + offset) and the trim – the part of the
// recording that stays in the ride. By default the trim follows the video, so whatever the
// video doesn't show is cut away; the rider can move both ends by hand (e.g. cut more at the
// start to hide their home). The cut is applied for good on "Fertig".
// Map (track + covered stretch + vehicle), video, and a timeline with the speed curve
// where the video is a bar that can be dragged along the track.

import { releaseRideCreated } from '@/lib/rideCreated';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as maplibregl from 'maplibre-gl';
import { ArrowLeft, Pause, Play, RotateCcw, Check, Info, ZoomIn, ZoomOut, GripHorizontal, Scissors, X as XIcon } from 'lucide-react';
import { buildEstimatedTimeline, anchorsFromPauses, type RoutePause } from '@/lib/estimatedTimeline';
import { Rnd } from 'react-rnd';
import { lockIframes, unlockIframes } from '@/lib/dragGuard';
import type { RouteConfig } from '@/hooks/useEditorState';
import { loadAllRoutes, updateUserRoute, loadUserRoutes } from '@/lib/userRoutes';
import { useDb } from '@/lib/db';
import { buildMapStyle, MAP_STYLES, type MapStyleId } from '@/lib/mapStyles';
import { distAtTrackTime, speedCurve, findStops, clampOffset, type TrackTimeline } from '@/lib/trackSync';
import { waitForYT } from '@/lib/youtubeDuration';
import { trimRoute, MIN_TRIM_SECONDS } from '@/lib/trimRoute';
import { t, useT } from '@/lib/i18n';

const LIME = '#CCFF00';
const SPEED_STEP = 2; // seconds per speed sample in the timeline

// 754.3 → "12:34.3", negative with a sign
function fmt(sec: number, tenths = false): string {
  const sign = sec < 0 ? '−' : '';
  const a = Math.abs(sec);
  const h = Math.floor(a / 3600), m = Math.floor((a % 3600) / 60), s = a % 60;
  const ss = tenths ? s.toFixed(1).padStart(4, '0') : String(Math.floor(s)).padStart(2, '0');
  return sign + (h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`);
}

function haversineKm(a: [number, number], b: [number, number]) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r, dLng = (b[0] - a[0]) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Polyline with cumulative distance fractions, for "point at fraction" and "fraction at point"
function useLine(route: RouteConfig | null) {
  return useMemo(() => {
    const coords = (route?.cities ?? []).map(c => [c.lng, c.lat] as [number, number]);
    const cum = [0];
    for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversineKm(coords[i - 1], coords[i]));
    const total = cum[cum.length - 1] || 1;
    const frac = cum.map(c => c / total);
    const pointAt = (f: number): [number, number] | null => {
      if (coords.length < 2) return null;
      const x = Math.max(0, Math.min(1, f));
      let i = 1;
      while (i < frac.length - 1 && frac[i] < x) i++;
      const t = frac[i] > frac[i - 1] ? (x - frac[i - 1]) / (frac[i] - frac[i - 1]) : 0;
      return [coords[i - 1][0] + t * (coords[i][0] - coords[i - 1][0]), coords[i - 1][1] + t * (coords[i][1] - coords[i - 1][1])];
    };
    const slice = (f0: number, f1: number): [number, number][] => {
      const a = pointAt(f0), b = pointAt(f1);
      if (!a || !b || f1 <= f0) return [];
      return [a, ...coords.filter((_, i) => frac[i] > f0 && frac[i] < f1), b];
    };
    return { coords, frac, pointAt, slice, km: cum[cum.length - 1] || 0 };
  }, [route]);
}

export default function SyncEditor({ routeId }: { routeId: string | null }) {
  useT();
  const router = useRouter();
  const [route, setRoute] = useState<RouteConfig | null>(null);
  const [loaded, setLoaded] = useState(false);
  const { loaded: dbLoaded, authReady, me } = useDb();
  useEffect(() => {
    // wait for the database and the login; then take the ride once – later refreshes of the
    // store must not reset an offset that is being edited
    if (!dbLoaded || !authReady || loaded) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- rides come from the browser-side store
    setRoute(loadAllRoutes().find(r => r.id === routeId) ?? null);
    setLoaded(true);
  }, [routeId, dbLoaded, authReady, loaded]);

  const videoDur = route?.durationSeconds ?? 0;
  // Strecke ohne Zeitstempel (Google-Maps-Link, GPX ohne Zeiten): statt Versatz Pausen auf der Strecke –
  // Stelle anklicken, eingeben wie lange man dort stand; den Rest rechnet die App
  const pinMode = !!route && (!!route.estimated || (!route.timeline && route.source === 'track'));
  const [pauses, setPauses] = useState<RoutePause[]>([]);
  const line = useLine(route);
  const anchors = useMemo(() => anchorsFromPauses(pauses, route?.baseTime, videoDur), [pauses, route?.baseTime, videoDur]);
  const pinTl = useMemo(
    () => (pinMode && route ? buildEstimatedTimeline({ baseTime: route.baseTime, anchors, videoDur, distanceKm: line.km }) : undefined),
    [pinMode, route, anchors, videoDur, line.km],
  );
  const tl = pinMode ? pinTl : route?.timeline;
  const isOwn = useMemo(() => !!routeId && loaded && !!me && loadUserRoutes().some(r => r.id === routeId), [routeId, loaded, me]);

  const [offset, setOffsetState] = useState(0);
  const savedOffset = route?.syncOffset ?? 0;
  const [prevRoute, setPrevRoute] = useState(route);
  if (route !== prevRoute) {
    setPrevRoute(route);
    if (route) { setOffsetState(route.estimated ? 0 : route.syncOffset ?? 0); setPauses(route.pauses ?? []); }
  }
  const setOffset = useCallback((o: number) => {
    if (!tl) return;
    setOffsetState(+clampOffset(o, videoDur, tl).toFixed(1));
  }, [tl, videoDur]);

  const [videoTime, setVideoTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  const trackTime = videoTime + offset;
  const posFrac = tl ? distAtTrackTime(tl, trackTime) : 0;
  const coverFrom = tl ? distAtTrackTime(tl, offset) : 0;
  const coverTo = tl ? distAtTrackTime(tl, offset + videoDur) : 0;

  // ── Trim: [start, end] in track seconds. `auto` = follows the video window ──
  const [trimAuto, setTrimAuto] = useState(true);
  const [manualTrim, setManualTrim] = useState<[number, number]>([0, 0]);
  const trackDur = tl?.durationSeconds ?? 0;
  const videoTrim: [number, number] = [Math.max(0, Math.min(trackDur, offset)), Math.max(0, Math.min(trackDur, offset + videoDur))];
  const trim: [number, number] = trimAuto ? videoTrim : manualTrim;
  const setTrim = useCallback((a: number, b: number) => {
    const lo = Math.max(0, Math.min(a, trackDur - MIN_TRIM_SECONDS));
    const hi = Math.min(trackDur, Math.max(b, lo + MIN_TRIM_SECONDS));
    setManualTrim([+lo.toFixed(1), +hi.toFixed(1)]);
    setTrimAuto(false);
  }, [trackDur]);
  const trimFrom = tl ? distAtTrackTime(tl, trim[0]) : 0;
  const trimTo = tl ? distAtTrackTime(tl, trim[1]) : 1;
  const cutsSomething = !!tl && (trim[0] > 0.5 || trim[1] < trackDur - 0.5);

  // floating video window: top right of the map, 400 px wide
  const videoWindowDefault = useMemo(() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const w = Math.min(400, vw - 24), h = Math.round(w * 9 / 16) + 34; // Handy: ganze Breite minus Rand
    return { x: Math.max(12, vw - w - 16), y: 12, width: w, height: h };
  }, []);

  // ── YouTube player ──
  const playerRef = useRef<YTPlayer | null>(null);
  const playerMount = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!route || !playerMount.current) return;
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | null = null;
    const mount = document.createElement('div');
    playerMount.current.appendChild(mount);
    waitForYT().then(YT => {
      if (cancelled) return;
      playerRef.current = new YT.Player(mount, {
        videoId: route.videoId,
        width: '100%', height: '100%',
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onStateChange: (e: { data: number }) => setPlaying(e.data === 1),
        },
      });
      poll = setInterval(() => {
        const p = playerRef.current;
        if (p?.getCurrentTime) setVideoTime(p.getCurrentTime() || 0);
      }, 100);
    }).catch(() => {});
    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      try { playerRef.current?.destroy(); } catch {}
      playerRef.current = null;
      mount.remove();
    };
  }, [route]);

  const seekVideo = useCallback((sec: number) => {
    const v = Math.max(0, Math.min(videoDur, sec));
    setVideoTime(v);
    try { playerRef.current?.seekTo(v, true); } catch {}
  }, [videoDur]);
  const togglePlay = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    if (playing) p.pauseVideo(); else p.playVideo();
  }, [playing]);

  // ── Map ──
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!route || !mapEl.current || line.coords.length < 2) return;
    let style: MapStyleId = 'satellite';
    try {
      const s = localStorage.getItem('routecam.mapStyle') as MapStyleId | null;
      if (s && MAP_STYLES.some(m => m.id === s)) style = s;
    } catch {}
    maplibregl.setWorkerUrl(`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/maplibre/maplibre-gl-worker.mjs`);
    const map = new maplibregl.Map({ container: mapEl.current, style: buildMapStyle(style), attributionControl: { compact: true } });
    mapRef.current = map;
    const b = new maplibregl.LngLatBounds();
    line.coords.forEach(c => b.extend(c));
    // Route in den freien Teil der Karte: am Rechner liegt das Video rechts, am Handy oben über die ganze Breite
    const padding = () => {
      const w = mapEl.current?.clientWidth ?? 1280;
      return w < 640
        ? { top: videoWindowDefault.y + videoWindowDefault.height + 24, bottom: 28, left: 28, right: 28 }
        : { top: 70, bottom: 40, left: 40, right: 440 };
    };
    map.fitBounds(b, { padding: padding(), duration: 0 });
    map.on('load', () => {
      const empty = { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: line.coords } };
      map.addSource('track', { type: 'geojson', data: empty });
      map.addSource('cut', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('covered', { type: 'geojson', data: { ...empty, geometry: { ...empty.geometry, coordinates: [] } } });
      // parts that will be cut away: thin, dashed, reddish
      map.addLayer({ id: 'cut', type: 'line', source: 'cut', paint: { 'line-color': '#ff6b5a', 'line-opacity': 0.75, 'line-width': 2, 'line-dasharray': [1.5, 1.5] }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      map.addLayer({ id: 'track', type: 'line', source: 'track', paint: { 'line-color': '#ffffff', 'line-opacity': 0.45, 'line-width': 3 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      map.addLayer({ id: 'covered', type: 'line', source: 'covered', paint: { 'line-color': LIME, 'line-width': 5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      setMapReady(true);
    });
    const el = document.createElement('div');
    el.style.cssText = `width:16px;height:16px;border-radius:50%;background:${LIME};border:3px solid #000;box-shadow:0 0 0 2px ${LIME}66`;
    markerRef.current = new maplibregl.Marker({ element: el }).setLngLat(line.coords[0]).addTo(map);

    // keep the canvas in step with the layout (window resize, side column, hidden tab)
    const ro = new ResizeObserver(() => { map.resize(); });
    ro.observe(mapEl.current);
    let fitted = false;
    map.on('resize', () => {
      if (fitted || !mapEl.current?.clientWidth) return;
      fitted = true;
      map.fitBounds(b, { padding: padding(), duration: 0 });
    });
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; setMapReady(false); };
  }, [route, line, videoWindowDefault]);

  // covered stretch + kept/cut parts of the track. Beim Ziehen kommen viele Werte pro Sekunde –
  // die Karte wird höchstens alle ~70 ms neu befüllt, sonst bremst sie den Balken aus (er springt dann in Schritten).
  const mapDataRef = useRef({ coverFrom, coverTo, trimFrom, trimTo });
  const mapTimer = useRef<number | null>(null);
  useEffect(() => {
    mapDataRef.current = { coverFrom, coverTo, trimFrom, trimTo };
    const map = mapRef.current;
    if (!map || !mapReady || mapTimer.current !== null) return;
    mapTimer.current = window.setTimeout(() => {
      mapTimer.current = null;
      const { coverFrom, coverTo, trimFrom, trimTo } = mapDataRef.current;
      // only what stays in the ride – a part cut away shows as dashed red even where the video covers it
      (map.getSource('covered') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line.slice(Math.max(coverFrom, trimFrom), Math.min(coverTo, trimTo)) } });
      (map.getSource('track') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line.slice(trimFrom, trimTo) } });
      const parts = [line.slice(0, trimFrom), line.slice(trimTo, 1)].filter(c => c.length > 1);
      (map.getSource('cut') as maplibregl.GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: parts.map(c => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: c } })),
      });
    }, 70);
  }, [mapReady, coverFrom, coverTo, trimFrom, trimTo, line]);
  useEffect(() => () => { if (mapTimer.current !== null) clearTimeout(mapTimer.current); }, []);
  useEffect(() => {
    const p = line.pointAt(posFrac);
    if (p) markerRef.current?.setLngLat(p);
  }, [posFrac, line]);


  // ── Pausen auf der Strecke (nur ohne Zeitstempel) ──
  // edit: offenes Fenster an einer Stelle der Strecke (neue Pause oder bestehende ändern)
  const [edit, setEdit] = useState<{ d: number; index: number | null; min: string; sec: string; x: number; y: number } | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  useEffect(() => {
    if (!pinError) return;
    const id = setTimeout(() => setPinError(null), 5000);
    return () => clearTimeout(id);
  }, [pinError]);
  const pausedTotal = pauses.reduce((sum, p) => sum + p.s, 0);

  const posFracRef = useRef(0);
  useLayoutEffect(() => { posFracRef.current = posFrac; });
  /** Stelle der Strecke (0–1) am Klickpunkt; bei mehreren Treffern (Strecke kreuzt sich) die zur aktuellen Position nächste */
  const fracAt = useCallback((lngLat: maplibregl.LngLat): number | null => {
    const map = mapRef.current;
    if (!map || line.coords.length < 2) return null;
    const p = map.project(lngLat);
    const px = line.coords.map(c => map.project(c));
    const hits: { f: number; dist: number }[] = [];
    for (let i = 1; i < px.length; i++) {
      const a = px[i - 1], b = px[i];
      const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
      const k = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
      const dist = Math.hypot(a.x + k * dx - p.x, a.y + k * dy - p.y);
      if (dist < 40) hits.push({ f: line.frac[i - 1] + k * (line.frac[i] - line.frac[i - 1]), dist });
    }
    if (!hits.length) return null;
    const minDist = Math.min(...hits.map(h => h.dist));
    const near = hits.filter(h => h.dist <= minDist + 15);
    return near.reduce((best, h) => (Math.abs(h.f - posFracRef.current) < Math.abs(best.f - posFracRef.current) ? h : best)).f;
  }, [line]);

  /** Fenster an einer Stelle öffnen: neue Pause (index null) oder bestehende */
  const openEditor = useCallback((d: number, index: number | null) => {
    const map = mapRef.current, pos = line.pointAt(d);
    if (!map || !pos) return;
    const pt = map.project(pos);
    const s = index !== null ? pauses[index].s : 60;
    setEdit({ d, index, min: String(Math.floor(s / 60)), sec: String(Math.round(s % 60)), x: pt.x, y: pt.y });
    setPinError(null);
  }, [line, pauses]);
  const openRef = useRef(openEditor);
  useLayoutEffect(() => { openRef.current = openEditor; });
  const pausesRef = useRef(pauses);
  useLayoutEffect(() => { pausesRef.current = pauses; });

  // Klick auf die Strecke → Pause an dieser Stelle (liegt dort schon eine, wird sie geöffnet)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !pinMode) return;
    const onClick = (e: maplibregl.MapMouseEvent) => {
      const f = fracAt(e.lngLat);
      if (f === null) { setEdit(null); return; }
      const near = pausesRef.current.findIndex(p => Math.abs(p.d - f) * line.km < 0.05); // innerhalb 50 m
      openRef.current(near >= 0 ? pausesRef.current[near].d : f, near >= 0 ? near : null);
    };
    const close = () => setEdit(null);
    map.on('click', onClick);
    map.on('movestart', close);
    const c = map.getCanvas();
    c.style.cursor = 'pointer';
    return () => { map.off('click', onClick); map.off('movestart', close); c.style.cursor = ''; };
  }, [mapReady, pinMode, fracAt, line.km]);

  const saveEdit = useCallback(() => {
    if (!edit) return;
    const s = (parseInt(edit.min || '0', 10) || 0) * 60 + (parseInt(edit.sec || '0', 10) || 0);
    if (s <= 0) { setPinError(t('Bitte eine Dauer eingeben.')); return; }
    const others = pauses.filter((_, i) => i !== edit.index).reduce((sum, p) => sum + p.s, 0);
    if (others + s >= videoDur) { setPinError(t('Alle Pausen zusammen müssen kürzer sein als das Video ({time}).', { time: fmt(videoDur) })); return; }
    const next: RoutePause = { d: +edit.d.toFixed(5), s };
    setPauses(list => edit.index !== null ? list.map((p, i) => (i === edit.index ? next : p)) : [...list, next].sort((a, b) => a.d - b.d));
    setEdit(null);
  }, [edit, pauses, videoDur]);
  const removePause = useCallback((index: number) => {
    setPauses(list => list.filter((_, i) => i !== index));
    setEdit(null);
  }, []);

  // Pausen als Nadeln auf der Karte, mit ihrer Dauer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !pinMode) return;
    const markers = pauses.map((p, i) => {
      const pos = line.pointAt(p.d);
      if (!pos) return null;
      const el = document.createElement('button');
      el.type = 'button';
      el.title = t('Pause {time} – ändern oder entfernen', { time: fmt(p.s) });
      el.style.cssText = 'height:22px;padding:0 8px;border-radius:11px;display:flex;align-items:center;gap:4px;font:700 11px/1 ui-monospace,monospace;cursor:pointer;border:2px solid #000;box-shadow:0 2px 6px rgba(0,0,0,.5);background:#f59e0b;color:#000;white-space:nowrap';
      el.textContent = `❚❚ ${fmt(p.s)}`;
      el.addEventListener('click', ev => { ev.stopPropagation(); openRef.current(p.d, i); });
      return new maplibregl.Marker({ element: el }).setLngLat(pos).addTo(map);
    });
    return () => { markers.forEach(m => m?.remove()); };
  }, [pauses, mapReady, pinMode, line]);

  // ── Keyboard: ←/→ 1 s, Shift 10 s, Alt 0.1 s; Space play/pause ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
        if (pinMode) seekVideo(videoTime + (e.key === 'ArrowRight' ? step : -step));
        else setOffset(offset + (e.key === 'ArrowRight' ? step : -step));
      } else if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [offset, setOffset, togglePlay, pinMode, seekVideo, videoTime]);

  async function finish() {
    if (!route) return;
    if (pinMode) {
      try {
        await updateUserRoute(route.id, { estimated: true, pauses, anchors, timeline: pinTl, syncOffset: 0, synced: true });
      } catch (e) {
        alert((e as Error).message);
        return;
      }
      releaseRideCreated(route.id);
      router.push(`/?route=${route.id}`);
      return;
    }
    const cut = cutsSomething ? trimRoute({ ...route, syncOffset: offset }, trim[0], trim[1]) : null;
    try {
      await updateUserRoute(route.id, { syncOffset: offset, ...(cut ?? {}), synced: true });
    } catch (e) {
      alert((e as Error).message);
      return;
    }
    releaseRideCreated(route.id);
    router.push(`/?route=${route.id}`);
  }

  // ── Empty states ──
  if (!loaded) return <div className="h-dvh bg-black" />;
  if (!route || !tl || !isOwn) {
    return (
      <div className="h-dvh bg-black text-white flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <p className="text-lg font-semibold">{!route ? t('Fahrt nicht gefunden') : t('Diese Fahrt lässt sich nicht ausrichten')}</p>
          <p className="text-sm text-white/50 mt-2">
            {!route ? t('Der Link ist ungültig oder die Fahrt wurde gelöscht.')
              : !isOwn ? t('Nur eigene Fahrten, die mit einer GPS-Datei angelegt wurden, können ausgerichtet werden.')
              : t('Die GPS-Datei dieser Fahrt hat keine Zeitstempel (oder die Fahrt wurde vor dieser Funktion angelegt). Sie läuft gleichmäßig über die Strecke.')}
          </p>
          <button onClick={() => router.push('/dashboard')} className="mt-6 px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-sm">{t('Zum Dashboard')}</button>
        </div>
      </div>
    );
  }

  const overhangStart = offset < 0;
  const overhangEnd = offset + videoDur > tl.durationSeconds;

  return (
    <div className="h-dvh w-full bg-black text-white font-sans flex flex-col overflow-hidden">
      {/* top bar */}
      <header className="h-14 shrink-0 flex items-center gap-3 px-4 border-b border-white/10">
        <button onClick={() => router.back()} className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center" title={t('Zurück ohne Speichern')}><ArrowLeft size={18} /></button>
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-white/40">{pinMode ? t('Pausen auf der Strecke') : t('Video ausrichten')}</div>
          <div className="text-sm font-semibold truncate">{route.name}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => { if (pinMode) { setPauses(route.pauses ?? []); setEdit(null); } else { setOffset(savedOffset); setTrimAuto(true); } }}
            disabled={pinMode ? JSON.stringify(pauses) === JSON.stringify(route.pauses ?? []) : Math.abs(offset - savedOffset) < 0.05 && trimAuto}
            className="h-9 px-3 rounded-full text-sm text-white/70 hover:bg-white/10 disabled:opacity-30 flex items-center gap-1.5"
          ><RotateCcw size={14} /> {t('Zurücksetzen')}</button>
          <button onClick={finish} className="h-9 px-4 rounded-full text-sm font-semibold bg-[#CCFF00] text-black hover:brightness-110 flex items-center gap-1.5">
            <Check size={15} /> {t('Fertig')}
          </button>
        </div>
      </header>

      {/* map over the full width, video as a floating window (like on the map page) */}
      <div className="flex-1 min-h-0 relative">
        <div className="absolute inset-0"><div ref={mapEl} style={{ width: '100%', height: '100%' }} /></div>

        {/* key figures */}
        {pinMode ? (
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-2 max-w-[calc(100%-24px)] pointer-events-none">
          <div className="rounded-lg bg-black/70 backdrop-blur-md border border-white/10 px-3 py-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span><span className="text-white/40">{t('Video')}</span> <span className="font-mono">{fmt(videoDur)}</span></span>
            <span><span className="text-white/40">{t('Strecke')}</span> <span className="font-mono">{line.km.toFixed(1)} km</span></span>
            <span><span className="text-white/40">{t('Position')}</span> <span className="font-mono">km {(posFrac * line.km).toFixed(1)}</span></span>
          </div>
          <div className="rounded-lg bg-black/75 backdrop-blur-md border border-[#CCFF00]/30 px-3.5 py-3 text-xs text-white/75 max-w-sm leading-relaxed">
            <p className="text-sm font-semibold text-white">{t('Wo hast du angehalten?')}</p>
            <p className="mt-1">{t('Klicke auf der Strecke auf die Stelle und gib ein, wie lange du dort standest. Den Rest rechnet RouteCam aus.')}</p>
            <p className="mt-1 text-white/45">{t('Mit Play prüfst du, ob der Punkt auf der Karte zum Video passt.')}</p>
          </div>
        </div>
        ) : (
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-2 max-w-[calc(100%-24px)] pointer-events-none">
          <div className="rounded-lg bg-black/70 backdrop-blur-md border border-white/10 px-3 py-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span><span className="text-white/40">{t('Video')}</span> <span className="font-mono">{fmt(videoDur)}</span></span>
            <span><span className="text-white/40">{t('Aufzeichnung')}</span> <span className="font-mono">{fmt(tl.durationSeconds)} · {tl.distanceKm.toFixed(1)} km</span></span>
            <span><span className="text-white/40">{t('Video zeigt')}</span> <span className="font-mono">km {(coverFrom * tl.distanceKm).toFixed(1)} – {(coverTo * tl.distanceKm).toFixed(1)}</span></span>
            <span className={cutsSomething ? 'text-[#ff8a7a]' : ''}>
              <span className="text-white/40">{t('Fahrt')}</span>{' '}
              <span className="font-mono">{fmt(trim[1] - trim[0])} · {((trimTo - trimFrom) * tl.distanceKm).toFixed(1)} km</span>
              {cutsSomething && <span className="text-white/40"> {t('(gekürzt)')}</span>}
            </span>
          </div>
          {cutsSomething && (
            <p className="rounded-lg bg-black/70 backdrop-blur-md border border-[#ff6b5a]/30 px-3 py-2 text-xs text-[#ffb0a6] flex gap-1.5 max-w-md"><Scissors size={14} className="shrink-0 mt-px" />
              {t('Die rot gestrichelten Teile werden mit „Fertig“ endgültig entfernt – sie gehören dann nicht mehr zur Fahrt.')}
            </p>
          )}
          {(overhangStart || overhangEnd) && (
            <p className="rounded-lg bg-black/70 backdrop-blur-md border border-amber-400/30 px-3 py-2 text-xs text-amber-300 flex gap-1.5 max-w-md"><Info size={14} className="shrink-0 mt-px" />
              {overhangStart && overhangEnd ? t('Das Video ragt an beiden Enden über die Aufzeichnung hinaus. Dort bleibt der Punkt am Start bzw. am Ende stehen.')
                : overhangStart ? t('Das Video ragt vorne über die Aufzeichnung hinaus. Dort bleibt der Punkt am Start stehen.')
                : t('Das Video ragt hinten über die Aufzeichnung hinaus. Dort bleibt der Punkt am Ende stehen.')}
            </p>
          )}
        </div>
        )}

        {pinMode && edit && (
          <PauseEditor
            edit={edit}
            km={edit.d * line.km}
            onChange={(min, sec) => setEdit(e => (e ? { ...e, min, sec } : e))}
            onSave={saveEdit}
            onRemove={edit.index !== null ? () => removePause(edit.index!) : undefined}
            onCancel={() => setEdit(null)}
            error={pinError}
          />
        )}

        <Rnd
          default={videoWindowDefault}
          minWidth={240}
          minHeight={135 + 34}
          lockAspectRatio={16 / 9}
          lockAspectRatioExtraHeight={34}
          bounds="parent"
          dragHandleClassName="sync-drag"
          onDragStart={lockIframes}
          onDragStop={unlockIframes}
          onResizeStart={lockIframes}
          onResizeStop={unlockIframes}
          className="z-20 rounded-xl overflow-hidden border border-white/20 bg-black/60 backdrop-blur-md shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)] flex flex-col"
        >
          <div className="sync-drag h-[34px] shrink-0 flex items-center gap-2 px-3 cursor-move text-white/50 hover:text-white/90">
            <span className="flex-1 min-w-0 text-[11px] font-bold tracking-wide uppercase text-white/80 truncate select-none">{t('Video')}</span>
            <span data-tip={t('Ziehen zum Verschieben')} className="inline-flex shrink-0"><GripHorizontal size={18} /></span>
          </div>
          <div className="relative bg-black" style={{ height: 'calc(100% - 34px)' }}>
            <div ref={playerMount} className="absolute inset-0 [&_iframe]:w-full [&_iframe]:h-full" />
          </div>
        </Rnd>
      </div>

      {pinMode ? (
        <PinPanel
          videoDur={videoDur}
          videoTime={videoTime}
          playing={playing}
          onTogglePlay={togglePlay}
          onSeekVideo={seekVideo}
          pauses={pauses}
          anchors={anchors}
          lineKm={line.km}
          pausedTotal={pausedTotal}
          onOpen={i => openEditor(pauses[i].d, i)}
          onRemove={removePause}
        />
      ) : (
      <SyncTimeline
        tl={tl}
        videoDur={videoDur}
        offset={offset}
        trim={trim}
        trimAuto={trimAuto}
        onTrim={setTrim}
        onTrimToVideo={() => setTrimAuto(true)}
        videoTime={videoTime}
        playing={playing}
        onTogglePlay={togglePlay}
        onOffset={setOffset}
        onSeekVideo={seekVideo}
      />
      )}
    </div>
  );
}

// ── Timeline: track speed curve + draggable video bar ──
function SyncTimeline({ tl, videoDur, offset, trim, trimAuto, onTrim, onTrimToVideo, videoTime, playing, onTogglePlay, onOffset, onSeekVideo }: {
  tl: TrackTimeline; videoDur: number; offset: number; videoTime: number; playing: boolean;
  trim: [number, number]; trimAuto: boolean; onTrim: (a: number, b: number) => void; onTrimToVideo: () => void;
  onTogglePlay: () => void; onOffset: (o: number) => void; onSeekVideo: (s: number) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  // Full range: the whole track plus room for the video to overhang.
  // `view` = zoomed window (null = show everything). It is frozen while dragging the bar.
  const dragging = useRef<{ startX: number; startOffset: number; wasNull: boolean } | null>(null);
  const [view, setView] = useState<[number, number] | null>(null);
  const fullRange = useCallback((): [number, number] => {
    const lo = Math.min(0, offset), hi = Math.max(tl.durationSeconds, offset + videoDur);
    const pad = (hi - lo) * 0.04;
    return [lo - pad, hi + pad];
  }, [offset, videoDur, tl.durationSeconds]);
  const [f0, f1] = fullRange();
  const [r0, r1] = view ?? [f0, f1];
  // Handy: nur das Nötigste – kein Spurname, keine Feinschritte, kein Kürzen/Zoom (Griffe und Ziehen gehen weiter)
  const compact = width < 640;
  const LABEL_W = compact ? 8 : 72;
  const plotW = Math.max(100, width - LABEL_W - 16);
  const x = (t: number) => LABEL_W + ((t - r0) / (r1 - r0)) * plotW;
  const tAt = (px: number) => r0 + ((px - LABEL_W) / plotW) * (r1 - r0);
  const MIN_SPAN = 20; // seconds visible at most zoom

  // zoom around a track time (anchor stays under the cursor); factor < 1 = zoom in
  const zoomAt = useCallback((anchor: number, factor: number) => {
    setView(prev => {
      const [a, b] = prev ?? fullRange();
      const [F0, F1] = fullRange();
      const span = Math.min(F1 - F0, Math.max(MIN_SPAN, (b - a) * factor));
      if (span >= F1 - F0 - 0.001) return null; // back to "everything"
      const k = (anchor - a) / (b - a);
      let n0 = anchor - k * span;
      n0 = Math.max(F0, Math.min(F1 - span, n0));
      return [n0, n0 + span];
    });
  }, [fullRange]);
  const panBy = useCallback((dt: number) => {
    setView(prev => {
      if (!prev) return prev;
      const [F0, F1] = fullRange();
      const span = prev[1] - prev[0];
      const n0 = Math.max(F0, Math.min(F1 - span, prev[0] + dt));
      return [n0, n0 + span];
    });
  }, [fullRange]);
  const fitVideo = () => {
    const pad = Math.max(10, videoDur * 0.08);
    const [F0, F1] = fullRange();
    const a = Math.max(F0, offset - pad), b = Math.min(F1, offset + videoDur + pad);
    setView(b - a >= F1 - F0 - 0.001 ? null : [a, b]);
  };

  // Mouse wheel / trackpad: vertical = zoom at the cursor (also pinch), horizontal or Shift = pan
  const zoomAtRef = useRef(zoomAt);
  const panByRef = useRef(panBy);
  const viewRef = useRef({ r0, r1, plotW, labelW: LABEL_W });
  useLayoutEffect(() => { zoomAtRef.current = zoomAt; panByRef.current = panBy; viewRef.current = { r0, r1, plotW, labelW: LABEL_W }; });
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { r0, r1, plotW, labelW } = viewRef.current;
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left - 8; // px-2 padding
      const anchor = r0 + ((px - labelW) / plotW) * (r1 - r0);
      const horizontal = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (horizontal) panByRef.current(((e.shiftKey ? e.deltaY : e.deltaX) / plotW) * (r1 - r0));
      else zoomAtRef.current(Math.max(r0, Math.min(r1, anchor)), Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0025)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const speeds = useMemo(() => speedCurve(tl, SPEED_STEP), [tl]); // SPEED_STEP s per sample
  const stops = useMemo(() => findStops(tl, 20), [tl]);
  const maxSpeed = Math.max(30, ...speeds);

  const TRACK_Y = 28, TRACK_H = 56, VIDEO_Y = TRACK_Y + TRACK_H + 14, VIDEO_H = 30;
  const H = VIDEO_Y + VIDEO_H + 10;
  const speedPath = useMemo(() => {
    const i0 = Math.max(0, Math.floor(r0 / SPEED_STEP) - 1), i1 = Math.min(speeds.length - 1, Math.ceil(r1 / SPEED_STEP) + 1);
    if (i1 <= i0) return '';
    const pts: string[] = [];
    for (let i = i0; i <= i1; i++) pts.push(`${x(i * SPEED_STEP).toFixed(1)},${(TRACK_Y + TRACK_H - (speeds[i] / maxSpeed) * TRACK_H).toFixed(1)}`);
    return `M ${x(i0 * SPEED_STEP)},${TRACK_Y + TRACK_H} L ${pts.join(' L ')} L ${x(i1 * SPEED_STEP)},${TRACK_Y + TRACK_H} Z`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speeds, maxSpeed, r0, r1, plotW]);

  // ticks every 1/2/5/10/15/30 min depending on range
  const span = r1 - r0;
  const tickStep = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600].find(s => span / s <= 12) ?? 7200;
  const ticks: number[] = [];
  for (let t = Math.ceil(r0 / tickStep) * tickStep; t <= r1; t += tickStep) ticks.push(t);

  function onBarDown(e: React.PointerEvent) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragging.current = { startX: e.clientX, startOffset: offset, wasNull: view === null };
    setView([r0, r1]);
  }
  function onBarMove(e: React.PointerEvent) {
    const d = dragging.current;
    if (!d) return;
    const dt = ((e.clientX - d.startX) / plotW) * (r1 - r0);
    let next = d.startOffset + dt;
    // snap the video start to the start of the track
    if (Math.abs(next) < ((r1 - r0) / plotW) * 6) next = 0; // within 6 px
    onOffset(next);
  }
  function onBarUp() {
    const wasNull = dragging.current?.wasNull;
    dragging.current = null;
    if (wasNull) setView(null);
  }
  // trim handles on the track lane: drag the start or the end of what stays in the ride
  const trimDrag = useRef<{ side: 0 | 1; startX: number; start: number } | null>(null);
  function onTrimDown(side: 0 | 1) {
    return (e: React.PointerEvent) => {
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
      trimDrag.current = { side, startX: e.clientX, start: trim[side] };
    };
  }
  function onTrimMove(e: React.PointerEvent) {
    const d = trimDrag.current;
    if (!d) return;
    let t = d.start + ((e.clientX - d.startX) / plotW) * (r1 - r0);
    // snap to the video's edges and the track's ends (within 6 px)
    const snap = ((r1 - r0) / plotW) * 6;
    for (const target of [offset, offset + videoDur, 0, tl.durationSeconds]) if (Math.abs(t - target) < snap) t = target;
    if (d.side === 0) onTrim(t, trim[1]); else onTrim(trim[0], t);
  }
  function onTrimUp() { trimDrag.current = null; }

  // click on the track lane / ruler → move the video to that moment (if the video covers it)
  function onLaneClick(e: React.MouseEvent<SVGSVGElement>) {
    if (dragging.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const t = tAt(e.clientX - rect.left);
    onSeekVideo(t - offset);
  }

  const head = offset + videoTime;
  return (
    <div className="shrink-0 border-t border-white/10 bg-[#0b0d10]">
      <div className="min-h-11 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 border-b border-white/5">
        <button onClick={onTogglePlay} aria-label={playing ? t('Pause') : t('Play')} className={`h-8 rounded-full bg-[#CCFF00] text-black font-semibold hover:brightness-110 text-sm flex items-center justify-center gap-1.5 ${compact ? 'w-8' : 'px-3'}`}>
          {playing ? <Pause size={14} /> : <Play size={14} />} {!compact && (playing ? t('Pause') : t('Play'))}
        </button>
        <span className="font-mono text-sm text-white/70">{t('Video')} {fmt(videoTime, true)} <span className="text-white/35">/ {fmt(videoDur)}</span></span>
        <span className="text-white/30 text-sm">=</span>
        <label className="flex items-center gap-2" title={t('Stelle der Aufzeichnung, die das Video gerade zeigt – eintippen (z. B. 8:40) oder den Video-Balken ziehen')}>
          {!compact && <span className="text-[10px] font-bold uppercase tracking-widest text-[#CCFF00]">{t('Aufzeichnung')}</span>}
          <TimeInput value={head} onCommit={t => onOffset(t - videoTime)} />
        </label>
        {!compact && <>
        <div className="flex items-center gap-1">
          {[-1, -0.1, 0.1, 1].map(d => (
            <button key={d} onClick={() => onOffset(offset + d)} className="h-8 px-2 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-xs font-mono">
              {d > 0 ? '+' : '−'}{Math.abs(d)}s
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 ml-2 pl-3 border-l border-white/10" title={t('Was außerhalb der Griffe liegt, wird beim Fertigstellen von der Fahrt abgeschnitten')}>
          <Scissors size={14} className="text-white/45" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/45">{t('Kürzen')}</span>
          <span className="font-mono text-xs text-white/70">{fmt(trim[0])} – {fmt(trim[1])}</span>
          <button onClick={onTrimToVideo} disabled={trimAuto} title={t('Anfang und Ende wieder genau auf das Video setzen')} className="h-8 px-2 rounded-md bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-40 text-xs">
            {trimAuto ? t('folgt dem Video') : t('Auf Video setzen')}
          </button>
          <button onClick={() => onTrim(0, tl.durationSeconds)} disabled={trim[0] < 0.5 && trim[1] > tl.durationSeconds - 0.5} title={t('Nichts abschneiden')} className="h-8 px-2 rounded-md bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-30 text-xs">{t('Nichts kürzen')}</button>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/35 mr-1">{t('Zoom')}</span>
          <button onClick={() => zoomAt(Math.max(r0, Math.min(r1, head)), 1.6)} disabled={!view} title={t('Herauszoomen')} className="w-8 h-8 rounded-md bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-30 flex items-center justify-center"><ZoomOut size={15} /></button>
          <button onClick={() => zoomAt(Math.max(r0, Math.min(r1, head)), 1 / 1.6)} disabled={r1 - r0 <= MIN_SPAN + 0.01} title={t('Hineinzoomen (am roten Abspielkopf) – auch mit Mausrad / Trackpad')} className="w-8 h-8 rounded-md bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-30 flex items-center justify-center"><ZoomIn size={15} /></button>
          <button onClick={fitVideo} title={t('Auf das Video zoomen')} className="h-8 px-2 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-xs">{t('Video')}</button>
          <button onClick={() => setView(null)} disabled={!view} title={t('Alles zeigen')} className="h-8 px-2 rounded-md bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-30 text-xs">{t('Alles')}</button>
        </div>
        </>}
      </div>
      <div ref={wrap} className="px-2 select-none">
        <svg width={width} height={H} onClick={onLaneClick} style={{ display: 'block', cursor: 'pointer', touchAction: 'none' }}>
          <defs>
            <clipPath id="sync-plot"><rect x={LABEL_W} y={0} width={plotW} height={H} /></clipPath>
            <pattern id="sync-cut" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width={6} height={6} fill="rgba(11,13,16,0.72)" />
              <line x1={0} y1={0} x2={0} y2={6} stroke="rgba(255,107,90,0.45)" strokeWidth={2} />
            </pattern>
          </defs>
          <g clipPath="url(#sync-plot)">
          {/* ruler */}
          {ticks.map(t => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={14} y2={H - 6} stroke="rgba(255,255,255,0.06)" />
              <text x={x(t) + 3} y={11} fill="rgba(255,255,255,0.35)" fontSize={9} fontFamily="monospace">{fmt(t)}</text>
            </g>
          ))}
          </g>
          {!compact && <>
          <text x={8} y={TRACK_Y + TRACK_H / 2 + 3} fill="rgba(255,255,255,0.45)" fontSize={10} fontWeight={700} letterSpacing={1}>{t('TRACK')}</text>
          <text x={8} y={VIDEO_Y + VIDEO_H / 2 + 3} fill="rgba(255,255,255,0.45)" fontSize={10} fontWeight={700} letterSpacing={1}>{t('VIDEO')}</text>
          </>}

          <g clipPath="url(#sync-plot)">
          {/* track: full recording as a lane, speed as a waveform, stops marked */}
          <rect x={x(0)} y={TRACK_Y} width={x(tl.durationSeconds) - x(0)} height={TRACK_H} rx={4} fill="rgba(255,255,255,0.03)" />
          <path d={speedPath} fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.5)" strokeWidth={1} />
          {stops.map(s => (
            <rect key={s.from} x={x(s.from)} y={TRACK_Y + TRACK_H - 4} width={Math.max(2, x(s.to) - x(s.from))} height={4} fill="#f59e0b" opacity={0.8}>
              <title>{t('Stopp {time}', { time: fmt(s.to - s.from) })}</title>
            </rect>
          ))}

          {/* trimmed-away parts of the recording + the two trim handles */}
          {trim[0] > 0 && <rect x={x(0)} y={TRACK_Y} width={Math.max(0, x(trim[0]) - x(0))} height={TRACK_H} fill="url(#sync-cut)" pointerEvents="none" />}
          {trim[1] < tl.durationSeconds && <rect x={x(trim[1])} y={TRACK_Y} width={Math.max(0, x(tl.durationSeconds) - x(trim[1]))} height={TRACK_H} fill="url(#sync-cut)" pointerEvents="none" />}
          {([0, 1] as const).map(side => (
            <g key={side} onPointerDown={onTrimDown(side)} onPointerMove={onTrimMove} onPointerUp={onTrimUp} onClick={e => e.stopPropagation()} style={{ cursor: 'ew-resize' }}>
              <title>{side === 0 ? t('Anfang der Fahrt – ziehen zum Kürzen') : t('Ende der Fahrt – ziehen zum Kürzen')}</title>
              <rect x={x(trim[side]) - 8} y={TRACK_Y - 4} width={16} height={TRACK_H + 8} fill="transparent" />
              <rect x={x(trim[side]) - (side === 0 ? 0 : 5)} y={TRACK_Y - 3} width={5} height={TRACK_H + 6} rx={2} fill="#ffffff" />
              <line x1={x(trim[side]) + (side === 0 ? 2.5 : -2.5)} x2={x(trim[side]) + (side === 0 ? 2.5 : -2.5)} y1={TRACK_Y + TRACK_H / 2 - 6} y2={TRACK_Y + TRACK_H / 2 + 6} stroke="#0b0d10" strokeWidth={1.5} />
            </g>
          ))}

          {/* video bar = the covered window, also tinted on the track lane */}
          <rect x={x(offset)} y={TRACK_Y} width={x(offset + videoDur) - x(offset)} height={TRACK_H} fill={LIME} opacity={0.07} pointerEvents="none" />
          <g onPointerDown={onBarDown} onPointerMove={onBarMove} onPointerUp={onBarUp} onClick={e => e.stopPropagation()} style={{ cursor: 'grab' }}>
            <rect x={x(offset)} y={VIDEO_Y} width={Math.max(4, x(offset + videoDur) - x(offset))} height={VIDEO_H} rx={6}
              fill="rgba(204,255,0,0.18)" stroke={LIME} strokeWidth={1.5} />
            <text x={Math.max(x(offset), LABEL_W) + 10} y={VIDEO_Y + VIDEO_H / 2 + 4} fill={LIME} fontSize={11} fontWeight={600} pointerEvents="none">
              {t('Video {time} – ziehen zum Ausrichten', { time: fmt(videoDur) })}
            </text>
          </g>

          {/* playhead */}
          <line x1={x(head)} x2={x(head)} y1={14} y2={H - 4} stroke="#ef4444" strokeWidth={1.5} pointerEvents="none" />
          <circle cx={x(head)} cy={16} r={4} fill="#ef4444" pointerEvents="none" />
          </g>
        </svg>
        {/* overview / scrollbar while zoomed: drag the window to pan */}
        <div className="h-3 relative mb-1 touch-none" style={{ marginLeft: LABEL_W, width: plotW }}>
          {view && (
            <div
              className="absolute top-0.5 h-2 rounded-full bg-white/25 hover:bg-white/40 cursor-grab"
              style={{ left: `${((r0 - f0) / (f1 - f0)) * 100}%`, width: `${Math.max(2, ((r1 - r0) / (f1 - f0)) * 100)}%` }}
              onPointerDown={e => {
                (e.target as Element).setPointerCapture(e.pointerId);
                const startX = e.clientX;
                const start = r0;
                const move = (ev: PointerEvent) => panBy(start + ((ev.clientX - startX) / plotW) * (f1 - f0) - viewRef.current.r0);
                const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
                window.addEventListener('pointermove', move);
                window.addEventListener('pointerup', up);
              }}
            />
          )}
          {view && <div className="absolute top-1 h-1 inset-x-0 rounded-full bg-white/[0.05] -z-10" />}
        </div>
      </div>
    </div>
  );
}

// ── Ohne Zeitstempel: Fenster für eine Pause an einer Stelle der Strecke ──
function PauseEditor({ edit, km, onChange, onSave, onRemove, onCancel, error }: {
  edit: { x: number; y: number; min: string; sec: string; index: number | null }; km: number;
  onChange: (min: string, sec: string) => void; onSave: () => void; onRemove?: () => void; onCancel: () => void; error: string | null;
}) {
  const minRef = useRef<HTMLInputElement>(null);
  useEffect(() => { minRef.current?.focus(); minRef.current?.select(); }, []);
  const field = 'w-14 h-10 rounded-lg bg-[#121212] border border-white/15 focus:border-[#CCFF00] outline-none text-center font-mono text-lg text-white';
  const keys = (e: React.KeyboardEvent) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); };
  return (
    <div className="absolute z-30 w-64 -translate-x-1/2 rounded-xl border border-white/15 bg-[#161616]/95 backdrop-blur-md shadow-2xl p-3.5 text-white"
      style={{ left: edit.x, top: edit.y + 18 }} onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{edit.index !== null ? t('Pause ändern') : t('Hier angehalten')}</p>
        <span className="text-[11px] font-mono text-white/40">km {km.toFixed(1)}</span>
      </div>
      <p className="mt-0.5 text-xs text-white/50">{t('Wie lange hast du hier gestanden?')}</p>
      <div className="mt-2.5 flex items-center gap-2">
        <input ref={minRef} value={edit.min} onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 3), edit.sec)} onKeyDown={keys} inputMode="numeric" className={field} aria-label={t('Minuten')} />
        <span className="text-xs text-white/50">{t('Min.')}</span>
        <input value={edit.sec} onChange={e => onChange(edit.min, e.target.value.replace(/\D/g, '').slice(0, 2))} onKeyDown={keys} inputMode="numeric" className={field} aria-label={t('Sekunden')} />
        <span className="text-xs text-white/50">{t('Sek.')}</span>
      </div>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      <div className="mt-3 flex items-center gap-2">
        {onRemove && <button type="button" onClick={onRemove} className="h-8 px-2.5 rounded-full text-xs text-red-300 hover:bg-red-400/10">{t('Entfernen')}</button>}
        <button type="button" onClick={onCancel} className="ml-auto h-8 px-3 rounded-full text-xs text-white/70 hover:bg-white/10">{t('Abbrechen')}</button>
        <button type="button" onClick={onSave} className="h-8 px-3.5 rounded-full text-xs font-semibold bg-[#CCFF00] text-black hover:brightness-110">{t('Speichern')}</button>
      </div>
    </div>
  );
}

// ── Ohne Zeitstempel: Abspielen + Liste der Pausen ──
function PinPanel({ videoDur, videoTime, playing, onTogglePlay, onSeekVideo, pauses, anchors, lineKm, pausedTotal, onOpen, onRemove }: {
  videoDur: number; videoTime: number; playing: boolean; onTogglePlay: () => void; onSeekVideo: (s: number) => void;
  pauses: RoutePause[]; anchors: { v: number; d: number; until?: number }[]; lineKm: number; pausedTotal: number;
  onOpen: (index: number) => void; onRemove: (index: number) => void;
}) {
  const dur = Math.max(1, videoDur);
  // Zeitleiste des Videos: Pausen als orange Abschnitte – nur zum Anschauen und Springen
  return (
    <div className="shrink-0 border-t border-white/10 bg-[#0b0d10]">
      <div className="py-2 flex flex-wrap items-center gap-x-3 gap-y-2 px-4">
        <button onClick={onTogglePlay} aria-label={playing ? t('Pause') : t('Play')} className="h-8 px-3 rounded-full bg-[#CCFF00] text-black font-semibold hover:brightness-110 text-sm flex items-center justify-center gap-1.5">
          {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? t('Pause') : t('Play')}
        </button>
        <span className="font-mono text-sm text-white/70">{fmt(videoTime)} <span className="text-white/35">/ {fmt(videoDur)}</span></span>
        <span className="text-xs text-white/45">
          {pauses.length === 1
            ? t('1 Pause · {time}', { time: fmt(pausedTotal) })
            : pauses.length
            ? t('{n} Pausen · zusammen {time}', { n: pauses.length, time: fmt(pausedTotal) })
            : t('Noch keine Pause – klicke auf der Karte auf die Strecke, wo du angehalten hast.')}
        </span>
      </div>
      <div className="px-4 pb-2.5">
        <div className="relative h-2 rounded-full bg-white/[0.07] cursor-pointer"
          onClick={e => { const r = e.currentTarget.getBoundingClientRect(); onSeekVideo(((e.clientX - r.left) / r.width) * dur); }}>
          {anchors.map(a => a.until !== undefined && (
            <span key={a.v} className="absolute inset-y-0 rounded-full bg-amber-400" style={{ left: `${(a.v / dur) * 100}%`, width: `${Math.max(0.5, ((a.until - a.v) / dur) * 100)}%` }} />
          ))}
          <span className="absolute -top-1 w-1 h-4 rounded-full bg-[#ef4444]" style={{ left: `calc(${(videoTime / dur) * 100}% - 2px)` }} />
        </div>
        {!!pauses.length && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {pauses.map((p, i) => (
              <span key={`${p.d}-${i}`} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full text-xs border border-amber-400/40 bg-amber-400/10 text-amber-200">
                <button type="button" onClick={() => onOpen(i)} className="hover:underline">
                  ❚❚ <span className="font-mono">{fmt(p.s)}</span> <span className="opacity-60">· km {(p.d * lineKm).toFixed(1)}</span>
                </button>
                <button type="button" onClick={() => onRemove(i)} aria-label={t('Pause entfernen')} className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-white/15"><XIcon size={12} /></button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// "8:40", "8:40.5", "1:02:03", "520" or "520,5" → seconds (null if invalid)
function parseTime(input: string): number | null {
  const t = input.trim().replace(',', '.');
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(t)) return null;
  return t.split(':').reduce((acc, part) => acc * 60 + parseFloat(part), 0);
}

// Recording time at the current video position – shown large, editable by typing
function TimeInput({ value, onCommit }: { value: number; onCommit: (seconds: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null); // null = not editing → show live value
  const [invalid, setInvalid] = useState(false);
  const commit = () => {
    if (draft === null) return;
    const v = parseTime(draft);
    if (v === null) { setInvalid(true); return; }
    onCommit(v);
    setDraft(null);
    setInvalid(false);
  };
  return (
    <input
      value={draft ?? fmt(value, true)}
      onFocus={e => { setDraft(fmt(value, true)); setTimeout(() => e.target.select(), 0); }}
      onChange={e => { setDraft(e.target.value); setInvalid(false); }}
      onBlur={() => { if (draft !== null && parseTime(draft) !== null) commit(); else { setDraft(null); setInvalid(false); } }}
      onKeyDown={e => {
        if (e.key === 'Enter') { commit(); (e.target as HTMLInputElement).blur(); }
        if (e.key === 'Escape') { setDraft(null); setInvalid(false); (e.target as HTMLInputElement).blur(); }
      }}
      inputMode="decimal"
      spellCheck={false}
      className={`w-28 h-9 px-2 rounded-md bg-[#121212] border font-mono text-lg text-white text-center outline-none transition-colors ${
        invalid ? 'border-red-400/70' : 'border-[#CCFF00]/50 focus:border-[#CCFF00]'
      }`}
    />
  );
}
