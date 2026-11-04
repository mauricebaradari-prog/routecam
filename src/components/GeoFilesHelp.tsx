'use client';

// Erklärfenster „Was sind GPX- und KML-Dateien?“ – öffnet sich über dem Fenster „Fahrt anlegen“,
// ohne es zu schließen. Esc und Klick daneben schließen nur dieses Fenster.

import React, { useEffect, useRef } from 'react';
import { X, Smartphone, Navigation, Camera, MapPinned } from 'lucide-react';
import { t, useT } from '@/lib/i18n';

export default function GeoFilesHelp({ onClose }: { onClose: () => void }) {
  useT();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    // capture phase + stopImmediatePropagation: Esc closes only this window, not the dialog below
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-0 md:p-6">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="geo-help-title"
        className="relative w-full h-full md:h-auto md:max-h-[88vh] md:max-w-3xl flex flex-col bg-[#181818] md:rounded-2xl border border-white/10 shadow-2xl text-white"
      >
        <div className="flex items-center justify-between gap-4 px-6 h-16 border-b border-white/10 shrink-0">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-widest text-white/40">{t('Geodaten')}</div>
            <h2 id="geo-help-title" className="text-lg font-semibold truncate">{t('Was sind GPX- und KML-Dateien?')}</h2>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={t('Schließen')} className="w-10 h-10 -mr-2 rounded-full flex items-center justify-center hover:bg-white/10">
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-8">
          {/* 1. what it is – a track of points */}
          <section className="grid md:grid-cols-[1fr_1.1fr] gap-6 items-center">
            <div className="flex flex-col gap-3 text-sm leading-relaxed text-white/70">
              <p className="text-base text-white">{t('Eine Spur aus Punkten.')}</p>
              <p>{t('Während du fährst, speichert ein GPS-Gerät etwa jede Sekunde, wo du gerade bist. Daraus entsteht eine Kette aus Punkten – deine Strecke.')}</p>
              <p>{t('Jeder Punkt kennt seine Position, meist auch die Höhe und die genaue Uhrzeit. GPX und KML sind zwei Dateiformate, in denen diese Punkte gespeichert werden.')}</p>
            </div>
            <TrackIllustration />
          </section>

          {/* 2. GPX vs KML */}
          <section className="flex flex-col gap-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-white/40">{t('Die beiden Formate')}</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <FormatCard
                name="GPX"
                tag={t('Empfohlen')}
                text={t('Der Standard von Tracking-Apps, Navis und Sportuhren. Enthält meist für jeden Punkt die Uhrzeit – damit passt die Position im Video auf die Sekunde.')}
              />
              <FormatCard
                name="KML"
                text={t('Das Format von Google Earth und Google My Maps. Oft eine vorab geplante Route ohne Uhrzeiten – RouteCam verteilt die Position dann gleichmäßig über die Strecke.')}
              />
            </div>
          </section>

          {/* 3. where the file comes from */}
          <section className="flex flex-col gap-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-white/40">{t('Woher bekomme ich die Datei?')}</h3>
            <div className="flex flex-col divide-y divide-white/10 border-y border-white/10">
              <Source
                icon={<Smartphone size={18} />}
                title={t('Handy-App')}
                text={t('Vor der Fahrt eine Tracking-App starten und mitlaufen lassen. Danach die Aufzeichnung als GPX exportieren, z. B. in Strava, Komoot oder OsmAnd.')}
              />
              <Source
                icon={<Navigation size={18} />}
                title={t('Navi oder GPS-Gerät')}
                text={t('Garmin, TomTom & Co. zeichnen jede Fahrt auf. Die Datei bekommst du über die Hersteller-App am Computer, z. B. Garmin Connect → Exportieren → GPX.')}
              />
              <Source
                icon={<Camera size={18} />}
                title={t('Kamera mit GPS')}
                text={t('GoPro (mit GPS) und Insta360 (mit GPS-Fernbedienung oder App) speichern die Strecke im Video. Wähle hier einfach die Original-Videodatei – sie wird nicht hochgeladen.')}
              />
              <Source
                icon={<MapPinned size={18} />}
                title={t('Geplante Route')}
                text={t('In Google My Maps eine Route zeichnen und als KML herunterladen. Das geht auch ohne Aufzeichnung, dann aber ohne Uhrzeiten.')}
              />
            </div>
          </section>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10 shrink-0">
          <button type="button" onClick={onClose} className="h-10 px-5 rounded-full text-sm font-semibold bg-[#CCFF00] text-black hover:brightness-110 transition">
            {t('Verstanden')}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormatCard({ name, tag, text }: { name: string; tag?: string; text: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-3 min-w-0">
      <div className="flex items-center gap-3">
        <FileBadge ext={name.toLowerCase()} highlight={!!tag} />
        {tag && <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#CCFF00] text-black">{tag}</span>}
      </div>
      <p className="text-sm leading-relaxed text-white/70">{text}</p>
    </div>
  );
}

// A file as a drawn sheet with a folded corner; the extension sits on the band across it.
// highlight = the recommended format, so it carries the lime accent.
function FileBadge({ ext, highlight }: { ext: string; highlight?: boolean }) {
  return (
    <svg viewBox="0 0 44 54" width="40" height="49" className="shrink-0" role="img" aria-label={`.${ext}`}>
      {/* sheet with the top-right corner folded away */}
      <path
        d="M 6 2 H 28 L 40 14 V 48 A 4 4 0 0 1 36 52 H 6 A 4 4 0 0 1 2 48 V 6 A 4 4 0 0 1 6 2 Z"
        fill="rgba(255,255,255,0.07)"
        stroke={highlight ? 'rgba(204,255,0,0.55)' : 'rgba(255,255,255,0.22)'}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* the fold itself */}
      <path d="M 28 2 L 40 14 H 28 Z" fill={highlight ? 'rgba(204,255,0,0.35)' : 'rgba(255,255,255,0.22)'} />
      {/* two hinted lines of content above the band */}
      <path d="M 9 21 H 24 M 9 26 H 20" stroke="rgba(255,255,255,0.20)" strokeWidth="2" strokeLinecap="round" />
      {/* band carrying the extension */}
      <rect x="5" y="32" width="34" height="15" rx="3" fill={highlight ? '#CCFF00' : 'rgba(255,255,255,0.30)'} />
      <text
        x="22" y="42.5"
        textAnchor="middle"
        className="font-mono"
        fontSize="11"
        fontWeight="700"
        letterSpacing="0.3"
        fill={highlight ? '#0b0c0a' : '#ffffff'}
      >
        {ext.toUpperCase()}
      </text>
    </svg>
  );
}

// One source as a collapsible row – same open/close style as the FAQ on the About page.
function Source({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none flex items-center gap-3 py-3 text-sm font-medium hover:text-white">
        <span className="w-9 h-9 shrink-0 rounded-lg bg-white/[0.06] text-[#CCFF00] flex items-center justify-center">{icon}</span>
        <span className="min-w-0 flex-1">{title}</span>
        <span className="shrink-0 text-white/40 group-open:rotate-45 transition-transform text-lg leading-none" aria-hidden="true">+</span>
      </summary>
      <p className="pb-3 pl-12 pr-1 text-[13px] leading-relaxed text-white/60">{text}</p>
    </details>
  );
}

// A rider moving along a road and recording a point every couple of seconds. The callout shows
// what the newest point stores. Loops; with reduced motion it shows one still frame instead.
const TRACK: [number, number][] = [
  [18, 160], [40, 152], [62, 140], [82, 124], [98, 106], [112, 88], [130, 74], [152, 68], [176, 72],
  [198, 84], [216, 98], [236, 106], [258, 102], [278, 88], [292, 70], [302, 48], [308, 26],
];
const ROAD = `M ${TRACK.map(p => p.join(',')).join(' L ')}`;
// cumulative length along the road, so the rider moves at an even speed
const SEG_LEN = TRACK.slice(1).map((p, i) => Math.hypot(p[0] - TRACK[i][0], p[1] - TRACK[i][1]));
const TOTAL_LEN = SEG_LEN.reduce((a, b) => a + b, 0);
const POINT_AT = TRACK.map((_, i) => SEG_LEN.slice(0, i).reduce((a, b) => a + b, 0) / TOTAL_LEN);

const RIDE_MS = 6000;   // start → finish
const HOLD_MS = 1600;   // full track stays visible
const FADE_MS = 500;    // points fade out before the next lap
const CYCLE_MS = RIDE_MS + HOLD_MS + FADE_MS;
const STILL_INDEX = 8;  // frame shown with reduced motion

// plausible values for each recorded point (west Cyprus), one point every 2 s
function pointData(i: number) {
  const [x, y] = TRACK[i];
  const sec = 51 + i * 2; // 09:40:51 + 2 s per point
  const mm = 40 + Math.floor(sec / 60), ss = sec % 60;
  return {
    lat: (34.77 + (190 - y) * 0.00006).toFixed(4),
    lon: (32.42 + x * 0.000025).toFixed(4),
    ele: Math.round(84 + (190 - y) * 0.27),
    time: `09:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`,
  };
}

function positionAt(f: number): [number, number] {
  let d = Math.max(0, Math.min(1, f)) * TOTAL_LEN;
  for (let i = 0; i < SEG_LEN.length; i++) {
    if (d <= SEG_LEN[i] || i === SEG_LEN.length - 1) {
      const k = SEG_LEN[i] ? Math.min(1, d / SEG_LEN[i]) : 0;
      const a = TRACK[i], b = TRACK[i + 1];
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    }
    d -= SEG_LEN[i];
  }
  return TRACK[TRACK.length - 1];
}

function TrackIllustration() {
  const [elapsed, setElapsed] = React.useState<number | null>(null); // null = still frame

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => { setElapsed((now - t0) % CYCLE_MS); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const still = elapsed === null;
  const progress = still ? POINT_AT[STILL_INDEX] : Math.min(1, elapsed / RIDE_MS);
  const fade = still || elapsed < RIDE_MS + HOLD_MS ? 1 : 1 - (elapsed - RIDE_MS - HOLD_MS) / FADE_MS;
  // newest recorded point = last one the rider has passed
  let last = 0;
  for (let i = 0; i < TRACK.length; i++) if (POINT_AT[i] <= progress + 1e-6) last = i;
  const rider = still ? TRACK[STILL_INDEX] : positionAt(progress);
  const cur = TRACK[last];
  const data = pointData(last);
  const recorded = `M ${[...TRACK.slice(0, last + 1), rider].map(p => p.join(',')).join(' L ')}`;
  // callout follows the newest point, kept inside the frame
  const calloutX = Math.max(84, Math.min(200, cur[0])); // stays clear of the "Ziel" label
  const calloutBottom = 46;
  const justRecorded = !still && last > 0 && progress - POINT_AT[last] < 0.035;

  return (
    <div dir="ltr" className="relative w-full max-w-full aspect-[320/190] rounded-xl bg-[#0b0d10] border border-white/5 overflow-hidden">
      <svg viewBox="0 0 320 190" className="absolute inset-0 w-full h-full" aria-hidden="true">
        <defs>
          <pattern id="geo-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="320" height="190" fill="url(#geo-grid)" />
        {/* the road */}
        <path d={ROAD} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
        <g opacity={fade}>
          {/* recorded trace behind the rider */}
          <path d={recorded} fill="none" stroke="#CCFF00" strokeWidth="1.5" strokeDasharray="2 5" strokeLinecap="round" opacity="0.6" />
          {/* recorded points */}
          {TRACK.slice(0, last + 1).map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i === last ? 4.5 : 3} fill={i === last ? '#CCFF00' : '#ffffff'} opacity={i === last ? 1 : 0.85} />
          ))}
          {/* pulse when a new point is stored */}
          {justRecorded && (
            <circle cx={cur[0]} cy={cur[1]} r={5 + (progress - POINT_AT[last]) * 260} fill="none" stroke="#CCFF00" strokeWidth="1.5"
              opacity={Math.max(0, 0.7 - (progress - POINT_AT[last]) * 20)} />
          )}
          {/* connector from the callout to the newest point */}
          <line x1={calloutX} y1={calloutBottom} x2={cur[0]} y2={cur[1] - 6} stroke="#CCFF00" strokeWidth="1" opacity="0.45" />
          {/* the rider */}
          <circle cx={rider[0]} cy={rider[1]} r="9" fill="#CCFF00" opacity="0.18" />
          <circle cx={rider[0]} cy={rider[1]} r="5.5" fill="#CCFF00" stroke="#0b0d10" strokeWidth="1.5" />
        </g>
      </svg>
      {/* callout: what the newest point stores */}
      <div
        className="absolute -translate-x-1/2 top-[6%] rounded-lg bg-black/85 border border-[#CCFF00]/40 px-3 py-1.5 font-mono tabular-nums text-[10px] sm:text-[11px] leading-snug text-white/85 whitespace-nowrap shadow-lg"
        style={{ left: `${(calloutX / 320) * 100}%`, opacity: fade }}
      >
        <div><span className="text-white/40">lat</span> {data.lat} <span className="text-white/40 ml-1">lon</span> {data.lon}</div>
        <div><span className="text-white/40">ele</span> {data.ele} m <span className="text-white/40 ml-1">time</span> <span className="text-[#CCFF00]">{data.time}</span></div>
      </div>
      <div className="absolute left-3 bottom-2 text-[10px] text-white/40">{t('Start')}</div>
      <div className="absolute right-3 top-2 text-[10px] text-white/40">{t('Ziel')}</div>
    </div>
  );
}
