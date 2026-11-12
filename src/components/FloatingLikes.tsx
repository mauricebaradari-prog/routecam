'use client';

// Wie Reaktionen im Live-Stream: Kommt die Fahrt an der Stelle vorbei, an der jemand geliked hat,
// steigen unten in der Mitte 9 Peace-Symbole in verschiedenen Größen auf und schwingen nach oben weg (ohne Namen).

import React, { useEffect, useRef, useState } from 'react';
import PeaceHand from '@/components/icons/PeaceHand';
import { phoneLayout, sheetPx } from '@/lib/mobileSheet';

export interface LikeMark { userId: string; seconds: number; name: string }
type Flyer = { key: number; size: number; dx: number; delay: number; dur: number; sway: number };
const BURST = 9;

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
    // je Like ein Schwall aus 9 Symbolen: verschiedene Größen, Wege, Tempi
    const fresh: Flyer[] = hit.flatMap((_, h) => Array.from({ length: BURST }, (_, i) => ({
      key: ++keyRef.current,
      size: Math.round(24 + Math.random() * 30),          // 24–54 px
      dx: Math.round((Math.random() - 0.5) * 220),        // seitliches Abdriften
      delay: h * 500 + i * 110 + Math.round(Math.random() * 80),
      dur: Math.round(2400 + Math.random() * 1200),       // 2,4–3,6 s
      sway: Math.round(600 + Math.random() * 600),        // Schwing-Tempo
    })));
     
    setFlyers(f => [...f, ...fresh]);
    const keys = fresh.map(f => f.key);
    window.setTimeout(() => setFlyers(f => f.filter(x => !keys.includes(x.key))), Math.max(...fresh.map(f => f.delay + f.dur)) + 100);
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
        <div key={f.key} className="rc-float absolute left-0 bottom-0" style={{ ['--dx' as string]: `${f.dx}px`, animationDelay: `${f.delay}ms`, animationDuration: `${f.dur}ms` }}>
          <div className="rc-sway" style={{ animationDelay: `${f.delay}ms`, animationDuration: `${f.sway}ms` }}>
            <span className="rounded-full bg-[#CCFF00] text-[#0b0d10] border-2 border-[#0b0d10] flex items-center justify-center" style={{ width: f.size, height: f.size }}>
              <PeaceHand size={Math.round(f.size * 0.56)} strokeWidth={2.3} />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
