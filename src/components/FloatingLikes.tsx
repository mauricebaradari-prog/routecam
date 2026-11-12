'use client';

// Wie Reaktionen im Live-Stream: Kommt die Fahrt an der Stelle vorbei, an der jemand geliked hat,
// steigt unten in der Mitte ein Peace-Symbol auf und schwingt nach oben weg.

import React, { useEffect, useRef, useState } from 'react';
import PeaceHand from '@/components/icons/PeaceHand';
import { phoneLayout, sheetPx } from '@/lib/mobileSheet';

export interface LikeMark { userId: string; seconds: number; name: string }
type Flyer = { key: number; name: string; dx: number; delay: number };

export default function FloatingLikes({ likes, videoSeconds, playing }: { likes: LikeMark[]; videoSeconds: number; playing: boolean }) {
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const prev = useRef(videoSeconds);
  const keyRef = useRef(0);

  useEffect(() => {
    const before = prev.current;
    prev.current = videoSeconds;
    // nur beim normalen Abspielen vorwärts – nicht bei Sprüngen (Klick auf Route, Spulen)
    if (!playing || videoSeconds <= before || videoSeconds - before > 2) return;
    const hit = likes.filter(l => l.seconds > before && l.seconds <= videoSeconds);
    if (!hit.length) return;
    const fresh = hit.map((l, i) => ({ key: ++keyRef.current, name: l.name, dx: Math.round((Math.random() - 0.5) * 120), delay: i * 220 }));
     
    setFlyers(f => [...f, ...fresh]);
    const keys = fresh.map(f => f.key);
    window.setTimeout(() => setFlyers(f => f.filter(x => !keys.includes(x.key))), 3200 + fresh.length * 220);
  }, [videoSeconds, playing, likes]);

  if (!flyers.length) return null;

  // Startpunkt: Mitte der sichtbaren Karte, unten (Handy: über dem Fahrt-Fenster bzw. rechte Hälfte quer)
  const { phone, landscape } = phoneLayout();
  const style: React.CSSProperties = phone
    ? (landscape ? { left: '75vw', bottom: 24 } : { left: '50vw', bottom: sheetPx() + 24 })
    : { left: '50vw', bottom: 96 };

  return (
    <div aria-hidden className="pointer-events-none fixed z-[85]" style={style}>
      {flyers.map(f => (
        <div key={f.key} className="rc-float absolute left-0 bottom-0" style={{ ['--dx' as string]: `${f.dx}px`, animationDelay: `${f.delay}ms` }}>
          <div className="rc-sway flex flex-col items-center" style={{ animationDelay: `${f.delay}ms` }}>
            <span className="w-11 h-11 rounded-full bg-[#CCFF00] text-[#0b0d10] border-2 border-[#0b0d10] flex items-center justify-center">
              <PeaceHand size={24} strokeWidth={2.3} />
            </span>
            {f.name && <span className="mt-1 px-1.5 py-0.5 rounded-md bg-[#0b0d10] text-[11px] font-semibold text-white whitespace-nowrap">{f.name}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
