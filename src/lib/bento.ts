// Bento-Ansicht (nur Desktop): statt frei verschiebbarer Fenster liegen Karte, Video, Tempo,
// Höhenprofil und Community fest in einem Raster mit gleichen Abständen. Standard ist „Frei“
// (wie bisher). Die Wahl wird im Browser gemerkt.
//
// Zwei Arten von Vorlagen:
// - Raster: wie CSS grid-template-areas, ein Buchstabe je Zelle. Fehlt ein Fenster (z. B. Tempo bei
//   Fahrten ohne Zeitstempel, oder keine Fahrt offen), übernimmt ein Nachbar dessen Fläche.
// - Spalte (`scroll`): links ein großes Fenster, rechts eine Spalte, in der die übrigen Fenster in
//   ihrer natürlichen Höhe untereinander stehen – mit dem Mausrad scrollbar.
import { useCallback, useEffect, useSyncExternalStore, type CSSProperties } from 'react';
import { HEADER_HEIGHT } from '@/components/AppHeader';
import { k } from '@/lib/i18nKey';

export type Tile = 'M' | 'V' | 'S' | 'E' | 'C'; // Map, Video, Speed (Tempo), Elevation, Community
export interface Rect { x: number; y: number; w: number; h: number }
/** Platz eines Fensters. `clipTop/clipBottom`: in der Scroll-Spalte abgeschnittener Teil oben/unten;
 *  `auto`: Höhe ergibt sich aus dem Inhalt (dann `measure` als ref ans Fenster hängen) */
export interface Box extends Rect { clipTop: number; clipBottom: number; auto: boolean; measure: (el: HTMLElement | null) => void }
/** areas/cols/rows dienen bei Spalten-Vorlagen nur dem Vorschaubild */
export interface Preset { id: string; name: string; areas: string[]; cols: number[]; rows: number[]; scroll?: { main: Tile; column: Tile[]; mainFrac: number } }

const column = (id: string, name: string, main: Tile, mainFrac: number, col: Tile[]): Preset => ({
  id, name, areas: col.map(c => `${main} ${c}`), cols: [mainFrac, 1 - mainFrac], rows: col.map(c => (c === 'V' || c === 'M' ? 1.4 : 1)),
  scroll: { main, column: col, mainFrac },
});

