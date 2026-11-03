// Links people share: the plain app link. On routecam.app a Cloudflare Pages Function
// (functions/_middleware.js) gives WhatsApp, Facebook & co. the ride's / channel's own
// title and video thumbnail as preview for exactly these addresses.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

export function shareUrl(target: { ride: string } | { channel: string }) {
  const origin = window.location.origin;
  return 'ride' in target
    ? `${origin}${BASE}/?route=${encodeURIComponent(target.ride)}`
    : `${origin}${BASE}/channel?u=${encodeURIComponent(target.channel)}`;
}
