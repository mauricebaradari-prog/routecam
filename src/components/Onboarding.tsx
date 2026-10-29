'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, Star, Heart, ArrowLeft, ArrowRight, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';

// Three-step intro shown once per Google account after the first sign-in.
// Seen state lives in localStorage (per account id); `openOnboarding()` shows it again on demand.

const SEEN_KEY = 'routecam.onboardingSeen';
const OPEN_EVENT = 'routecam:onboarding';

function seenIds(): string[] {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return []; }
}
function markSeen(id: string) {
  try {
    const ids = seenIds();
    if (!ids.includes(id)) localStorage.setItem(SEEN_KEY, JSON.stringify([...ids, id]));
  } catch {}
}

export function openOnboarding() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

const STEPS = [
  {
    title: 'Video und Strecke verbinden',
    text: 'Füge den Link zu deinem YouTube-Video ein und lade die GPX- oder KML-Datei deiner Fahrt hoch. RouteCam legt beides übereinander: Während das Video läuft, fährt dein Pin die Strecke auf dem 3D-Globus mit.',
    visual: <VisualConnect />,
  },
  {
    title: 'Kommentieren und bewerten',
    text: 'Hinterlasse Kommentare direkt an einer Stelle im Video, vergib Sterne für Strecken und like die Fahrten, die dir gefallen. Wer die Fahrt angelegt hat, wird benachrichtigt.',
    visual: <VisualReact />,
  },
  {
    title: 'Fahrten der Community entdecken',
    text: 'Schau dir die Touren anderer Fahrer an. Fahren mehrere dieselbe Straße, wechselst du an derselben Stelle die Perspektive: gleicher Ort, anderes Video.',
    visual: <VisualCommunity />,
  },
];