export const PRESETS: Preset[] = [
  column('map-left',   k('Karte groß'),  'M', 0.7, ['V', 'S', 'E', 'C']),
  column('video-left', k('Video groß'),  'V', 0.66, ['M', 'S', 'E', 'C']),
  column('split',      k('Halb & halb'), 'M', 0.5, ['V', 'S', 'E', 'C']),
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
const heights = new Map<Tile, number>(); // gemessene Höhe der Fenster in der Scroll-Spalte
let offset = 0; // wie weit die Spalte gescrollt ist
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
  offset = 0;
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

interface ColumnLayout { x: number; y: number; w: number; h: number; total: number; boxes: Partial<Record<Tile, Box>> }

const measures = new Map<Tile, (el: HTMLElement | null) => void>();
const observed = new Map<Tile, { el: HTMLElement; ro: ResizeObserver }>();
function measureFor(tile: Tile) {
  let fn = measures.get(tile);
  if (!fn) {
    fn = (el: HTMLElement | null) => {
      const prev = observed.get(tile);
      if (prev && prev.el === el) return;
      prev?.ro.disconnect(); observed.delete(tile);
      if (!el || typeof ResizeObserver === 'undefined') return;
      const ro = new ResizeObserver(() => {
        const h = el.offsetHeight;
        if (h && heights.get(tile) !== h) { heights.set(tile, h); emit(); }
      });
      ro.observe(el);
      observed.set(tile, { el, ro });
    };
    measures.set(tile, fn);
  }
  return fn;
}

/** Spalten-Vorlage: großes Fenster links, rechts scrollbare Spalte */
function columnLayout(preset: Preset, has: (t: string) => boolean, vw: number, vh: number): ColumnLayout | null {
  const sc = preset.scroll!;
  const TOP = top();
  const W = vw - LEFT - EDGE, H = vh - TOP - EDGE;
  const order = [sc.main, ...sc.column].filter(t => has(t));
  if (!order.length) return null;
  const [main, ...col] = order; // fehlt das große Fenster, rückt das erste aus der Spalte nach
  const boxes: Partial<Record<Tile, Box>> = {};
  const fixed = (r: Rect): Box => ({ ...r, clipTop: 0, clipBottom: 0, auto: false, measure: measureFor(main) });
  if (!col.length) { boxes[main] = fixed({ x: LEFT, y: TOP, w: W, h: H }); return { x: LEFT + W, y: TOP, w: 0, h: H, total: 0, boxes }; }
  const mainW = Math.round((W - BENTO_GAP) * sc.mainFrac);
  boxes[main] = fixed({ x: LEFT, y: TOP, w: mainW, h: H });
  const x = LEFT + mainW + BENTO_GAP, w = W - mainW - BENTO_GAP;
  const sizes = col.map(t => t === 'V' ? Math.round(w * 9 / 16) + 82 /* Kopf- und Kanalzeile */ : t === 'M' ? Math.round(w * 0.75) : heights.get(t) ?? 200);
  const total = sizes.reduce((a, b) => a + b, 0) + BENTO_GAP * (col.length - 1);
  offset = Math.max(0, Math.min(offset, total - H));
  let y = TOP - offset;
  col.forEach((t, i) => {
    const h = sizes[i];
    boxes[t] = { x, y, w, h, clipTop: Math.max(0, TOP - y), clipBottom: Math.max(0, y + h - (TOP + H)), auto: t !== 'V' && t !== 'M', measure: measureFor(t) };
    y += h + BENTO_GAP;
  });
  return { x, y: TOP, w, h: H, total, boxes };
}

function currentPreset() { return bentoActive() ? PRESETS.find(p => p.id === presetId) ?? null : null; }
const hasNow = (extra?: Tile) => (t: string) => t === extra || present.has(t as Tile);

/** Die scrollbare Spalte der aktuellen Vorlage (für Mausrad und Scrollbalken) – oder null */
export function bentoColumn(): ColumnLayout | null {
  const p = currentPreset();
  if (!p?.scroll || typeof window === 'undefined') return null;
  const c = columnLayout(p, hasNow(), window.innerWidth, window.innerHeight);
  return c && c.w > 0 && c.total > c.h ? c : null;
}
export function scrollBentoColumn(to: number) {
  const c = bentoColumn(); if (!c) return;
  const next = Math.max(0, Math.min(to, c.total - c.h));
  if (next !== offset) { offset = next; emit(); }
}
export function bentoOffset() { return offset; }

// Mausrad über der Spalte scrollt die Spalte (auch über Karte oder Fenstern darin)
if (typeof window !== 'undefined') {
  window.addEventListener('wheel', e => {
    const c = bentoColumn(); if (!c) return;
    if (e.clientX < c.x || e.clientX > c.x + c.w || e.clientY < c.y || e.clientY > c.y + c.h) return;
    e.preventDefault(); e.stopPropagation();
    scrollBentoColumn(offset + (e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY));
  }, { capture: true, passive: false });
}

/**
 * Fenster meldet sich an (solange `active`) und bekommt seinen festen Platz – oder null, wenn die
 * Ansicht frei ist (dann wie bisher verschiebbar).
 */
export function useBentoRect(tile: Tile, active: boolean): Box | null {
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
  const measure = useCallback((el: HTMLElement | null) => measureFor(tile)(el), [tile]);
  const preset = active ? currentPreset() : null;
  if (!preset) return null;
  if (preset.scroll) {
    const b = columnLayout(preset, hasNow(tile), window.innerWidth, window.innerHeight)?.boxes[tile];
    return b ? { ...b, measure } : null;
  }
  const r = bentoRects(preset, hasNow(tile), window.innerWidth, window.innerHeight)[tile];
  return r ? { ...r, clipTop: 0, clipBottom: 0, auto: false, measure } : null;
}

/** Stil für den festen Platz: Position, Größe (oder Inhaltshöhe), in der Spalte oben/unten abgeschnitten */
export function bentoStyle(b: Box, z = 50): CSSProperties {
  return {
    position: 'absolute', left: b.x, top: b.y, width: b.w, height: b.auto ? undefined : b.h, zIndex: z,
    ...(b.clipTop || b.clipBottom ? { clipPath: `inset(${b.clipTop}px 0 ${b.clipBottom}px 0)` } : {}),
  };
}

/** Ist gerade eine feste Vorlage aktiv? (für den Fenster-Stapel: dann nichts verschieben) */
export function useBentoActive() {
  useSyncExternalStore(subscribe, () => version, () => 0);
  return bentoActive();
}
export function onBentoChange(l: () => void) { return subscribe(l); }
