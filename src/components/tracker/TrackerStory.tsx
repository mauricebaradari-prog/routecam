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
// Koordinaten: „Welt“ = dp des Tracker-Bildschirms (411 × 870), skaliert auf das Fenster.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Mountain, Gauge, Route, Timer, Satellite, SatelliteDish, Check } from 'lucide-react';
import TrackerScreen, { LogoDefs, SCREEN_W, SCREEN_H, TARGETS, type Parts } from './TrackerScreen';
import { PTS, ROUTE_ORIGIN, headAt, RIDE_START_UTC_S, RIDE_TZ_OFFSET_S, AVG_KMH } from './rideData';
import LogoLockup from '@/components/LogoLockup';
import { FileBadge } from '@/components/GeoFilesHelp';
import { t, useT, locale } from '@/lib/i18n';
import { k } from '@/lib/i18nKey';

/** Ziel des Download-Knopfs – kommt später (Play Store oder APK). */
export const APP_DOWNLOAD_HREF: string | null = null;

const LIME = '#CCFF00';
const MONO = 'var(--font-geist-mono), ui-monospace, monospace';
const BEZEL = 9;
/** Anteil des Fensters, den das Handy (mit Rand) höchstens einnimmt */
const PHONE_FILL = 0.8;
/** Scrollhöhe der ganzen Geschichte in Fensterhöhen */
const STORY_VH = 500;

