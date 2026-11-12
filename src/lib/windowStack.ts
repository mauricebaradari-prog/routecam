// Desktop: die Fenster rechts (Tempo, Höhenprofil, Community) stehen untereinander mit immer
// gleichem Abstand – gemessen an ihrer echten Höhe, nicht an geschätzten Werten. Ändert sich eine
// Höhe (Kommentare kommen dazu, Schrift lädt nach …), rücken die darunter nach. Ein Fenster, das
// man selbst verschoben hat, bleibt stehen und fällt aus dem Stapel.
import type { Rnd } from 'react-rnd';

export const STACK_TOP = 80;
export const STACK_GAP = 12;

interface Entry { rnd: Rnd; dragged: boolean; x: number; y: number }
const entries = new Map<number, Entry>(); // Reihenfolge von oben nach unten
let observer: ResizeObserver | null = null;
let frame = 0;

function layout() {
  frame = 0;
  let y = STACK_TOP;
  for (const order of [...entries.keys()].sort((a, b) => a - b)) {
    const e = entries.get(order)!;
    const el = e.rnd.getSelfElement();
    if (!el) continue;
    if (e.dragged) continue;
    e.x = window.innerWidth - 344; e.y = y;
    e.rnd.updatePosition({ x: e.x, y: e.y });
    y += el.offsetHeight + STACK_GAP;
  }
}

function schedule() {
  if (!frame && typeof window !== 'undefined') frame = requestAnimationFrame(layout);
}

/** Als `ref` an das Rnd hängen: `ref={stackRef(1)}` (1 = oben) */
const refs = new Map<number, (rnd: Rnd | null) => void>(); // feste Funktion je Platz – sonst meldet React bei jedem Rendern ab und an
export function stackRef(order: number) {
  const cached = refs.get(order);
  if (cached) return cached;
  const fn = (rnd: Rnd | null) => {
    const prev = entries.get(order);
    if (prev && prev.rnd !== rnd) {
      const el = prev.rnd.getSelfElement();
      if (el) observer?.unobserve(el);
      entries.delete(order);
    }
    if (rnd && !entries.has(order)) {
      entries.set(order, { rnd, dragged: false, x: 0, y: 0 });
      if (!observer && typeof ResizeObserver !== 'undefined') observer = new ResizeObserver(schedule);
      const el = rnd.getSelfElement();
      if (el) observer?.observe(el);
    }
    schedule();
  };
  refs.set(order, fn);
  return fn;
}

/** In onDragStop: wirklich verschoben (nicht nur angeklickt) → Fenster bleibt, wo man es hingestellt hat */
export function stackDragged(order: number, pos: { x: number; y: number }) {
  const e = entries.get(order);
  if (e && !e.dragged && Math.hypot(pos.x - e.x, pos.y - e.y) > 3) { e.dragged = true; schedule(); }
}

if (typeof window !== 'undefined') window.addEventListener('resize', schedule);
