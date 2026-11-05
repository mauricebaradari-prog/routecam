'use client';

// Onepager zur Tracker-App: eine Scroll-Geschichte, in der sich der Tracker-Screen Stück für Stück
// zusammensetzt. Alles hängt am Scrollweg (p = 0…1), rückwärts scrollen baut es wieder ab.
//
//  1  Punkt pulsiert, „Scrollen ↓“
//  2  Punkt fährt die echte Fahrt (#015) ab und zieht die Linie nach, Kamera folgt
//  3  GPS-Status + Tempo kommen unscharf und versetzt von links/rechts (GPS zuerst – ohne GPS keine Aufzeichnung)
//  4  Distanz + Laufzeit kommen dazu, die ersten werden scharf
//  5  GPS-Zeit + Höhe, alles rückt zusammen
//  6  Kontur des Smartphones entsteht, Lichtblitz, Kamera zoomt auf die ganze Strecke
//  7  Karten fliegen in ihre Plätze – am Ende steht 1:1 der Tracker-Screen, Knopf „App Download“,
//     dahinter groß und leise „DEIN GPS TRACKER“
//
// Koordinaten: „Welt“ = dp des Tracker-Bildschirms (411 × 915), skaliert auf das Fenster.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Mountain, Gauge, Route, Timer, Satellite, SatelliteDish, Check } from 'lucide-react';
import TrackerScreen, { LogoDefs, SCREEN_W, SCREEN_H, TARGETS, type Parts } from './TrackerScreen';
import { PTS, ROUTE_ORIGIN, headAt, RIDE_START_UTC_S, RIDE_TZ_OFFSET_S, AVG_KMH } from './rideData';
import LogoLockup from '@/components/LogoLockup';
import { t, useT, locale } from '@/lib/i18n';
import { k } from '@/lib/i18nKey';

/** Ziel des Download-Knopfs – kommt später (Play Store oder APK). */
export const APP_DOWNLOAD_HREF: string | null = null;

const LIME = '#CCFF00';
const MONO = 'var(--font-geist-mono), ui-monospace, monospace';
const BEZEL = 9;
/** Scrollhöhe der ganzen Geschichte in Fensterhöhen */
const STORY_VH = 760;

// ── Zeitplan (Anteil am Scrollweg) ────────────────────────────────────────────
const P = {
  hintOut: [0.004, 0.035],
  route: [0.01, 0.6],
  cam: [0.6, 0.76],
  outline: [0.62, 0.72],
  body: [0.68, 0.75],
  flash: [0.68, 0.8],
  chrome: [0.72, 0.79],
  card: [0.74, 0.82],
  header: [0.76, 0.84],
  cta: [0.9, 0.97],
  title: [0.86, 0.98],
} as const;

type CardKey = 'ele' | 'speed' | 'dist' | 'time' | 'gpsTime' | 'gps';
type CardDef = {
  key: CardKey; side: -1 | 1; row: 0 | 1 | 2; enter: [number, number]; fly: [number, number];
  target: keyof typeof TARGETS; part: keyof Parts; extraPart?: keyof Parts; label: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
};
const CARDS: CardDef[] = [
  { key: 'gps', side: -1, row: 0, enter: [0.005, 0.05], fly: [0.86, 0.94], target: 'pill', part: 'pill', extraPart: 'tileGps', label: k('GPS-Status'), Icon: SatelliteDish },
  { key: 'speed', side: 1, row: 0, enter: [0.02, 0.07], fly: [0.84, 0.92], target: 'tileSpeed', part: 'tileSpeed', label: k('Tempo'), Icon: Gauge },
  { key: 'dist', side: -1, row: 1, enter: [0.07, 0.12], fly: [0.82, 0.9], target: 'tileDist', part: 'tileDist', label: k('Distanz'), Icon: Route },
  { key: 'time', side: 1, row: 1, enter: [0.09, 0.14], fly: [0.78, 0.86], target: 'timer', part: 'timer', label: k('Laufzeit'), Icon: Timer },
  { key: 'gpsTime', side: -1, row: 2, enter: [0.14, 0.19], fly: [0.8, 0.88], target: 'gpsTime', part: 'gpsTime', label: k('GPS-Zeit'), Icon: Satellite },
  { key: 'ele', side: 1, row: 2, enter: [0.16, 0.21], fly: [0.8, 0.88], target: 'profile', part: 'profile', label: k('Höhe'), Icon: Mountain },
];
// Schärfe: jede Karte kommt unscharf; scharf wird sie, wenn die nächste Welle kommt
const SHARPEN: Record<number, [number, number]> = { 0: [0.07, 0.13], 1: [0.14, 0.2], 2: [0.21, 0.27] };

