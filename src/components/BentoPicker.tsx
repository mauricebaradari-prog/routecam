'use client';
// Auswahl der Bento-Ansicht: „Frei“ (Fenster verschiebbar, Standard) oder eine von sechs festen
// Anordnungen. Die Vorschaubilder werden aus derselben Beschreibung gezeichnet wie das Raster selbst.
import { Gauge, Map as MapIcon, Mountain, Move, Play, Users } from 'lucide-react';
import { PRESETS, setBentoPreset, useBentoPreset, type Preset, type Tile } from '@/lib/bento';
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
  const pick = (id: string | null) => { setBentoPreset(id); onPicked?.(); };
  return (
    <div className="p-3">
      <div className="px-1 pb-2 text-[11px] font-bold tracking-[0.05em] uppercase text-white">{t('Ansicht')}</div>
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
