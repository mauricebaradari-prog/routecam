import { useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { setDb, useDb } from '@/lib/db';

// Google login via "Sign in with Google" (Google Identity Services).
//
// Google hands the browser a signed ID token; supabase.auth.signInWithIdToken checks it
// server-side and creates the real session (an account in Supabase Auth plus a row in
// public.profiles = the channel). The session is kept and refreshed by supabase-js.
//
// Needs NEXT_PUBLIC_GOOGLE_CLIENT_ID (OAuth client ID, type "Web application") in .env.local –
// the same id is entered under Authentication → Sign In / Providers → Google in Supabase.

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

export interface AuthUser {
  id: string;        // Supabase user id (= profiles.id, channel id)
  name: string;
  email: string;
  picture?: string;
}

const GSI_SRC = 'https://accounts.google.com/gsi/client';

async function handleCredential(resp: { credential: string }) {
  const { error } = await supabase().auth.signInWithIdToken({ provider: 'google', token: resp.credential });
  if (error) {
    console.error('[auth]', error.message);
    setDb({ authError: 'Die Anmeldung hat nicht geklappt. Bitte versuch es noch einmal.' });
  }
  // success: db.ts reacts to the new session (profile, own data, import of old local data)
}

// Loads the GIS script once and initialises it once per page.
let gsiReady: Promise<GsiId> | null = null;
function loadGsi(): Promise<GsiId> {
  if (!GOOGLE_CLIENT_ID) return Promise.reject(new Error('NEXT_PUBLIC_GOOGLE_CLIENT_ID fehlt'));
  if (gsiReady) return gsiReady;
  gsiReady = new Promise((resolve, reject) => {
    const init = () => {
      const g = window.google?.accounts?.id;
      if (!g) return reject(new Error('Google-Login konnte nicht geladen werden'));
      g.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleCredential, auto_select: false, cancel_on_tap_outside: true });
      resolve(g);
    };
    if (window.google?.accounts?.id) return init();
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
  const { me, email, authReady } = useDb();
  const user = useMemo<AuthUser | null>(
    () => (me ? { id: me.id, name: me.name || email.split('@')[0] || 'Konto', email, picture: me.picture ?? undefined } : null),
    [me, email],
  );

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
    try { window.google?.accounts?.id?.disableAutoSelect(); } catch {}
    supabase().auth.signOut().catch(e => console.error('[auth]', e));
  }, []);

  return { user, ready: authReady, signOut, renderSignInButton, promptOneTap, configured: !!GOOGLE_CLIENT_ID };
}
