// „Fahrt angelegt“-Toast: wer eine Fahrt anlegt, meldet das hier; der Toast (im Layout) zeigt es an.
export interface RideCreated { routeId: string; name: string; videoId: string; needsSync: boolean }
const EVENT = 'routecam:ride-created';
export function announceRideCreated(r: RideCreated) { window.dispatchEvent(new CustomEvent<RideCreated>(EVENT, { detail: r })); }
export function onRideCreated(cb: (r: RideCreated) => void) {
  const h = (e: Event) => cb((e as CustomEvent<RideCreated>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