// ── Zeitplan (Anteil am Scrollweg) ────────────────────────────────────────────
const P = {
  hintOut: [0.004, 0.035],
  route: [0.01, 0.6],
  cam: [0.6, 0.76],
  outline: [0.62, 0.72],
  outlineFade: [0.72, 0.84],
  body: [0.68, 0.75],
  flash: [0.68, 0.8],
  chrome: [0.72, 0.79],
  card: [0.74, 0.82],
  header: [0.76, 0.84],
  cta: [0.9, 0.97],
  title: [0.86, 0.98],
  side: [0.9, 1],
  parallax: [0.9, 1],
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
  // Maßstab wie mit Navigationsleiste (915 dp) – ohne sie wird das Handy kürzer, nicht breiter
  const s = Math.min((vh * PHONE_FILL) / (915 + 2 * BEZEL), (vw * PHONE_FILL) / (SCREEN_W + 2 * BEZEL));
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

/** Scrollweg der Geschichte selbst – darunter kann (auf schmalen Fenstern) noch Text folgen. */
function storyMax(el: HTMLDivElement) {
  const main = el.querySelector('main');
  return Math.max(1, (main?.offsetHeight ?? el.scrollHeight) - el.clientHeight);
}
/** Seitlich neben dem Handy ist Platz für Text und GPX-Karte (px pro Seite)? */
const SIDE_MIN_PX = 300;
function sideRoomPx(vw: number, vh: number) {
  const { s, ox } = geom(vw, vh);
  return ox - BEZEL * s;
}

function useScrollStage(ref: React.RefObject<HTMLDivElement | null>) {
  const [s, setS] = useState<{ p: number; y: number; vw: number; vh: number; max: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const read = () => {
      raf = 0;
      const max = storyMax(el);
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
const AUTOPLAY_MS = 14000;
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

// ── Endbild reagiert auf den Mauszeiger: Handy kippt leicht, Ebenen verschieben sich ──
// Zeigerposition als CSS-Variablen --mx/--my (−1…1) am Bühnen-Element, weich nachgezogen;
// --pk (0…1) blendet den Effekt erst im Endbild ein. Nur mit Maus, nicht bei reduzierter Bewegung.
const DEPTH = { tilt: 7, near: 14, far: 26 };
function useCursorDepth(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia('(pointer: fine)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const target = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
    let raf = 0;
    const tick = () => {
      cur.x += (target.x - cur.x) * 0.08;
      cur.y += (target.y - cur.y) * 0.08;
      el.style.setProperty('--mx', cur.x.toFixed(4));
      el.style.setProperty('--my', cur.y.toFixed(4));
      raf = Math.abs(target.x - cur.x) + Math.abs(target.y - cur.y) > 0.001 ? requestAnimationFrame(tick) : 0;
    };
    const move = (e: PointerEvent) => {
      target.x = Math.max(-1, Math.min(1, (e.clientX / window.innerWidth) * 2 - 1));
      target.y = Math.max(-1, Math.min(1, (e.clientY / window.innerHeight) * 2 - 1));
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const leave = () => { target.x = 0; target.y = 0; if (!raf) raf = requestAnimationFrame(tick); };
    window.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    return () => { window.removeEventListener('pointermove', move); document.documentElement.removeEventListener('pointerleave', leave); cancelAnimationFrame(raf); };
  }, [ref]);
}

export default function TrackerStory() {
  useT();
  const scroller = useRef<HTMLDivElement>(null);
  const st = useScrollStage(scroller);
  const stage = useRef<HTMLDivElement>(null);
  useCursorDepth(stage);
  const loc = locale();
  const stopPlay = useRef<(() => void) | null>(null);

  // „Animation abspielen“: scrollt selbst bis ans Ende und bremst dort ab.
  // Jede eigene Eingabe (Rad, Finger, Taste) übernimmt sofort wieder.
  const play = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    stopPlay.current?.();
    const from = Math.min(el.scrollTop, storyMax(el)), to = storyMax(el);
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
      <div ref={stage} className="sticky top-0 h-[100dvh] w-full overflow-hidden"
        style={{ ...dotGrid(st), ['--pk' as string]: st ? easeIO(seg(st.p, P.parallax)).toFixed(3) : '0' }}>

        {/* auf schmalen Fenstern füllt das Handy am Ende den Bildschirm – dann tritt das Logo zurück */}
        <Link href="/" className="absolute left-4 top-4 md:left-6 md:top-5 z-20 hover:!opacity-100 transition-opacity" aria-label={t('Zurück zu RouteCam')}
          style={{ opacity: 0.8 * (st && st.vw < 768 ? 1 - seg(st.p, [0.64, 0.7]) : 1), pointerEvents: st && st.vw < 768 && st.p > 0.7 ? 'none' : undefined }}>
          <LogoLockup />
        </Link>

        {st && <Stage p={st.p} scrollY={Math.min(st.y, st.max)} vw={st.vw} vh={st.vh} loc={loc} onPlay={play} />}
        {st && sideRoomPx(st.vw, st.vh) >= SIDE_MIN_PX && <SideInfo p={st.p} vw={st.vw} vh={st.vh} />}

        {/* dauerhafter dunkler Schein vom Fensterrand nach innen */}
        <div aria-hidden className="absolute inset-0 pointer-events-none z-10" style={{
          boxShadow: 'inset 0 0 min(18vw, 22vh) min(4vw, 5vh) rgba(0,0,0,0.85)',
        }} />
      </div>
    </main>
    {/* schmale Fenster: kein Platz neben dem Handy – Text und GPX-Karte folgen darunter */}
    {st && sideRoomPx(st.vw, st.vh) < SIDE_MIN_PX && (
      <section className="relative px-6 pt-10 pb-16 flex flex-col gap-6" style={{ background: `linear-gradient(rgba(0,0,0,0.8), ${CARD_BG} 120px)` }}>
        <div className="w-full max-w-[520px] mx-auto flex flex-col gap-6">
          <IntroText />
          <GpxCard />
        </div>
      </section>
    )}
    </div>
  );
}

// ── Endbild: worum es geht (links) und was rauskommt (rechts) ──────────────────
function IntroText({ className = '' }: { className?: string }) {
  return (
    <div className={className}>
      <h2 className="m-0 mb-3" style={{ color: LIME, fontSize: 26, lineHeight: 1.15, fontWeight: 700, letterSpacing: '-0.01em' }}>
        {t('Auf die Sekunde synchron.')}
      </h2>
      <p className="m-0 text-white" style={{ fontSize: 17, lineHeight: 1.6, letterSpacing: 0.1 }}>
        {t('Der RouteCam Tracker zeichnet deine Fahrt jede Sekunde auf – Position, Höhe und Tempo, jeweils mit der exakten GPS-Uhrzeit. Damit legt RouteCam Video und Strecke sekundengenau übereinander.')}
      </p>
    </div>
  );
}

/** Das Export-Format – Datei-Symbol in Neongrün (Gegengewicht zur Überschrift links), Text frei, ohne Kasten. */
function GpxCard() {
  return (
    <div className="flex flex-col gap-4">
      <FileBadge ext="gpx" solid size={52} />
      <p className="m-0 leading-relaxed text-white/70" style={{ fontSize: 15 }}>
        {t('GPX ist der Standard von Tracking-Apps, Navis und Sportuhren. Der Tracker speichert für jeden Punkt die GPS-Uhrzeit – damit passt die Position im Video auf die Sekunde.')}
      </p>
    </div>
  );
}

function SideInfo({ p, vw, vh }: { p: number; vw: number; vh: number }) {
  const room = sideRoomPx(vw, vh);
  const gap = Math.min(64, room * 0.14);
  const w = Math.min(380, room - gap - 40);
  const x = easeOut(seg(p, P.side));
  const shift = (1 - x) * 24;
  const common: React.CSSProperties = { position: 'absolute', top: '50%', width: w, opacity: x, pointerEvents: x > 0.5 ? 'auto' : 'none' };
  return (
    <>
      <div style={{ ...common, right: vw - room + gap, transform: `translate(calc(${-shift}px + ${DEPTH.near}px * var(--mx, 0) * var(--pk, 0)), calc(-50% + ${DEPTH.near * 0.7}px * var(--my, 0) * var(--pk, 0)))` }}>
        <IntroText />
      </div>
      <div style={{ ...common, left: vw - room + gap, transform: `translate(calc(${shift}px + ${DEPTH.near}px * var(--mx, 0) * var(--pk, 0)), calc(-50% + ${DEPTH.near * 0.7}px * var(--my, 0) * var(--pk, 0)))`, width: Math.min(340, w) }}>
        <GpxCard />
      </div>
    </>
  );
}

function Stage({ p, scrollY, vw, vh, loc, onPlay }: { p: number; scrollY: number; vw: number; vh: number; loc: string; onPlay: () => void }) {
  // Maßstab: Handy (mit Rand) passt ins Fenster
  const { s, ox, oy } = geom(vw, vh);
  const sideRoom = (vw / s - SCREEN_W) / 2 - BEZEL;
  const wide = sideRoom >= 250;

  // ── Route + Kamera ──
  const routeFrac = seg(p, P.route);
  const head = headAt(routeFrac);
  const cam = easeIO(seg(p, P.cam));
  const zoom = lerp(2.6, 1, cam);
  const anchor = { x: lerp(205.5, head.x, cam), y: lerp(SCREEN_H / 2 + 43, head.y, cam) };
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
  // am Anfang groß mit Play-Symbol (antippen = abspielen), schrumpft mit dem ersten Scrollen
  const startBig = 1 - easeIO(seg(p, [0.004, 0.05]));
  const dotR = lerp(11, 7.6, cam) + 19 * startBig;

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
    const y0 = SCREEN_H / 2 + (c.row - (rowsShown - 1) / 2) * rowGap - cardH / 2;
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
  // Endbild: groß und leise hinter dem Handy, nur als Kontur (3 px)
  const titleIn = easeOut(seg(p, P.title));
  const titleSize = Math.min(vw * 0.155, vh * 0.3);
  const bigTitle: React.CSSProperties = {
    fontSize: titleSize, lineHeight: 0.92, fontWeight: 900, letterSpacing: '-0.02em', textTransform: 'uppercase', whiteSpace: 'pre-line',
    color: 'transparent', WebkitTextStroke: '3px rgba(226, 229, 234, 0.16)', fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
  };
  // Anfang: dieselbe große Kontur-Schrift, sie scrollt mit dem ersten Scrollen nach oben weg
  const startVisible = scrollY < vh * DISSOLVE_VH;

  return (
    <>
      <h1 className="sr-only">{t('Starte dein\nAbenteuer')}</h1>
      {startVisible && <ParticleTitle text={t('Starte dein\nAbenteuer')} size={titleSize} scrollY={scrollY} vw={vw} vh={vh} />}
      <div aria-hidden className="absolute left-0 w-full text-center m-0 pointer-events-none select-none" style={{
        ...bigTitle, top: '50%', opacity: titleIn,
        transform: `translate(calc(${-DEPTH.far}px * var(--mx, 0) * var(--pk, 0)), calc(-50% + ${(1 - titleIn) * 40}px - ${DEPTH.far * 0.7}px * var(--my, 0) * var(--pk, 0)))`,
      }}>
        {t('Dein GPS')}<br />{t('Tracker')}
      </div>
      <div className="absolute left-0 top-0" style={{
        transform: `translate(${ox}px, ${oy}px) scale(${s}) translate(${SCREEN_W / 2}px, ${SCREEN_H / 2}px) perspective(1600px) rotateY(calc(${DEPTH.tilt}deg * var(--mx, 0) * var(--pk, 0))) rotateX(calc(${-DEPTH.tilt * 0.8}deg * var(--my, 0) * var(--pk, 0))) translate(${-SCREEN_W / 2}px, ${-SCREEN_H / 2}px)`,
        transformOrigin: '0 0', width: SCREEN_W, height: SCREEN_H }}>
        {/* Schatten unter dem Handy – gibt dem Endbild Tiefe */}
        <div aria-hidden className="absolute pointer-events-none" style={{
          left: -BEZEL, top: -BEZEL, width: SCREEN_W + 2 * BEZEL, height: SCREEN_H + 2 * BEZEL, borderRadius: 46, opacity: body,
          boxShadow: '0 70px 120px -10px rgba(0,0,0,0.85), 0 30px 50px -8px rgba(0,0,0,0.7), 0 8px 16px rgba(0,0,0,0.55)',
        }} />
        {/* Handy-Gehäuse (Android, schlicht) */}
        <svg aria-hidden className="absolute" style={{ left: -BEZEL - 2, top: -BEZEL - 2, overflow: 'visible' }} width={SCREEN_W + 2 * BEZEL + 4} height={SCREEN_H + 2 * BEZEL + 4}>
          <rect x="2" y="2" width={SCREEN_W + 2 * BEZEL} height={SCREEN_H + 2 * BEZEL} rx="46" fill="#0d0d0e" opacity={body} />
          <rect x={2 + BEZEL} y={2 + BEZEL} width={SCREEN_W} height={SCREEN_H} rx="36" fill="#000" opacity={body} />
          {/* dezente Kante des fertigen Gehäuses */}
          <rect x="2" y="2" width={SCREEN_W + 2 * BEZEL} height={SCREEN_H + 2 * BEZEL} rx="46" fill="none" stroke="#2c2d30" strokeWidth="1.5" opacity={body} />
          {/* neongrüne Kontur, die das Handy zeichnet – danach weich ausblenden statt abrupt */}
          <rect x="2" y="2" width={SCREEN_W + 2 * BEZEL} height={SCREEN_H + 2 * BEZEL} rx="46" fill="none"
            stroke={LIME} strokeOpacity={0.9} strokeWidth={2.2}
            pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - outline} opacity={outline > 0 ? 1 - easeIO(seg(p, P.outlineFade)) : 0} />
          {/* Seitentasten */}
          <rect x={SCREEN_W + 2 * BEZEL + 1} y="190" width="3" height="70" rx="1.5" fill="#1d1e21" opacity={body} />
          <rect x={SCREEN_W + 2 * BEZEL + 1} y="290" width="3" height="44" rx="1.5" fill="#1d1e21" opacity={body} />
        </svg>

        {/* der Tracker-Screen selbst; Bereiche blenden nach und nach ein */}
        <div className="absolute left-0 top-0" style={{ width: SCREEN_W, height: SCREEN_H, borderRadius: 36, overflow: 'hidden' }}>
          <TrackerScreen parts={parts} ctaLabel={t('App Download')} ctaHref={APP_DOWNLOAD_HREF} ctaClassName={(parts.cta ?? 0) >= 1 ? 'trk-cta-pulse' : ''} />
        </div>

        {/* Lichtreflex: läuft im Endbild immer wieder von links oben nach rechts unten übers Handy –
            als 1-px-Linie auf der Außenkante, ganz leicht übers Glas */}
        {(parts.cta ?? 0) > 0 && (
          <div aria-hidden className="absolute pointer-events-none" style={{ left: -BEZEL, top: -BEZEL, width: SCREEN_W + 2 * BEZEL, height: SCREEN_H + 2 * BEZEL, opacity: parts.cta }}>
            <div className="absolute inset-0 trk-sheen" style={{ borderRadius: 46, opacity: 0.09 }} />
            <div className="absolute inset-0 trk-sheen trk-rim" style={{ borderRadius: 46, padding: 1 / s, opacity: 1 }} />
          </div>
        )}

        {/* Hinweis unter dem Handy, kommt mit dem Download-Knopf */}
        <p className="absolute m-0 text-center whitespace-nowrap" style={{
          left: 0, width: SCREEN_W, top: SCREEN_H + BEZEL + 18, fontSize: 13, letterSpacing: 0.3, color: '#7d828c',
          opacity: parts.cta ?? 0, fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
        }}>
          {t('Nur für Android')}
        </p>

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
        {startBig > 0.05 && (
          <button type="button" onClick={onPlay} aria-label={t('Animation abspielen')} tabIndex={startBig > 0.5 ? 0 : -1}
            className="absolute rounded-full flex items-center justify-center cursor-pointer hover:scale-110 transition-transform"
            style={{ left: hx - dotR, top: hy - dotR, width: dotR * 2, height: dotR * 2, background: 'transparent', border: 'none', padding: 0, pointerEvents: startBig > 0.5 ? 'auto' : 'none' }}>
            <svg width={dotR * 0.8} height={dotR * 0.8} viewBox="0 0 24 24" aria-hidden style={{ opacity: startBig, marginLeft: dotR * 0.1 }}>
              <path d="M6 3.5 L20.5 12 L6 20.5 Z" fill="#000" strokeLinejoin="round" stroke="#000" strokeWidth="1.5" />
            </svg>
          </button>
        )}


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

      {/* „Scrollen ↓“ am unteren Fensterrand – verschwindet, sobald es losgeht.
          Wer nicht scrollen will, tippt auf den Punkt (Play). */}
      <div aria-hidden className="absolute left-1/2 -translate-x-1/2 bottom-6 md:bottom-8 z-20 flex flex-col items-center gap-2 pointer-events-none" style={{ opacity: hintIn }}>
        <span style={{ fontFamily: MONO, fontSize: 13, letterSpacing: 3, color: '#d9dce1', textTransform: 'uppercase' }}>{t('Scrollen')}</span>
        <svg width="16" height="22" viewBox="0 0 16 22" aria-hidden className="trk-bob"><path d="M8 2v17M2 13l6 6 6-6" stroke="#d9dce1" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>

      <style>{`
        @keyframes trkPulse { 0% { transform: scale(1); opacity: .9 } 100% { transform: scale(3.2); opacity: 0 } }
        @keyframes trkBob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(5px) } }
        .trk-pulse { animation: trkPulse 1.8s ease-out infinite; }
        .trk-bob { animation: trkBob 1.6s ease-in-out infinite; }
        /* Download-Knopf pulsiert sanft, sobald der Screen fertig ist */
        @keyframes trkCta { 0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(204,255,0,.55) } 50% { transform: scale(1.025) } 70% { box-shadow: 0 0 0 12px rgba(204,255,0,0) } 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(204,255,0,0) } }
        .trk-cta-pulse { animation: trkCta 1.8s ease-in-out infinite; }
        /* Lichtreflex: diagonales Band, wandert in ~3 s übers Handy, dann ~6 s Pause */
        @keyframes trkSheen { 0% { background-position: 100% 100% } 34% { background-position: 0% 0% } 100% { background-position: 0% 0% } }
        .trk-sheen { background: linear-gradient(135deg, transparent 44%, rgba(255,255,255,0.55) 49%, #fff 50%, rgba(255,255,255,0.55) 51%, transparent 56%) no-repeat; background-size: 300% 300%; background-position: 100% 100%; animation: trkSheen 9s cubic-bezier(.45,0,.25,1) 0.6s infinite; }
        /* nur der Rahmen: Inhalt ausgespart */
        .trk-rim { -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0); }
        .trk-cta-pulse:hover { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) { .trk-pulse, .trk-bob, .trk-cta-pulse, .trk-sheen { animation: none } }
      `}</style>
    </>
  );
}

// ── Anfangs-Schriftzug, der beim ersten Scrollen in Partikel zerfällt ─────────
// Die Kontur der Buchstaben wird einmal auf eine Leinwand gezeichnet und in Punkte zerlegt.
// Beim Scrollen wandert die obere Zeile nach rechts, die untere nach links, beide nach oben;
// gleichzeitig lösen sich die Punkte – zuerst an der vorderen Kante – und verwehen.
/** Nach so vielen Fensterhöhen Scrollweg ist der Schriftzug ganz zerfallen. */
const DISSOLVE_VH = 0.8;
type Particle = { x: number; y: number; line: number; vx: number; vy: number; delay: number };

/** Schrift wie bei „DEIN GPS TRACKER“ setzen und so verkleinern, dass die längste Zeile ins Fenster passt. */
function setTitleFont(g: CanvasRenderingContext2D, lines: string[], size: number, vw: number) {
  const family = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
  const apply = (px: number) => {
    g.font = `900 ${px}px ${family}`;
    (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${(-0.02 * px).toFixed(2)}px`;
  };
  apply(size);
  const widest = Math.max(...lines.map(l => g.measureText(l).width));
  const px = widest > vw * 0.94 ? size * (vw * 0.94) / widest : size;
  apply(px);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  return px;
}

function ParticleTitle({ text, size, scrollY, vw, vh }: { text: string; size: number; scrollY: number; vw: number; vh: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [particles, setParticles] = useState<{ pts: Particle[]; key: string } | null>(null);
  const key = `${text}|${Math.round(size)}|${vw}|${vh}`;

  // Kontur einmal zeichnen und abtasten (nach dem Laden der Schrift, bei Größen- oder Sprachwechsel neu)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { await document.fonts.ready; } catch { /* ältere Browser */ }
      if (cancelled) return;
      const off = document.createElement('canvas');
      off.width = vw; off.height = vh;
      const g = off.getContext('2d', { willReadFrequently: true });
      if (!g) return;
      const lines = text.toUpperCase().split('\n');
      const px = setTitleFont(g, lines, size, vw);
      g.lineWidth = 3; g.strokeStyle = '#fff';
      const lh = px * 0.92;
      lines.forEach((ln, i) => g.strokeText(ln, vw / 2, vh / 2 + (i - (lines.length - 1) / 2) * lh));
      const data = g.getImageData(0, 0, vw, vh).data;
      const step = vw < 700 ? 2 : 3;
      const pts: Particle[] = [];
      for (let y = 0; y < vh; y += step) for (let x = 0; x < vw; x += step) {
        if (data[(y * vw + x) * 4 + 3] < 110) continue;
        const line = y < vh / 2 ? 0 : 1;
        const dir = line === 0 ? 1 : -1;
        // vordere Kante zuerst: oben rechts (wandert nach rechts), unten links (wandert nach links)
        const lead = line === 0 ? x / vw : 1 - x / vw;
        pts.push({ x, y, line, vx: dir * (0.4 + Math.random()) + (Math.random() - 0.5) * 0.8, vy: -0.3 - Math.random() * 1.2,
          delay: 0.55 * (1 - lead) + Math.random() * 0.2 });
      }
      if (!cancelled) setParticles({ pts, key });
    })();
    return () => { cancelled = true; };
  }, [key, text, size, vw, vh]);

  // je Scrollstand neu zeichnen
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(vw * dpr) || c.height !== Math.round(vh * dpr)) { c.width = Math.round(vw * dpr); c.height = Math.round(vh * dpr); }
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, vw, vh);
    const q = clamp01(scrollY / (vh * DISSOLVE_VH));
    const lines = text.toUpperCase().split('\n');
    const shift = (line: number) => (line === 0 ? 1 : -1) * easeIO(q) * vw * 0.35;

    // solange noch nicht gescrollt: die saubere Kontur (wie „DEIN GPS TRACKER“ am Ende)
    const crisp = 1 - clamp01(q / 0.04);
    if (crisp > 0 || !particles) {
      g.globalAlpha = particles ? crisp : 1;
      const lh = setTitleFont(g, lines, size, vw) * 0.92;
      g.lineWidth = 3; g.strokeStyle = 'rgba(226, 229, 234, 0.16)';
      lines.forEach((ln, i) => g.strokeText(ln, vw / 2 + shift(i), vh / 2 + (i - (lines.length - 1) / 2) * lh - scrollY));
      g.globalAlpha = 1;
    }
    if (!particles || particles.key !== key || q <= 0) return;

    const intro = clamp01(q / 0.04);
    for (const pt of particles.pts) {
      const d = clamp01((q - pt.delay) / 0.35);
      const e = d * d;
      const x = pt.x + shift(pt.line) + pt.vx * e * 220;
      const y = pt.y - scrollY + pt.vy * e * 220;
      if (y < -10 || y > vh + 10 || x < -10 || x > vw + 10) continue;
      // fest im Schriftzug leise, beim Loslösen kurz heller, dann verweht
      const a = intro * (d <= 0 ? 0.16 : (0.16 + 0.5 * Math.sin(Math.PI * Math.min(1, d * 1.4))) * (1 - d));
      if (a <= 0.004) continue;
      g.fillStyle = d > 0.05 && pt.delay % 0.1 < 0.012 ? `rgba(204,255,0,${a})` : `rgba(226,229,234,${a})`;
      const r = d > 0 ? 1.6 : 1.3;
      g.fillRect(x, y, r, r);
    }
  }, [scrollY, vw, vh, size, text, particles, key]);

  return <canvas ref={canvas} aria-hidden className="absolute left-0 top-0 pointer-events-none" style={{ width: vw, height: vh }} />;
}
