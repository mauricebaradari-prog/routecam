import type { RouteOwner } from '@/lib/channels';

// The built-in Cyprus rides belong to the founder's channel. Before the founder's profile is
// loaded (or before he ever signed in) they show this placeholder. Kept in its own file so
// server code (share-index.json) can use it without pulling in the browser-side store.
export const FOUNDER: RouteOwner = { id: 'maurice', name: 'Maurice B.' };
