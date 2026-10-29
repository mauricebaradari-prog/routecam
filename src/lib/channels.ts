import type { RouteConfig } from '@/hooks/useEditorState';
import { haversineDistance } from '@/lib/geo';

// RouteCam channels: every account has its own channel page (/channel?u=<id>) listing its rides.
// INTERIM: owners are stored on the route itself (localStorage); with Supabase this becomes
// a `profiles` table and routes.owner_id.

export interface RouteOwner {
  id: string;        // account id (Google "sub" today, Supabase user id later)
  name: string;
  picture?: string;
}

// The built-in Cyprus rides belong to the founder's channel
export const FOUNDER: RouteOwner = { id: 'maurice', name: 'Maurice B.' };
// The founder's Google account (FNV-1a hash of the e-mail, so the address isn't in the bundle).
// When he is signed in, the built-in rides join his real channel – one channel, with his photo.
const FOUNDER_EMAIL_HASH = 0xd39c81d0;

function fnv1a(text: string) {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(text)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

function currentUser(): (RouteOwner & { email?: string }) | null {
  try {
    const u = JSON.parse(localStorage.getItem('routecam.user') || 'null');
    return u?.id ? { id: u.id, name: u.name, picture: u.picture, email: u.email } : null;
  } catch {
    return null;
  }
}

function founder(): RouteOwner {
  const me = typeof window !== 'undefined' ? currentUser() : null;
  return me?.email && fnv1a(me.email.trim().toLowerCase()) === FOUNDER_EMAIL_HASH
    ? { id: me.id, name: me.name, picture: me.picture }
    : FOUNDER;
}

// the founder channel's id as seen from this browser ('maurice', or his account id when signed in)
export function founderId() { return founder().id; }

// Owner shown for a ride. Rides created before owners existed were made in this browser,
// so they belong to whoever is signed in here.
export function ownerOf(route: RouteConfig): RouteOwner {
  if (route.owner) return route.owner.id === FOUNDER.id ? founder() : route.owner;
  if (route.id.startsWith('user-')) {
    const me = typeof window !== 'undefined' ? currentUser() : null;
    return me ? { id: me.id, name: me.name, picture: me.picture } : { id: 'local', name: 'Du' };
  }
  return founder();
}

// called when a ride is saved without an owner: stamp the signed-in account
export function withOwner(route: RouteConfig): RouteConfig {
  if (route.owner) return route;
  const me = currentUser();
  return me ? { ...route, owner: { id: me.id, name: me.name, picture: me.picture } } : route;
}

// The id used in links. The founder's channel is always addressed as "maurice": his Google
// account id only exists in his own browser, so a link carrying it would be "Kanal nicht
// gefunden" for everyone else. (Goes away with Supabase, when profiles have one public id.)
export function publicChannelId(ownerId: string) {
  return ownerId !== FOUNDER.id && typeof window !== 'undefined' && ownerId === founderId() ? FOUNDER.id : ownerId;
}

export function channelHref(ownerId: string) {
  return `/channel?u=${encodeURIComponent(publicChannelId(ownerId))}`;
}

export function initialOf(name: string) {
  return (name.replace(/^[^\p{L}\p{N}]+/u, '')[0] || '?').toUpperCase();
}

export function distanceKm(route: RouteConfig) {
  let km = 0;
  for (let i = 1; i < route.cities.length; i++) km += haversineDistance(route.cities[i - 1], route.cities[i]);
  return km;
}
