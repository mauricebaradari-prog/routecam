// Bento-Ansicht (nur Desktop): statt frei verschiebbarer Fenster liegen Karte, Video, Tempo,
// Höhenprofil und Community fest in einem Raster mit gleichen Abständen. Standard ist „Frei“
// (wie bisher). Die Wahl wird im Browser gemerkt.
//
// Jede Vorlage beschreibt das Raster wie CSS grid-template-areas: ein Buchstabe je Zelle.
// Fehlt ein Fenster (z. B. Tempo bei Fahrten ohne Zeitstempel, oder keine Fahrt offen), übernimmt
// ein Nachbar dessen Fläche – das Raster bleibt geschlossen.
import { useEffect, useSyncExternalStore } from 'react';
import { HEADER_HEIGHT } from '@/components/AppHeader';
import { k } from '@/lib/i18nKey';

export type Tile = 'M' | 'V' | 'S' | 'E' | 'C'; // Map, Video, Speed (Tempo), Elevation, Community
export interface Rect { x: number; y: number; w: number; h: number }
export interface Preset { id: string; name: string; areas: string[]; cols: number[]; rows: number[] }

export const PRESETS: Preset[] = [
  { id: 'map-left',   name: k('Karte groß'),     areas: ['M V', 'M S', 'M E', 'M C'],           cols: [2.4, 1], rows: [1.25, 0.95, 0.75, 1.15] },
  { id: 'video-left', name: k('Video groß'),     areas: ['V V M', 'V V M', 'S E C'],             cols: [1, 1, 1], rows: [1, 1, 0.75] },
  { id: 'split',      name: k('Halb & halb'),    areas: ['M M V V', 'M M V V', 'S E C C'],       cols: [1, 1, 1, 1], rows: [1, 1, 0.75] },
  { id: 'map-top',    name: k('Karte oben'),     areas: ['M M M', 'V S C', 'V E C'],             cols: [1.3, 1, 1], rows: [1.5, 0.62, 0.62] },
  { id: 'cinema',     name: k('Kino'),           areas: ['V V C', 'V V C', 'M S C', 'M E C'],    cols: [1, 1, 0.85], rows: [1, 1, 0.55, 0.55] },
  { id: 'side',       name: k('Seitenleiste'),   areas: ['S M M', 'E M M', 'C V V', 'C V V'],     cols: [0.85, 1, 1], rows: [0.6, 0.6, 1, 1] },
];

const LEFT = 96;   // rechts neben der Knopfspalte links
// erst beim Rechnen lesen: AppHeader importiert (über den Ansicht-Knopf) wiederum diese Datei
const top = () => HEADER_HEIGHT + 16;
const EDGE = 16;   // Abstand rechts/unten
export const BENTO_GAP = 12;
export const BENTO_MIN_WIDTH = 1024; // darunter (Tablet/Handy) immer frei

const KEY = 'routecam.bento';
let presetId: string | null = null;
try { presetId = typeof window !== 'undefined' ? localStorage.getItem(KEY) : null; } catch { /* privat */ }
if (presetId && !PRESETS.some(p => p.id === presetId)) presetId = null;
const present = new Map<Tile, number>(); // wie viele Fenster dieser Art gerade angezeigt werden
let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; listeners.forEach(l => l()); };

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
if (typeof window !== 'undefined') window.addEventListener('resize', emit);

export function getBentoPreset() { return presetId; }
export function setBentoPreset(id: string | null) {
  presetId = id;
  try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY); } catch { /* egal */ }
  emit();
}

/** Bento wird nur auf großen Bildschirmen mit Maus angewendet */
export function bentoActive() {
  return !!presetId && typeof window !== 'undefined' && window.innerWidth >= BENTO_MIN_WIDTH;
}

