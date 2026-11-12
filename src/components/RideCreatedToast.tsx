'use client';

// Toast nach dem Anlegen einer Fahrt: YouTube-Vorschaubild mit Haken, Titel, „Jetzt ansehen“ und –
// falls die Fahrt noch nicht ausgerichtet ist – „Video ausrichten“. Desktop unten rechts, Handy über der
// Navigation. Verschwindet nach 6 s (der Balken unten läuft ab), pausiert, solange die Maus darauf ist.

import React, { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { t, useT } from '@/lib/i18n';
import { onRideCreated, type RideCreated } from '@/lib/rideCreated';

const SHOW_MS = 6000;

export default function RideCreatedToast() {
  useT();
  const router = useRouter();
  const pathname = usePathname();
  const [ride, setRide] = useState<RideCreated | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const left = useRef(SHOW_MS);
  const [progress, setProgress] = useState(1);

  useEffect(() => onRideCreated(r => { left.current = SHOW_MS; setProgress(1); setLeaving(false); setRide(r); }), []);

  // Ablauf (pausiert beim Drüberfahren)
  useEffect(() => {
    if (!ride || paused || leaving) return;
    let last = performance.now(), raf = 0;
    const tick = (now: number) => {
      left.current -= now - last; last = now;
      setProgress(Math.max(0, left.current / SHOW_MS));
      if (left.current <= 0) { close(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
     
  }, [ride, paused, leaving]);

  function close() {
    setLeaving(true);
    window.setTimeout(() => { setRide(null); setLeaving(false); }, 250);
  }

  if (!ride) return null;

  function open() {
    if (!ride) return;
    // Auf der Karte: dort öffnen; sonst die Karte mit ?route laden
    const handled = !window.dispatchEvent(new CustomEvent('routecam:open-ride', { detail: { routeId: ride.routeId }, cancelable: true }));
    if (!handled) router.push(`/?route=${ride.routeId}`);
    close();
  }

  return (
    <div
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={`fixed z-[120] left-3 right-3 bottom-[calc(84px+env(safe-area-inset-bottom))] sm:left-auto sm:right-6 sm:bottom-6 sm:w-[400px] overflow-hidden rounded-2xl border border-white/10 bg-[#16181c] text-white shadow-[0_18px_50px_rgba(0,0,0,0.55)] transition-all duration-300 ${leaving ? 'opacity-0 translate-y-3' : 'opacity-100 translate-y-0 rc-toast-in'}`}
    >
      <div className="flex items-center gap-3.5 p-3 pb-3.5">
        <div className="relative w-28 h-[63px] shrink-0 overflow-hidden rounded-[10px] border border-white/10 bg-black">
          {ride.videoId && <img src={`https://img.youtube.com/vi/${ride.videoId}/mqdefault.jpg`} alt="" className="w-full h-full object-cover" />}
          <span className="absolute right-1 bottom-1 w-[22px] h-[22px] rounded-full bg-[#CCFF00] text-[#0b0d10] border-2 border-[#16181c] flex items-center justify-center">
            <Check size={13} strokeWidth={3.2} />
          </span>
        </div>
        <div className="min-w-0 flex-1 pr-5">
          <div className="text-sm font-bold leading-tight">{t('Fahrt angelegt')}</div>
          <div className="mt-0.5 text-[12.5px] leading-snug text-white/60 line-clamp-2">
            {t('„{name}“ ist mit deinem Video verbunden.', { name: ride.name })}
          </div>
          <div className="mt-2 flex gap-3.5 text-[12.5px] font-semibold">
            {pathname !== '/' && <button type="button" onClick={open} className="text-[#CCFF00] hover:underline">{t('Jetzt ansehen')}</button>}
            {ride.needsSync && pathname !== '/sync' && (
              <button type="button" onClick={() => { router.push(`/sync?route=${ride.routeId}`); close(); }} className="text-white/55 hover:text-white">{t('Video ausrichten')}</button>
            )}
          </div>
        </div>
      </div>
      <button type="button" onClick={close} aria-label={t('Schließen')} className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10">
        <X size={15} />
      </button>
      <div className="absolute left-0 bottom-0 h-[3px] bg-[#CCFF00]" style={{ width: `${progress * 100}%` }} />
    </div>
  );
}
