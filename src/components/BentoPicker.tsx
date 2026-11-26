'use client';
// Auswahl der Bento-Ansicht: „Frei“ (Fenster verschiebbar, Standard) oder eine von sechs festen
// Anordnungen. Die Vorschaubilder werden aus derselben Beschreibung gezeichnet wie das Raster selbst.
import { useEffect, useRef, useState } from 'react';
import { Gauge, LayoutGrid, Map as MapIcon, Mountain, Move, Play, Users } from 'lucide-react';
import { PRESETS, setBentoPreset, useBentoPreset, useBentoRideOpen, bentoColumn, bentoOffset, onBentoChange, scrollBentoColumn, type Preset, type Tile } from '@/lib/bento';
import { t } from '@/lib/i18n';

const ICON: Record<Tile, typeof Play> = { M: MapIcon, V: Play, S: Gauge, E: Mountain, C: Users };

function Thumb({ preset, active }: { preset: Preset; active: boolean }) {
  const rows = preset.areas.map(r => r.trim().split(/\s+/));
  const tiles = [...new Set(rows.flat())] as Tile[];
  return (
    <div
      className="grid w-full aspect-[16/10] gap-[3px]"
      style={{
        gridTemplateAreas: rows.map(r => `"${r.join(' ')}"`).join(' '),
        gridTemplateColumns: preset.cols.map(c => `${c}fr`).join(' '),
        gridTemplateRows: preset.rows.map(r => `${r}fr`).join(' '),
      }}
    >
      {tiles.map(tl => {
        const I = ICON[tl];
        return (
          <div key={tl} style={{ gridArea: tl }}
            className={`rounded-[3px] flex items-center justify-center ${tl === 'M'
              ? active ? 'bg-[#CCFF00]/35 text-[#CCFF00]' : 'bg-[#CCFF00]/15 text-[#CCFF00]/70'
              : active ? 'bg-white/25 text-white' : 'bg-white/10 text-white/50'}`}>
            <I size={9} strokeWidth={2.5} />
          </div>
        );
      })}
    </div>
  );
}

export default function BentoPicker({ onPicked }: { onPicked?: () => void }) {
  const current = useBentoPreset();
  const rideOpen = useBentoRideOpen();
  const pick = (id: string | null) => { setBentoPreset(id); onPicked?.(); };
  return (
    <div className="p-3">
      <div className="px-1 pb-2 text-[11px] font-bold tracking-[0.05em] uppercase text-white">{t('Ansicht')}</div>
      {!rideOpen && (
        <p className="mx-1 mb-2.5 rounded-lg border border-[#CCFF00]/25 bg-[#CCFF00]/[0.06] px-2.5 py-2 text-[11px] leading-snug text-white/75">
          {t('Die Anordnung gilt, sobald eine Fahrt offen ist. Ohne Fahrt bleibt die Karte im Vollbild.')}
        </p>
      )}
      <button type="button" onClick={() => pick(null)} data-no-tip
        className={`w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors border ${current === null ? 'border-[#CCFF00]/60 bg-[#CCFF00]/10' : 'border-transparent hover:bg-white/5'}`}>
        <Move size={16} className={current === null ? 'text-[#CCFF00]' : 'text-white/60'} />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-white">{t('Frei')}</span>
          <span className="block text-[11px] text-white/45">{t('Fenster frei verschieben')}</span>
        </span>
      </button>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {PRESETS.map(p => {
          const active = current === p.id;
          return (
            <button key={p.id} type="button" onClick={() => pick(p.id)} aria-pressed={active} data-no-tip
              className={`rounded-xl p-1.5 border transition-colors ${active ? 'border-[#CCFF00]/60 bg-[#CCFF00]/10' : 'border-white/10 hover:border-white/25 hover:bg-white/5'}`}>
              <Thumb preset={p} active={active} />
              <span className={`mt-1.5 block text-[10px] font-medium leading-tight truncate ${active ? 'text-[#CCFF00]' : 'text-white/60'}`}>{t(p.name)}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2.5 px-1 text-[10px] leading-snug text-white/40">{t('In einer festen Anordnung lassen sich die Fenster nicht verschieben.')}</p>
    </div>
  );
}

/** Knopf in der Kopfzeile (links neben „GPS Tracker App“) mit der Auswahl als Aufklapp-Fenster – nur ab 1024 px */
export function BentoButton() {
  const current = useBentoPreset();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', down, true); document.removeEventListener('keydown', esc); };
  }, [open]);
  const name = t(PRESETS.find(p => p.id === current)?.name ?? 'Frei');
  return (
    <div ref={box} className="relative hidden lg:block">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={t('Ansicht')}
        title={t('Ansicht: {name}', { name })}
        className={`w-9 h-9 rounded-full flex items-center justify-center border transition-colors ${open || current
          ? 'bg-[#CCFF00]/15 text-[#CCFF00] border-[#CCFF00]/45'
          : 'text-white border-white/15 hover:bg-white/10'}`}>
        <LayoutGrid size={17} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 z-[80] bg-[#141414] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
          <BentoPicker />
        </div>
      )}
    </div>
  );
}

/** Scrollbalken für die Spalte in den Spalten-Vorlagen (rechts im Randabstand, ziehbar) */
export function BentoScrollbar() {
  useBentoPreset();
  const [, force] = useState(0);
  useEffect(() => onBentoChange(() => force(n => n + 1)), []);
  const c = bentoColumn();
  if (!c) return null;
  const thumbH = Math.max(40, Math.round(c.h * c.h / c.total));
  const maxOff = c.total - c.h;
  const thumbY = Math.round((c.h - thumbH) * (bentoOffset() / maxOff));
  const drag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startY = e.clientY, start = bentoOffset();
    const move = (ev: PointerEvent) => scrollBentoColumn(start + (ev.clientY - startY) * (maxOff / (c.h - thumbH)));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className="fixed z-[55] w-1.5 rounded-full bg-white/[0.06]" style={{ left: c.x + c.w + 5, top: c.y, height: c.h }} data-no-tip>
      <div onPointerDown={drag} className="absolute left-0 w-1.5 rounded-full bg-white/30 hover:bg-white/50 cursor-grab active:cursor-grabbing"
        style={{ top: thumbY, height: thumbH }} />
    </div>
  );
}