// ── kleine Helfer ────────────────────────────────────────────────────────────
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const seg = (p: number, [a, b]: readonly [number, number]) => clamp01((p - a) / (b - a));
const easeIO = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const lerp = (a: number, b: number, x: number) => a + (b - a) * x;
const fmtDur = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = Math.floor(s % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};
const clockOf = (utcS: number) => {
  const d = new Date((utcS + RIDE_TZ_OFFSET_S) * 1000);
  return [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()].map(n => String(n).padStart(2, '0')).join(':');
};

// html/body scrollen in dieser App nicht (die Karte braucht das) – der Onepager hat einen eigenen Scroller.
// Hintergrund wie die Fahrt-Karte der App: Punktraster in deren Farben und Abstand. Es scrollt mit
// und liegt am Ende genau auf dem Raster der Karte im Screen, sodass beide ineinander übergehen.
const CARD_BG = '#0c0d11';
const DOT = '#16171b';
const DOT_STEP = 20.9; // dp, wie in der App
function geom(vw: number, vh: number) {
  const s = Math.min((vh * 0.94) / (SCREEN_H + 2 * BEZEL), (vw * 0.94) / (SCREEN_W + 2 * BEZEL));
  return { s, ox: (vw - SCREEN_W * s) / 2, oy: (vh - SCREEN_H * s) / 2 };
}
function dotGrid(st: { y: number; vw: number; vh: number; max: number } | null): React.CSSProperties {
  if (!st) return { backgroundColor: CARD_BG };
  const { s, ox, oy } = geom(st.vw, st.vh);
  const step = DOT_STEP * s;
  // Punkte der Karte liegen bei Screen-dp 25,65 + n·20,9 (x) bzw. 106,05 + n·20,9 (y)
  const x = ox + 25.65 * s - step / 2;
  const y = oy + 106.05 * s - step / 2 + (st.max - st.y);
  return {
    backgroundColor: CARD_BG,
    backgroundImage: `radial-gradient(circle, ${DOT} ${(1.15 * s).toFixed(2)}px, transparent ${(1.4 * s).toFixed(2)}px)`,
    backgroundSize: `${step}px ${step}px`,
    backgroundPosition: `${x.toFixed(2)}px ${y.toFixed(2)}px`,
  };
}

function useScrollStage(ref: React.RefObject<HTMLDivElement | null>) {
  const [s, setS] = useState<{ p: number; y: number; vw: number; vh: number; max: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const read = () => {
      raf = 0;
      const max = Math.max(1, el.scrollHeight - el.clientHeight);
      setS({ p: clamp01(el.scrollTop / max), y: el.scrollTop, vw: el.clientWidth, vh: el.clientHeight, max });
    };
    const req = () => { if (!raf) raf = requestAnimationFrame(read); };
    read();
    el.addEventListener('scroll', req, { passive: true });
    window.addEventListener('resize', req);
    return () => { el.removeEventListener('scroll', req); window.removeEventListener('resize', req); cancelAnimationFrame(raf); };
  }, [ref]);
  return s;
}

/** Automatisch abspielen: so lange dauert der ganze Weg bis zum fertigen Screen. */
const AUTOPLAY_MS = 22000;
/**
 * Tempo-Verlauf fürs Abspielen: kurz anfahren (erste 8 %), dann gleichmäßig – damit die Karten
 * Zeit zum Lesen haben –, in den letzten 30 % sanft abbremsen bis zum Stand.
 */