export default function Onboarding({ onCreate }: { onCreate?: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const primaryRef = useRef<HTMLButtonElement>(null);

  // first sign-in of this account → show once
  useEffect(() => {
    if (user && !seenIds().includes(user.id)) { setStep(0); setOpen(true); }
  }, [user]);

  // manual replay (About → Support)
  useEffect(() => {
    const show = () => { setStep(0); setOpen(true); };
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);

  const close = useCallback(() => {
    if (user) markSeen(user.id);
    setOpen(false);
  }, [user]);

  const last = step === STEPS.length - 1;
  const next = useCallback(() => (last ? close() : setStep(s => s + 1)), [last, close]);
  const back = useCallback(() => setStep(s => Math.max(0, s - 1)), []);

  useEffect(() => {
    if (!open) return;
    primaryRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') back();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, step, close, next, back]);

  if (!open) return null;
  const s = STEPS[step];
  const firstName = user?.name?.split(' ')[0];

  return (
    <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center sm:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={close} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="relative w-full sm:max-w-md bg-[#1f1f1f] sm:rounded-2xl rounded-t-2xl border border-white/10 shadow-2xl text-white overflow-hidden"
      >
        {/* top: skip + step indicator */}
        <div className="flex items-center justify-between px-5 pt-4">
          <span className="text-[11px] font-medium tracking-wider uppercase text-white/40 tabular-nums">
            Schritt {step + 1} von {STEPS.length}
          </span>
          <button onClick={close} className="h-8 -mr-2 px-3 rounded-full text-xs text-white/50 hover:text-white hover:bg-white/10 inline-flex items-center gap-1">
            Überspringen <X size={14} />
          </button>
        </div>

        {/* visual */}
        <div key={step} className="mx-5 mt-3 h-40 rounded-xl bg-[#0b0d10] border border-white/5 flex items-center justify-center overflow-hidden onboarding-fade">
          {s.visual}
        </div>

        {/* text */}
        {/* all three texts share one grid cell, so the window is as tall as the longest step – no jumping */}
        <div className="px-5 pt-5 grid">
          {STEPS.map((st, i) => (
            <div key={i} style={{ gridArea: '1 / 1' }} className={i === step ? '' : 'invisible'} aria-hidden={i !== step}>
              {i === 0 && firstName && <p className="text-xs text-[#CCFF00] mb-1">Willkommen, {firstName}</p>}
              <h2 id={i === step ? 'onboarding-title' : undefined} className="text-lg font-semibold tracking-tight text-balance">{st.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/60">{st.text}</p>
            </div>
          ))}
        </div>

        {/* footer: dots + navigation */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 mt-2 border-t border-white/10">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {STEPS.map((_, i) => (
              <button
                key={i}
                tabIndex={-1}
                onClick={() => setStep(i)}
                className={`h-1.5 rounded-full transition-all ${i === step ? 'w-5 bg-[#CCFF00]' : 'w-1.5 bg-white/20 hover:bg-white/40'}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button onClick={back} aria-label="Zurück" className="w-10 h-10 rounded-full flex items-center justify-center text-white/70 hover:bg-white/10">
                <ArrowLeft size={18} />
              </button>
            )}
            {last && onCreate && (
              <button onClick={() => { close(); onCreate(); }} className="h-10 px-4 rounded-full text-sm font-medium hover:bg-white/10">
                Erste Fahrt anlegen
              </button>
            )}
            <button
              ref={primaryRef}
              onClick={next}
              className="h-10 pl-5 pr-4 rounded-full text-sm font-semibold bg-[#CCFF00] text-black hover:brightness-110 transition inline-flex items-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CCFF00]"
            >
              {last ? 'Los geht’s' : <>Weiter <ArrowRight size={16} /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── small illustrations ─────────────────────────────────────────────────────

// Step 1: YouTube link + GPX file merge into a route whose pin runs in sync with the video.
type ConnectPhase = 'cards' | 'join' | 'merge' | 'flash' | 'result' | 'play' | 'out';
const CONNECT_TIMELINE: [number, ConnectPhase][] = [[0, 'cards'], [1000, 'join'], [1900, 'merge'], [2450, 'flash'], [2650, 'result'], [3350, 'play'], [6800, 'out']];
const CONNECT_LOOP_MS = 7300;
const PLAY_MS = 3200;
const ROUTE_D = 'M22 112 C 60 104, 70 62, 112 66 S 160 104, 192 82 S 238 34, 282 28';

function VisualConnect() {
  const [phase, setPhase] = useState<ConnectPhase>('cards');
  const [cycle, setCycle] = useState(0);
  const [p, setP] = useState(0);              // playback progress 0..1
  const [len, setLen] = useState(0);
  const [still, setStill] = useState(false);
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => { if (pathRef.current) setLen(pathRef.current.getTotalLength()); }, []);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setStill(true); setPhase('play'); setP(0.6); return; }
    let timers: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      setP(0);
      setCycle(c => c + 1);
      timers = CONNECT_TIMELINE.map(([t, ph]) => setTimeout(() => setPhase(ph), t));
      timers.push(setTimeout(run, CONNECT_LOOP_MS));
    };
    run();
    return () => timers.forEach(clearTimeout);
  }, []);

  // pin + video progress while playing
  useEffect(() => {
    if (phase !== 'play' || still) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const v = Math.min(1, (now - t0) / PLAY_MS);
      setP(v);
      if (v < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, still]);

  const joining = phase === 'join';
  const merged = phase !== 'cards' && phase !== 'join';
  const showResult = phase === 'result' || phase === 'play' || phase === 'out';
  const pin = pathRef.current && len ? pathRef.current.getPointAtLength(len * p) : { x: 22, y: 112 };

  return (
    <div className="relative w-full h-full">
      {/* ── result: map with route, moving pin and synced video ── */}
      <div className="absolute inset-0 transition-opacity duration-500" style={{ opacity: showResult && phase !== 'out' ? 1 : 0 }}>
        <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
        <svg viewBox="0 0 300 140" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 w-full h-full p-2" aria-hidden="true">
          <path ref={pathRef} d={ROUTE_D} fill="none" stroke="#CCFF00" strokeOpacity="0.3" strokeWidth="2.5" strokeLinecap="round"
            style={len ? { strokeDasharray: len, strokeDashoffset: showResult ? 0 : len, transition: showResult ? 'stroke-dashoffset 700ms ease-out' : 'none' } : undefined} />
          {len > 0 && (
            <path d={ROUTE_D} fill="none" stroke="#CCFF00" strokeWidth="2.5" strokeLinecap="round"
              style={{ strokeDasharray: len, strokeDashoffset: len * (1 - p), filter: 'drop-shadow(0 0 3px #CCFF00)' }} />
          )}
          <circle cx="22" cy="112" r="3" fill="#fff" />
          <circle cx="282" cy="28" r="3" fill="#fff" fillOpacity="0.5" />
          {phase === 'play' || still ? (
            <g transform={`translate(${pin.x} ${pin.y})`}>
              <circle r="8" fill="#CCFF00" fillOpacity="0.2" />
              <circle r="4.5" fill="#CCFF00" stroke="#0b0d10" strokeWidth="1.5" />
            </g>
          ) : null}
        </svg>

        <VideoInset p={p} playing={phase === 'play'} />
      </div>

      {/* flash where the two inputs meet */}
      {phase === 'flash' && <span className="absolute left-1/2 top-1/2 w-10 h-10 -ml-5 -mt-5 rounded-full bg-[#CCFF00] onboarding-flash" aria-hidden="true" />}

      {/* ── inputs: YouTube link and GPX file glide together ── */}
      {!still && (
        <div key={cycle} className={`absolute inset-0 ${phase === 'cards' ? 'onboarding-fade' : ''}`} aria-hidden="true">
          <InputCard side="left" merged={merged} joining={joining}>
            <div className="w-full h-9 rounded bg-gradient-to-b from-[#3b5b78] to-[#3d3a33] flex items-center justify-center">
              <span className="w-5 h-3.5 rounded-[4px] bg-[#ff0033] flex items-center justify-center">
                <span className="w-0 h-0 border-y-[3px] border-y-transparent border-l-[5px] border-l-white ml-px" />
              </span>
            </div>
            <span className="text-[9px] text-white/50 font-mono truncate w-full text-center">youtu.be/…</span>
          </InputCard>
          {/* the "+" that does the joining */}
          <div className="absolute left-1/2 top-1/2 flex flex-col items-center"
            style={{ transform: `translate(-50%, -14px) scale(${merged ? 1.8 : joining ? 1.15 : 1})`, opacity: merged ? 0 : 1, transition: 'transform 300ms cubic-bezier(.3,1.6,.5,1), opacity 250ms' }}>
            <span className={`relative w-7 h-7 rounded-full flex items-center justify-center text-base font-semibold border transition-colors duration-200 ${
              joining ? 'bg-[#CCFF00] border-[#CCFF00] text-black' : 'bg-[#CCFF00]/10 border-[#CCFF00]/40 text-[#CCFF00]'}`}>
              {joining && <span className="absolute inset-0 rounded-full border border-[#CCFF00] onboarding-ripple" />}
              +
            </span>
          </div>
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 mt-[22px] text-[10px] font-medium text-[#CCFF00] transition-opacity duration-200" style={{ opacity: joining ? 1 : 0 }}>verbinden</span>
          <InputCard side="right" merged={merged} joining={joining}>
            <svg viewBox="0 0 60 30" className="w-full h-9" aria-hidden="true">
              <path d="M4 24 C 14 22, 16 8, 28 10 S 42 24, 56 6" fill="none" stroke="#CCFF00" strokeWidth="2" strokeLinecap="round" />
              <circle cx="4" cy="24" r="2" fill="#fff" /><circle cx="56" cy="6" r="2" fill="#fff" />
            </svg>
            <span className="text-[9px] text-white/50 font-mono">tour.gpx</span>
          </InputCard>
        </div>
      )}
    </div>
  );
}

function InputCard({ side, merged, joining, children }: { side: 'left' | 'right'; merged: boolean; joining: boolean; children: React.ReactNode }) {
  const off = joining ? 64 : 82; // slide in until they touch the "+"
  const dx = side === 'left' ? `calc(-50% - ${off}px)` : `calc(-50% + ${off}px)`;
  return (
    <div
      className="absolute left-1/2 top-1/2 w-[92px] rounded-lg bg-white/5 border border-white/10 p-1.5 flex flex-col items-center gap-1"
      style={{
        transform: merged ? 'translate(-50%, -50%) scale(.45)' : `translate(${dx}, -50%)`,
        opacity: merged ? 0 : 1,
        transition: joining ? 'transform 450ms cubic-bezier(.3,1.4,.5,1)' : 'transform 550ms cubic-bezier(.6,0,.4,1), opacity 400ms 150ms',
      }}
    >
      {children}
    </div>
  );
}

// Step 2: a cursor sweeps over the stars, clicks the 4th, then likes the ride.
type Target = 'start' | 's0' | 's1' | 's2' | 's3' | 'heart';
type Frame = { target?: Target; dur?: number; hover?: number | null; rating?: number; liked?: boolean; press?: boolean; hidden?: boolean };
const TIMELINE: [number, Frame][] = [
  [0, { target: 'start', dur: 0, hover: null, rating: 0, liked: false, press: false, hidden: false }],
  [350, { target: 's0', dur: 650 }],
  [1000, { hover: 1 }],
  [1150, { target: 's1', dur: 150 }], [1300, { hover: 2 }],
  [1300, { target: 's2', dur: 150 }], [1450, { hover: 3 }],
  [1450, { target: 's3', dur: 150 }], [1600, { hover: 4 }],
  [1900, { press: true }],
  [2050, { press: false, rating: 4, hover: null }],
  [2600, { target: 'heart', dur: 650 }],
  [3400, { press: true }],
  [3550, { press: false, liked: true }],
  [5000, { hidden: true }],
];
const LOOP_MS = 5600;

function VisualReact() {
  const box = useRef<HTMLDivElement>(null);
  const stars = useRef<(HTMLSpanElement | null)[]>([]);
  const heart = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<Record<Target, [number, number]> | null>(null);
  const [f, setF] = useState<Required<Frame>>({ target: 'start', dur: 0, hover: null, rating: 0, liked: false, press: false, hidden: false });
  const [still, setStill] = useState(false);

  // measure click targets relative to the box (cursor tip = top-left of the svg)
  useEffect(() => {
    const b = box.current?.getBoundingClientRect();
    if (!b) return;
    const centre = (el: Element | null): [number, number] => {
      const r = el?.getBoundingClientRect();
      return r ? [r.left - b.left + r.width / 2, r.top - b.top + r.height / 2] : [0, 0];
    };
    setPos({
      start: [b.width - 6, b.height + 10],
      s0: centre(stars.current[0]), s1: centre(stars.current[1]), s2: centre(stars.current[2]), s3: centre(stars.current[3]),
      heart: centre(heart.current),
    });
  }, []);

  useEffect(() => {
    if (!pos) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setStill(true); setF(x => ({ ...x, rating: 4, liked: true, hidden: true }));
      return;
    }
    let timers: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      timers = TIMELINE.map(([t, patch]) => setTimeout(() => setF(x => ({ ...x, ...patch })), t));
      timers.push(setTimeout(run, LOOP_MS));
    };
    run();
    return () => timers.forEach(clearTimeout);
  }, [pos]);

  const shown = f.hover ?? f.rating;
  const [cx, cy] = pos ? pos[f.target] : [0, 0];

  return (
    <div ref={box} className="relative w-60 flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <span className="w-7 h-7 rounded-full bg-[#CCFF00]/20 text-[#CCFF00] text-[11px] font-semibold flex items-center justify-center shrink-0">L</span>
        <div className="rounded-lg rounded-tl-sm bg-white/5 border border-white/10 px-3 py-2 text-[11px] text-white/70">
          <span className="text-white/40 tabular-nums mr-1">12:41</span>Die Kurven hier sind der Wahnsinn!
        </div>
      </div>
      <div className="flex items-center justify-between pl-9">
        <div className="flex gap-0.5">
          {[0, 1, 2, 3, 4].map(i => (
            <span key={i} ref={el => { stars.current[i] = el; }} className={`transition-transform duration-150 ${f.rating === 4 && i < 4 && !still ? 'onboarding-pop' : ''}`} style={{ animationDelay: `${i * 40}ms` }}>
              <Star size={15} className={`transition-colors duration-100 ${i < shown ? 'text-[#CCFF00]' : 'text-white/20'}`} fill="currentColor" />
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-white/50">
          <span className="inline-flex items-center gap-1">
            <span ref={heart} className={f.liked && !still ? 'onboarding-pop' : ''}>
              <Heart size={14} className={`transition-colors ${f.liked ? 'text-[#CCFF00]' : 'text-white/40'}`} fill={f.liked ? 'currentColor' : 'none'} />
            </span>
            <span className="tabular-nums">{f.liked ? 25 : 24}</span>
          </span>
          <span className="inline-flex items-center gap-1"><MessageCircle size={14} /> 7</span>
        </div>
      </div>

      {pos && !still && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0"
          style={{
            transform: `translate(${cx}px, ${cy}px)`,
            transition: `transform ${f.dur}ms cubic-bezier(.45,.05,.25,1), opacity 300ms`,
            opacity: f.hidden ? 0 : 1,
          }}
        >
          {f.press && <span className="absolute -left-3 -top-3 w-6 h-6 rounded-full border border-[#CCFF00] onboarding-ripple" />}
          <svg width="16" height="20" viewBox="0 0 16 20" style={{ transform: `scale(${f.press ? 0.85 : 1})`, transformOrigin: '0 0', transition: 'transform 100ms', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.6))' }}>
            <path d="M1 1 L1 16 L5 12.5 L7.8 18.5 L10.2 17.4 L7.5 11.5 L12.5 11.5 Z" fill="#fff" stroke="#000" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </div>
  );
}

// Small "YouTube" frame whose progress follows the pin – shared by steps 1 and 3.
function VideoInset({ p, playing, style }: { p: number; playing: boolean; style?: React.CSSProperties }) {
  const secs = Math.round(p * 754); // fake 12:34 video
  const stamp = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  return (
    <div className="absolute left-2.5 top-2.5 w-24 rounded-md overflow-hidden border border-white/15 bg-black shadow-lg transition-opacity duration-300" style={style}>
      <svg viewBox="0 0 96 54" className="block w-full" aria-hidden="true">
        <rect width="96" height="30" fill="#4a6580" />
        <rect width="96" height="30" fill="#c7a46a" opacity=".45" style={{ maskImage: 'linear-gradient(transparent, #000)' }} />
        <path d="M0 30 L22 16 L38 26 L58 12 L78 24 L96 18 L96 30 Z" fill="#2c3a2a" />
        <rect y="30" width="96" height="24" fill="#3d3a33" />
        <path d="M40 30 L56 30 L80 54 L16 54 Z" fill="#55524a" />
        <line x1="48" y1="30" x2="48" y2="54" stroke="#e8e2c8" strokeWidth="1.5" strokeDasharray="4 5" className={playing ? 'onboarding-road' : ''} />
      </svg>
      <div className="absolute left-1 bottom-2 text-[8px] font-medium text-white tabular-nums bg-black/50 rounded px-0.5">{stamp}</div>
      <div className="h-[3px] bg-white/15"><div className="h-full bg-[#CCFF00]" style={{ width: `${p * 100}%` }} /></div>
    </div>
  );
}

// Step 3: zoom from the globe down onto one ride; other rides fly past left and right.
const VB_W = 300, VB_H = 140;
const GLOBE = { x: 150, y: 70, r: 54 };
const TARGET = { x: 168, y: 60 };
const TARGET_D = 'M-2.1 1.3 C -1.3 1.15, -1.1 0.15, -0.1 0.25 S 0.9 1.2, 1.4 0.6 S 1.9 -0.8, 2.2 -1.05';
const Z_MAX = 40;

// deterministic pseudo-random squiggles around the target at several scales,
// biased to the left and right so they sweep sideways during the zoom
function makeRides() {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const rides: { x: number; y: number; k: number; d: string; lime: boolean }[] = [];
  const bands = [
    { n: 8, dist: [3.5, 11], size: 1.4 },  // appear half-way
    { n: 8, dist: [1.8, 4.2], size: 0.5 }, // rush past at the end
  ];
  for (const band of bands) {
    for (let i = 0; i < band.n; i++) {
      const side = i % 2 ? 1 : -1;
      const dx = side * (band.dist[0] + rnd() * (band.dist[1] - band.dist[0]));
      const dy = (rnd() - 0.5) * band.dist[1] * 0.55;
      const x = TARGET.x + dx, y = TARGET.y + dy;
      if (Math.hypot(x - GLOBE.x, y - GLOBE.y) > GLOBE.r - 3) continue; // keep on the globe
      const a = (rnd() - 0.5) * 1.6, b = (rnd() - 0.5) * 1.6;
      rides.push({ x, y, k: band.size, d: `M-1 ${a.toFixed(2)} C -0.4 ${(-a).toFixed(2)}, 0.1 ${b.toFixed(2)}, 0.4 ${(b * 0.3).toFixed(2)} S 0.8 ${(-b).toFixed(2)}, 1 ${(a * 0.5).toFixed(2)}`, lime: rnd() > 0.55 });
    }
  }
  return rides;
}
const RIDES = makeRides();

// timeline (ms): globe spins in → zoom → cursor clicks the ride → ride plays with its video
const SPIN_END = 2400, ZOOM_START = 1300, ZOOM_END = 4300;
const CURSOR_IN = 4500, CURSOR_AT = 5300, CLICK = 5450, SELECTED = 5600;
const PLAY_START = 5800, PLAY_END = 8600, COMMUNITY_LOOP = 9300;
const SPIN_FROM = -2.4; // radians the globe still has to turn when the loop starts
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// rides live on the sphere: store latitude/longitude, project with the current spin
function toSphere(x: number, y: number) {
  const lat = Math.asin(clamp01((y - GLOBE.y) / GLOBE.r * 0.5 + 0.5) * 2 - 1);
  const lon = Math.asin(Math.max(-1, Math.min(1, (x - GLOBE.x) / (GLOBE.r * Math.cos(lat)))));
  return { lat, lon };
}
function project(lat: number, lon: number, spin: number) {
  const a = lon + spin;
  return { x: GLOBE.x + GLOBE.r * Math.cos(lat) * Math.sin(a), y: GLOBE.y + GLOBE.r * Math.sin(lat), front: Math.cos(a) };
}
const RIDES_GEO = RIDES.map(r => ({ ...r, ...toSphere(r.x, r.y) }));
const TARGET_GEO = toSphere(TARGET.x, TARGET.y);
const MERIDIANS = [0, 0.5, 1, 1.5, 2, 2.5];
const SHOW_OTHER_RIDES = false; // other community rides around the target (switched off on request)
const FRAME_OFFSET_Y = 0.125;    // centre the ride vertically so its start isn't cut off

function VisualCommunity() {
  const [t, setT] = useState(0);
  const [len, setLen] = useState(0);
  const routeRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setT(PLAY_START + (PLAY_END - PLAY_START) * 0.6); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => { setT((now - t0) % COMMUNITY_LOOP); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  // the ride is only in the DOM once it has turned to the front – measure it then
  useEffect(() => { if (!len && routeRef.current) setLen(routeRef.current.getTotalLength()); });

  // camera
  const spin = SPIN_FROM * (1 - easeOut(clamp01(t / SPIN_END)));
  const zt = ease(clamp01((t - ZOOM_START) / (ZOOM_END - ZOOM_START)));
  const sc = Math.pow(Z_MAX, zt);                        // log-zoom feels like flying in
  const tgt = project(TARGET_GEO.lat, TARGET_GEO.lon, spin);
  const follow = 1 - Math.pow(1 - zt, 3);
  const cx = GLOBE.x + (tgt.x - GLOBE.x) * follow;
  const cy = GLOBE.y + (tgt.y + FRAME_OFFSET_Y - GLOBE.y) * follow;
  const camera = `translate(${VB_W / 2} ${VB_H / 2}) scale(${sc}) translate(${-cx} ${-cy})`;

  // states
  const landed = t >= ZOOM_END;
  const selected = t >= SELECTED;
  const p = clamp01((t - PLAY_START) / (PLAY_END - PLAY_START));
  const fade = Math.min(clamp01(t / 400), t > PLAY_END + 300 ? 0 : 1);
  const dim = selected ? 1 - 0.7 * clamp01((t - SELECTED) / 400) : 1;
  const point = (f: number) => (routeRef.current && len ? routeRef.current.getPointAtLength(len * f) : { x: -2.1, y: 1.3 });
  const pin = point(p);

  // cursor (viewBox units): glides in from the bottom right and clicks the ride
  const hit = point(0); // play button sits on the start of the ride
  const hitX = VB_W / 2 + (tgt.x + hit.x - cx) * sc, hitY = VB_H / 2 + (tgt.y + hit.y - cy) * sc;
  const ct = easeOut(clamp01((t - CURSOR_IN) / (CURSOR_AT - CURSOR_IN)));
  const tipX = hitX + 2, tipY = hitY + 2;
  const curX = VB_W + 12 + (tipX - VB_W - 12) * ct, curY = VB_H + 12 + (tipY - VB_H - 12) * ct;
  const pressed = t >= CLICK && t < CLICK + 150;
  const showCursor = t >= CURSOR_IN && t < PLAY_START + 500;

  return (
    <div className="relative w-full h-full" style={{ opacity: fade, transition: 'opacity 300ms' }}>
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 w-full h-full overflow-visible" aria-hidden="true">
        <defs>
          <radialGradient id="ob-globe" cx="40%" cy="35%" r="70%">
            <stop offset="0" stopColor="#1b2a33" /><stop offset="1" stopColor="#0d1418" />
          </radialGradient>
        </defs>
        <g transform={camera}>
          <circle cx={GLOBE.x} cy={GLOBE.y} r={GLOBE.r} fill="url(#ob-globe)" stroke="#CCFF00" strokeOpacity=".25" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {MERIDIANS.map(m => (
            <ellipse key={`m${m}`} cx={GLOBE.x} cy={GLOBE.y} rx={Math.max(0.01, GLOBE.r * Math.abs(Math.sin(m + spin)))} ry={GLOBE.r} fill="none" stroke="#fff" strokeOpacity=".06" vectorEffect="non-scaling-stroke" />
          ))}
          {[-0.6, -0.3, 0, 0.3, 0.6].map(k => (
            <line key={`p${k}`} x1={GLOBE.x - GLOBE.r * Math.sqrt(1 - k * k)} x2={GLOBE.x + GLOBE.r * Math.sqrt(1 - k * k)} y1={GLOBE.y + GLOBE.r * k} y2={GLOBE.y + GLOBE.r * k} stroke="#fff" strokeOpacity=".06" vectorEffect="non-scaling-stroke" />
          ))}

          {SHOW_OTHER_RIDES && RIDES_GEO.map((r, i) => {
            const pr = project(r.lat, r.lon, spin);
            if (pr.front <= 0.05) return null;                 // behind the globe
            const px = r.k * 2 * sc;                           // on-screen size
            const o = clamp01((px - 4) / 10) * clamp01((sc - 2.5) / 3) * Math.min(1, pr.front * 3); // only once we're diving in
            if (o <= 0) return null;
            return (
              <g key={i} transform={`translate(${pr.x} ${pr.y}) scale(${r.k})`} opacity={o * 0.85 * dim}>
                <path d={r.d} fill="none" stroke={r.lime ? '#CCFF00' : '#fff'} strokeOpacity={r.lime ? 0.55 : 0.4} strokeWidth="1.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                <circle cx="-1" cy="0" r={1.6 / (r.k * sc)} fill="#fff" fillOpacity=".6" />
              </g>
            );
          })}

          {/* the ride the cursor picks */}
          {tgt.front > 0.05 && (
            <g transform={`translate(${tgt.x} ${tgt.y})`} opacity={Math.min(1, tgt.front * 3)}>
              <path ref={routeRef} d={TARGET_D} fill="none" stroke={selected ? '#CCFF00' : '#ffffff'}
                strokeOpacity={selected ? 0.3 : landed ? 0.75 : 0.6} strokeWidth={(landed ? 2.2 : 1.6) / sc} strokeLinecap="round" />
              {selected && len > 0 && (
                <path d={TARGET_D} fill="none" stroke="#CCFF00" strokeWidth={2.6 / sc} strokeLinecap="round"
                  style={{ strokeDasharray: len, strokeDashoffset: len * (1 - p), filter: 'drop-shadow(0 0 3px #CCFF00)' }} />
              )}
              <circle cx={-2.1} cy={1.3} r={2.2 / sc} fill="#fff" fillOpacity={selected ? 0 : 0.8} />
              {selected && (
                <g transform={`translate(${pin.x} ${pin.y})`}>
                  <circle r={8 / sc} fill="#CCFF00" fillOpacity=".2" />
                  <circle r={4.5 / sc} fill="#CCFF00" stroke="#0b0d10" strokeWidth={1.5 / sc} />
                </g>
              )}
            </g>
          )}
        </g>

        {/* play button on the ride – the cursor presses it */}
        {landed && t < SELECTED + 250 && (() => {
          const appear = easeOut(clamp01((t - ZOOM_END - 100) / 250));
          const gone = clamp01((t - SELECTED) / 250);
          const k = (t >= CLICK && t < CLICK + 150 ? 0.86 : 1) * (0.6 + 0.4 * appear) * (1 + 0.3 * gone);
          return (
            <g transform={`translate(${hitX} ${hitY}) scale(${k})`} opacity={appear * (1 - gone)}>
              <circle r="13" fill="#CCFF00" fillOpacity=".18" />
              <circle r="9" fill="#CCFF00" style={{ filter: 'drop-shadow(0 0 4px rgba(204,255,0,.6))' }} />
              <path d="M-2.6 -4.3 L4.6 0 L-2.6 4.3 Z" fill="#000" strokeLinejoin="round" />
            </g>
          );
        })()}

        {/* cursor */}
        {showCursor && (
          <g transform={`translate(${curX} ${curY})`}>
            {t >= CLICK && t < CLICK + 400 && (
              <circle r={4 + ((t - CLICK) / 400) * 10} fill="none" stroke="#CCFF00" strokeOpacity={1 - (t - CLICK) / 400} strokeWidth="1" />
            )}
            <g transform={`scale(${pressed ? 0.62 : 0.72})`} style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.6))' }}>
              <path d="M1 1 L1 16 L5 12.5 L7.8 18.5 L10.2 17.4 L7.5 11.5 L12.5 11.5 Z" fill="#fff" stroke="#000" strokeWidth="1.2" strokeLinejoin="round" />
            </g>
          </g>
        )}
      </svg>
      <VideoInset p={p} playing={selected && p > 0 && p < 1} style={{ opacity: selected ? 1 : 0 }} />
    </div>
  );
}
