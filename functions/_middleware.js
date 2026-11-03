// Link previews per ride and per channel (Cloudflare Pages Function – runs before the static page).
//
// WhatsApp, iMessage, Facebook, X, Telegram, Slack … build their preview from the HTML of a link
// and never run JavaScript. The app is a static page, so without this every link would show the
// generic RouteCam preview. Here the page's title, description and image are swapped for the
// ride's / channel's own before the HTML goes out. People get the very same page and app.
//
//   https://routecam.app/?route=route-3   → ride: title, km · minutes · owner, YouTube thumbnail
//   https://routecam.app/channel?u=maurice → channel: name, number of rides, latest thumbnail
//
// Data: share-index.json (built-in rides, written by `npm run build`) and Supabase (rides and
// profiles in the database; the public key only sees what Row Level Security allows).
// Replaces legacy/r.php from the PHP hosting days.

const SUPABASE_URL = 'https://yagqzwufmmlmenurrlte.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PpRt1eSGuFQJF2fzuCKF9g_Sw3cEdZq';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  const rideId = path === '/' ? url.searchParams.get('route') : null;
  const channel = path === '/channel' ? url.searchParams.get('u') : null;

  const response = await context.next();
  if (request.method !== 'GET' || (!rideId && !channel)) return response;
  if (!(response.headers.get('content-type') || '').includes('text/html')) return response;

  let preview = null;
  try {
    preview = rideId && /^[A-Za-z0-9_-]{1,64}$/.test(rideId)
      ? await ridePreview(context, rideId)
      : channel && /^[A-Za-z0-9_.-]{1,64}$/.test(channel)
        ? await channelPreview(context, channel)
        : null;
  } catch (e) {
    console.error('preview failed', e);
  }
  if (!preview) return response;

  const pageUrl = url.toString();
  const set = (name, value) => ({ element: el => el.setAttribute('content', value) });
  const rewritten = new HTMLRewriter()
    .on('title', { element: el => el.setInnerContent(`${preview.title} – RouteCam`) })
    .on('meta[name="description"]', set('description', preview.desc))
    .on('meta[property="og:title"]', set('og:title', preview.title))
    .on('meta[property="og:description"]', set('og:description', preview.desc))
    .on('meta[property="og:url"]', set('og:url', pageUrl))
    .on('meta[property="og:image"]', set('og:image', preview.image.url))
    .on('meta[property="og:image:width"]', set('w', String(preview.image.width)))
    .on('meta[property="og:image:height"]', set('h', String(preview.image.height)))
    .on('meta[property="og:image:alt"]', set('alt', preview.title))
    .on('meta[name="twitter:title"]', set('twitter:title', preview.title))
    .on('meta[name="twitter:description"]', set('twitter:description', preview.desc))
    .on('meta[name="twitter:image"]', set('twitter:image', preview.image.url))
    .transform(response);

  const headers = new Headers(rewritten.headers);
  headers.set('Cache-Control', 'public, max-age=300');
  return new Response(rewritten.body, { status: rewritten.status, headers });
}

// ── Data ─────────────────────────────────────────────────────────────────────
async function supabase(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    cf: { cacheTtl: 60 },
  });
  return res.ok ? res.json() : [];
}

async function shareIndex(context) {
  try {
    const res = await context.env.ASSETS.fetch(new URL('/share-index.json', context.request.url));
    return res.ok ? await res.json() : { rides: [], channels: {} };
  } catch {
    return { rides: [], channels: {} };
  }
}

function km(cities) {
  if (!Array.isArray(cities)) return 0;
  let d = 0;
  const rad = x => (x * Math.PI) / 180;
  for (let i = 1; i < cities.length; i++) {
    const a = cities[i - 1], b = cities[i];
    const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
    d += 2 * 6371 * Math.asin(Math.sqrt(h));
  }
  return Math.round(d);
}

// Best YouTube thumbnail: maxres (1280×720) when the video has one, else hq (480×360, always there)
async function thumbnail(videoId) {
  if (!videoId) return null;
  const max = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
  try {
    const res = await fetch(max, { method: 'HEAD', cf: { cacheTtl: 86400 } });
    if (res.ok) return { url: max, width: 1280, height: 720 };
  } catch {}
  return { url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, width: 480, height: 360 };
}

function describe({ km: k, minutes, owner }) {
  return [k ? `${k} km` : '', minutes ? `${minutes} Min. Video` : '', owner ? `von ${owner}` : '']
    .filter(Boolean).join(' · ') + ' – auf dem 3D-Globus mitfahren bei RouteCam';
}

async function ridePreview(context, id) {
  // database row: user rides, and built-in rides the founder changed (renamed, hidden …)
  const [row] = await supabase(
    `routes?id=eq.${encodeURIComponent(id)}&select=visibility,hidden,place_names,name:config->>name,videoId:config->>videoId,duration:config->>durationSeconds,cities:config->cities,owner:profiles(name)`,
  );
  if (row && (row.hidden || row.visibility === 'private')) return null;
  const builtIn = (await shareIndex(context)).rides.find(r => r.id === id);
  if (!row && !builtIn) return null;

  const names = row?.place_names || {};
  const start = names.start || builtIn?.start;
  const end = names.end || builtIn?.end;
  const baseName = row?.name || builtIn?.title || 'Fahrt';
  const title = names.title || (names.start || names.end ? `${start} → ${end}` : baseName);
  const owner = row?.owner?.name || (builtIn ? (await founderName()) : null);
  const image = await thumbnail(row?.videoId || builtIn?.videoId);
  return {
    title,
    desc: describe({ km: row ? km(row.cities) : builtIn.km, minutes: Math.round(Number(row?.duration || 0) / 60) || builtIn?.minutes, owner }),
    image: image || { url: 'https://routecam.app/og-image.jpg', width: 1200, height: 630 },
  };
}

async function founderName() {
  const [p] = await supabase('profiles?is_founder=eq.true&select=name&limit=1');
  return p?.name || 'Maurice B.';
}

async function channelPreview(context, u) {
  const filter = UUID.test(u) ? `id=eq.${u}` : `slug=eq.${encodeURIComponent(u)}`;
  const [profile] = await supabase(`profiles?${filter}&select=id,name,is_founder`);
  if (!profile) return null;
  const rows = await supabase(
    `routes?owner_id=eq.${profile.id}&visibility=eq.public&hidden=eq.false&select=id,videoId:config->>videoId,created_at&order=created_at.desc`,
  );
  let rides = rows.filter(r => r.id.startsWith('user-'));
  let builtIn = [];
  if (profile.is_founder) {
    const hiddenOrPrivate = new Set((await supabase(`routes?id=like.route-*&or=(hidden.eq.true,visibility.neq.public)&select=id`)).map(r => r.id));
    builtIn = (await shareIndex(context)).rides.filter(r => !hiddenOrPrivate.has(r.id));
  }
  const count = rides.length + builtIn.length;
  const latestVideo = rides[0]?.videoId || builtIn[0]?.videoId;
  const totalKm = builtIn.reduce((s, r) => s + (r.km || 0), 0);
  return {
    title: `${profile.name || 'RouteCam-Kanal'} auf RouteCam`,
    desc: `${count} ${count === 1 ? 'Fahrt' : 'Fahrten'}${totalKm ? ` · über ${totalKm.toLocaleString('de-DE')} km` : ''} – Fahrvideos auf dem 3D-Globus`,
    image: (await thumbnail(latestVideo)) || { url: 'https://routecam.app/og-image.jpg', width: 1200, height: 630 },
  };
}
