'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Layers, ArrowLeftRight, ChevronDown } from 'lucide-react';
import type { RouteOverlap } from '@/lib/routeOverlap';

const thumb = (videoId: string) => `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;

// Appears at the top of the map while the vehicle is on a stretch that other rides share.
// One click switches to the other ride – at the same point on the road, not the same second.
export default function PerspectiveSwitcher({ overlaps, onSwitch }: {
  overlaps: RouteOverlap[];
  onSwitch: (o: RouteOverlap) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (!overlaps.length) return null;
  const first = overlaps[0];
  const many = overlaps.length > 1;

  return (
    <div ref={ref} className="absolute top-[68px] left-1/2 -translate-x-1/2 z-[55] pointer-events-auto">
      <div className="flex items-center gap-2 rounded-full bg-black/80 backdrop-blur-md border border-white/15 shadow-2xl pl-3 pr-1.5 py-1.5">
        <Layers size={16} className="text-[#CCFF00] shrink-0" />
        <span className="text-sm text-white/80 whitespace-nowrap">
          {many ? <>Diese Stelle gibt es in <b className="text-white">{overlaps.length} weiteren Fahrten</b></> : <>Auch gefahren: <b className="text-white">{first.route.name}</b></>}
        </span>
        {many ? (
          <button onClick={() => setOpen(o => !o)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white/10 hover:bg-white/20 text-sm font-medium text-white">
            Auswählen <ChevronDown size={14} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
        ) : (
          <button onClick={() => onSwitch(first)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[#CCFF00] text-black text-sm font-semibold hover:brightness-110">
            <ArrowLeftRight size={14} /> Perspektive wechseln
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-80 rounded-xl border border-white/10 bg-[#212121] shadow-2xl p-1.5">
          {overlaps.map(o => {
            const dir = o.sections[0].direction;
            return (
              <button key={o.route.id} onClick={() => { setOpen(false); onSwitch(o); }} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/10 text-left">
                <img src={thumb(o.route.videoId)} alt="" className="w-20 aspect-video object-cover rounded-md bg-white/5 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-white truncate">{o.route.name}</span>
                  <span className="block text-xs text-white/50">
                    {o.sharedKm.toFixed(1).replace('.', ',')} km gemeinsam · {dir === 'same' ? 'gleiche Richtung' : 'Gegenrichtung'}
                  </span>
                </span>
                <ArrowLeftRight size={16} className="text-[#CCFF00] shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
