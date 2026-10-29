import { useCallback, useEffect, useState } from 'react';

// Google login via "Sign in with Google" (Google Identity Services), client-side only.
//
// The browser receives a signed Google ID token (JWT). We decode it here ONLY to show
// name/picture in the UI – it is NOT verified, so nothing security-relevant may rely on it.
// With Supabase, the same token is handed to supabase.auth.signInWithIdToken({ provider: 'google', token })
// which verifies it server-side and creates the real session (see 07_TODO.md).
//
// Needs NEXT_PUBLIC_GOOGLE_CLIENT_ID (OAuth client ID, type "Web application") in .env.local.

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

export interface AuthUser {
  id: string;        // Google "sub"
  name: string;
  email: string;
  picture?: string;
  credential: string; // raw ID token – pass to Supabase later
  expiresAt: number;  // ms
}

const STORAGE_KEY = 'routecam.user';
const CHANGE_EVENT = 'routecam:auth';
const GSI_SRC = 'https://accounts.google.com/gsi/client';

function decodeJwt(token: string): Record<string, any> | null {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '='))
        .split('')
        .map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function load(): AuthUser | null {
  try {
    const u = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as AuthUser | null;
    // Google ID tokens live ~1 h; the profile stays shown until sign-out (no server session yet)
    return u && u.id ? u : null;
  } catch {
    return null;
  }
}

function save(u: AuthUser | null) {
  try {
    if (u) localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function handleCredential(resp: { credential: string }) {
  const p = decodeJwt(resp.credential);
  if (!p?.sub) return;
  save({
    id: p.sub,
    name: p.name || p.email,
    email: p.email,
    picture: p.picture,
    credential: resp.credential,
    expiresAt: (p.exp || 0) * 1000,
  });
}

// Loads the GIS script once and initialises it once per page.
let gsiReady: Promise<any> | null = null;
function loadGsi(): Promise<any> {
  if (!GOOGLE_CLIENT_ID) return Promise.reject(new Error('NEXT_PUBLIC_GOOGLE_CLIENT_ID fehlt'));
  if (gsiReady) return gsiReady;
  gsiReady = new Promise((resolve, reject) => {
    const init = () => {
      const g = (window as any).google?.accounts?.id;
      if (!g) return reject(new Error('Google-Login konnte nicht geladen werden'));
      g.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleCredential, auto_select: false, cancel_on_tap_outside: true });
      resolve(g);
    };
    if ((window as any).google?.accounts?.id) return init();
    const tag = document.createElement('script');
    tag.src = GSI_SRC;
    tag.async = true;
    tag.onload = init;
    tag.onerror = () => { gsiReady = null; reject(new Error('Google-Login konnte nicht geladen werden')); };
    document.head.appendChild(tag);
  });
  return gsiReady;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const sync = () => setUser(load());
    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  // Renders Google's official sign-in button into the given element
  // theme: 'filled_black' (account menu) or 'outline' (white – sign-up wall)
  const renderSignInButton = useCallback(async (el: HTMLElement, theme: 'filled_black' | 'outline' = 'filled_black') => {
    const g = await loadGsi();
    el.replaceChildren(); // effects can run twice (dev mode, re-open) – never stack two buttons
    g.renderButton(el, { theme, size: 'large', shape: 'pill', text: 'signin_with', locale: 'de', width: 240 });
  }, []);

  // Google "One Tap": the small account prompt in the corner. Google itself decides whether it
  // may show (cool-down after the visitor closed it, browser support) – no need to track that here.
  const promptOneTap = useCallback(async () => {
    try { (await loadGsi()).prompt(); } catch {}
  }, []);

  const signOut = useCallback(() => {
    try { (window as any).google?.accounts?.id?.disableAutoSelect(); } catch {}
    save(null);
  }, []);

  return { user, signOut, renderSignInButton, promptOneTap, configured: !!GOOGLE_CLIENT_ID };
}