/** Fehlende Fenster an einen Nachbarn abgeben (nur so, dass jede Fläche ein Rechteck bleibt) */
export function resolveAreas(areas: string[], has: (t: string) => boolean): string[][] {
  const g = areas.map(r => r.trim().split(/\s+/));
  const bbox = (L: string) => {
    let r0 = Infinity, r1 = -1, c0 = Infinity, c1 = -1;
    g.forEach((row, r) => row.forEach((v, c) => { if (v === L) { r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, c); c1 = Math.max(c1, c); } }));
    return r1 < 0 ? null : { r0, r1, c0, c1 };
  };
  for (let guard = 0; guard < 20; guard++) {
    const missing = [...new Set(g.flat())].filter(L => L !== '.' && !has(L));
    if (!missing.length) break;
    // Nachbar Y, der die Fläche von X übernehmen kann (gleich hoch links/rechts, gleich breit oben/unten)
    const neighbour = (X: string, want: (Y: string) => boolean): string | null => {
      const b = bbox(X); if (!b) return null;
      const sides: [number, number][][] = [
        Array.from({ length: b.r1 - b.r0 + 1 }, (_, i) => [b.r0 + i, b.c0 - 1]), // links
        Array.from({ length: b.c1 - b.c0 + 1 }, (_, i) => [b.r0 - 1, b.c0 + i]), // oben
        Array.from({ length: b.r1 - b.r0 + 1 }, (_, i) => [b.r0 + i, b.c1 + 1]), // rechts
        Array.from({ length: b.c1 - b.c0 + 1 }, (_, i) => [b.r1 + 1, b.c0 + i]), // unten
      ];
      for (const [d, cells] of sides.entries()) {
        const vals = cells.map(([r, c]) => g[r]?.[c]);
        const Y = vals[0];
        if (!Y || Y === X || Y === '.' || !want(Y) || vals.some(v => v !== Y)) continue;
        const yb = bbox(Y)!;
        if (d % 2 === 0 ? yb.r0 === b.r0 && yb.r1 === b.r1 : yb.c0 === b.c0 && yb.c1 === b.c1) return Y;
      }
      return null;
    };
    const merge = (X: string, Y: string) => g.forEach((row, r) => row.forEach((v, c) => { if (v === X) g[r][c] = Y; }));
    let changed = false;
    // erst an ein angezeigtes Fenster abgeben …
    for (const X of missing) { const Y = neighbour(X, has); if (Y) { merge(X, Y); changed = true; } }
    // … sonst zwei fehlende zusammenlegen (die größere Fläche passt dann oft an einen Nachbarn)
    if (!changed) for (const X of missing) { const Y = neighbour(X, y => !has(y)); if (Y) { merge(X, Y); changed = true; break; } }
    if (!changed) {
      // kein passender Nachbar: Fläche bleibt leer
      g.forEach((row, r) => row.forEach((v, c) => { if (missing.includes(v)) g[r][c] = '.'; }));
    }
  }
  return g;
}

export function bentoRects(preset: Preset, has: (t: string) => boolean, vw: number, vh: number): Partial<Record<Tile, Rect>> {
  const g = resolveAreas(preset.areas, has);
  const TOP = top();
  const W = vw - LEFT - EDGE, H = vh - TOP - EDGE;
  const edges = (fr: number[], total: number) => {
    const free = total - BENTO_GAP * (fr.length - 1);
    const sum = fr.reduce((a, b) => a + b, 0);
    const out: number[] = []; let p = 0;
    fr.forEach(f => { out.push(p); p += (f / sum) * free + BENTO_GAP; });
    return { start: out, size: fr.map(f => (f / sum) * free) };
  };
  const cx = edges(preset.cols, W), cy = edges(preset.rows, H);
  const rects: Partial<Record<Tile, Rect>> = {};
  for (const L of new Set(g.flat())) {
    if (L === '.') continue;
    let r0 = Infinity, r1 = -1, c0 = Infinity, c1 = -1;
    g.forEach((row, r) => row.forEach((v, c) => { if (v === L) { r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, c); c1 = Math.max(c1, c); } }));
    const x = cx.start[c0], y = cy.start[r0];
    rects[L as Tile] = {
      x: Math.round(LEFT + x), y: Math.round(TOP + y),
      w: Math.round(cx.start[c1] + cx.size[c1] - x), h: Math.round(cy.start[r1] + cy.size[r1] - y),
    };
  }
  return rects;
}

/** Gewählte Vorlage (oder null = frei) – für den Auswahl-Knopf */
export function useBentoPreset() {
  return useSyncExternalStore(subscribe, () => presetId, () => null);
}

/**
 * Fenster meldet sich an (solange `active`) und bekommt seine feste Fläche – oder null, wenn die
 * Ansicht frei ist (dann wie bisher verschiebbar).
 */
export function useBentoRect(tile: Tile, active: boolean): Rect | null {
  useEffect(() => {
    if (!active) return;
    present.set(tile, (present.get(tile) ?? 0) + 1);
    emit();
    return () => {
      const n = (present.get(tile) ?? 1) - 1;
      if (n > 0) present.set(tile, n); else present.delete(tile);
      emit();
    };
  }, [tile, active]);
  useSyncExternalStore(subscribe, () => version, () => 0);
  if (!active || !bentoActive()) return null;
  const preset = PRESETS.find(p => p.id === presetId)!;
  const has = (t: string) => t === tile || present.has(t as Tile);
  return bentoRects(preset, has, window.innerWidth, window.innerHeight)[tile] ?? null;
}

/** Ist gerade eine feste Vorlage aktiv? (für den Fenster-Stapel: dann nichts verschieben) */
export function useBentoActive() {
  useSyncExternalStore(subscribe, () => version, () => 0);
  return bentoActive();
}
export function onBentoChange(l: () => void) { return subscribe(l); }
