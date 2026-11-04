'use client';

// Erklärfenster „Was sind GPX- und KML-Dateien?“ – öffnet sich über dem Fenster „Fahrt anlegen“,
// ohne es zu schließen. Esc und Klick daneben schließen nur dieses Fenster.

import React, { useEffect, useRef } from 'react';
import { X, Smartphone, Navigation, Camera, MapPinned, Clock } from 'lucide-react';
import { t, rich, useT } from '@/lib/i18n';

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
                sample={'<trkpt lat="34.7768" lon="32.4245">\n  <ele>112</ele>\n  <time>2026-10-12T09:41:07Z</time>\n</trkpt>'}
              />
              <FormatCard
                name="KML"
                text={t('Das Format von Google Earth und Google My Maps. Oft eine vorab geplante Route ohne Uhrzeiten – RouteCam verteilt die Position dann gleichmäßig über die Strecke.')}
                sample={'<coordinates>\n  32.4245,34.7768,112\n  32.4251,34.7772,115\n</coordinates>'}
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

          {/* 4. why time matters */}
          <section className="rounded-xl border border-[#CCFF00]/25 bg-[#CCFF00]/[0.06] p-4 flex gap-3">
            <span className="w-9 h-9 shrink-0 rounded-lg bg-[#CCFF00]/15 text-[#CCFF00] flex items-center justify-center"><Clock size={18} /></span>
            <div className="text-sm leading-relaxed text-white/75 flex flex-col gap-1.5">
              <p className="font-medium text-white">{t('Am besten: Aufzeichnung mit Uhrzeit')}</p>
              <p>{rich('Mit Uhrzeiten weiß RouteCam für jede Sekunde im Video, wo du warst. Starte die Aufzeichnung <0>vor</0> der Kamera und lass sie bis nach dem Videoende laufen – den Rest richtest du im Sync-Editor aus.', [s => <b className="text-white">{s}</b>])}</p>
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

function FormatCard({ name, tag, text, sample }: { name: string; tag?: string; text: string; sample: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-3 min-w-0">
      <div className="flex items-center gap-3">
        <FileBadge ext={name.toLowerCase()} highlight={!!tag} />
        {tag && <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#CCFF00] text-black">{tag}</span>}
      </div>
      <p className="text-sm leading-relaxed text-white/70">{text}</p>
      <pre dir="ltr" className="mt-auto overflow-x-auto rounded-lg bg-black/50 border border-white/5 px-3 py-2.5 text-[11px] leading-relaxed font-mono text-white/55"><code>{sample}</code></pre>
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

// A track drawn as dots on a road, one point opened up to show what it stores.
function TrackIllustration() {
  // points along a winding road (viewBox 320×190)
  const pts: [number, number][] = [
    [18, 160], [40, 152], [62, 140], [82, 124], [98, 106], [112, 88], [130, 74], [152, 68], [176, 72],
    [198, 84], [216, 98], [236, 106], [258, 102], [278, 88], [292, 70], [302, 48], [308, 26],
  ];
  const road = `M ${pts.map(p => p.join(',')).join(' L ')}`;
  const hi = pts[8];
  return (
    <div dir="ltr" className="relative w-full max-w-full aspect-[320/190] rounded-xl bg-[#0b0d10] border border-white/5 overflow-hidden">
      <svg viewBox="0 0 320 190" className="absolute inset-0 w-full h-full" aria-hidden="true">
        <defs>
          <pattern id="geo-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="320" height="190" fill="url(#geo-grid)" />
        <path d={road} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
        <path d={road} fill="none" stroke="#CCFF00" strokeWidth="1.5" strokeDasharray="2 5" strokeLinecap="round" opacity="0.6" />
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i === 8 ? 5.5 : 3} fill={i === 8 ? '#CCFF00' : '#ffffff'} opacity={i === 8 ? 1 : 0.85} />
        ))}
        <circle cx={hi[0]} cy={hi[1]} r="11" fill="none" stroke="#CCFF00" strokeWidth="1.5" opacity="0.5" />
        <line x1={hi[0]} y1={hi[1] - 12} x2={hi[0]} y2={44} stroke="#CCFF00" strokeWidth="1" opacity="0.6" />
      </svg>
      {/* callout: what one point stores */}
      <div className="absolute left-1/2 -translate-x-1/2 top-[6%] rounded-lg bg-black/85 border border-[#CCFF00]/40 px-3 py-1.5 font-mono text-[10px] sm:text-[11px] leading-snug text-white/85 whitespace-nowrap shadow-lg">
        <div><span className="text-white/40">lat</span> 34.7768 <span className="text-white/40 ml-1">lon</span> 32.4245</div>
        <div><span className="text-white/40">ele</span> 112 m <span className="text-white/40 ml-1">time</span> <span className="text-[#CCFF00]">09:41:07</span></div>
      </div>
      <div className="absolute left-3 bottom-2 text-[10px] text-white/40">{t('Start')}</div>
      <div className="absolute right-3 top-2 text-[10px] text-white/40">{t('Ziel')}</div>
    </div>
  );
}
