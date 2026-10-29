// Sign-up wall for visitors without an account (free – it only asks to sign in with Google).
//
// Rules:
// - Watching rides, browsing channels, sharing and reporting: always open.
// - Liking / rating: the first one is free, after that the wall appears.
// - Commenting and creating a ride: need an account → wall.
// - While watching: after ~3 minutes of playback or the 3rd ride opened, the wall appears
//   once per browser session (can be dismissed with "Später").

export type WallReason = 'comment' | 'create' | 'interact' | 'engaged';

const OPEN_EVENT = 'routecam:signup-wall';
const FREE_KEY = 'routecam.anon.freeInteractions';
export const FREE_INTERACTIONS = 1;

function signedIn(): boolean {
  try { return !!JSON.parse(localStorage.getItem('routecam.user') || 'null')?.id; } catch { return false; }
}

export function openSignupWall(reason: WallReason) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: reason }));
}

export function onSignupWall(cb: (reason: WallReason) => void) {
  const h = (e: Event) => cb((e as CustomEvent).detail as WallReason);
  window.addEventListener(OPEN_EVENT, h);
  return () => window.removeEventListener(OPEN_EVENT, h);
}

// Gate for actions that need an account: true = go ahead, false = wall shown instead
export function requireAccount(reason: Exclude<WallReason, 'engaged'>): boolean {
  if (signedIn()) return true;
  openSignupWall(reason);
  return false;
}

// Likes and ratings: one free try for visitors, then the wall
export function allowInteraction(): boolean {
  if (signedIn()) return true;
  let used = 0;
  try { used = Number(localStorage.getItem(FREE_KEY) || 0); } catch {}
  if (used < FREE_INTERACTIONS) {
    try { localStorage.setItem(FREE_KEY, String(used + 1)); } catch {}
    return true;
  }
  openSignupWall('interact');
  return false;
}