function autoplayEase(x: number) {
  const A = 0.08, B = 0.7;
  const total = A / 2 + (B - A) + (1 - B) / 2;
  let d: number;
  if (x <= A) d = (x * x) / (2 * A);
  else if (x <= B) d = A / 2 + (x - A);
  else { const u = x - B; d = A / 2 + (B - A) + u - (u * u) / (2 * (1 - B)); }
  return clamp01(d / total);
}

export default function TrackerStory() {
  useT();
  const scroller = useRef<HTMLDivElement>(null);
  const st = useScrollStage(scroller);
  const loc = locale();
  const stopPlay = useRef<(() => void) | null>(null);

  // „Animation abspielen“: scrollt selbst bis ans Ende und bremst dort ab.
  // Jede eigene Eingabe (Rad, Finger, Taste) übernimmt sofort wieder.
  const play = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    stopPlay.current?.();
    const from = el.scrollTop, to = el.scrollHeight - el.clientHeight;
    const dur = AUTOPLAY_MS * Math.max(0.15, (to - from) / Math.max(1, to));
    const t0 = performance.now();
    let raf = 0;
    const stop = () => {
      cancelAnimationFrame(raf);
      ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(ev => window.removeEventListener(ev, stop));
      stopPlay.current = null;
    };
    const step = (now: number) => {
      const x = clamp01((now - t0) / dur);
      el.scrollTop = from + (to - from) * autoplayEase(x);
      if (x < 1) raf = requestAnimationFrame(step); else stop();
    };
    // erst nach dem Klick selbst auf Abbruch hören
    requestAnimationFrame(() => ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, stop, { passive: true })));
    raf = requestAnimationFrame(step);
    stopPlay.current = stop;
  }, []);
  useEffect(() => () => stopPlay.current?.(), []);

  return (
    <div ref={scroller} data-tracker-scroller className="fixed inset-0 overflow-y-auto overflow-x-hidden no-scrollbar" style={{ overscrollBehavior: 'none' }}>
    <main className="relative" style={{ height: `${STORY_VH}vh`, background: CARD_BG }}>
      <LogoDefs />
      <div className="sticky top-0 h-[100dvh] w-full overflow-hidden" style={dotGrid(st)}>

        {/* auf schmalen Fenstern füllt das Handy am Ende den Bildschirm – dann tritt das Logo zurück */}
        <Link href="/" className="absolute left-4 top-4 md:left-6 md:top-5 z-20 hover:!opacity-100 transition-opacity" aria-label={t('Zurück zu RouteCam')}
          style={{ opacity: 0.8 * (st && st.vw < 768 ? 1 - seg(st.p, [0.64, 0.7]) : 1), pointerEvents: st && st.vw < 768 && st.p > 0.7 ? 'none' : undefined }}>
          <LogoLockup />
        </Link>

        {st && <Stage p={st.p} vw={st.vw} vh={st.vh} loc={loc} onPlay={play} />}
      </div>
    </main>
    </div>
  );
}

