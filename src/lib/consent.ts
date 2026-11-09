// Einwilligung für eingebettete Dienste von Dritten (YouTube, Google One Tap).
// RouteCam selbst speichert nur Notwendiges im Browser – dafür braucht es kein Okay.
// Die Wahl liegt im localStorage; „Cookie-Einstellungen“ öffnet den Banner jederzeit wieder.
import { useSyncExternalStore } from 'react';

const KEY = 'routecam.consent';
const CHANGE = 'routecam:consent';
const OPEN = 'routecam:consent-open';
const VERSION = 1;

/** 'unset' = noch nicht gefragt · 'necessary' = nur Notwendiges · 'all' = auch YouTube und One Tap */
export type ConsentChoice = 'unset' | 'necessary' | 'all';

export function getConsent(): ConsentChoice {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && v.v === VERSION && (v.choice === 'necessary' || v.choice === 'all')) return v.choice;
  } catch { /* privates Fenster o. Ä. */ }
  return 'unset';
}

export function setConsent(choice: 'necessary' | 'all') {
  try { localStorage.setItem(KEY, JSON.stringify({ v: VERSION, choice, at: new Date().toISOString() })); } catch { /* ignore */ }
  window.dispatchEvent(new Event(CHANGE));
}

/** Darf YouTube (und One Tap) geladen werden? */
export const hasMediaConsent = () => getConsent() === 'all';

/** Banner (wieder) öffnen – z. B. aus „Cookie-Einstellungen“ oder wenn ein Video gebraucht wird. */
export function openConsent() {
  window.dispatchEvent(new Event(OPEN));
}

export function onConsentOpen(cb: () => void) {
  window.addEventListener(OPEN, cb);
  return () => window.removeEventListener(OPEN, cb);
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(); };
  window.addEventListener(CHANGE, cb);
  window.addEventListener('storage', onStorage);
  return () => { window.removeEventListener(CHANGE, cb); window.removeEventListener('storage', onStorage); };
}

/** Aktuelle Wahl, live (auch aus anderen Tabs); auf dem Server 'unset'. */
export function useConsent(): ConsentChoice {
  return useSyncExternalStore(subscribe, getConsent, () => 'unset');
}

/** Wartet, bis YouTube erlaubt ist (sofort, wenn schon erlaubt). */
export function whenMediaConsent(): Promise<void> {
  if (hasMediaConsent()) return Promise.resolve();
  return new Promise(resolve => {
    const check = () => { if (hasMediaConsent()) { window.removeEventListener(CHANGE, check); resolve(); } };
    window.addEventListener(CHANGE, check);
  });
}
