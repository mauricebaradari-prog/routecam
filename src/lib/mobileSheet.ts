// Smartphone: wird eine Fahrt geöffnet, fährt unten ein Fenster hoch:
//   Kopfzeile (Kanal + X) · Video (volle Breite, 16:9) · Höhenprofil.
// Die Teile kommen aus verschiedenen Komponenten und liegen per „fixed“ übereinander –
// diese Maße halten sie zusammen. Die Karte darüber bekommt den Rest der Höhe.
export const SHEET_HEAD = 56;
export const SHEET_ELEV = 132;
const SAFE = 'env(safe-area-inset-bottom)';
export const SHEET_VIDEO = 'calc(100vw * 9 / 16)';
/** Abstände von unten */
export const SHEET_ELEV_H = `calc(${SHEET_ELEV}px + ${SAFE})`;
export const SHEET_VIDEO_BOTTOM = SHEET_ELEV_H;
export const SHEET_HEAD_BOTTOM = `calc(${SHEET_ELEV}px + ${SAFE} + 100vw * 9 / 16)`;
/** Gesamthöhe des Fensters */
export const SHEET_H = `calc(${SHEET_HEAD}px + 100vw * 9 / 16 + ${SHEET_ELEV}px + ${SAFE})`;
/** Höhe des Fensters in Pixeln (für die Kamera der Karte) */
export function sheetPx(): number {
  if (typeof window === 'undefined') return 0;
  let safe = 0;
  try {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;height:env(safe-area-inset-bottom)';
    document.body.appendChild(probe);
    safe = probe.getBoundingClientRect().height;
    probe.remove();
  } catch { /* ignore */ }
  return Math.round(SHEET_HEAD + window.innerWidth * 9 / 16 + SHEET_ELEV + safe);
}
