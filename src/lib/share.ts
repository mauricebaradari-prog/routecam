// Links people share. In the built site they go through r.php (public/r.php), which gives
// WhatsApp, Facebook & co. the ride's own title and video thumbnail as preview.
// `next dev` can't run PHP, so locally the plain app link is used.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

export function shareUrl(target: { ride: string } | { channel: string }) {
  const origin = window.location.origin;
  if (process.env.NODE_ENV !== 'production') {
    return 'ride' in target
      ? `${origin}${BASE}/?route=${encodeURIComponent(target.ride)}`
      : `${origin}${BASE}/channel?u=${encodeURIComponent(target.channel)}`;
  }
  return 'ride' in target
    ? `${origin}${BASE}/r.php?id=${encodeURIComponent(target.ride)}`
    : `${origin}${BASE}/r.php?u=${encodeURIComponent(target.channel)}`;
}
