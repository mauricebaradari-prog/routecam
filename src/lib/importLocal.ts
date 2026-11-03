import { ROUTES, type RouteConfig } from '@/hooks/useEditorState';
import { db, refresh } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { configOf } from '@/lib/userRoutes';

// One-time move of the data this browser kept in localStorage before the database existed:
// own rides (+ their names and visibility), likes, ratings, own comments and groups.
// Only what belonged to the same Google account is taken over. Runs after each sign-in and
// does nothing once this account's data was moved (flag per account); the old entries stay
// in localStorage untouched as a backup.

const DONE_KEY = 'routecam.importedAccounts';

function read<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

interface OldComment { id: string; routeId: string; seconds: number; text: string; createdAt: string; authorId?: string; parentId?: string; editedAt?: string }
interface OldGroup { name: string; routeIds: string[]; visibility?: 'public' | 'unlisted' | 'private'; createdAt?: string }
interface OldInteraction { liked?: boolean; rating?: number }

export async function importLocalData() {
  const me = db().me;
  if (!me) return;
  const done: string[] = read(DONE_KEY, []);
  if (done.includes(me.id)) return;

  const sb = supabase();
  const { data: auth } = await sb.auth.getUser();
  // the Google account id ("sub") – the id the old local data was stamped with
  const googleId = auth.user?.identities?.find(i => i.provider === 'google')?.id;
  const oldUser = read<{ id?: string } | null>('routecam.user', null);
  const sameAccount = !oldUser?.id || oldUser.id === googleId;
  const mine = (ownerId?: string) => (ownerId ? ownerId === googleId : sameAccount);

  const rides = read<RouteConfig[]>('routecam.userRoutes', []).filter(r => r?.id?.startsWith('user-') && mine(r.owner?.id));
  const visibility = read<Record<string, 'public' | 'unlisted' | 'private'>>('routecam.visibility', {});
  const names = read<Record<string, { start?: string; end?: string; title?: string }>>('routecam.placeNames', {});
  const hiddenBuiltIn = read<string[]>('routecam.deletedRoutes', []);
  const interactions = sameAccount ? read<Record<string, OldInteraction>>('routecam.interactions', {}) : {};
  const comments = read<OldComment[]>('routecam.comments', []).filter(c => c?.routeId && c.text && mine(c.authorId));
  const groups = sameAccount ? read<OldGroup[]>('routecam.groups', []) : [];

  const nothing = !rides.length && !comments.length && !groups.length && !Object.keys(interactions).length
    && !(me.is_founder && (hiddenBuiltIn.length || Object.keys(names).some(id => id.startsWith('route-')) || Object.keys(visibility).some(id => id.startsWith('route-'))));
  if (nothing) { localStorage.setItem(DONE_KEY, JSON.stringify([...done, me.id])); return; }

  const errors: string[] = [];
  // comments and groups have no natural key – remember which of them already went through
  const stepsKey = `routecam.importSteps.${me.id}`;
  const steps: string[] = read(stepsKey, []);
  const stepDone = (step: string) => { steps.push(step); localStorage.setItem(stepsKey, JSON.stringify(steps)); };
  const check = (what: string, error: { message: string } | null) => { if (error) errors.push(`${what}: ${error.message}`); };

  // 1. rides (existing ids are left alone)
  if (rides.length) {
    const { error } = await sb.from('routes').upsert(rides.map(r => ({
      id: r.id,
      visibility: visibility[r.id] ?? r.visibility ?? 'public',
      config: configOf(r),
      place_names: names[r.id] ?? null,
      created_at: r.createdAt ?? undefined,
    })), { onConflict: 'id', ignoreDuplicates: true });
    check('Fahrten', error);
  }

  // 2. founder: own names, visibility and hidden state of the built-in rides
  if (me.is_founder) {
    const touched = ROUTES.filter(b => names[b.id] || visibility[b.id] || hiddenBuiltIn.includes(b.id));
    if (touched.length) {
      const { error } = await sb.from('routes').upsert(touched.map(b => ({
        id: b.id,
        visibility: visibility[b.id] ?? 'public',
        config: configOf(b),
        place_names: names[b.id] ?? null,
        hidden: hiddenBuiltIn.includes(b.id),
      })), { onConflict: 'id', ignoreDuplicates: true });
      check('Zypern-Fahrten', error);
    }
  }

  // 3. likes and ratings
  const likes = Object.entries(interactions).filter(([, e]) => e?.liked).map(([route_id]) => ({ route_id }));
  if (likes.length) check('Likes', (await sb.from('likes').upsert(likes, { onConflict: 'route_id,user_id', ignoreDuplicates: true })).error);
  const ratings = Object.entries(interactions)
    .filter(([, e]) => e?.rating && e.rating >= 1 && e.rating <= 5)
    .map(([route_id, e]) => ({ route_id, user_id: me.id, stars: Math.round(e.rating!) }));
  if (ratings.length) check('Bewertungen', (await sb.from('ratings').upsert(ratings, { onConflict: 'route_id,user_id', ignoreDuplicates: true })).error);

  // 4. comments – top comments first, replies point to the new ids
  const newId = new Map<string, string>();
  const tops = comments.filter(c => !c.parentId);
  const replies = comments.filter(c => c.parentId);
  if (!steps.includes('comments')) for (const batch of [tops, replies]) {
    const rows = batch
      .filter(c => !c.parentId || newId.has(c.parentId))
      .map(c => {
        const id = crypto.randomUUID();
        newId.set(c.id, id);
        return {
          id, route_id: c.routeId, seconds: Math.max(0, Math.round(c.seconds || 0)), text: c.text.slice(0, 2000),
          parent_id: c.parentId ? newId.get(c.parentId)! : null, created_at: c.createdAt, edited_at: c.editedAt ?? null,
        };
      });
    if (rows.length) check('Kommentare', (await sb.from('comments').insert(rows)).error);
  }
  if (!steps.includes('comments') && !errors.some(e => e.startsWith('Kommentare'))) stepDone('comments');

  // 5. groups
  const groupRows = groups.filter(g => g?.name?.trim()).map(g => ({
    name: g.name.trim().slice(0, 120), route_ids: g.routeIds ?? [], visibility: g.visibility ?? 'public', created_at: g.createdAt,
  }));
  if (groupRows.length && !steps.includes('groups')) {
    const { error } = await sb.from('route_groups').insert(groupRows);
    check('Gruppen', error);
    if (!error) stepDone('groups');
  }

  if (errors.length) {
    console.error('[import] not everything could be moved:', errors);
    return; // try again on the next sign-in
  }
  localStorage.setItem(DONE_KEY, JSON.stringify([...done, me.id]));
  console.info(`[import] moved ${rides.length} rides, ${comments.length} comments, ${groupRows.length} groups into the database`);
  await refresh();
}
