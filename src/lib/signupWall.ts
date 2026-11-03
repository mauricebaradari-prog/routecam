// Sign-up wall for visitors without an account (free – it only asks to sign in with Google).
//
// Rules:
// - Watching rides, browsing channels, sharing and reporting: always open.
// - Liking / rating: need an account → wall.
// - Commenting and creating a ride: need an account → wall.
// - While watching: after ~3 minutes of playback or the 3rd ride opened, the wall appears
//   once per browser session (can be dismissed with "Später").

import { db } from '@/lib/db';

export type WallReason = 'comment' | 'create' | 'interact' | 'engaged' | 'account';

const OPEN_EVENT = 'routecam:signup-wall';

function signedIn(): boolean {
  return !!db().me;
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

// Likes and ratings are stored with the account, so visitors get the wall right away
// (the "first one free" try of the localStorage days had nowhere to be saved).
export function allowInteraction(): boolean {
  if (signedIn()) return true;
  openSignupWall('interact');
  return false;
}
