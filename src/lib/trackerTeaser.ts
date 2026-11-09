// Ob der Tracker-Teaser auf der Karte weggeklickt wurde – gemerkt im Browser.
// Ist er weg, zeigt die Kopfzeile der Hauptseite stattdessen den Knopf „GPS Tracker App“.
import { useSyncExternalStore } from 'react';

const DISMISS_KEY = 'routecam.trackerTeaserDismissed';
const EVENT = 'routecam:tracker-teaser';

export function isTrackerTeaserDismissed() {
  try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
}

export function dismissTrackerTeaser() {
  try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* privates Fenster o. Ä. */ }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === DISMISS_KEY) cb(); };
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', onStorage);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener('storage', onStorage); };
}

/** true, sobald der Teaser weggeklickt ist (auch in einem anderen Tab); auf dem Server immer false. */
export function useTrackerTeaserDismissed() {
  return useSyncExternalStore(subscribe, isTrackerTeaserDismissed, () => false);
}
