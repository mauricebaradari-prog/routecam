// Geschätzte Zeitachse für Strecken ohne Zeitstempel (Google-Maps-Link, GPX ohne Zeiten).
//
// Die App rechnet überall mit einer Tabelle „Sekunde → Anteil der Strecke“ (TrackTimeline). Für
// aufgezeichnete Fahrten kommt sie aus den Zeitstempeln. Hier wird sie geschätzt, aus:
//   1. der Grundschätzung `baseTime`: geschätzte Fahrzeit bis zu jeder Stelle (aus der
//      Routenberechnung – Autobahn schneller als Serpentinen); ohne sie gleichmäßig,
//   2. Passpunkten („Hier bin ich“): an Videosekunde v ist man an Stelle d,
//   3. Stopps: von Videosekunde v bis `until` steht man an Stelle d.
// Zwischen zwei Punkten wird die Zeit nach der Grundschätzung verteilt. Die Zeitachse läuft
// genau so lang wie das Video (Versatz 0) – Videosekunde = Sekunde der Zeitachse.
import type { TrackTimeline } from '@/lib/trackSync';

/** v: Videosekunde, d: Anteil der Strecke 0–1, until: Ende eines Stopps (Videosekunde) */
export interface SyncAnchor { v: number; d: number; until?: number }
/** [Anteil der Strecke, geschätzte Sekunden bis dorthin], aufsteigend */
export type BaseTime = [number, number][];

const STEP = 2; // Sekunden je Eintrag – wie bei aufgezeichneten Fahrten

const UNIFORM: BaseTime = [[0, 0], [1, 1]];

function interp(table: [number, number][], x: number, from: 0 | 1, to: 0 | 1): number {
  if (x <= table[0][from]) return table[0][to];
  const last = table[table.length - 1];
  if (x >= last[from]) return last[to];
  let lo = 0, hi = table.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (table[m][from] <= x) lo = m; else hi = m; }
  const a = table[lo], b = table[hi];
  return b[from] > a[from] ? a[to] + ((x - a[from]) / (b[from] - a[from])) * (b[to] - a[to]) : a[to];
}

/** Passpunkte und Stopps als geordnete Kette (Videosekunde, Stelle); mit Anfang und Ende des Videos */
export function anchorChain(anchors: SyncAnchor[], videoDur: number): { v: number; d: number }[] {
  const pts: { v: number; d: number }[] = [];
  for (const a of [...anchors].sort((x, y) => x.v - y.v)) {
    pts.push({ v: a.v, d: a.d });
    if (a.until !== undefined && a.until > a.v) pts.push({ v: a.until, d: a.d });
  }
  // ohne eigenen Punkt am Anfang/Ende: Video beginnt am Start und endet am Ziel der Strecke
  if (!pts.length || pts[0].v > 0.5) pts.unshift({ v: 0, d: 0 });
  if (pts[pts.length - 1].v < videoDur - 0.5) pts.push({ v: videoDur, d: 1 });
  // die Strecke läuft nur vorwärts
  for (let i = 1; i < pts.length; i++) pts[i].d = Math.max(pts[i].d, pts[i - 1].d);
  return pts;
}

export function buildEstimatedTimeline(opts: { baseTime?: BaseTime; anchors?: SyncAnchor[]; videoDur: number; distanceKm: number }): TrackTimeline {
  const base = opts.baseTime && opts.baseTime.length >= 2 ? opts.baseTime : UNIFORM;
  const B = (d: number) => interp(base, d, 0, 1);
  const Binv = (s: number) => interp(base, s, 1, 0);
  const dur = Math.max(1, opts.videoDur);
  const chain = anchorChain(opts.anchors ?? [], dur);
  const samples: [number, number][] = [];
  let i = 0;
  for (let t = 0; t <= dur + 1e-6; t += STEP) {
    while (i < chain.length - 2 && chain[i + 1].v <= t) i++;
    const a = chain[i], b = chain[i + 1] ?? a;
    let d: number;
    if (t <= a.v || b.v <= a.v || b.d === a.d) d = t >= b.v ? b.d : a.d;
    else {
      const k = Math.min(1, (t - a.v) / (b.v - a.v));
      d = Binv(B(a.d) + k * (B(b.d) - B(a.d)));
    }
    samples.push([t, +Math.min(1, Math.max(0, d)).toFixed(5)]);
  }
  if (samples[samples.length - 1][0] < dur) samples.push([+dur.toFixed(1), chain[chain.length - 1].d]);
  return { samples, durationSeconds: Math.round(dur), distanceKm: +opts.distanceKm.toFixed(2) };
}

/** Grundschätzung aus der Routenberechnung: Dauer je Abschnitt (Sekunden) entlang der Punkte */
export function baseTimeFromDurations(coords: { lat: number; lng: number }[], durations: number[], distKm: (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => number): BaseTime | undefined {
  if (durations.length !== coords.length - 1 || coords.length < 2) return undefined;
  const cumD = [0], cumT = [0];
  for (let i = 1; i < coords.length; i++) {
    cumD.push(cumD[i - 1] + distKm(coords[i - 1], coords[i]));
    cumT.push(cumT[i - 1] + Math.max(0, durations[i - 1] || 0));
  }
  const D = cumD[cumD.length - 1], T = cumT[cumT.length - 1];
  if (!(D > 0) || !(T > 0)) return undefined;
  // höchstens ~300 Einträge – reicht für eine glatte Verteilung
  const every = Math.max(1, Math.ceil(coords.length / 300));
  const out: BaseTime = [];
  for (let i = 0; i < coords.length; i += every) out.push([+(cumD[i] / D).toFixed(5), +cumT[i].toFixed(1)]);
  if (out[out.length - 1][0] < 1) out.push([1, +T.toFixed(1)]);
  return out;
}
