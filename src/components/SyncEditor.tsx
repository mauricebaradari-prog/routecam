'use client';

// Sync editor: align ONE continuous YouTube video with a recorded GPS track.
// The only value being edited is the offset: track time = video time + offset.
// Map (track + covered stretch + vehicle), video, and a timeline with the speed curve
// where the video is a bar that can be dragged along the track.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as maplibregl from 'maplibre-gl';
import { ArrowLeft, Pause, Play, RotateCcw, Check, Info, ZoomIn, ZoomOut, GripHorizontal } from 'lucide-react';
import { Rnd } from 'react-rnd';
import { lockIframes, unlockIframes } from '@/lib/dragGuard';
import type { RouteConfig } from '@/hooks/useEditorState';
import { loadAllRoutes, updateUserRoute, loadUserRoutes } from '@/lib/userRoutes';
import { buildMapStyle, MAP_STYLES, type MapStyleId } from '@/lib/mapStyles';
import { distAtTrackTime, speedCurve, findStops, clampOffset, type TrackTimeline } from '@/lib/trackSync';
import { waitForYT } from '@/lib/youtubeDuration';

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
    return { coords, frac, pointAt, slice };
  }, [route]);
}

export default function SyncEditor({ routeId }: { routeId: string | null }) {
  const router = useRouter();
  const [route, setRoute] = useState<RouteConfig | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setRoute(loadAllRoutes().find(r => r.id === routeId) ?? null);
    setLoaded(true);
  }, [routeId]);

  const tl = route?.timeline;
  const videoDur = route?.durationSeconds ?? 0;
  const isOwn = useMemo(() => !!routeId && loaded && loadUserRoutes().some(r => r.id === routeId), [routeId, loaded]);

  const [offset, setOffsetState] = useState(0);
  const savedOffset = route?.syncOffset ?? 0;
  useEffect(() => { if (route) setOffsetState(route.syncOffset ?? 0); }, [route]);
  const setOffset = useCallback((o: number) => {
    if (!tl) return;
    setOffsetState(+clampOffset(o, videoDur, tl).toFixed(1));
  }, [tl, videoDur]);

  const [videoTime, setVideoTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  const line = useLine(route);
  const trackTime = videoTime + offset;
  const posFrac = tl ? distAtTrackTime(tl, trackTime) : 0;
  const coverFrom = tl ? distAtTrackTime(tl, offset) : 0;
  const coverTo = tl ? distAtTrackTime(tl, offset + videoDur) : 0;

  // floating video window: top right of the map, 400 px wide
  const videoWindowDefault = useMemo(() => {
    const w = 400, h = Math.round(w * 9 / 16) + 34;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    return { x: Math.max(12, vw - w - 16), y: 12, width: w, height: h };
  }, []);

  // ── YouTube player ──
  const playerRef = useRef<any>(null);
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
          onStateChange: (e: any) => setPlaying(e.data === 1),
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
    maplibregl.setWorkerUrl('/routecam/maplibre/maplibre-gl-worker.mjs');
    const map = new maplibregl.Map({ container: mapEl.current, style: buildMapStyle(style), attributionControl: { compact: true } });
    mapRef.current = map;
    const b = new maplibregl.LngLatBounds();
    line.coords.forEach(c => b.extend(c));
    map.fitBounds(b, { padding: { top: 70, bottom: 40, left: 40, right: 440 }, duration: 0 });
    map.on('load', () => {
      const empty = { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: line.coords } };
      map.addSource('track', { type: 'geojson', data: empty });
      map.addSource('covered', { type: 'geojson', data: { ...empty, geometry: { ...empty.geometry, coordinates: [] } } });
      map.addLayer({ id: 'track', type: 'line', source: 'track', paint: { 'line-color': '#ffffff', 'line-opacity': 0.35, 'line-width': 3 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
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
      map.fitBounds(b, { padding: { top: 70, bottom: 40, left: 40, right: 440 }, duration: 0 });
    });
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; setMapReady(false); };
  }, [route, line]);

  // covered stretch + vehicle follow the offset and the video time
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource('covered') as maplibregl.GeoJSONSource | undefined;
    src?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line.slice(coverFrom, coverTo) } });
  }, [mapReady, coverFrom, coverTo, line]);
  useEffect(() => {
    const p = line.pointAt(posFrac);
    if (p) markerRef.current?.setLngLat(p);
  }, [posFrac, line]);

  // ── Keyboard: ←/→ 1 s, Shift 10 s, Alt 0.1 s; Space play/pause ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
        setOffset(offset + (e.key === 'ArrowRight' ? step : -step));
      } else if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [offset, setOffset, togglePlay]);

  function finish() {
    if (!route) return;
    updateUserRoute(route.id, { syncOffset: offset, synced: true });
    router.push(`/?route=${route.id}`);
  }

  // ── Empty states ──
  if (!loaded) return <div className="h-screen bg-black" />;
  if (!route || !tl || !isOwn) {
    return (
      <div className="h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <p className="text-lg font-semibold">{!route ? 'Fahrt nicht gefunden' : 'Diese Fahrt lässt sich nicht ausrichten'}</p>
          <p className="text-sm text-white/50 mt-2">
            {!route ? 'Der Link ist ungültig oder die Fahrt wurde gelöscht.'
              : !isOwn ? 'Nur eigene Fahrten, die mit einer GPS-Datei angelegt wurden, können ausgerichtet werden.'
              : 'Die GPS-Datei dieser Fahrt hat keine Zeitstempel (oder die Fahrt wurde vor dieser Funktion angelegt). Sie läuft gleichmäßig über die Strecke.'}
          </p>
          <button onClick={() => router.push('/dashboard')} className="mt-6 px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-sm">Zum Dashboard</button>
        </div>
      </div>
    );
  }

  const overhangStart = offset < 0;
  const overhangEnd = offset + videoDur > tl.durationSeconds;

  return (
    <div className="h-screen w-full bg-black text-white font-sans flex flex-col overflow-hidden">
      {/* top bar */}
      <header className="h-14 shrink-0 flex items-center gap-3 px-4 border-b border-white/10">
        <button onClick={() => router.back()} className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center" title="Zurück ohne Speichern"><ArrowLeft size={18} /></button>
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-white/40">Video ausrichten</div>
          <div className="text-sm font-semibold truncate">{route.name}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setOffset(savedOffset)}
            disabled={Math.abs(offset - savedOffset) < 0.05}
            className="h-9 px-3 rounded-full text-sm text-white/70 hover:bg-white/10 disabled:opacity-30 flex items-center gap-1.5"
          ><RotateCcw size={14} /> Zurücksetzen</button>
          <button onClick={finish} className="h-9 px-4 rounded-full text-sm font-semibold bg-[#CCFF00] text-black hover:brightness-110 flex items-center gap-1.5">
            <Check size={15} /> Fertig
          </button>
        </div>
      </header>

      {/* map over the full width, video as a floating window (like on the map page) */}
      <div className="flex-1 min-h-0 relative">
        <div className="absolute inset-0"><div ref={mapEl} style={{ width: '100%', height: '100%' }} /></div>

        {/* key figures */}
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-2 max-w-[calc(100%-24px)] pointer-events-none">
          <div className="rounded-lg bg-black/70 backdrop-blur-md border border-white/10 px-3 py-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span><span className="text-white/40">Video</span> <span className="font-mono">{fmt(videoDur)}</span></span>
            <span><span className="text-white/40">Aufzeichnung</span> <span className="font-mono">{fmt(tl.durationSeconds)} · {tl.distanceKm.toFixed(1)} km</span></span>
            <span><span className="text-white/40">Video zeigt</span> <span className="font-mono">km {(coverFrom * tl.distanceKm).toFixed(1)} – {(coverTo * tl.distanceKm).toFixed(1)}</span></span>
          </div>
          {(overhangStart || overhangEnd) && (
            <p className="rounded-lg bg-black/70 backdrop-blur-md border border-amber-400/30 px-3 py-2 text-xs text-amber-300 flex gap-1.5 max-w-md"><Info size={14} className="shrink-0 mt-px" />
              Das Video ragt {overhangStart && overhangEnd ? 'an beiden Enden' : overhangStart ? 'vorne' : 'hinten'} über die Aufzeichnung hinaus. Dort bleibt der Punkt am {overhangStart && !overhangEnd ? 'Start' : 'Ende'} stehen.
            </p>
          )}
        </div>

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
            <span className="flex-1 min-w-0 text-[11px] font-bold tracking-wide uppercase text-white/80 truncate select-none">Video</span>
            <GripHorizontal size={18} className="shrink-0" />
          </div>
          <div className="relative bg-black" style={{ height: 'calc(100% - 34px)' }}>
            <div ref={playerMount} className="absolute inset-0 [&_iframe]:w-full [&_iframe]:h-full" />
          </div>
        </Rnd>
      </div>

      <SyncTimeline
        tl={tl}
        videoDur={videoDur}
        offset={offset}
        videoTime={videoTime}
        playing={playing}
        onTogglePlay={togglePlay}
        onOffset={setOffset}
        onSeekVideo={seekVideo}
      />
    </div>
  );
}

