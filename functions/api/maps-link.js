// Google-Maps-Kurzlink auflösen (Cloudflare Pages Function: GET /api/maps-link?url=…)
//
// „Teilen“ in Google Maps liefert Kurzlinks (maps.app.goo.gl/…). Erst die Weiterleitung führt zur
// langen Adresse mit den Wegpunkten – und der Browser darf ihr wegen CORS nicht selbst folgen.
// Hier wird der Weiterleitung gefolgt, ausschließlich über Google-Adressen (kein offener Proxy),
// und nur die lange Adresse zurückgegeben. Das Auslesen der Route macht die App selbst.

const GOOGLE = /^(maps\.app\.goo\.gl|goo\.gl|g\.co|consent\.google\.[a-z.]+|((www|maps)\.)?google\.[a-z]{2,3}(\.[a-z]{2})?)$/i;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': status === 200 ? 'public, max-age=86400' : 'no-store' },
});

/** lange Maps-Adresse (enthält die Route) – dann nicht weiter folgen */
const isLong = u => /(^|\.)google\.[a-z.]+$/i.test(u.hostname) && !/^consent\./i.test(u.hostname) && (u.pathname.startsWith('/maps') || u.searchParams.has('saddr') || u.searchParams.has('daddr'));

export async function onRequestGet({ request }) {
  const raw = new URL(request.url).searchParams.get('url') || '';
  let target;
  try { target = new URL(raw.trim()); } catch { return json({ error: 'invalid' }, 400); }

  for (let hop = 0; hop < 8; hop++) {
    if (target.protocol !== 'https:' && target.protocol !== 'http:') return json({ error: 'invalid' }, 400);
    if (!GOOGLE.test(target.hostname)) return json({ error: 'not-google' }, 400);
    // Cookie-Hinweis (EU): das eigentliche Ziel steht in „continue“
    if (/^consent\./i.test(target.hostname)) {
      const next = target.searchParams.get('continue');
      if (!next) break;
      target = new URL(next);
      continue;
    }
    if (isLong(target)) return json({ url: target.toString() });
    let res;
    try {
      res = await fetch(target.toString(), {
        redirect: 'manual',
        headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', 'accept-language': 'en' },
      });
    } catch {
      return json({ error: 'fetch' }, 502);
    }
    const loc = res.headers.get('location');
    if (!loc) break;
    target = new URL(loc, target);
  }
  return isLong(target) ? json({ url: target.toString() }) : json({ error: 'no-route' }, 422);
}
