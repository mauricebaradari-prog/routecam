import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Supabase project "routecam" (Maurice Baradari Ltd, region Frankfurt).
// URL and publishable key are public by design – they end up in the browser bundle anyway.
// What anyone may read or write is decided by the Row Level Security rules in
// supabase/migrations/. The secret key never belongs in this app.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://yagqzwufmmlmenurrlte.supabase.co';
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY || 'sb_publishable_PpRt1eSGuFQJF2fzuCKF9g_Sw3cEdZq';

let client: SupabaseClient | null = null;

// Browser only: the session (login) is kept in localStorage and refreshed automatically.
export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'routecam.auth' },
    });
  }
  return client;
}
