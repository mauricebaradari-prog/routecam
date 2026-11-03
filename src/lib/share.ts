// Links people share. For now the plain app link: the old preview page (legacy/r.php) needed
// PHP, which Cloudflare Pages doesn't run. It is being rebuilt as a Cloudflare Worker that
// gives WhatsApp, Facebook & co. the ride's own title and video thumbnail – then the links
// below switch to it.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

export function shareUrl(target: { ride: string } | { channel: string }) {
  const origin = window.location.origin;
  return 'ride' in target
    ? `${origin}${BASE}/?route=${encodeURIComponent(target.ride)}`
    : `${origin}${BASE}/channel?u=${encodeURIComponent(target.channel)}`;
}