// ── Timeline: track speed curve + draggable video bar ──
function SyncTimeline({ tl, videoDur, offset, videoTime, playing, onTogglePlay, onOffset, onSeekVideo }: {
  tl: TrackTimeline; videoDur: number; offset: number; videoTime: number; playing: boolean;
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
  const LABEL_W = 72;
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
  const zoomAtRef = useRef(zoomAt); zoomAtRef.current = zoomAt;
  const panByRef = useRef(panBy); panByRef.current = panBy;
  const viewRef = useRef({ r0, r1, plotW }); viewRef.current = { r0, r1, plotW };
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { r0, r1, plotW } = viewRef.current;
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left - 8; // px-2 padding
      const anchor = r0 + ((px - LABEL_W) / plotW) * (r1 - r0);
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
      <div className="h-11 flex items-center gap-3 px-4 border-b border-white/5">
        <button onClick={onTogglePlay} className="h-8 px-3 rounded-full bg-[#CCFF00] text-black font-semibold hover:brightness-110 text-sm flex items-center gap-1.5">
          {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? 'Pause' : 'Play'}
        </button>
        <span className="font-mono text-sm text-white/70">Video {fmt(videoTime, true)} <span className="text-white/35">/ {fmt(videoDur)}</span></span>
        <span className="text-white/30 text-sm">=</span>
        <label className="flex items-center gap-2" title="Stelle der Aufzeichnung, die das Video gerade zeigt – eintippen (z. B. 8:40) oder den Video-Balken ziehen">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#CCFF00]">Aufzeichnung</span>
          <TimeInput value={head} onCommit={t => onOffset(t - videoTime)} />
        </label>
        <div className="flex items-center gap-1">
          {[-1, -0.1, 0.1, 1].map(d => (
            <button key={d} onClick={() => onOffset(offset + d)} className="h-8 px-2 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-xs font-mono">
              {d > 0 ? '+' : '−'}{Math.abs(d)}s
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/35 mr-1">Zoom</span>
          <button onClick={() => zoomAt(Math.max(r0, Math.min(r1, head)), 1.6)} disabled={!view} title="Herauszoomen" className="w-8 h-8 rounded-md bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-30 flex items-center justify-center"><ZoomOut size={15} /></button>
          <button onClick={() => zoomAt(Math.max(r0, Math.min(r1, head)), 1 / 1.6)} disabled={r1 - r0 <= MIN_SPAN + 0.01} title="Hineinzoomen (am roten Abspielkopf) – auch mit Mausrad / Trackpad" className="w-8 h-8 rounded-md bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-30 flex items-center justify-center"><ZoomIn size={15} /></button>
          <button onClick={fitVideo} title="Auf das Video zoomen" className="h-8 px-2 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-xs">Video</button>
          <button onClick={() => setView(null)} disabled={!view} title="Alles zeigen" className="h-8 px-2 rounded-md bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-30 text-xs">Alles</button>
        </div>
      </div>
      <div ref={wrap} className="px-2 select-none">
        <svg width={width} height={H} onClick={onLaneClick} style={{ display: 'block', cursor: 'pointer' }}>
          <defs><clipPath id="sync-plot"><rect x={LABEL_W} y={0} width={plotW} height={H} /></clipPath></defs>
          <g clipPath="url(#sync-plot)">
          {/* ruler */}
          {ticks.map(t => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={14} y2={H - 6} stroke="rgba(255,255,255,0.06)" />
              <text x={x(t) + 3} y={11} fill="rgba(255,255,255,0.35)" fontSize={9} fontFamily="monospace">{fmt(t)}</text>
            </g>
          ))}
          </g>
          <text x={8} y={TRACK_Y + TRACK_H / 2 + 3} fill="rgba(255,255,255,0.45)" fontSize={10} fontWeight={700} letterSpacing={1}>TRACK</text>
          <text x={8} y={VIDEO_Y + VIDEO_H / 2 + 3} fill="rgba(255,255,255,0.45)" fontSize={10} fontWeight={700} letterSpacing={1}>VIDEO</text>

          <g clipPath="url(#sync-plot)">
          {/* track: full recording as a lane, speed as a waveform, stops marked */}
          <rect x={x(0)} y={TRACK_Y} width={x(tl.durationSeconds) - x(0)} height={TRACK_H} rx={4} fill="rgba(255,255,255,0.03)" />
          <path d={speedPath} fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.5)" strokeWidth={1} />
          {stops.map(s => (
            <rect key={s.from} x={x(s.from)} y={TRACK_Y + TRACK_H - 4} width={Math.max(2, x(s.to) - x(s.from))} height={4} fill="#f59e0b" opacity={0.8}>
              <title>Stopp {fmt(s.to - s.from)}</title>
            </rect>
          ))}

          {/* video bar = the covered window, also tinted on the track lane */}
          <rect x={x(offset)} y={TRACK_Y} width={x(offset + videoDur) - x(offset)} height={TRACK_H} fill={LIME} opacity={0.07} pointerEvents="none" />
          <g onPointerDown={onBarDown} onPointerMove={onBarMove} onPointerUp={onBarUp} onClick={e => e.stopPropagation()} style={{ cursor: 'grab' }}>
            <rect x={x(offset)} y={VIDEO_Y} width={Math.max(4, x(offset + videoDur) - x(offset))} height={VIDEO_H} rx={6}
              fill="rgba(204,255,0,0.18)" stroke={LIME} strokeWidth={1.5} />
            <text x={Math.max(x(offset), LABEL_W) + 10} y={VIDEO_Y + VIDEO_H / 2 + 4} fill={LIME} fontSize={11} fontWeight={600} pointerEvents="none">
              Video {fmt(videoDur)} – ziehen zum Ausrichten
            </text>
          </g>

          {/* playhead */}
          <line x1={x(head)} x2={x(head)} y1={14} y2={H - 4} stroke="#ef4444" strokeWidth={1.5} pointerEvents="none" />
          <circle cx={x(head)} cy={16} r={4} fill="#ef4444" pointerEvents="none" />
          </g>
        </svg>
        {/* overview / scrollbar while zoomed: drag the window to pan */}
        <div className="h-3 relative mb-1" style={{ marginLeft: LABEL_W, width: plotW }}>
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
