// „Fahrt angelegt“-Toast: wer eine Fahrt anlegt, meldet das hier; der Toast (im Layout) zeigt es an.
export interface RideCreated { routeId: string; name: string; videoId: string; needsSync: boolean }
const EVENT = 'routecam:ride-created';
export function announceRideCreated(r: RideCreated) { window.dispatchEvent(new CustomEvent<RideCreated>(EVENT, { detail: r })); }
export function onRideCreated(cb: (r: RideCreated) => void) {
  const h = (e: Event) => cb((e as CustomEvent<RideCreated>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

// Fahrt mit „Video ausrichten“ angelegt: der Toast kommt erst, wenn man im Sync-Fenster auf
// „Fertig“ gedrückt hat und wieder auf der Karte ist – nicht schon beim Anlegen.
const PENDING = 'routecam.rideToastPending';
const READY = 'routecam.rideToastReady';
const store = () => { try { return window.sessionStorage; } catch { return null; } };

/** Beim Anlegen: Toast für später zurücklegen (bis „Fertig“ im Sync-Fenster) */
export function deferRideCreated(r: RideCreated) {
  store()?.setItem(PENDING, JSON.stringify({ ...r, needsSync: false }));
}
/** Sync-Fenster „Fertig“: zurückgelegten Toast dieser Fahrt für die Karte freigeben */
export function releaseRideCreated(routeId: string) {
  const s = store(); const raw = s?.getItem(PENDING);
  if (!s || !raw) return;
  try { if ((JSON.parse(raw) as RideCreated).routeId === routeId) { s.setItem(READY, raw); s.removeItem(PENDING); } } catch { s.removeItem(PENDING); }
}
/** Karte: freigegebenen Toast dieser Fahrt jetzt zeigen */
export function showReleasedRideCreated(routeId: string) {
  const s = store(); const raw = s?.getItem(READY);
  if (!s || !raw) return;
  s.removeItem(READY);
  try { const r = JSON.parse(raw) as RideCreated; if (r.routeId === routeId) announceRideCreated(r); } catch {}
}