function Stage({ p, vw, vh, loc, onPlay }: { p: number; vw: number; vh: number; loc: string; onPlay: () => void }) {
  // Maßstab: Handy (mit Rand) passt ins Fenster
  const { s, ox, oy } = geom(vw, vh);
  const sideRoom = (vw / s - SCREEN_W) / 2 - BEZEL;
  const wide = sideRoom >= 250;

  // ── Route + Kamera ──
  const routeFrac = seg(p, P.route);
  const head = headAt(routeFrac);
  const cam = easeIO(seg(p, P.cam));
  const zoom = lerp(2.6, 1, cam);
  const anchor = { x: lerp(205.5, head.x, cam), y: lerp(500, head.y, cam) };
  const T = (x: number, y: number) => [anchor.x + (x - head.x) * zoom, anchor.y + (y - head.y) * zoom] as const;

  const routePath = useMemo(() => {
    if (routeFrac <= 0) return '';
    const out: string[] = [];
    for (let i = 0; i <= head.i; i++) {
      const [x, y] = T(PTS[i][0] + ROUTE_ORIGIN.x, PTS[i][1] + ROUTE_ORIGIN.y);
      out.push(`${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`);
    }
    const [hx, hy] = T(head.x, head.y);
    out.push(`L${hx.toFixed(2)},${hy.toFixed(2)}`);
    return out.join('');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- T hängt nur an head/anchor/zoom
  }, [routeFrac, head.i, head.x, head.y, anchor.x, anchor.y, zoom]);

  const [sx, sy] = T(ROUTE_ORIGIN.x, ROUTE_ORIGIN.y);
  const last = PTS[PTS.length - 1];
  const [ex, ey] = T(last[0] + ROUTE_ORIGIN.x, last[1] + ROUTE_ORIGIN.y);
  const [hx, hy] = T(head.x, head.y);
  const coreW = lerp(6, 4.2, cam);
  const dotR = lerp(11, 7.6, cam);

  // ── Handy + Screen ──
  const outline = easeOut(seg(p, P.outline));
  const body = seg(p, P.body);
  const flashX = seg(p, P.flash);
  const flash = Math.sin(Math.PI * flashX);
  const parts: Parts = {
    chrome: seg(p, P.chrome), card: seg(p, P.card), header: seg(p, P.header), cta: easeOut(seg(p, P.cta)),
  };

  // ── Karten ──
  const cardW = wide ? 196 : 150;
  const cardH = wide ? 84 : 70;
  const rowGap = wide ? 108 : 86;
  const rowsShown = 1 + easeOut(seg(p, CARDS[2].enter)) + easeOut(seg(p, CARDS[4].enter));
  const colX = (side: -1 | 1) => wide
    ? (side < 0 ? -BEZEL - 44 - cardW : SCREEN_W + BEZEL + 44)
    : (side < 0 ? 10 : SCREEN_W - 10 - cardW);

  const cards = CARDS.map(c => {
    const e = easeOut(seg(p, c.enter));
    const sharpen = seg(p, SHARPEN[c.row]);
    const blur = 14 * (1 - e) + 5 * (1 - sharpen);
    const fly = easeIO(seg(p, c.fly));
    const x0 = colX(c.side) + c.side * 170 * (1 - e);
    const y0 = 457 + (c.row - (rowsShown - 1) / 2) * rowGap - cardH / 2;
    const tg = TARGETS[c.target];
    const scale = lerp(1, Math.min(tg.w / cardW, tg.h / cardH) * 1.05, fly);
    const cx = lerp(x0 + cardW / 2, tg.x + tg.w / 2, fly);
    const cy = lerp(y0 + cardH / 2, tg.y + tg.h / 2, fly);
    const arrive = seg(fly, [0.45, 1]);
    parts[c.part] = arrive;
    if (c.extraPart) parts[c.extraPart] = arrive;
    return { c, e, blur: blur * (1 - fly), fly, scale, cx, cy, opacity: e * (1 - arrive) };
  });

  const values: Record<CardKey, string> = {
    ele: `${Math.round(head.ele).toLocaleString(loc)} m`,
    // unterwegs das aktuelle Tempo, am Ziel der Schnitt – so wie die Kachel im fertigen Screen
    speed: routeFrac >= 1 ? `Ø ${Math.round(AVG_KMH)} km/h` : `${Math.round(head.kmh)} km/h`,
    dist: `${(head.m / 1000).toLocaleString(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`,
    time: fmtDur(head.t),
    gpsTime: clockOf(RIDE_START_UTC_S + head.t),
    gps: '',
  };

  const hintIn = 1 - seg(p, P.hintOut);
  // Endbild: groß und leise hinter dem Handy
  const titleIn = easeOut(seg(p, P.title));
  const titleSize = Math.min(vw * 0.155, vh * 0.3);

  return (
    <>
      <h1 className="absolute left-0 w-full text-center m-0 pointer-events-none select-none" style={{
        top: '50%', transform: `translateY(calc(-50% + ${(1 - titleIn) * 40}px))`, opacity: titleIn,
        fontSize: titleSize, lineHeight: 0.92, fontWeight: 900, letterSpacing: '-0.02em', textTransform: 'uppercase',
        color: 'rgba(226, 229, 234, 0.09)', fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
      }}>
        {t('Dein GPS')}<br />{t('Tracker')}
      </h1>
      <div className="absolute left-0 top-0" style={{ transform: `translate(${ox}px, ${oy}px) scale(${s})`, transformOrigin: '0 0', width: SCREEN_W, height: SCREEN_H }}>
        {/* Handy-Gehäuse (Android, schlicht) */}
        <svg aria-hidden className="absolute" style={{ left: -BEZEL - 2, top: -BEZEL - 2, overflow: 'visible' }} width={SCREEN_W + 2 * BEZEL + 4} height={SCREEN_H + 2 * BEZEL + 4}>
          <rect x="2" y="2" width={SCREEN_W + 2 * BEZEL} height={SCREEN_H + 2 * BEZEL} rx="46" fill="#0d0d0e" opacity={body} />
          <rect x={2 + BEZEL} y={2 + BEZEL} width={SCREEN_W} height={SCREEN_H} rx="36" fill="#000" opacity={body} />
          <rect x="2" y="2" width={SCREEN_W + 2 * BEZEL} height={SCREEN_H + 2 * BEZEL} rx="46" fill="none"
            stroke={body > 0.5 ? '#2c2d30' : LIME} strokeOpacity={body > 0.5 ? 1 : 0.9} strokeWidth={body > 0.5 ? 1.5 : 2.2}
            pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - outline} opacity={outline > 0 ? 1 : 0} />
          {/* Seitentasten */}
          <rect x={SCREEN_W + 2 * BEZEL + 1} y="190" width="3" height="70" rx="1.5" fill="#1d1e21" opacity={body} />
          <rect x={SCREEN_W + 2 * BEZEL + 1} y="290" width="3" height="44" rx="1.5" fill="#1d1e21" opacity={body} />
        </svg>

        {/* der Tracker-Screen selbst; Bereiche blenden nach und nach ein */}
        <div className="absolute left-0 top-0" style={{ width: SCREEN_W, height: SCREEN_H, borderRadius: 36, overflow: 'hidden' }}>
          <TrackerScreen parts={parts} ctaLabel={t('App Download')} ctaHref={APP_DOWNLOAD_HREF} />
        </div>

        {/* weiches Aufleuchten um den Punkt, wenn das Handy entsteht */}
        {flash > 0.001 && (
          <svg aria-hidden className="absolute pointer-events-none" style={{ left: hx - 260, top: hy - 260, opacity: flash }} width="520" height="520" viewBox="-260 -260 520 520">
            <defs>
              <radialGradient id="trk-flash">
                <stop offset="0" stopColor={LIME} stopOpacity="0.55" />
                <stop offset="1" stopColor={LIME} stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle r={60 + 120 * flashX} fill="url(#trk-flash)" />
          </svg>
        )}

        {/* Route: Glow, Linie, Start- und Positionspunkt */}
        <svg aria-hidden className="absolute left-0 top-0 pointer-events-none" width={SCREEN_W} height={SCREEN_H} style={{ overflow: 'visible' }}>
          <defs>
            <linearGradient id="trk-route" gradientUnits="userSpaceOnUse" x1={sx} y1={sy} x2={ex} y2={ey}>
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.06" stopColor="#f6ffd6" />
              <stop offset="0.2" stopColor={LIME} />
              <stop offset="1" stopColor={LIME} />
            </linearGradient>
            {/* feste Fläche statt Anteil der Linienbreite: am Anfang ist die Route fast senkrecht und
                nur wenige Pixel breit – ein relativer Bereich schnitte den Schein links und rechts ab */}
            <filter id="trk-glow" filterUnits="userSpaceOnUse" x="-3000" y="-3000" width="7000" height="8000">
              <feGaussianBlur stdDeviation={lerp(7, 4.6, cam)} />
            </filter>
          </defs>
          {routePath && (
            <>
              <path d={routePath} fill="none" stroke={LIME} strokeOpacity={0.55} strokeWidth={coreW * 2.6} strokeLinecap="round" strokeLinejoin="round" filter="url(#trk-glow)" />
              <path d={routePath} fill="none" stroke="url(#trk-route)" strokeWidth={coreW} strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={sx} cy={sy} r={lerp(6, 4.6, cam)} fill="#fff" stroke="#0c0d11" strokeWidth="2" />
            </>
          )}
          <circle cx={hx} cy={hy} r={dotR * 2.4} fill={LIME} opacity={0.22} filter="url(#trk-glow)" />
          <circle cx={hx} cy={hy} r={dotR} fill={LIME} stroke="#0c0d11" strokeWidth="2.2" />
        </svg>
        {/* Puls wie beim GPS-Signal – stark am Anfang, im fertigen Screen aus */}
        <span aria-hidden className="absolute pointer-events-none" style={{ left: hx - dotR, top: hy - dotR, width: dotR * 2, height: dotR * 2, opacity: 1 - cam }}>
          <span className="absolute inset-0 rounded-full trk-pulse" style={{ border: `2px solid ${LIME}` }} />
        </span>

        {/* „Scrollen ↓“ unter dem Punkt (Szene 1) – verschwindet, sobald es losgeht.
            Darunter die Alternative für alle, die nicht scrollen wollen. */}
        <div className="absolute flex flex-col items-center gap-2" style={{ left: 205.5 - 120, width: 240, top: 540, opacity: hintIn, pointerEvents: hintIn > 0.5 ? 'auto' : 'none' }}>
          <span style={{ fontFamily: MONO, fontSize: 14, letterSpacing: 3, color: '#d9dce1', textTransform: 'uppercase' }}>{t('Scrollen')}</span>
          <svg width="16" height="22" viewBox="0 0 16 22" aria-hidden className="trk-bob"><path d="M8 2v17M2 13l6 6 6-6" stroke="#d9dce1" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <button type="button" onClick={onPlay} tabIndex={hintIn > 0.5 ? 0 : -1}
            className="mt-3 px-3 py-2 underline underline-offset-4 decoration-1 hover:text-white transition-colors"
            style={{ fontSize: 13, color: '#9aa0a8', background: 'none', border: 'none', cursor: 'pointer' }}>
            {t('Animation abspielen')}
          </button>
        </div>

        {/* Daten-Karten */}
        {cards.map(({ c, blur, scale, cx, cy, opacity }) => opacity > 0.002 && (
          <div key={c.key} className="absolute" style={{
            left: cx - cardW / 2, top: cy - cardH / 2, width: cardW, height: cardH, transform: `scale(${scale})`, opacity,
            filter: blur > 0.2 ? `blur(${blur.toFixed(1)}px)` : undefined, borderRadius: 18, boxSizing: 'border-box',
            background: 'rgba(14,14,15,0.92)', border: '1px solid #2a2b2e', boxShadow: '0 18px 40px rgba(0,0,0,0.45)',
            padding: wide ? '14px 16px' : '11px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          }}>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: wide ? 11 : 9.5, fontWeight: 600, letterSpacing: 1.6, color: '#9aa0a8', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{t(c.label)}</span>
              <c.Icon size={wide ? 20 : 16} strokeWidth={1.8} color={LIME} />
            </div>
            {c.key === 'gps' ? (
              // GPS ist von Anfang an bereit – ohne GPS keine Aufzeichnung
              <span className="flex items-center gap-2" style={{ fontFamily: MONO, fontSize: wide ? 24 : 19, fontWeight: 700, color: LIME, lineHeight: 1 }}>
                {t('Bereit')}
                <span className="inline-flex items-center justify-center rounded-full" style={{ width: wide ? 20 : 16, height: wide ? 20 : 16, background: LIME }}><Check size={wide ? 13 : 11} strokeWidth={3.2} color="#000" /></span>
              </span>
            ) : (
              <span style={{ fontFamily: MONO, fontSize: wide ? 26 : 20, fontWeight: 700, color: '#fff', lineHeight: 1, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{values[c.key]}</span>
            )}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes trkPulse { 0% { transform: scale(1); opacity: .9 } 100% { transform: scale(3.2); opacity: 0 } }
        @keyframes trkBob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(5px) } }
        .trk-pulse { animation: trkPulse 1.8s ease-out infinite; }
        .trk-bob { animation: trkBob 1.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .trk-pulse, .trk-bob { animation: none } }
      `}</style>
    </>
  );
}
