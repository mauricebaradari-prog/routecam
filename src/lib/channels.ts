import type { RouteConfig } from '@/hooks/useEditorState';
import { haversineDistance } from '@/lib/geo';

import { db } from '@/lib/db';

// RouteCam channels: every account has its own channel page (/channel?u=<id or slug>) listing
// its rides. Owners come from the database (routes.owner_id → profiles).

export interface RouteOwner {
  id: string;        // Supabase user id (profiles.id)
  name: string;
  picture?: string;
}

import { FOUNDER } from '@/lib/founder';
export { FOUNDER };

function profileOwner(id: string): RouteOwner | null {
  const p = db().profiles[id];
  return p ? { id: p.id, name: p.name || 'RouteCam-Nutzer', picture: p.picture ?? undefined } : null;
}

function founder(): RouteOwner {
  const p = Object.values(db().profiles).find(x => x.is_founder);
  return p ? profileOwner(p.id)! : FOUNDER;
}

// the founder channel's id ('maurice' until his profile is known)
export function founderId() { return founder().id; }

// Owner shown for a ride: the account from the database, built-in rides → founder.
export function ownerOf(route: RouteConfig): RouteOwner {
  if (route.owner) return profileOwner(route.owner.id) ?? route.owner;
  return founder();
}

// The account a ride belongs to, as stored with it
export function ownerFromId(id: string): RouteOwner {
  return profileOwner(id) ?? { id, name: 'RouteCam-Nutzer' };
}

// The id used in links: the short channel name when the account has one ("maurice").
export function publicChannelId(ownerId: string) {
  return db().profiles[ownerId]?.slug || ownerId;
}

// Channel address from a link (?u=…) → account id
export function resolveChannelId(u: string) {
  const bySlug = Object.values(db().profiles).find(p => p.slug === u);
  if (bySlug) return bySlug.id;
  return u === FOUNDER.id ? founderId() : u;
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
